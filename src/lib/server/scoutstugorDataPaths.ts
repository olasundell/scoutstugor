import { isAbsolute, resolve } from "node:path";

const DEFAULT_DATA_FILES = [
	"data/scoutstugor.stockholm.json",
	"data/scoutstugor.sverige.json",
];

function splitEnvList(value?: string): string[] {
	if (!value) return [];
	return value
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function toAbsolute(pathname: string): string {
	return isAbsolute(pathname) ? pathname : resolve(process.cwd(), pathname);
}

export function resolveScoutstugorDataPaths(): string[] {
	const fromEnv = splitEnvList(process.env.SCOUTSTUGOR_DATA_FILES);
	const selected = fromEnv.length > 0 ? fromEnv : DEFAULT_DATA_FILES;
	return selected.map(toAbsolute);
}
