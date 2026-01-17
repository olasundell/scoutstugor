import { readFile } from "node:fs/promises";
import type { Scoutstuga, ScoutstugaTyp } from "$lib/scoutstugor";
import { resolveScoutstugorDataPaths } from "./scoutstugorDataPaths";

function extractEmails(value: string): string[] {
	if (!value) return [];
	const matches = value.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi);
	if (!matches) return [];

	return [...new Set(matches.map((email) => email.trim()).filter(Boolean))];
}

type ScoutstugaJson = {
	id: string;
	kommun: string;
	namn: string;
	organisation: string;
	typ: ScoutstugaTyp;
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
	avstandBadplatsM?: number;
	avstandMataffarM?: number;
	avstandBadplatsBilM?: number;
	avstandBadplatsGangM?: number;
	avstandMataffarBilM?: number;
	avstandMataffarGangM?: number;
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

export function isNotForRent(
	stuga: Pick<
		Scoutstuga,
		"prisinfo" | "prisKallaNotering" | "bokningsKallaNotering"
	>,
): boolean {
	const candidates = [
		stuga.prisinfo,
		stuga.prisKallaNotering,
		stuga.bokningsKallaNotering,
	].filter(Boolean);

	return candidates.some((value) => isExplicitNotForRent(value ?? ""));
}

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
		assertOptionalNonNegativeNumber(obj.avstandBadplatsM, "avstandBadplatsM");
		assertOptionalNonNegativeNumber(obj.avstandMataffarM, "avstandMataffarM");
		assertOptionalNonNegativeNumber(
			obj.avstandBadplatsBilM,
			"avstandBadplatsBilM",
		);
		assertOptionalNonNegativeNumber(
			obj.avstandBadplatsGangM,
			"avstandBadplatsGangM",
		);
		assertOptionalNonNegativeNumber(
			obj.avstandMataffarBilM,
			"avstandMataffarBilM",
		);
		assertOptionalNonNegativeNumber(
			obj.avstandMataffarGangM,
			"avstandMataffarGangM",
		);

		const id = obj.id.trim();
		if (!id) throw new Error('Ogiltig data: "id" får inte vara tom.');
		if (seen.has(id)) throw new Error(`Ogiltig data: duplicerat id "${id}".`);
		seen.add(id);

		items.push({
			id,
			kommun: obj.kommun,
			namn: obj.namn,
			organisation: obj.organisation,
			typ: obj.typ as ScoutstugaTyp,
			platsAdress: obj.platsAdress,
			epost: obj.epost,
			telefon: obj.telefon,
			ovrigt: obj.ovrigt,
			latitud: obj.latitud,
			longitud: obj.longitud,
			koordinatKalla: obj.koordinatKalla,
			noggrannhet: obj.noggrannhet,
			golvytaM2: obj.golvytaM2,
			sangar: obj.sangar,
			el: obj.el,
			vatten: obj.vatten,
			vattenTyp: obj.vattenTyp as ScoutstugaJson["vattenTyp"],
			toalett: obj.toalett as ScoutstugaJson["toalett"],
			omStuganUrl: obj.omStuganUrl,
			karUrl: obj.karUrl,
			prisinfo: obj.prisinfo,
			prisKallaUrl: obj.prisKallaUrl,
			prisKallaNotering: obj.prisKallaNotering,
			bokningslank: obj.bokningslank,
			bokningsKallaUrl: obj.bokningsKallaUrl,
			bokningsKallaNotering: obj.bokningsKallaNotering,
			senastKontrollerad: obj.senastKontrollerad,
			avstandBadplatsM: obj.avstandBadplatsM,
			avstandMataffarM: obj.avstandMataffarM,
			avstandBadplatsBilM: obj.avstandBadplatsBilM,
			avstandBadplatsGangM: obj.avstandBadplatsGangM,
			avstandMataffarBilM: obj.avstandMataffarBilM,
			avstandMataffarGangM: obj.avstandMataffarGangM,
		});
	}

	return { items, uniqueIdCount: seen.size };
}

export async function loadScoutstugor(): Promise<Scoutstuga[]> {
	const dataPaths = resolveScoutstugorDataPaths();
	const chunks: unknown[] = [];

	for (const dataPath of dataPaths) {
		const jsonText = await readFile(dataPath, { encoding: "utf8" });
		let raw: unknown;
		try {
			raw = JSON.parse(jsonText) as unknown;
		} catch {
			throw new Error(
				`Ogiltig data: "${dataPath}" kunde inte tolkas som JSON.`,
			);
		}
		if (!Array.isArray(raw)) {
			throw new Error(`Ogiltig data: "${dataPath}" måste vara en array.`);
		}
		chunks.push(...raw);
	}

	const { items } = validateAndNormalize(chunks);

	const out: Scoutstuga[] = items.map((item) => ({
		...item,
		epostadresser: extractEmails(item.epost),
	}));

	return out.sort((a, b) =>
		`${a.kommun}\u0000${a.namn}`.localeCompare(
			`${b.kommun}\u0000${b.namn}`,
			"sv",
		),
	);
}
