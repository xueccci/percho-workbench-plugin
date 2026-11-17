import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const pkg = join(root, "npm-package");
await rm(join(pkg, "vendor"), { recursive: true, force: true });
await mkdir(join(pkg, "vendor"), { recursive: true });
for (const name of ["installer.cjs", "manifest.json", "payload"]) {
	await cp(join(root, "dist", name), join(pkg, "vendor", name), { recursive: true });
}
for (const name of ["LICENSE", "NOTICE.md"]) await cp(join(root, name), join(pkg, name));
let manifest;
let info;
try {
	manifest = JSON.parse(await readFile(join(pkg, "package.json"), "utf8"));
	info = JSON.parse(
		execFileSync("npm", ["pack", "--dry-run", "--json"], { cwd: pkg, encoding: "utf8", shell: process.platform === "win32" }),
	)[0];
} catch (error) {
	throw new Error("Could not pack the Pi package; run npm install first", { cause: error });
}
const version = manifest.version;
console.log(JSON.stringify({ version, files: info.entryCount, packedBytes: info.size, unpackedBytes: info.unpackedSize }, null, 2));
await writeFile(join(root, "artifacts/pi-package.json"), JSON.stringify({ version, files: info.entryCount, packedBytes: info.size, unpackedBytes: info.unpackedSize }, null, 2));