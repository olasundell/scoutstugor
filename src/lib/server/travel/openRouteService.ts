import { env } from "$env/dynamic/private";
import type { HikeProfilePoint, LatLon } from "$lib/travel/types";

type OrsDirectionsGeoJson = {
	features?: Array<{
		properties?: {
			summary?: {
				distance?: number; // meters
				duration?: number; // seconds
			};
		};
		geometry?: {
			type?: string;
			coordinates?: Array<[number, number, number?]>;
		};
	}>;
};

function requireKey(): string {
	const key = (env.OPENROUTESERVICE_API_KEY || "").trim();
	if (!key) {
		throw new Error("Missing OPENROUTESERVICE_API_KEY");
	}
	return key;
}

function baseUrl(): string {
	return (env.OPENROUTESERVICE_BASE_URL || "https://api.openrouteservice.org")
		.trim()
		.replace(/\/+$/, "");
}

function haversineMeters(a: LatLon, b: LatLon): number {
	const r = 6371e3;
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const dLat = toRad(b.lat - a.lat);
	const dLon = toRad(b.lon - a.lon);
	const lat1 = toRad(a.lat);
	const lat2 = toRad(b.lat);
	const sinDLat = Math.sin(dLat / 2);
	const sinDLon = Math.sin(dLon / 2);
	const h =
		sinDLat * sinDLat +
		Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
	return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

function buildProfile(
	coords: Array<[number, number, number?]>,
): {
	profile: HikeProfilePoint[];
	ascentM: number;
	descentM: number;
	route: LatLon[];
} {
	const profile: HikeProfilePoint[] = [];
	const route: LatLon[] = [];
	let ascentM = 0;
	let descentM = 0;
	let distanceM = 0;
	let prev: { lat: number; lon: number; ele: number | null } | null = null;

	for (const [lon, lat, eleRaw] of coords) {
		route.push({ lat, lon });
		const ele = typeof eleRaw === "number" ? eleRaw : null;
		if (!prev) {
			profile.push({
				distanceM: 0,
				elevationM: ele ?? 0,
			});
			prev = { lat, lon, ele };
			continue;
		}

		distanceM += haversineMeters(
			{ lat: prev.lat, lon: prev.lon },
			{ lat, lon },
		);

		if (typeof prev.ele === "number" && typeof ele === "number") {
			const diff = ele - prev.ele;
			if (diff > 0) ascentM += diff;
			else if (diff < 0) descentM += Math.abs(diff);
		}

		profile.push({
			distanceM: Math.round(distanceM),
			elevationM: ele ?? (prev.ele ?? 0),
		});
		prev = { lat, lon, ele };
	}

	return {
		profile,
		ascentM: Math.round(ascentM),
		descentM: Math.round(descentM),
		route,
	};
}

export async function openRouteServiceHikeRoute(
	origin: LatLon,
	destination: LatLon,
): Promise<{
	durationMs: number;
	distanceM: number;
	ascentM: number;
	descentM: number;
	profile: HikeProfilePoint[];
}> {
	const key = requireKey();
	const url = new URL(`${baseUrl()}/v2/directions/foot-hiking/geojson`);
	url.searchParams.set("api_key", key);

	const body = {
		coordinates: [
			[origin.lon, origin.lat],
			[destination.lon, destination.lat],
		],
		elevation: true,
		instructions: false,
		geometry_simplify: false,
		units: "m",
	};

	const res = await fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		const detail = await res.text().catch(() => "");
		throw new Error(
			`OpenRouteService hike failed: ${res.status} ${res.statusText}${
				detail ? ` - ${detail.slice(0, 500)}` : ""
			}`,
		);
	}

	const data = (await res.json()) as OrsDirectionsGeoJson;
	const feature = data.features?.[0];
	const summary = feature?.properties?.summary;
	const geometry = feature?.geometry;
	const distance = summary?.distance;
	const duration = summary?.duration;
	const coords = geometry?.coordinates ?? [];

	if (
		typeof distance !== "number" ||
		typeof duration !== "number" ||
		coords.length < 2
	) {
		throw new Error("OpenRouteService returned unexpected payload");
	}

	const { profile, ascentM, descentM, route } = buildProfile(coords);

	return {
		durationMs: Math.round(duration * 1000),
		distanceM: Math.round(distance),
		ascentM,
		descentM,
		route,
		profile,
	};
}
