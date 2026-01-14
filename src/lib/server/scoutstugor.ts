import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Scoutstuga, ScoutstugaTyp } from "$lib/scoutstugor";

const CSV_WITH_COORDS_PATH = resolve(
	process.cwd(),
	"scoutstugor_stockholms_lan_masterlista_med_koordinater_semikolon.csv",
);
const CSV_FALLBACK_PATH = resolve(
	process.cwd(),
	"scoutstugor_stockholms_lan_masterlista_semikolon.csv",
);

function parseSemicolonCsvLine(line: string): string[] {
	const fields: string[] = [];
	let current = "";
	let inQuotes = false;

	for (let index = 0; index < line.length; index += 1) {
		const character = line[index];
		if (!character) continue;

		if (inQuotes) {
			if (character === '"') {
				const next = line[index + 1];
				if (next === '"') {
					current += '"';
					index += 1;
					continue;
				}

				inQuotes = false;
				continue;
			}

			current += character;
			continue;
		}

		if (character === '"') {
			inQuotes = true;
			continue;
		}

		if (character === ";") {
			fields.push(current.trim());
			current = "";
			continue;
		}

		current += character;
	}

	if (inQuotes) {
		throw new Error('Ogiltig CSV: rad slutar med oavslutat citattecken (").');
	}

	fields.push(current.trim());
	return fields;
}

function getColumnIndex(header: string[], name: string): number {
	const index = header.indexOf(name);
	if (index === -1) {
		throw new Error(
			`Ogiltig CSV: saknar kolumnen "${name}". Hittade: ${header.join(", ")}`,
		);
	}
	return index;
}

function getOptionalColumnIndex(header: string[], name: string): number | null {
	const index = header.indexOf(name);
	return index === -1 ? null : index;
}

function slugify(value: string): string {
	return value
		.toLowerCase()
		.normalize("NFKD")
		.replaceAll(/[\u0300-\u036f]/g, "")
		.replaceAll(/[^a-z0-9]+/g, "-")
		.replaceAll(/(^-+|-+$)/g, "");
}

function extractEmails(value: string): string[] {
	if (!value) return [];
	const matches = value.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi);
	if (!matches) return [];

	return [...new Set(matches.map((email) => email.trim()).filter(Boolean))];
}

function parseCoordinate(value: string): number | null {
	const trimmed = value.trim();
	if (!trimmed) return null;

	const normalized = trimmed.replace(",", ".");
	const parsed = Number.parseFloat(normalized);
	if (!Number.isFinite(parsed)) return null;

	return parsed;
}

function normalizeFieldCount(
	fields: string[],
	expected: number,
	lineNumber: number,
): string[] {
	if (fields.length === expected) return fields;

	if (fields.length < expected) {
		return [
			...fields,
			...Array.from({ length: expected - fields.length }, () => ""),
		];
	}

	const extras = fields.slice(expected);
	if (extras.every((value) => value.trim().length === 0)) {
		return fields.slice(0, expected);
	}

	throw new Error(
		`Ogiltig CSV: rad ${lineNumber} har ${fields.length} fält, men header har ${expected}.`,
	);
}

export async function loadScoutstugorFromCsv(): Promise<Scoutstuga[]> {
	let csvText: string;
	try {
		csvText = await readFile(CSV_WITH_COORDS_PATH, { encoding: "utf8" });
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			csvText = await readFile(CSV_FALLBACK_PATH, { encoding: "utf8" });
		} else {
			throw error;
		}
	}
	if (csvText.startsWith("\uFEFF")) csvText = csvText.slice(1);

	const lines = csvText
		.split(/\r?\n/)
		.map((line: string) => line.trimEnd())
		.filter((line: string) => line.trim().length > 0);

	if (lines.length === 0) return [];

	const header = parseSemicolonCsvLine(lines[0] ?? "");
	const kommunIndex = getColumnIndex(header, "Kommun");
	const namnIndex = getColumnIndex(header, "Namn");
	const organisationIndex = getColumnIndex(header, "Organisation");
	const typIndex = getColumnIndex(header, "Typ");
	const platsAdressIndex = getColumnIndex(header, "Plats_Adress");
	const epostIndex = getColumnIndex(header, "Epost");
	const telefonIndex = getColumnIndex(header, "Telefon");
	const ovrigtIndex = getColumnIndex(header, "Ovrigt");
	const latitudIndex = getOptionalColumnIndex(header, "Latitud");
	const longitudIndex = getOptionalColumnIndex(header, "Longitud");
	const koordinatKallaIndex = getOptionalColumnIndex(header, "Koordinatkälla");
	const noggrannhetIndex = getOptionalColumnIndex(header, "Noggrannhet");

	const items: Scoutstuga[] = [];
	const idCounter = new Map<string, number>();

	for (const [lineIndex, line] of lines.slice(1).entries()) {
		const fields = normalizeFieldCount(
			parseSemicolonCsvLine(line),
			header.length,
			lineIndex + 2,
		);

		const kommun = fields[kommunIndex] ?? "";
		const namn = fields[namnIndex] ?? "";
		const organisation = fields[organisationIndex] ?? "";
		const typ = (fields[typIndex] ?? "") as ScoutstugaTyp;
		const platsAdress = fields[platsAdressIndex] ?? "";
		const epost = fields[epostIndex] ?? "";
		const telefon = fields[telefonIndex] ?? "";
		const ovrigt = fields[ovrigtIndex] ?? "";
		const latitud =
			latitudIndex === null
				? null
				: parseCoordinate(fields[latitudIndex] ?? "");
		const longitud =
			longitudIndex === null
				? null
				: parseCoordinate(fields[longitudIndex] ?? "");
		const koordinatKalla =
			koordinatKallaIndex === null ? "" : (fields[koordinatKallaIndex] ?? "");
		const noggrannhet =
			noggrannhetIndex === null ? "" : (fields[noggrannhetIndex] ?? "");

		const baseId = slugify(`${kommun}-${namn}`);
		const count = (idCounter.get(baseId) ?? 0) + 1;
		idCounter.set(baseId, count);

		items.push({
			id: count === 1 ? baseId : `${baseId}-${count}`,
			kommun,
			namn,
			organisation,
			typ,
			platsAdress,
			epost,
			telefon,
			ovrigt,
			epostadresser: extractEmails(epost),
			latitud,
			longitud,
			koordinatKalla,
			noggrannhet,
		});
	}

	return items.sort((a, b) =>
		`${a.kommun}\u0000${a.namn}`.localeCompare(
			`${b.kommun}\u0000${b.namn}`,
			"sv",
		),
	);
}
