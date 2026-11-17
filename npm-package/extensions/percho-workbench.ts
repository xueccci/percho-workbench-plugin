import { spawn, spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/**
 * Installs the Percho Workbench compatibility patch (right-hand embedded browser +
 * files pane). The patch itself ships in the installer bundle under vendor/; this
 * extension only locates the original Percho and drives that installer.
 */

// PERCHO_WORKBENCH_VENDOR overrides the payload location for tests and unusual loaders.
const VENDOR = [process.env.PERCHO_WORKBENCH_VENDOR, "../vendor/installer.cjs", "vendor/installer.cjs"]
	.filter((path): path is string => Boolean(path))
	.map((path) => resolve(path.startsWith("../") || path.startsWith("vendor/") ? join(import.meta.dirname ?? "", path) : path))
	.find(existsSync);

function ps(script: string): string {
	const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], {
		encoding: "utf8",
		windowsHide: true,
		timeout: 25_000,
	});
	return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

/** Percho folders from running processes, uninstall registry entries and common install paths. */
function candidates(): string[] {
	const found = new Set<string>();
	for (const path of ps("Get-Process Percho -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path").split(/\r?\n/)) {
		if (path.trim()) found.add(dirname(path.trim()));
	}
	const roots = [
		"HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
		"HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
		"HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
	]
		.map((root) => `'${root}'`)
		.join(",");
	for (const icon of ps(
		`Get-ItemProperty ${roots} -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like '*Percho*' -and $_.DisplayIcon } | ForEach-Object { $_.DisplayIcon }`,
	).split(/\r?\n/)) {
		const clean = icon.trim().replace(/,\d+$/, "").replace(/^"|"$/g, "");
		if (clean) found.add(dirname(clean));
	}
	for (const root of [process.env.LOCALAPPDATA, process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]) {
		if (!root) continue;
		found.add(join(root, "Percho"));
		found.add(join(root, "Programs", "Percho"));
	}
	return [...found].filter(
		(folder) => existsSync(join(folder, "Percho.exe")) && existsSync(join(folder, "resources", "app.asar")),
	);
}

function runInstaller(action: string, target: string): { code: number; output: string } {
	const result = spawnSync(join(target, "Percho.exe"), [VENDOR as string, action, "--target", target], {
		env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
		encoding: "utf8",
		windowsHide: true,
		timeout: 180_000,
	});
	return { code: result.status ?? -1, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

/** Close the target, patch it, then start it again. Detached because this host is the target. */
function schedule(action: "install" | "uninstall", target: string): string {
	const stamp = Date.now();
	const script = join(tmpdir(), `percho-workbench-${stamp}.mjs`);
	const log = join(tmpdir(), `percho-workbench-${stamp}.log`);
	writeFileSync(
		script,
		`import { spawn, spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
const exe = ${JSON.stringify(join(target, "Percho.exe"))};
const log = ${JSON.stringify(log)};
const note = (text) => appendFileSync(log, new Date().toISOString() + " " + text + "\\n");
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const ps = (script) => {
	const out = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], { encoding: "utf8", windowsHide: true });
	return (out.stdout || "") + (out.stderr || "");
};
note("waiting for the reply to be delivered");
await sleep(6000);
let code = -1;
try {
	for (let attempt = 0; attempt < 40; attempt++) {
		ps("Get-Process Percho -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue");
		await sleep(1500);
		if (ps("(Get-Process Percho -ErrorAction SilentlyContinue | Measure-Object).Count").trim() === "0") { await sleep(3000); break; }
	}
	const result = spawnSync(exe, [${JSON.stringify(VENDOR)}, ${JSON.stringify(action)}, "--target", ${JSON.stringify(target)}], {
		env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, encoding: "utf8", windowsHide: true,
	});
	code = result.status ?? -1;
	note("installer exit=" + code + "\\n" + (result.stdout || "") + (result.stderr || ""));
} catch (error) {
	note("installer threw: " + error.message);
} finally {
	const app = spawn(exe, [], { detached: true, stdio: "ignore" });
	app.unref();
	note("restarted Percho pid=" + app.pid + " installerExit=" + code);
}
`,
	);
	const child = spawn(process.execPath, [script], {
		detached: true,
		stdio: "ignore",
		env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
		windowsHide: true,
	});
	child.unref();
	return log;
}

const tool = defineTool({
	name: "percho_workbench",
	label: "Percho Workbench",
	description:
		"Check, install or remove the Percho Workbench add-on: a real right-hand pane with an embedded browser and project files, plus a workbench tool that drives the same visible page. Supports Windows x64 Percho 0.6.8 build 87476fa1 only.",
	parameters: Type.Object({
		action: StringEnum(["detect", "status", "install", "uninstall"] as const),
		target: Type.Optional(
			Type.String({ description: "Percho installation folder containing Percho.exe; detected when omitted" }),
		),
	}),
	async execute(_id, params) {
		if (!VENDOR) throw new Error("Package payload is missing; reinstall the percho-workbench package.");
		const targets = params.target ? [resolve(params.target)] : candidates();
		if (params.action === "detect")
			return {
				content: [
					{
						type: "text",
						text: targets.length
							? `Percho installations:\n${targets.join("\n")}`
							: "No Percho installation found. Ask the user for the folder containing Percho.exe.",
					},
				],
				details: { targets },
			};
		const target = targets[0];
		if (!target)
			throw new Error(
				"No Percho installation found. Ask the user for the folder containing Percho.exe, then pass it as target.",
			);
		if (params.action === "status") {
			const result = runInstaller("status", target);
			return {
				content: [{ type: "text", text: result.output.trim() || `exit ${result.code}` }],
				details: { target, ...result },
			};
		}
		const log = schedule(params.action, target);
		return {
			content: [
				{
					type: "text",
					text: `${params.action} scheduled for ${target}. Percho closes in about 6 seconds, the patch is applied, then Percho restarts; progress is written to ${log}. Tell the user the window will reopen shortly, and that they open a local session and click the Workbench button.`,
				},
			],
			details: { target, log },
		};
	},
});

export default function (pi: ExtensionAPI) {
	pi.registerTool(tool);
	pi.registerCommand("percho-workbench", {
		description: "Report the Percho Workbench add-on state for this machine",
		handler: async (args, ctx) => {
			const targets = args?.trim() ? [resolve(args.trim())] : candidates();
			if (!targets.length) {
				ctx.ui.notify("No Percho installation found; pass the folder containing Percho.exe", "warning");
				return;
			}
			ctx.ui.notify(runInstaller("status", targets[0]).output.trim(), "info");
		},
	});
}