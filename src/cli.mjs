import { dirname, resolve } from "node:path";
import { manage } from "./installer.mjs";

const args = process.argv.slice(2);
const targetIndex = args.indexOf("--target");
const bundle = resolve(dirname(process.argv[1]));
async function main() {
	if (targetIndex < 0 || !args[targetIndex + 1])
		throw new Error(
			"Usage: installer.cjs install|uninstall|status --target <Percho directory>",
		);
	console.log(
		JSON.stringify(
			await manage(args[0], args[targetIndex + 1], bundle),
			null,
			2,
		),
	);
}
main().catch((error) => {
	console.error(`Workbench: ${error.message}`);
	process.exitCode = 1;
});
