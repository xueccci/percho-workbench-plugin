import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const root = join(import.meta.dirname, "..");
let version;
try {
	({ version } = JSON.parse(readFileSync(join(root, "npm-package/package.json"), "utf8")));
} catch (error) {
	throw new Error("npm-package/package.json is missing or invalid", { cause: error });
}
const name = `percho-workbench-${version}.tgz`;
const file = join(root, "release", name);
const hash = createHash("sha256").update(readFileSync(file)).digest("hex");
writeFileSync(`${file}.sha256`, `${hash}  ${name}\n`);
console.log(`${name} ${hash}`);