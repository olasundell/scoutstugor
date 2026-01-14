export type ScoutstugaTyp =
	| "Scoutstuga"
	| "Scoutlokal"
	| "Scoutgård"
	| "Utfärdsstuga"
	| "Stuga/Projekt"
	| string;

export type Scoutstuga = {
	id: string;
	kommun: string;
	namn: string;
	organisation: string;
	typ: ScoutstugaTyp;
	platsAdress: string;
	epost: string;
	telefon: string;
	ovrigt: string;
	epostadresser: string[];
	latitud: number | null;
	longitud: number | null;
	koordinatKalla: string;
	noggrannhet: string;

	// Optional attributes (size + facilities)
	golvytaM2?: number;
	sangar?: number;
	el?: boolean;
	vatten?: boolean;
	/**
	 * Optional clarification for water.
	 * - "inne": indoor faucet/water
	 * - "pump": outdoor hand pump
	 *
	 * If omitted, fall back to `vatten` boolean.
	 */
	vattenTyp?: "inne" | "pump";
	toalett?: "inne" | "ute" | "båda" | "ingen";

	// Optional enrichment (links)
	/**
	 * Primary info page about the cabin (e.g. "Om stugan", "Hyr stugan").
	 * If missing, fall back to `karUrl`.
	 */
	omStuganUrl?: string;
	/**
	 * Scout troop/organization website (fallback if no `omStuganUrl`).
	 */
	karUrl?: string;

	// Optional enrichment (prices + booking)
	prisinfo?: string;
	prisKallaUrl?: string;
	/**
	 * Free-text provenance note for `prisinfo` / `prisKallaUrl`.
	 *
	 * Example: "Hittat via scoutstuga.se: sökterm 'Bygget' → Pris-sektionen."
	 */
	prisKallaNotering?: string;
	bokningslank?: string;
	bokningsKallaUrl?: string;
	/**
	 * Free-text provenance note for `bokningslank` / `bokningsKallaUrl`.
	 */
	bokningsKallaNotering?: string;
	senastKontrollerad?: string; // ISO 8601 date
};
