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
};
