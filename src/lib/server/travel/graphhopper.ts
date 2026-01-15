import { env } from "$env/dynamic/private";
import type { LatLon } from "$lib/travel/types";

type GraphHopperGeocodeHit = {
	point?: { lat?: number; lng?: number };
	name?: string;
	country?: string;
	city?: string;
	street?: string;
	housenumber?: string;
	state?: string;
	postcode?: string;
};

type GraphHopperGeocodeResponse = {
	hits?: GraphHopperGeocodeHit[];
};

type GraphHopperRouteResponse = {
	paths?: Array<{
		time?: number; // ms
		distance?: number; // meters
	}>;
};

type GraphHopperMatrixResponse = {
	times?: number[][]; // seconds
	distances?: number[][]; // meters
};

function requireKey(): string {
	if (!env.GRAPHHOPPER_API_KEY) {
		throw new Error("Missing GRAPHHOPPER_API_KEY");
	}
	return env.GRAPHHOPPER_API_KEY;
}

export type GeocodeResult = {
	label: string;
	lat: number;
	lon: number;
	country?: string;
	city?: string;
	street?: string;
	housenumber?: string;
	postcode?: string;
	state?: string;
};

export async function graphhopperGeocode(
	query: string,
	limit = 5,
): Promise<GeocodeResult[]> {
	const key = requireKey();
	const url = new URL("https://graphhopper.com/api/1/geocode");
	url.searchParams.set("q", query);
	url.searchParams.set("locale", "sv");
	url.searchParams.set("limit", String(limit));
	url.searchParams.set("key", key);

	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(
			`GraphHopper geocode failed: ${res.status} ${res.statusText}`,
		);
	}
	const data = (await res.json()) as GraphHopperGeocodeResponse;
	const hits = data.hits ?? [];

	const results: GeocodeResult[] = [];
	for (const hit of hits) {
		const lat = hit.point?.lat;
		const lon = hit.point?.lng;
		if (typeof lat !== "number" || typeof lon !== "number") continue;

		const parts = [
			hit.name,
			hit.street,
			hit.housenumber,
			hit.postcode,
			hit.city,
			hit.state,
			hit.country,
		].filter((v) => typeof v === "string" && v.trim().length > 0);

		const result: GeocodeResult = {
			label: parts.join(", "),
			lat,
			lon,
			...(hit.country ? { country: hit.country } : {}),
			...(hit.city ? { city: hit.city } : {}),
			...(hit.street ? { street: hit.street } : {}),
			...(hit.housenumber ? { housenumber: hit.housenumber } : {}),
			...(hit.postcode ? { postcode: hit.postcode } : {}),
			...(hit.state ? { state: hit.state } : {}),
		};
		results.push(result);
	}
	return results;
}

export async function graphhopperCarRoute(origin: LatLon, destination: LatLon) {
	const key = requireKey();
	const url = new URL("https://graphhopper.com/api/1/route");
	url.searchParams.append("point", `${origin.lat},${origin.lon}`);
	url.searchParams.append("point", `${destination.lat},${destination.lon}`);
	url.searchParams.set("vehicle", "car");
	url.searchParams.set("locale", "sv");
	url.searchParams.set("calc_points", "false");
	url.searchParams.set("key", key);

	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(
			`GraphHopper route failed: ${res.status} ${res.statusText}`,
		);
	}
	const data = (await res.json()) as GraphHopperRouteResponse;
	const path = data.paths?.[0];
	const time = path?.time;
	const distance = path?.distance;
	if (typeof time !== "number" || typeof distance !== "number") {
		throw new Error("GraphHopper route returned unexpected payload");
	}
	return { durationMs: time, distanceM: distance };
}

export async function graphhopperCarMatrix(
	origin: LatLon,
	destinations: LatLon[],
): Promise<{ durationsMs: number[]; distancesM: number[] }> {
	const key = requireKey();
	const url = new URL("https://graphhopper.com/api/1/matrix");
	url.searchParams.set("key", key);

	const body = {
		profile: "car",
		// GraphHopper expects points as [lon,lat]
		points: [
			[origin.lon, origin.lat],
			...destinations.map((d) => [d.lon, d.lat]),
		],
		sources: [0],
		destinations: destinations.map((_, idx) => idx + 1),
		out_arrays: ["times", "distances"],
	} as const;

	const res = await fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		throw new Error(
			`GraphHopper matrix failed: ${res.status} ${res.statusText}`,
		);
	}
	const data = (await res.json()) as GraphHopperMatrixResponse;
	const timesRow = data.times?.[0];
	const distRow = data.distances?.[0];
	if (!timesRow || !distRow || timesRow.length !== destinations.length) {
		throw new Error("GraphHopper matrix returned unexpected payload");
	}
	return {
		durationsMs: timesRow.map((sec) => Math.round(sec * 1000)),
		distancesM: distRow.map((m) => Math.round(m)),
	};
}
