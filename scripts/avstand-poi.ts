import { readFile, writeFile } from "node:fs/promises";
import { resolveScoutstugorDataPaths } from "../src/lib/server/scoutstugorDataPaths";

type LatLon = {
	lat: number;
	lon: number;
};

type ScoutstugaJson = {
	id: string;
	namn: string;
	latitud: number | null;
	longitud: number | null;
	avstandBadplatsBilM?: number;
	avstandBadplatsGangM?: number;
	avstandMataffarBilM?: number;
	avstandMataffarGangM?: number;
};

type Args = {
	radiusM: number;
	candidates: number;
	limit?: number;
	sleepMs: number;
	retries: number;
	overpassUrl?: string;
	debug: boolean;
	forceRecount: boolean;
	osrmDrivingUrl: string;
	osrmFootUrl: string;
	osrmRetries: number;
};

type OverpassElement = {
	type?: "node" | "way" | "relation";
	id?: number;
	lat?: number;
	lon?: number;
	center?: { lat?: number; lon?: number };
};

function parseArgs(argv: string[]): Args {
	const args: Args = {
		radiusM: 20_000,
		candidates: 5,
		sleepMs: 400,
		retries: 3,
		debug: false,
		forceRecount: false,
		osrmDrivingUrl: "http://localhost:5005",
		osrmFootUrl: "http://localhost:5006",
		osrmRetries: 2,
	};

	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--radius") {
			const v = argv[i + 1];
			if (!v) throw new Error("--radius kräver ett tal i meter.");
			const n = Number.parseInt(v, 10);
			if (!Number.isFinite(n) || n <= 0)
				throw new Error("Ogiltigt tal för --radius.");
			args.radiusM = n;
			i++;
			continue;
		}
		if (a === "--candidates") {
			const v = argv[i + 1];
			if (!v) throw new Error("--candidates kräver ett tal.");
			const n = Number.parseInt(v, 10);
			if (!Number.isFinite(n) || n <= 0)
				throw new Error("Ogiltigt tal för --candidates.");
			args.candidates = n;
			i++;
			continue;
		}
		if (a === "--limit") {
			const v = argv[i + 1];
			if (!v) throw new Error("--limit kräver ett tal.");
			const n = Number.parseInt(v, 10);
			if (!Number.isFinite(n) || n <= 0)
				throw new Error("Ogiltigt tal för --limit.");
			args.limit = n;
			i++;
			continue;
		}
		if (a === "--sleep") {
			const v = argv[i + 1];
			if (!v) throw new Error("--sleep kräver ett tal i ms.");
			const n = Number.parseInt(v, 10);
			if (!Number.isFinite(n) || n < 0)
				throw new Error("Ogiltigt tal för --sleep.");
			args.sleepMs = n;
			i++;
			continue;
		}
		if (a === "--retries") {
			const v = argv[i + 1];
			if (!v) throw new Error("--retries kräver ett tal.");
			const n = Number.parseInt(v, 10);
			if (!Number.isFinite(n) || n < 0)
				throw new Error("Ogiltigt tal för --retries.");
			args.retries = n;
			i++;
			continue;
		}
		if (a === "--debug") {
			args.debug = true;
			continue;
		}
		if (a === "--force" || a === "--recount") {
			args.forceRecount = true;
			continue;
		}
		if (a === "--osrm-driving") {
			const v = argv[i + 1];
			if (!v) throw new Error("--osrm-driving kräver en URL.");
			args.osrmDrivingUrl = v;
			i++;
			continue;
		}
		if (a === "--osrm-foot") {
			const v = argv[i + 1];
			if (!v) throw new Error("--osrm-foot kräver en URL.");
			args.osrmFootUrl = v;
			i++;
			continue;
		}
		if (a === "--osrm-retries") {
			const v = argv[i + 1];
			if (!v) throw new Error("--osrm-retries kräver ett tal.");
			const n = Number.parseInt(v, 10);
			if (!Number.isFinite(n) || n < 0)
				throw new Error("Ogiltigt tal för --osrm-retries.");
			args.osrmRetries = n;
			i++;
			continue;
		}
		if (a === "--overpass") {
			const v = argv[i + 1];
			if (!v) throw new Error("--overpass kräver en URL.");
			args.overpassUrl = v;
			i++;
			continue;
		}
		throw new Error(`Okänd flagga: ${a}`);
	}

	return args;
}

function toRad(deg: number): number {
	return (deg * Math.PI) / 180;
}

function haversineMeters(a: LatLon, b: LatLon): number {
	const R = 6371_000;
	const dLat = toRad(b.lat - a.lat);
	const dLon = toRad(b.lon - a.lon);
	const lat1 = toRad(a.lat);
	const lat2 = toRad(b.lat);

	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(h));
}

function buildOverpassQuery(
	origin: LatLon,
	radiusM: number,
	tags: Array<{ key: string; value: string }>,
): string {
	const { lat, lon } = origin;
	const lines: string[] = [];

	for (const tag of tags) {
		lines.push(
			`node["${tag.key}"="${tag.value}"](around:${radiusM},${lat},${lon});`,
		);
		lines.push(
			`way["${tag.key}"="${tag.value}"](around:${radiusM},${lat},${lon});`,
		);
		lines.push(
			`relation["${tag.key}"="${tag.value}"](around:${radiusM},${lat},${lon});`,
		);
	}

	return `[out:json][timeout:25];(${lines.join("")});out center;`;
}

function extractPoints(elements: OverpassElement[]): LatLon[] {
	const points: LatLon[] = [];
	for (const el of elements) {
		const lat =
			typeof el.lat === "number"
				? el.lat
				: typeof el.center?.lat === "number"
					? el.center.lat
					: null;
		const lon =
			typeof el.lon === "number"
				? el.lon
				: typeof el.center?.lon === "number"
					? el.center.lon
					: null;
		if (lat === null || lon === null) continue;
		points.push({ lat, lon });
	}
	return points;
}

async function fetchOverpassPoints(
	origin: LatLon,
	radiusM: number,
	tags: Array<{ key: string; value: string }>,
	options: {
		retries: number;
		baseUrl: string;
	},
): Promise<LatLon[]> {
	const query = buildOverpassQuery(origin, radiusM, tags);
	let lastError: unknown = null;
	for (let attempt = 0; attempt <= options.retries; attempt++) {
		try {
			const res = await fetch(options.baseUrl, {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({ data: query }),
			});
			if (!res.ok) {
				throw new Error(`Overpass error: ${res.status} ${res.statusText}`);
			}
			const data = (await res.json()) as { elements?: OverpassElement[] };
			const elements = data.elements ?? [];
			return extractPoints(elements);
		} catch (error) {
			lastError = error;
			if (attempt < options.retries) {
				const backoffMs = 500 * 2 ** attempt;
				await new Promise((resolve) => setTimeout(resolve, backoffMs));
			}
		}
	}
	throw lastError ?? new Error("Overpass error");
}

async function nearestRoutingDistanceM(
	origin: LatLon,
	points: LatLon[],
	maxCandidates: number,
	osrmBaseUrl: string,
	profile: "driving" | "foot",
): Promise<number | null> {
	if (points.length === 0) return null;
	const candidates = [...points]
		.sort((a, b) => haversineMeters(origin, a) - haversineMeters(origin, b))
		.slice(0, maxCandidates);
	if (candidates.length === 0) return null;

	try {
		if (args.debug) {
			console.log("OSRM table candidates:", {
				origin,
				count: candidates.length,
				points: candidates,
				baseUrl: osrmBaseUrl,
				profile,
			});
		}
		const distancesM = await osrmTableDistances(
			osrmBaseUrl,
			profile,
			origin,
			candidates,
		);
		const filtered = distancesM.filter(
			(value) => Number.isFinite(value) && value >= 0,
		);
		if (filtered.length === 0) return null;
		return Math.min(...filtered);
	} catch (error) {
		console.warn("OSRM table failed, falling back to routes", error);
		let best: number | null = null;
		for (const candidate of candidates) {
			const route = await osrmRouteDistance(
				osrmBaseUrl,
				profile,
				origin,
				candidate,
			);
			if (!route) continue;
			if (best === null || route < best) best = route;
		}
		return best;
	}
}

const args = parseArgs(process.argv.slice(2));

async function osrmFetch(url: URL, retries: number): Promise<Response> {
	for (let attempt = 0; attempt <= retries; attempt++) {
		const res = await fetch(url);
		if (res.ok) return res;
		if (res.status === 429 || res.status >= 500) {
			const backoffMs = 300 * 2 ** attempt;
			await new Promise((resolve) => setTimeout(resolve, backoffMs));
			continue;
		}
		return res;
	}
	throw new Error("OSRM request failed after retries");
}

function buildOsrmCoords(origin: LatLon, destinations: LatLon[]): string {
	const points = [origin, ...destinations];
	return points.map((p) => `${p.lon},${p.lat}`).join(";");
}

async function osrmTableDistances(
	baseUrl: string,
	profile: "driving" | "foot",
	origin: LatLon,
	destinations: LatLon[],
): Promise<number[]> {
	const coords = buildOsrmCoords(origin, destinations);
	const url = new URL(`${baseUrl}/table/v1/${profile}/${coords}`);
	url.searchParams.set("sources", "0");
	url.searchParams.set(
		"destinations",
		destinations.map((_, idx) => idx + 1).join(";"),
	);
	url.searchParams.set("annotations", "distance");

	const res = await osrmFetch(url, args.osrmRetries);
	const responseText = await res
		.clone()
		.text()
		.catch(() => "");
	if (!res.ok) {
		throw new Error(
			`OSRM table failed: ${res.status} ${res.statusText} ${responseText}`,
		);
	}
	const data = (await res.json()) as {
		distances?: number[][];
	};
	const distRow = data.distances?.[0];
	let normalizedDistances = distRow;
	if (Array.isArray(distRow) && distRow.length === destinations.length + 1) {
		normalizedDistances = distRow.slice(1);
	}
	if (
		!normalizedDistances ||
		normalizedDistances.length !== destinations.length
	) {
		if (args.debug) {
			console.warn("OSRM table payload mismatch", {
				status: res.status,
				destinations: destinations.length,
				distancesLength: distRow?.length,
				body: responseText,
			});
		}
		throw new Error("OSRM table returned unexpected payload");
	}
	return normalizedDistances.map((m) => Math.round(m));
}

async function osrmRouteDistance(
	baseUrl: string,
	profile: "driving" | "foot",
	origin: LatLon,
	destination: LatLon,
): Promise<number | null> {
	const coords = `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;
	const url = new URL(`${baseUrl}/route/v1/${profile}/${coords}`);
	url.searchParams.set("overview", "false");
	const res = await osrmFetch(url, args.osrmRetries);
	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(
			`OSRM route failed: ${res.status} ${res.statusText} ${text}`,
		);
	}
	const data = (await res.json()) as { routes?: Array<{ distance?: number }> };
	const distance = data.routes?.[0]?.distance;
	if (typeof distance !== "number") return null;
	return Math.round(distance);
}
const overpassUrls = [
	"https://overpass-api.de/api/interpreter",
	"https://overpass.kumi.systems/api/interpreter",
	"https://overpass.nchc.org.tw/api/interpreter",
];
const baseOverpassUrl = args.overpassUrl ?? overpassUrls[0];
const dataPaths = resolveScoutstugorDataPaths();

const badplatsTags = [
	{ key: "leisure", value: "swimming_area" },
	{ key: "natural", value: "beach" },
];
const mataffarTags = [
	{ key: "shop", value: "supermarket" },
	{ key: "shop", value: "convenience" },
];

for (const [index, dataPath] of dataPaths.entries()) {
	if (dataPaths.length > 1) {
		console.log(`\n[${index + 1}/${dataPaths.length}] ${dataPath}`);
	}

	const jsonText = await readFile(dataPath, { encoding: "utf8" });
	const raw = JSON.parse(jsonText) as unknown;
	if (!Array.isArray(raw)) {
		throw new Error(`JSON måste vara en array: ${dataPath}`);
	}

	const items = raw as ScoutstugaJson[];
	const subset =
		typeof args.limit === "number" ? items.slice(0, args.limit) : items;

	for (const stuga of subset) {
		if (
			typeof stuga.latitud !== "number" ||
			typeof stuga.longitud !== "number"
		) {
			continue;
		}
		const origin = { lat: stuga.latitud, lon: stuga.longitud };
		const hasBadplatsBil = Number.isFinite(stuga.avstandBadplatsBilM);
		const hasBadplatsGang = Number.isFinite(stuga.avstandBadplatsGangM);
		const hasMataffarBil = Number.isFinite(stuga.avstandMataffarBilM);
		const hasMataffarGang = Number.isFinite(stuga.avstandMataffarGangM);
		const needsBadplatsBil = args.forceRecount || !hasBadplatsBil;
		const needsBadplatsGang = args.forceRecount || !hasBadplatsGang;
		const needsMataffarBil = args.forceRecount || !hasMataffarBil;
		const needsMataffarGang = args.forceRecount || !hasMataffarGang;
		const needsBadplats = needsBadplatsBil || needsBadplatsGang;
		const needsMataffar = needsMataffarBil || needsMataffarGang;

		if (!needsBadplats && !needsMataffar) {
			if (args.debug) {
				console.log(`${stuga.id}: avstånd finns redan, hoppar över`);
			}
			continue;
		}

		let badplatsPoints: LatLon[] = [];
		let mataffarPoints: LatLon[] = [];
		for (const baseUrl of [
			baseOverpassUrl,
			...overpassUrls.filter((u) => u !== baseOverpassUrl),
		]) {
			try {
				if (needsBadplats) {
					badplatsPoints = await fetchOverpassPoints(
						origin,
						args.radiusM,
						badplatsTags,
						{
							retries: args.retries,
							baseUrl,
						},
					);
				}
				if (needsMataffar) {
					mataffarPoints = await fetchOverpassPoints(
						origin,
						args.radiusM,
						mataffarTags,
						{
							retries: args.retries,
							baseUrl,
						},
					);
				}
				break;
			} catch (error) {
				if (baseUrl === overpassUrls[overpassUrls.length - 1]) {
					throw error;
				}
			}
		}

		const badplatsDistanceBil = needsBadplatsBil
			? await nearestRoutingDistanceM(
					origin,
					badplatsPoints,
					args.candidates,
					args.osrmDrivingUrl,
					"driving",
				)
			: null;
		const badplatsDistanceGang = needsBadplatsGang
			? await nearestRoutingDistanceM(
					origin,
					badplatsPoints,
					args.candidates,
					args.osrmFootUrl,
					"foot",
				)
			: null;
		const mataffarDistanceBil = needsMataffarBil
			? await nearestRoutingDistanceM(
					origin,
					mataffarPoints,
					args.candidates,
					args.osrmDrivingUrl,
					"driving",
				)
			: null;
		const mataffarDistanceGang = needsMataffarGang
			? await nearestRoutingDistanceM(
					origin,
					mataffarPoints,
					args.candidates,
					args.osrmFootUrl,
					"foot",
				)
			: null;

		if (typeof badplatsDistanceBil === "number")
			stuga.avstandBadplatsBilM = Math.round(badplatsDistanceBil);
		if (typeof badplatsDistanceGang === "number")
			stuga.avstandBadplatsGangM = Math.round(badplatsDistanceGang);
		if (typeof mataffarDistanceBil === "number")
			stuga.avstandMataffarBilM = Math.round(mataffarDistanceBil);
		if (typeof mataffarDistanceGang === "number")
			stuga.avstandMataffarGangM = Math.round(mataffarDistanceGang);

		console.log(
			`${stuga.id}: badplats bil ${
				typeof badplatsDistanceBil === "number"
					? `${Math.round(badplatsDistanceBil)} m`
					: "saknas"
			}, gång ${
				typeof badplatsDistanceGang === "number"
					? `${Math.round(badplatsDistanceGang)} m`
					: "saknas"
			} | mataffär bil ${
				typeof mataffarDistanceBil === "number"
					? `${Math.round(mataffarDistanceBil)} m`
					: "saknas"
			}, gång ${
				typeof mataffarDistanceGang === "number"
					? `${Math.round(mataffarDistanceGang)} m`
					: "saknas"
			}`,
		);

		if (args.sleepMs > 0) {
			await new Promise((resolve) => setTimeout(resolve, args.sleepMs));
		}
	}

	await writeFile(dataPath, `${JSON.stringify(items, null, "\t")}\n`, {
		encoding: "utf8",
	});
}
