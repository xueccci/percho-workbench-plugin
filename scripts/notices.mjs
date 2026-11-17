import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
export async function writeNotices(workbench, root) {
	const modules = join(workbench, "node_modules"),
		packages = [];
	for (const item of await readdir(modules, { withFileTypes: true })) {
		if (item.name.startsWith(".")) continue;
		const base = join(modules, item.name);
		if (item.name.startsWith("@")) {
			for (const child of await readdir(base, { withFileTypes: true }))
				if (child.isDirectory()) packages.push(join(base, child.name));
		} else if (item.isDirectory()) packages.push(base);
	}
	packages.push(join(root, "node_modules/@electron/asar"));
	packages.sort();
	const output = [
		"# Third-party notices\n\nThe compatibility payload contains portions of Percho's compiled application and its dependency tree. This inventory retains license texts from the source build dependencies; inclusion does not imply every package is bundled. Runtime dependencies already installed with Percho retain their upstream notices.\n",
	];
	for (const directory of packages) {
		let meta;
		try {
			meta = JSON.parse(
				await readFile(join(directory, "package.json"), "utf8"),
			);
		} catch {
			continue;
		}
		const texts = [];
		for (const name of await readdir(directory)) {
			if (/^(LICENSE|COPYING|NOTICE)(\.|$)/i.test(name)) {
				try {
					texts.push(
						`### ${name}\n\n${await readFile(join(directory, name), "utf8")}\n`,
					);
				} catch {
					/* Directories may use LICENSE as a name. */
				}
			}
		}
		if (texts.length)
			output.push(`\n## ${meta.name} ${meta.version}\n\n${texts.join("\n")}`);
	}
	await writeFile(join(root, "THIRD_PARTY_NOTICES.md"), output.join("\n"));
	await mkdir(join(root, "host-source"), { recursive: true });
	await cp(
		join(workbench, "scripts/workbench-e2e.mjs"),
		join(root, "host-source/workbench-e2e.mjs.source"),
	);
}
