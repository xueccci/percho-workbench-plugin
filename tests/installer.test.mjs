import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
	appendFile,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { finished } from "node:stream/promises";
import { test } from "node:test";
import { createPackageWithOptions, extractFile, uncache } from "@electron/asar";
import {
	backupFile,
	backupName,
	ensureSpace,
	hashFile,
	manage,
	runningProcessPaths,
} from "../src/installer.mjs";

test("space preflight rejects impossible allocation before backup", async () => {
	await assert.rejects(
		ensureSpace(tmpdir(), Number.MAX_SAFE_INTEGER),
		/Not enough free space/,
	);
});

test("process probe distinguishes no matching process from a live one", () => {
	assert.deepEqual(runningProcessPaths("PerchoDefinitelyNotRunning"), []);
	const live = runningProcessPaths("Percho");
	assert.ok(Array.isArray(live));
	for (const path of live) assert.ok(path.toLowerCase().endsWith("percho.exe"), path);
});

async function fixture(t) {
	const root = await mkdtemp(join(tmpdir(), "workbench-installer-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const target = join(root, "Percho 空格"),
		input = join(root, "input"),
		bundle = join(root, "bundle");
	await mkdir(join(target, "resources"), { recursive: true });
	await mkdir(join(input, "out/main"), { recursive: true });
	await mkdir(join(bundle, "payload/out/main"), { recursive: true });
	await writeFile(
		join(input, "package.json"),
		JSON.stringify({
			version: "0.6.8",
			perchoBuildCommit: "test-commit",
			main: "out/main/index.js",
		}),
	);
	await writeFile(join(input, "out/main/index.js"), "original");
	await writeFile(join(input, "keep.txt"), "preserved original data");
	await writeFile(join(input, "native.node"), "unpacked bytes");
	const archive = join(target, "resources/app.asar");
	await finished(
		await createPackageWithOptions(input, archive, { unpack: "*.node" }),
	);
	const payload = join(bundle, "payload/out/main/index.js");
	await writeFile(payload, "plugin enabled");
	const manifest = {
		id: "percho-workbench",
		version: "0.1.0",
		host: {
			version: "0.6.8",
			commit: "test-commit",
			archiveSha256: await hashFile(archive),
		},
		files: [
			{
				path: "out/main/index.js",
				sha256: createHash("sha256").update("plugin enabled").digest("hex"),
			},
		],
	};
	await writeFile(join(bundle, "manifest.json"), JSON.stringify(manifest));
	return {
		root,
		target,
		archive,
		bundle,
		manifest,
		payload,
		backup: join(target, "resources", backupName),
	};
}

test("install enables payload, retains untouched and unpacked files; uninstall restores exact original", async (t) => {
	const f = await fixture(t),
		original = await hashFile(f.archive);
	assert.equal((await manage("status", f.target, f.bundle)).installed, false);
	assert.equal((await manage("install", f.target, f.bundle)).installed, true);
	uncache(f.archive);
	assert.equal(
		extractFile(f.archive, join("out", "main", "index.js")).toString(),
		"plugin enabled",
	);
	assert.equal(
		extractFile(f.archive, "keep.txt").toString(),
		"preserved original data",
	);
	assert.equal(
		extractFile(f.archive, "native.node").toString(),
		"unpacked bytes",
	);
	assert.equal(
		JSON.parse(extractFile(f.archive, "package.json")).workbenchBuild,
		true,
	);
	const installed = await hashFile(f.archive);
	assert.equal((await manage("install", f.target, f.bundle)).installed, true);
	assert.equal(await hashFile(f.archive), installed);
	assert.equal(
		(await manage("status", f.target, f.bundle)).plugin.version,
		"0.1.0",
	);
	await manage("uninstall", f.target, f.bundle);
	assert.equal(await hashFile(f.archive), original);
	assert.equal((await manage("status", f.target, f.bundle)).installed, false);
	await assert.rejects(readFile(join(f.backup, backupFile)), /ENOENT/);
});

test("recover cleanup after original was restored but backup receipt was lost", async (t) => {
	const f = await fixture(t);
	await mkdir(f.backup);
	await writeFile(join(f.backup, backupFile), await readFile(f.archive));
	assert.equal(
		(await manage("uninstall", f.target, f.bundle)).installed,
		false,
	);
	await assert.rejects(readFile(join(f.backup, backupFile)), /ENOENT/);
});

test("reject incompatible version, modified original and corrupt payload before changing target", async (t) => {
	const f = await fixture(t),
		original = await hashFile(f.archive);
	f.manifest.host.version = "wrong";
	await writeFile(join(f.bundle, "manifest.json"), JSON.stringify(f.manifest));
	await assert.rejects(
		manage("install", f.target, f.bundle),
		/Unsupported Percho/,
	);
	f.manifest.host.version = "0.6.8";
	f.manifest.host.archiveSha256 = "wrong";
	await writeFile(join(f.bundle, "manifest.json"), JSON.stringify(f.manifest));
	await assert.rejects(manage("install", f.target, f.bundle), /checksum/);
	f.manifest.host.archiveSha256 = original;
	await writeFile(join(f.bundle, "manifest.json"), JSON.stringify(f.manifest));
	await writeFile(f.payload, "corrupt");
	await assert.rejects(
		manage("install", f.target, f.bundle),
		/payload checksum/,
	);
	assert.equal(await hashFile(f.archive), original);
	await assert.rejects(readFile(join(f.backup, backupFile)), /ENOENT/);
});

test("uninstall refuses foreign changes and a damaged backup", async (t) => {
	const f = await fixture(t);
	await manage("install", f.target, f.bundle);
	const installed = await readFile(f.archive);
	await appendFile(f.archive, "foreign update");
	await assert.rejects(
		manage("uninstall", f.target, f.bundle),
		/changed since installation/,
	);
	assert.equal(
		(await readFile(f.archive)).subarray(-14).toString(),
		"foreign update",
	);
	await writeFile(f.archive, installed);
	await appendFile(join(f.backup, backupFile), "corrupted");
	await assert.rejects(
		manage("uninstall", f.target, f.bundle),
		/backup checksum/,
	);
	assert.deepEqual(await readFile(f.archive), installed);
});

test("reject traversal paths and preserve an existing recovery directory", async (t) => {
	const f = await fixture(t),
		original = await hashFile(f.archive);
	f.manifest.files[0].path = "out/../../escape";
	await writeFile(join(f.bundle, "manifest.json"), JSON.stringify(f.manifest));
	await assert.rejects(manage("install", f.target, f.bundle), /Unsafe payload/);
	await mkdir(f.backup);
	await writeFile(join(f.backup, "important"), "keep");
	await assert.rejects(
		manage("install", f.target, f.bundle),
		/Recovery directory/,
	);
	assert.equal(await readFile(join(f.backup, "important"), "utf8"), "keep");
	assert.equal(await hashFile(f.archive), original);
});
