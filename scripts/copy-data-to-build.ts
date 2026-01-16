import { copyFile, mkdir } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { resolveScoutstugorDataPaths } from "../src/lib/server/scoutstugorDataPaths";

const dataPaths = resolveScoutstugorDataPaths();
if (dataPaths.length === 0) {
	throw new Error("Inga datafiler hittades att kopiera.");
}

const outputDir = resolve(process.cwd(), "build", "data");
await mkdir(outputDir, { recursive: true });

const seen = new Set<string>();
for (const dataPath of dataPaths) {
	const filename = basename(dataPath);
	if (seen.has(filename)) {
		throw new Error(
			`Duplicerat filnamn "${filename}" vid kopiering till build/data.`,
		);
	}
	seen.add(filename);
	await copyFile(dataPath, resolve(outputDir, filename));
}

console.log(`Kopierade ${dataPaths.length} datafil(er) till build/data.`);
