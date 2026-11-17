import { spawnSync } from "node:child_process";
import { cp, mkdir, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const destination = resolve(process.argv[2] || ".local/percho-source");
let base;
try {
	base = JSON.parse(
		await readFile(join(root, "host-source/base.json"), "utf8"),
	);
} catch (error) {
	throw new Error(
		"Invalid host-source/base.json; restore the source bundle before rebuilding",
		{ cause: error },
	);
}
function run(binary, args, cwd) {
	const result = spawnSync(binary, args, {
		cwd,
		stdio: "inherit",
		shell: process.platform === "win32" && binary === "npm",
	});
	if (result.error || result.status !== 0)
		throw result.error || new Error(`${binary} failed (${result.status})`);
}
await mkdir(resolve(destination, ".."), { recursive: true });
run("git", ["clone", "--no-checkout", base.repository, destination]);
run("git", ["checkout", "--detach", base.commit], destination);
run("git", ["apply", join(root, "host-source/integration.patch")], destination);
async function overlay(source, target) {
	for (const item of await readdir(source, { withFileTypes: true })) {
		const from = join(source, item.name),
			to = join(target, item.name);
		if (item.isDirectory()) {
			await mkdir(to, { recursive: true });
			await overlay(from, to);
		} else if (item.name.endsWith(".source")) await cp(from, to.slice(0, -7));
	}
}
await overlay(join(root, "host-source/overlay"), destination);
await cp(
	join(root, "host-source/workbench-e2e.mjs.source"),
	join(destination, "scripts/workbench-e2e.mjs"),
);
run("npm", ["ci"], destination);
run("npm", ["run", "typecheck"], destination);
run("npm", ["run", "build"], destination);
console.log(
	`Host rebuilt at ${destination}. Pass --workbench to the plugin build command.`,
);
