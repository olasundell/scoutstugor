import { readFile } from "node:fs/promises";
import { resolveScoutstugorDataPaths } from "../../src/lib/server/scoutstugorDataPaths";

export type ScoutstugaData = {
	id: string;
	kommun: string;
	namn: string;
	latitud: number | null;
	longitud: number | null;
};

type ScoutstugaRaw = ScoutstugaData & {
	prisinfo?: string;
	prisKallaNotering?: string;
	bokningsKallaNotering?: string;
};

function isExplicitNotForRent(value: string): boolean {
	const text = value.trim().toLowerCase();
	if (!text) return false;

	if (/^(ej|inte)\s+bokningsbar(t)?\b/.test(text)) return true;
	if (!/^hyrs\s+(ej|inte)\s+ut\b/.test(text)) return false;

	const rest = text.replace(/^hyrs\s+(ej|inte)\s+ut\b/, "").trim();
	if (!rest) return true;
	if (/^[.,;:()[\]"']/.test(rest)) return true;
	if (
		/^för\s+(tillfället|tillfallet|tillsvidare|närvarande|just\s+nu)\b/.test(
			rest,
		)
	) {
		return true;
	}

	return false;
}

function isNotForRent(stuga: ScoutstugaRaw): boolean {
	const candidates = [
		stuga.prisinfo,
		stuga.prisKallaNotering,
		stuga.bokningsKallaNotering,
	].filter(Boolean);

	return candidates.some((value) => isExplicitNotForRent(value ?? ""));
}

export async function loadScoutstugorData(): Promise<ScoutstugaData[]> {
	const dataPaths = resolveScoutstugorDataPaths();
	const chunks: ScoutstugaRaw[] = [];

	for (const dataPath of dataPaths) {
		const raw = await readFile(dataPath, { encoding: "utf8" });
		const data = JSON.parse(raw) as ScoutstugaRaw[];
		if (!Array.isArray(data)) {
			throw new Error(`Scoutstugor JSON must be an array: ${dataPath}`);
		}
		chunks.push(...data);
	}

	return chunks.filter((stuga) => !isNotForRent(stuga));
}

export function resolveRegionLabel(): string {
	const envLabel = process.env.SCOUTSTUGOR_REGION_LABEL?.trim();
	if (envLabel) return envLabel;
	return resolveScoutstugorDataPaths().length > 1
		? "Sverige"
		: "Stockholms län";
}
