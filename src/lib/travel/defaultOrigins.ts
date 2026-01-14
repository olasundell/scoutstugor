import type { LatLon } from "$lib/travel/types";

export type NamedOrigin = { label: string; coord: LatLon };

// Defaults requested for simplicity in the UI.
// Car: "Fyrskeppsvägen 55, 121 54 Johanneshov"
// PT:  "Kärrtorps tunnelbanestation"

export const DEFAULT_CAR_ORIGIN: NamedOrigin = {
	label: "Fyrskeppsvägen 55, 121 54 Johanneshov",
	// Resolved once (2026-01-14) via OpenStreetMap Nominatim
	coord: { lat: 59.2878842, lon: 18.1067874 },
};

export const DEFAULT_PT_ORIGIN: NamedOrigin = {
	label: "Kärrtorps tunnelbanestation",
	// Approx location of Kärrtorp metro station
	coord: { lat: 59.28416, lon: 18.11463 },
};
