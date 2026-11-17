import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { finished, pipeline } from "node:stream/promises";
import { extractFile, getRawHeader, uncache } from "@electron/asar";
import { Pickle } from "@electron/asar/lib/pickle.js";

const nativeRequire = createRequire(join(process.cwd(), "installer.cjs"));
const rawFs = nativeRequire(
	process.versions.electron ? "original-fs" : "node:fs",
);
const { createReadStream, createWriteStream } = rawFs;
const { copyFile, mkdir, open, readFile, rename, rm, stat, statfs, writeFile } =
	rawFs.promises;
export const backupName = ".percho-workbench-plugin";
export const backupFile = "original.bin";
// The installer handles archive bytes; Electron's virtual ASAR filesystem must stay disabled here.
if (process.versions.electron) process.noAsar = true;
export async function hashFile(path) {
	const hash = createHash("sha256");
	const stream = createReadStream(path);
	for await (const chunk of stream) hash.update(chunk);
	await finished(stream, { cleanup: true });
	return hash.digest("hex");
}
export async function ensureSpace(directory, requiredBytes) {
	const disk = await statfs(directory);
	if (disk.bavail * disk.bsize < requiredBytes)
		throw new Error(
			`Not enough free space. Need at least ${Math.ceil(requiredBytes / 1024 / 1024)} MiB before installation.`,
		);
}
async function exists(path) {
	try {
		await stat(path);
		return true;
	} catch (error) {
		if (error.code === "ENOENT") return false;
		throw error;
	}
}
function json(data, label) {
	try {
		return JSON.parse(data.toString());
	} catch (error) {
		throw new Error(`Invalid ${label}`, { cause: error });
	}
}
function metadata(archive) {
	uncache(archive);
	return json(extractFile(archive, "package.json"), "Percho metadata");
}
function assertHost(meta, manifest) {
	if (
		meta.version !== manifest.host.version ||
		meta.perchoBuildCommit !== manifest.host.commit
	)
		throw new Error(
			`Unsupported Percho. Required ${manifest.host.version} (${manifest.host.commit.slice(0, 8)}); got ${meta.version}.`,
		);
}
/** Paths of running processes with this simple name; empty when none exist. */
export function runningProcessPaths(name) {
	if (process.platform !== "win32") return [];
	if (!/^[A-Za-z][\w.-]{0,60}$/.test(name)) throw new Error("Unsupported process name");
	const script = `[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); $p = @(Get-Process ${name} -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne ${process.pid} }); if ($p.Count -eq 0) { 'none' } else { $p | ForEach-Object { $_.Path } }`;
	let output;
	try {
		output = execFileSync(
			"powershell.exe",
			["-NoProfile", "-Command", script],
			{ encoding: "utf8", windowsHide: true },
		).trim();
	} catch (error) {
		throw new Error(
			"Could not verify whether Percho is running; installation stopped.",
			{ cause: error },
		);
	}
	// Emptied output means the probe failed rather than reported an empty list.
	if (!output)
		throw new Error(
			"Could not verify whether Percho is running; installation stopped.",
		);
	return output === "none"
		? []
		: output.split(/\r?\n/).map((path) => path.trim()).filter(Boolean);
}
export function assertClosed(target) {
	const executable = join(target, "Percho.exe").toLowerCase();
	if (runningProcessPaths("Percho").some((path) => path.toLowerCase() === executable))
		throw new Error(
			"Target Percho is running. Exit it completely, then run the installer again. No processes were stopped.",
		);
}

export async function rewriteArchive(source, destination, replacements) {
	const { header, headerSize } = getRawHeader(source);
	const originalSize = (await stat(source)).size;
	let offset = originalSize - 8 - headerSize;
	const additions = [];
	for (const [path, local] of replacements) {
		const content = await readFile(local);
		let node = header;
		const parts = path.split("/");
		const filename = parts.pop();
		for (const part of parts) {
			node.files ??= {};
			node.files[part] ??= { files: {} };
			node = node.files[part];
		}
		const hash = (data) => createHash("sha256").update(data).digest("hex");
		const blockSize = 4 * 1024 * 1024,
			blocks = [];
		for (let start = 0; start < content.length; start += blockSize)
			blocks.push(hash(content.subarray(start, start + blockSize)));
		if (content.length % blockSize === 0) blocks.push(hash(Buffer.alloc(0)));
		node.files[filename] = {
			size: content.length,
			offset: String(offset),
			integrity: {
				algorithm: "SHA256",
				hash: hash(content),
				blockSize,
				blocks,
			},
		};
		offset += content.length;
		additions.push(content);
	}
	const headerPickle = Pickle.createEmpty();
	headerPickle.writeString(JSON.stringify(header));
	const headerBuffer = headerPickle.toBuffer();
	const sizePickle = Pickle.createEmpty();
	sizePickle.writeUInt32(headerBuffer.length);
	// Preserve original packed bytes, links and unpacked references exactly; append replacements.
	async function* bytes() {
		yield sizePickle.toBuffer();
		yield headerBuffer;
		yield* createReadStream(source, { start: 8 + headerSize });
		yield* additions;
	}
	await pipeline(bytes(), createWriteStream(destination, { flags: "wx" }));
	uncache(source);
}

export async function manage(action, target, bundle) {
	if (!["install", "uninstall", "status"].includes(action))
		throw new Error("Expected install, uninstall or status");
	target = resolve(target);
	const resources = join(target, "resources"),
		archive = join(resources, "app.asar");
	const backup = join(resources, backupName),
		receiptPath = join(backup, "receipt.json");
	const meta = metadata(archive);
	if (action === "status")
		return {
			installed: !!meta.perchoWorkbenchPlugin && (await exists(receiptPath)),
			hostVersion: meta.version,
			plugin: meta.perchoWorkbenchPlugin ?? null,
			recoveryAvailable: await exists(join(backup, backupFile)),
			target,
		};
	assertClosed(target);
	const lock = await open(
		join(resources, ".percho-workbench-install.lock"),
		"wx",
	).catch((error) => {
		throw new Error(
			"Cannot lock installation directory. Check write access or another installer.",
			{ cause: error },
		);
	});
	const temp = join(resources, `app.workbench-${randomUUID()}.asar`);
	let createdBackup = false;
	let committed = false;
	let originalSha256;
	try {
		if (action === "uninstall") {
			if (!(await exists(receiptPath))) {
				const manifest = json(
					await readFile(join(bundle, "manifest.json")),
					"plugin manifest",
				);
				const currentHash = await hashFile(archive);
				if (
					currentHash !== manifest.host.archiveSha256 ||
					!(await exists(join(backup, backupFile))) ||
					(await hashFile(join(backup, backupFile))) !== currentHash
				)
					throw new Error("No plugin receipt found. Nothing was overwritten.");
				await rm(backup, { recursive: true });
				return {
					installed: false,
					message:
						"Original already restored; verified leftover backup removed.",
					target,
				};
			}
			const receipt = json(await readFile(receiptPath), "installation receipt");
			const currentHash = await hashFile(archive);
			if (
				currentHash !== receipt.originalSha256 &&
				currentHash !== receipt.installedSha256
			)
				throw new Error(
					"Percho changed since installation. Refusing to overwrite it; backup retained.",
				);
			if ((await hashFile(join(backup, backupFile))) !== receipt.originalSha256)
				throw new Error("Original backup checksum failed; no changes made.");
			await ensureSpace(
				resources,
				(await stat(join(backup, backupFile))).size + 16 * 1024 * 1024,
			);
			if (currentHash !== receipt.originalSha256) {
				await copyFile(join(backup, backupFile), temp);
				await rename(temp, archive);
			}
			await rm(backup, { recursive: true });
			uncache(archive);
			return {
				installed: false,
				message: "Original Percho restored exactly. User data was not changed.",
				target,
			};
		}
		const manifest = json(
			await readFile(join(bundle, "manifest.json")),
			"plugin manifest",
		);
		if (
			manifest.id !== "percho-workbench" ||
			!Array.isArray(manifest.files) ||
			!manifest.files.length
		)
			throw new Error("Invalid plugin manifest");
		if (
			manifest.platform &&
			manifest.platform !== `${process.platform}-${process.arch}`
		)
			throw new Error("This release requires Windows x64");
		assertHost(meta, manifest);
		if (await exists(receiptPath)) {
			const receipt = json(await readFile(receiptPath), "installation receipt");
			if (
				receipt.pluginVersion === manifest.version &&
				(await hashFile(archive)) === receipt.installedSha256
			)
				return {
					installed: true,
					message: "This plugin version is already installed.",
					target,
				};
			throw new Error(
				"A previous plugin installation exists. Uninstall it before installing another version.",
			);
		}
		if (await exists(backup))
			throw new Error(
				"Recovery directory already exists. Inspect it before retrying; it was not changed.",
			);
		if (meta.workbenchBuild || meta.perchoWorkbenchPlugin)
			throw new Error(
				"This is already a modified Workbench build. Select the original Percho installation.",
			);
		originalSha256 = await hashFile(archive);
		if (originalSha256 !== manifest.host.archiveSha256)
			throw new Error(
				"Percho archive checksum does not match this supported build; no changes made.",
			);
		const replacements = new Map();
		let payloadBytes = 0;
		for (const entry of manifest.files) {
			if (
				!/^out\/[\w./-]+$/.test(entry.path) ||
				entry.path.split("/").includes("..")
			)
				throw new Error("Unsafe payload path");
			const file = join(bundle, "payload", ...entry.path.split("/"));
			if ((await hashFile(file)) !== entry.sha256)
				throw new Error(`Plugin payload checksum failed: ${entry.path}`);
			if (replacements.has(entry.path))
				throw new Error("Duplicate payload path");
			payloadBytes += (await stat(file)).size;
			replacements.set(entry.path, file);
		}
		await ensureSpace(
			resources,
			(await stat(archive)).size * 2 + payloadBytes + 64 * 1024 * 1024,
		);
		await mkdir(backup);
		createdBackup = true;
		await copyFile(archive, join(backup, backupFile));
		const modified = {
			...meta,
			workbenchBuild: true,
			perchoWorkbenchPlugin: { id: manifest.id, version: manifest.version },
		};
		await writeFile(
			join(backup, "package.json"),
			JSON.stringify(modified, null, 2),
		);
		replacements.set("package.json", join(backup, "package.json"));
		console.log(
			"Building compatibility archive. The original is backed up; please wait...",
		);
		await rewriteArchive(archive, temp, replacements);
		if (metadata(temp).perchoWorkbenchPlugin?.version !== manifest.version)
			throw new Error("Generated archive verification failed");
		for (const entry of manifest.files) {
			const content = extractFile(temp, join(...entry.path.split("/")));
			if (createHash("sha256").update(content).digest("hex") !== entry.sha256)
				throw new Error(`Generated file verification failed: ${entry.path}`);
		}
		if ((await hashFile(archive)) !== originalSha256)
			throw new Error("Percho changed during installation; backup retained");
		const receipt = {
			pluginVersion: manifest.version,
			originalSha256,
			installedSha256: await hashFile(temp),
			installedAt: new Date().toISOString(),
		};
		await writeFile(receiptPath, JSON.stringify(receipt, null, 2));
		assertClosed(target);
		await rename(temp, archive);
		committed = true;
		uncache(archive);
		return {
			installed: true,
			version: manifest.version,
			message:
				"Installed. Restart Percho and open Workbench in a local session. Automatic updates are disabled until uninstall.",
			target,
		};
	} catch (error) {
		if (
			createdBackup &&
			!committed &&
			(await hashFile(archive)) === originalSha256
		)
			await rm(backup, { recursive: true });
		throw error;
	} finally {
		await rm(temp, { force: true });
		await rm(`${temp}.unpacked`, { recursive: true, force: true });
		await lock.close();
		await rm(join(resources, ".percho-workbench-install.lock"), {
			force: true,
		});
	}
}
