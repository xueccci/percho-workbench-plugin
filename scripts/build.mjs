import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractFile } from "@electron/asar";
import { build } from "esbuild";
import { hashFile } from "../src/installer.mjs";
import { writeNotices } from "./notices.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const option = (key, fallback) =>
	args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const host = resolve(option("--host", ""));
const workbench = resolve(option("--workbench", "../percho-workbench"));
if (!args.includes("--host"))
	throw new Error(
		"Usage: npm run build -- --host <original Percho folder> [--workbench <source checkout>]",
	);
const archive = join(host, "resources/app.asar");
let meta;
try {
	meta = JSON.parse(extractFile(archive, "package.json"));
} catch (error) {
	throw new Error("Cannot read original Percho package", { cause: error });
}
if (
	meta.version !== "0.6.8" ||
	meta.perchoBuildCommit !== "87476fa1f884d3590e58400b4099212593a5a047" ||
	meta.workbenchBuild
)
	throw new Error("Build requires an unmodified supported Percho installation");
const dist = join(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await build({
	entryPoints: [join(root, "src/cli.mjs")],
	bundle: true,
	outfile: join(dist, "installer.cjs"),
	platform: "node",
	format: "cjs",
	target: "node22",
	external: ["original-fs"],
	minify: false,
});
const manifest = {
	id: "percho-workbench",
	version: "0.1.0",
	platform: "win32-x64",
	kind: "host-compatibility-addon",
	host: {
		version: meta.version,
		commit: meta.perchoBuildCommit,
		archiveSha256: await hashFile(archive),
	},
	files: [],
};
async function collect(directory) {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			await collect(path);
			continue;
		}
		if (!entry.isFile()) throw new Error(`Unsupported output entry: ${path}`);
		const name = `out/${relative(join(workbench, "packages/desktop/out"), path).replaceAll("\\", "/")}`;
		const content = await readFile(path);
		let original;
		try {
			original = extractFile(archive, join(...name.split("/")));
		} catch {
			/* New Vite asset. */
		}
		if (original?.equals(content)) continue;
		const destination = join(dist, "payload", name);
		await mkdir(resolve(destination, ".."), { recursive: true });
		await writeFile(destination, content);
		manifest.files.push({
			path: name,
			size: content.length,
			sha256: createHash("sha256").update(content).digest("hex"),
		});
	}
}
await collect(join(workbench, "packages/desktop/out"));
manifest.files.sort((a, b) => a.path.localeCompare(b.path));
await writeFile(join(dist, "manifest.json"), JSON.stringify(manifest, null, 2));
// Keep reproducible host changes with the separate project, without user profiles or build artifacts.
const source = join(root, "host-source");
await rm(join(source, "overlay"), { recursive: true, force: true });
await mkdir(source, { recursive: true });
const patch = execFileSync(
	"git",
	["diff", "--binary", "--", "package-lock.json", "packages"],
	{ cwd: workbench, maxBuffer: 10 * 1024 * 1024 },
);
await writeFile(join(source, "integration.patch"), patch);
const untracked = execFileSync(
	"git",
	["ls-files", "--others", "--exclude-standard", "packages"],
	{ cwd: workbench, encoding: "utf8" },
)
	.trim()
	.split(/\r?\n/)
	.filter(Boolean);
for (const path of untracked) {
	const destination = join(source, "overlay", `${path}.source`);
	await mkdir(resolve(destination, ".."), { recursive: true });
	await cp(join(workbench, path), destination);
}
await writeFile(
	join(source, "base.json"),
	JSON.stringify(
		{
			repository: "https://github.com/Jaxton07/percho.git",
			commit: meta.perchoBuildCommit,
		},
		null,
		2,
	),
);
await cp(join(workbench, "LICENSE"), join(root, "LICENSE"));
await writeNotices(workbench, root);
const release = join(root, "release", "percho-workbench-plugin-0.1.0-win-x64");
await rm(release, { recursive: true, force: true });
await mkdir(release, { recursive: true });
for (const name of [
	"dist",
	"scripts/manage.ps1",
	"install.cmd",
	"uninstall.cmd",
	"status.cmd",
	"README.md",
	"NOTICE.md",
	"THIRD_PARTY_NOTICES.md",
	"LICENSE",
]) {
	await mkdir(resolve(join(release, name), ".."), { recursive: true });
	await cp(join(root, name), join(release, name), { recursive: true });
}
console.log(
	JSON.stringify(
		{
			files: manifest.files.length,
			payloadBytes: manifest.files.reduce((size, file) => size + file.size, 0),
			release,
		},
		null,
		2,
	),
);
