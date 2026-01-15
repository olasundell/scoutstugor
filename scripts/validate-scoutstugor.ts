import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type ScoutstugaJson = {
	id: string;
	kommun: string;
	namn: string;
	organisation: string;
	typ: string;
	platsAdress: string;
	epost: string;
	telefon: string;
	ovrigt: string;
	latitud: number | null;
	longitud: number | null;
	koordinatKalla: string;
	noggrannhet: string;
	golvytaM2?: number;
	sangar?: number;
	el?: boolean;
	vatten?: boolean;
	vattenTyp?: "inne" | "pump";
	toalett?: "inne" | "ute" | "båda" | "ingen";
	omStuganUrl?: string;
	karUrl?: string;
	prisinfo?: string;
	prisKallaUrl?: string;
	prisKallaNotering?: string;
	bokningslank?: string;
	bokningsKallaUrl?: string;
	bokningsKallaNotering?: string;
	senastKontrollerad?: string;
};

function assertString(value: unknown, name: string): asserts value is string {
	if (typeof value !== "string") {
		throw new Error(`Ogiltig data: "${name}" måste vara string.`);
	}
}

function assertNullableNumber(
	value: unknown,
	name: string,
): asserts value is number | null {
	if (value === null) return;
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`Ogiltig data: "${name}" måste vara number eller null.`);
	}
}

function assertOptionalString(
	value: unknown,
	name: string,
): asserts value is string | undefined {
	if (value === undefined) return;
	if (typeof value !== "string") {
		throw new Error(`Ogiltig data: "${name}" måste vara string om angiven.`);
	}
}

function assertOptionalBoolean(
	value: unknown,
	name: string,
): asserts value is boolean | undefined {
	if (value === undefined) return;
	if (typeof value !== "boolean") {
		throw new Error(`Ogiltig data: "${name}" måste vara boolean om angiven.`);
	}
}

function assertOptionalVattenTyp(
	value: unknown,
	name: string,
): asserts value is ScoutstugaJson["vattenTyp"] {
	if (value === undefined) return;
	if (typeof value !== "string") {
		throw new Error(`Ogiltig data: "${name}" måste vara string om angiven.`);
	}
	if (value !== "inne" && value !== "pump") {
		throw new Error(
			`Ogiltig data: "${name}" måste vara "inne" eller "pump" om angiven.`,
		);
	}
}

function assertOptionalNonNegativeNumber(
	value: unknown,
	name: string,
): asserts value is number | undefined {
	if (value === undefined) return;
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		throw new Error(
			`Ogiltig data: "${name}" måste vara ett number >= 0 om angiven.`,
		);
	}
}

function assertOptionalToalett(
	value: unknown,
	name: string,
): asserts value is ScoutstugaJson["toalett"] {
	if (value === undefined) return;
	if (typeof value !== "string") {
		throw new Error(`Ogiltig data: "${name}" måste vara string om angiven.`);
	}
	if (
		value !== "inne" &&
		value !== "ute" &&
		value !== "båda" &&
		value !== "ingen"
	) {
		throw new Error(
			`Ogiltig data: "${name}" måste vara en av "inne", "ute", "båda", "ingen" om angiven.`,
		);
	}
}

function validateAndNormalize(raw: unknown): {
	items: ScoutstugaJson[];
	uniqueIdCount: number;
} {
	if (!Array.isArray(raw)) {
		throw new Error("Ogiltig data: toppnivån måste vara en array.");
	}

	const seen = new Set<string>();
	const items: ScoutstugaJson[] = [];

	for (const [index, value] of raw.entries()) {
		if (!value || typeof value !== "object") {
			throw new Error(`Ogiltig data: rad ${index} måste vara ett objekt.`);
		}
		const obj = value as Record<string, unknown>;

		assertString(obj.id, "id");
		assertString(obj.kommun, "kommun");
		assertString(obj.namn, "namn");
		assertString(obj.organisation, "organisation");
		assertString(obj.typ, "typ");
		assertString(obj.platsAdress, "platsAdress");
		assertString(obj.epost, "epost");
		assertString(obj.telefon, "telefon");
		assertString(obj.ovrigt, "ovrigt");
		assertNullableNumber(obj.latitud, "latitud");
		assertNullableNumber(obj.longitud, "longitud");
		assertString(obj.koordinatKalla, "koordinatKalla");
		assertString(obj.noggrannhet, "noggrannhet");

		assertOptionalNonNegativeNumber(obj.golvytaM2, "golvytaM2");
		assertOptionalNonNegativeNumber(obj.sangar, "sangar");
		assertOptionalBoolean(obj.el, "el");
		assertOptionalBoolean(obj.vatten, "vatten");
		assertOptionalVattenTyp(obj.vattenTyp, "vattenTyp");
		assertOptionalToalett(obj.toalett, "toalett");
		assertOptionalString(obj.omStuganUrl, "omStuganUrl");
		assertOptionalString(obj.karUrl, "karUrl");

		assertOptionalString(obj.prisinfo, "prisinfo");
		assertOptionalString(obj.prisKallaUrl, "prisKallaUrl");
		assertOptionalString(obj.prisKallaNotering, "prisKallaNotering");
		assertOptionalString(obj.bokningslank, "bokningslank");
		assertOptionalString(obj.bokningsKallaUrl, "bokningsKallaUrl");
		assertOptionalString(obj.bokningsKallaNotering, "bokningsKallaNotering");
		assertOptionalString(obj.senastKontrollerad, "senastKontrollerad");

		const id = obj.id.trim();
		if (!id) throw new Error('Ogiltig data: "id" får inte vara tom.');
		if (seen.has(id)) throw new Error(`Ogiltig data: duplicerat id "${id}".`);
		seen.add(id);

		items.push(obj as ScoutstugaJson);
	}

	return { items, uniqueIdCount: seen.size };
}

const JSON_PATH = resolve(process.cwd(), "data/scoutstugor.stockholm.json");
const jsonText = await readFile(JSON_PATH, { encoding: "utf8" });
const raw = JSON.parse(jsonText) as unknown;
const { items, uniqueIdCount } = validateAndNormalize(raw);

console.log(`OK: ${items.length} rader, ${uniqueIdCount} unika id.`);
