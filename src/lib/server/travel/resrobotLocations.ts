import { TRAFIKLAB_RESROBOT_ACCESS_ID } from "$env/dynamic/private";
import type { GeocodeResult } from "$lib/server/travel/graphhopper";

type ResRobotStopLocation = {
	name?: string;
	lat?: string;
	lon?: string;
};

type ResRobotCoordLocation = {
	name?: string;
	lat?: string;
	lon?: string;
};

type ResRobotLocationNameResponse = {
	LocationList?: {
		StopLocation?: ResRobotStopLocation[] | ResRobotStopLocation;
		CoordLocation?: ResRobotCoordLocation[] | ResRobotCoordLocation;
	};
};

function parseLatLon(lat?: string, lon?: string): { lat: number; lon: number } | null {
	if (!lat || !lon) return null;
	const la = Number.parseFloat(lat);
	const lo = Number.parseFloat(lon);
	if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
	return { lat: la, lon: lo };
}

function toArray<T>(value: T[] | T | undefined): T[] {
	if (!value) return [];
	return Array.isArray(value) ? value : [value];
}

function abortAfter(ms: number) {
	const controller = new AbortController();
	const t = setTimeout(() => controller.abort(), ms);
	return {
		signal: controller.signal,
		clear: () => clearTimeout(t),
	};
}

export async function resrobotLocationNameGeocode(
	query: string,
	limit = 5,
): Promise<GeocodeResult[]> {
	const accessId = (TRAFIKLAB_RESROBOT_ACCESS_ID || "").trim();
	if (!accessId) return [];

	const maxNo = Math.max(1, Math.min(10, limit));
	const url = new URL("https://api.resrobot.se/v2.1/location.name");
	url.searchParams.set("format", "json");
	url.searchParams.set("accessId", accessId);
	url.searchParams.set("input", query);
	url.searchParams.set("maxNo", String(maxNo));

	const { signal, clear } = abortAfter(7000);
	try {
		const res = await fetch(url, { signal });
		if (!res.ok) {
			throw new Error(
				`ResRobot location.name failed: ${res.status} ${res.statusText}`,
			);
		}
		const data = (await res.json()) as ResRobotLocationNameResponse;
		const list = data.LocationList;
		const stopLocations = toArray(list?.StopLocation);
		const coordLocations = toArray(list?.CoordLocation);

		const out: GeocodeResult[] = [];

		for (const s of stopLocations) {
			const coords = parseLatLon(s.lat, s.lon);
			const label = typeof s.name === "string" ? s.name.trim() : "";
			if (!coords || !label) continue;
			out.push({ label, lat: coords.lat, lon: coords.lon });
		}

		for (const c of coordLocations) {
			const coords = parseLatLon(c.lat, c.lon);
			const label = typeof c.name === "string" ? c.name.trim() : "";
			if (!coords || !label) continue;
			out.push({ label, lat: coords.lat, lon: coords.lon });
		}

		return out.slice(0, maxNo);
	} finally {
		clear();
	}
}

