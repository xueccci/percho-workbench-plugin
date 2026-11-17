import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const file = join(import.meta.dirname, "..", "release", "percho-workbench-0.1.0.tgz");
const hash = createHash("sha256").update(readFileSync(file)).digest("hex");
writeFileSync(`${file}.sha256`, `${hash}  percho-workbench-0.1.0.tgz\n`);
console.log(hash);