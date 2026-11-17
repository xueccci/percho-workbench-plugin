import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	copyFile,
	cp,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { hashFile } from "../src/installer.mjs";

const root = resolve(import.meta.dirname, "..");
const original = resolve(process.argv[2]);
const workbench = resolve(process.argv[3]);
const runRoot = await mkdtemp(join(tmpdir(), "workbench-release-"));
const target = join(runRoot, "Percho 测试安装"),
	unpack = join(runRoot, "plugin");
const archive = join(target, "resources/app.asar");
const evidence = join(root, "artifacts");
await mkdir(evidence, { recursive: true });
const results = [];
let log = "";
function run(file, args, options = {}) {
	const child = spawnSync(file, args, {
		windowsHide: true,
		encoding: "utf8",
		maxBuffer: 10 * 1024 * 1024,
		...options,
	});
	log += `\n$ ${file} ${args.join(" ")}\n${child.stdout || ""}${child.stderr || ""}\nexit=${child.status}\n`;
	assert.ifError(child.error);
	return child;
}
function entry(action) {
	const command = `""${join(unpack, "percho-workbench-plugin-0.1.0-win-x64", `${action}.cmd`)}" -Target "${target}""`;
	const child = run("cmd.exe", ["/d", "/s", "/c", command], {
		input: "",
		windowsVerbatimArguments: true,
	});
	assert.equal(child.status, 0, child.stdout + child.stderr);
	return child.stdout;
}
try {
	await mkdir(join(target, "resources"), { recursive: true });
	for (const item of await readdir(original, { withFileTypes: true })) {
		if (item.isFile())
			await copyFile(join(original, item.name), join(target, item.name));
	}
	await copyFile(join(original, "resources/app.asar"), archive);
	for (const name of [
		"locales",
		"resources/app.asar.unpacked",
		"resources/ui-plugins",
		"resources/skills",
	]) {
		await cp(join(original, name), join(target, name), { recursive: true });
	}
	const expected = await hashFile(archive);
	const zip = join(root, "release/percho-workbench-plugin-0.1.0-win-x64.zip");
	const extracted = run("powershell.exe", [
		"-NoProfile",
		"-Command",
		`Expand-Archive -LiteralPath '${zip}' -DestinationPath '${unpack}'`,
	]);
	assert.equal(extracted.status, 0);
	assert.match(entry("status"), /"installed": false/);
	entry("install");
	assert.match(entry("status"), /"installed": true/);
	const installed = await hashFile(archive);
	assert.notEqual(installed, expected);
	assert.match(entry("install"), /already installed/);
	assert.equal(await hashFile(archive), installed);
	results.push(
		"Extracted ZIP installs via install.cmd using target Electron runtime; repeat install is idempotent",
	);
	const launched = run(
		process.execPath,
		[join(workbench, "scripts/workbench-e2e.mjs")],
		{
			cwd: workbench,
			env: {
				...process.env,
				PERCHO_WORKBENCH_EXECUTABLE: join(target, "Percho.exe"),
			},
		},
	);
	assert.equal(launched.status, 0, launched.stdout + launched.stderr);
	const e2e = JSON.parse(
		await readFile(
			join(workbench, "artifacts/workbench-e2e-results.json"),
			"utf8",
		),
	);
	assert.equal(e2e.passed, 10);
	assert.equal(e2e.failed, 0);
	results.push(...e2e.checks);
	for (const name of [
		"workbench-e2e-results.json",
		"workbench-agent-same-page.png",
		"workbench-files.png",
		"workbench-browser-dark.png",
	]) {
		await copyFile(join(workbench, "artifacts", name), join(evidence, name));
	}
	entry("uninstall");
	assert.equal(await hashFile(archive), expected);
	assert.match(entry("status"), /"installed": false/);
	await assert.rejects(
		stat(join(target, "resources/.percho-workbench-plugin")),
		/ENOENT/,
	);
	results.push(
		"uninstall.cmd restores original archive SHA-256 exactly and removes backup",
	);
	const data = {
		passed: results.length,
		failed: 0,
		checks: results,
		originalSha256: expected,
		restoredSha256: await hashFile(archive),
		zipSha256: await hashFile(zip),
		target,
		at: new Date().toISOString(),
	};
	await writeFile(
		join(evidence, "release-verification.json"),
		JSON.stringify(data, null, 2),
	);
	console.log(JSON.stringify(data, null, 2));
} finally {
	await writeFile(join(evidence, "release-verification.log"), log);
}
