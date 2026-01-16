import { readFile } from "node:fs/promises";
import { resolveScoutstugorDataPaths } from "../../src/lib/server/scoutstugorDataPaths";

export type ScoutstugaData = {
	id: string;
	kommun: string;
	namn: string;
	latitud: number | null;
	longitud: number | null;
};

export async function loadScoutstugorData(): Promise<ScoutstugaData[]> {
	const dataPaths = resolveScoutstugorDataPaths();
	const chunks: ScoutstugaData[] = [];

	for (const dataPath of dataPaths) {
		const raw = await readFile(dataPath, { encoding: "utf8" });
		const data = JSON.parse(raw) as ScoutstugaData[];
		if (!Array.isArray(data)) {
			throw new Error(`Scoutstugor JSON must be an array: ${dataPath}`);
		}
		chunks.push(...data);
	}

	return chunks;
}
