import { env } from "$env/dynamic/private";
import type { LatLon, PublicTransportLeg } from "$lib/travel/types";

type ResRobotTripResponse = {
	Trip?: Array<{
		LegList?: {
			Leg?: Array<{
				type?: string;
				// When walking, ResRobot commonly returns `type=WALK`
				duration?: string; // ISO8601 duration, e.g. PT5M
				dist?: number | string; // meters (best effort)
				direction?: string;
				Product?:
					| {
							name?: string;
							num?: string;
							catCode?: string;
							operator?: string;
					  }
					| Array<{
							name?: string;
							num?: string;
							catCode?: string;
							operator?: string;
					  }>;
				Origin?: {
					name?: string;
					date?: string;
					time?: string;
					depDate?: string;
					depTime?: string;
				};
				Destination?: {
					name?: string;
					date?: string;
					time?: string;
					arrDate?: string;
					arrTime?: string;
				};
			}>;
		};
		dur?: string; // sometimes ISO8601 duration
		chg?: number | string;
	}>;
};

type ResRobotNearbyStop = {
	extId?: string;
	id?: string;
	name?: string;
	lat?: string;
	lon?: string;
	dist?: number | string;
};

type ResRobotNearbyStopsResponse = {
	StopLocation?: ResRobotNearbyStop[] | ResRobotNearbyStop;
};

function requireAccessId(): string {
	if (!env.TRAFIKLAB_RESROBOT_ACCESS_ID) {
		throw new Error("Missing TRAFIKLAB_RESROBOT_ACCESS_ID");
	}
	return env.TRAFIKLAB_RESROBOT_ACCESS_ID;
}

class ResRobotHttpError extends Error {
	status: number;
	statusText: string;
	body: string;

	constructor(status: number, statusText: string, body: string) {
		const suffix = body ? ` - ${body.slice(0, 500)}` : "";
		super(`ResRobot trip failed: ${status} ${statusText}${suffix}`);
		this.status = status;
		this.statusText = statusText;
		this.body = body;
	}
}

function toIsoLocalDateTime(date?: string, time?: string): string | null {
	if (!date || !time) return null;
	// ResRobot gives local date/time; treat as local and convert to ISO string
	const parsed = new Date(`${date}T${time}`);
	if (!Number.isFinite(parsed.getTime())) return null;
	return parsed.toISOString();
}

function parseDistanceMeters(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const n = Number.parseFloat(value);
		return Number.isFinite(n) ? n : null;
	}
	return null;
}

function toArray<T>(value: T[] | T | undefined): T[] {
	if (!value) return [];
	return Array.isArray(value) ? value : [value];
}

function isNoNearbyStopsError(error: unknown): boolean {
	if (!(error instanceof ResRobotHttpError)) return false;
	return error.body.includes("SVC_LOC") || error.body.includes("H9220");
}

async function fetchTrip(url: URL): Promise<ResRobotTripResponse> {
	const res = await fetch(url);
	if (!res.ok) {
		const details = await res.text().catch(() => "");
		throw new ResRobotHttpError(res.status, res.statusText, details);
	}
	return (await res.json()) as ResRobotTripResponse;
}

async function fetchNearestStopId(
	lat: number,
	lon: number,
): Promise<{ id: string; name: string | null; dist: number | null } | null> {
	const accessId = requireAccessId();
	const url = new URL("https://api.resrobot.se/v2.1/location.nearbystops");
	url.searchParams.set("format", "json");
	url.searchParams.set("accessId", accessId);
	url.searchParams.set("originCoordLat", String(lat));
	url.searchParams.set("originCoordLong", String(lon));
	url.searchParams.set("maxNo", "1");
	url.searchParams.set("r", "10000");

	const res = await fetch(url);
	if (!res.ok) return null;
	const data = (await res.json()) as ResRobotNearbyStopsResponse;
	const first = toArray(data.StopLocation)[0];
	if (!first) return null;
	const id =
		typeof first.extId === "string" && first.extId.trim()
			? first.extId.trim()
			: typeof first.id === "string" && first.id.trim()
				? first.id.trim()
				: null;
	if (!id) return null;
	const name = typeof first.name === "string" ? first.name : null;
	const distRaw = first.dist;
	const dist =
		typeof distRaw === "number"
			? distRaw
			: typeof distRaw === "string"
				? Number.parseFloat(distRaw)
				: null;
	return { id, name, dist: Number.isFinite(dist) ? dist : null };
}

function buildTripUrl(params: {
	origin: LatLon;
	destination: LatLon;
	departAtIso: string;
	originStopId?: string | null;
	destStopId?: string | null;
}): URL {
	const accessId = requireAccessId();
	const url = new URL("https://api.resrobot.se/v2.1/trip");
	url.searchParams.set("format", "json");
	url.searchParams.set("accessId", accessId);

	if (params.originStopId) url.searchParams.set("originId", params.originStopId);
	else {
		url.searchParams.set("originCoordLat", String(params.origin.lat));
		url.searchParams.set("originCoordLong", String(params.origin.lon));
	}

	if (params.destStopId) url.searchParams.set("destId", params.destStopId);
	else {
		url.searchParams.set("destCoordLat", String(params.destination.lat));
		url.searchParams.set("destCoordLong", String(params.destination.lon));
	}

	// Allow longer walking distance to reduce "no nearby stops" errors.
	url.searchParams.set("maxWalkDist", "5000");
	url.searchParams.set("date", params.departAtIso.slice(0, 10)); // YYYY-MM-DD
	url.searchParams.set("time", params.departAtIso.slice(11, 16)); // HH:MM (best-effort)
	return url;
}

function parseIsoDurationMs(value: unknown): number | null {
	if (typeof value !== "string" || !value.startsWith("P")) return null;
	// Minimal ISO-8601 duration parser: PnDTnHnMnS (we only care about T-part)
	// Examples: PT5M, PT1H25M, PT30S
	const m = value.match(
		/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/,
	);
	if (!m) return null;
	const days = m[1] ? Number.parseInt(m[1], 10) : 0;
	const hours = m[2] ? Number.parseInt(m[2], 10) : 0;
	const minutes = m[3] ? Number.parseInt(m[3], 10) : 0;
	const seconds = m[4] ? Number.parseInt(m[4], 10) : 0;
	if (![days, hours, minutes, seconds].every((n) => Number.isFinite(n)))
		return null;
	return (
		days * 24 * 60 * 60_000 +
		hours * 60 * 60_000 +
		minutes * 60_000 +
		seconds * 1000
	);
}

function pickProduct(
	raw:
		| {
				name?: string;
				num?: string;
				catCode?: string;
				operator?: string;
		  }
		| Array<{
				name?: string;
				num?: string;
				catCode?: string;
				operator?: string;
		  }>
		| undefined,
): { name?: string; num?: string; catCode?: string; operator?: string } | null {
	if (!raw) return null;
	if (Array.isArray(raw)) return raw[0] ?? null;
	return raw;
}

function toIsoFromOrigin(origin: {
	date?: string;
	time?: string;
	depDate?: string;
	depTime?: string;
}): string | null {
	return (
		toIsoLocalDateTime(origin.depDate, origin.depTime) ??
		toIsoLocalDateTime(origin.date, origin.time)
	);
}

function toIsoFromDestination(dest: {
	date?: string;
	time?: string;
	arrDate?: string;
	arrTime?: string;
}): string | null {
	return (
		toIsoLocalDateTime(dest.arrDate, dest.arrTime) ??
		toIsoLocalDateTime(dest.date, dest.time)
	);
}

export async function resrobotTrip(
	origin: LatLon,
	destination: LatLon,
	departAtIso: string,
): Promise<{
	durationMs: number;
	departAt: string;
	arriveAt: string;
	changes: number | null;
	legs: PublicTransportLeg[];
}> {
	const departAt = new Date(departAtIso);
	if (!Number.isFinite(departAt.getTime())) {
		throw new Error("Invalid departAt");
	}

	let data: ResRobotTripResponse;
	try {
		data = await fetchTrip(
			buildTripUrl({ origin, destination, departAtIso }),
		);
	} catch (error) {
		if (isNoNearbyStopsError(error)) {
			const [originStop, destStop] = await Promise.all([
				fetchNearestStopId(origin.lat, origin.lon),
				fetchNearestStopId(destination.lat, destination.lon),
			]);
			console.info("[resrobotTrip] fallback nearby stops", {
				origin: { lat: origin.lat, lon: origin.lon },
				destination: { lat: destination.lat, lon: destination.lon },
				originStop,
				destStop,
			});
			if (originStop || destStop) {
				data = await fetchTrip(
					buildTripUrl({
						origin,
						destination,
						departAtIso,
						originStopId: originStop?.id,
						destStopId: destStop?.id,
					}),
				);
			} else {
				console.info("[resrobotTrip] no nearby stops found");
				throw error;
			}
		} else {
			throw error;
		}
	}
	const trips = data.Trip ?? [];
	if (trips.length === 0) {
		throw new Error("ResRobot trip returned no trips");
	}

	// Choose trip with earliest arrival (or shortest duration as fallback)
	let best: {
		durationMs: number;
		departAt: string;
		arriveAt: string;
		changes: number | null;
		legs: PublicTransportLeg[];
	} | null = null;

	for (const trip of trips) {
		const legs = trip.LegList?.Leg ?? [];
		const first = legs[0];
		const last = legs[legs.length - 1];
		const tripDepartIso = first?.Origin ? toIsoFromOrigin(first.Origin) : null;
		const tripArriveIso = last?.Destination
			? toIsoFromDestination(last.Destination)
			: null;
		if (!tripDepartIso || !tripArriveIso) continue;

		const departMs = Date.parse(tripDepartIso);
		const arriveMs = Date.parse(tripArriveIso);
		if (
			!Number.isFinite(departMs) ||
			!Number.isFinite(arriveMs) ||
			arriveMs <= departMs
		)
			continue;

		const durationMs = arriveMs - departMs;
		const changes =
			typeof trip.chg === "number"
				? trip.chg
				: typeof trip.chg === "string"
					? Number.parseInt(trip.chg, 10)
					: null;

		const normalizedLegs: PublicTransportLeg[] = [];
		for (const leg of legs) {
			const fromName = leg.Origin?.name ?? null;
			const toName = leg.Destination?.name ?? null;
			const legDepartAt = leg.Origin ? toIsoFromOrigin(leg.Origin) : null;
			const legArriveAt = leg.Destination
				? toIsoFromDestination(leg.Destination)
				: null;

			const type = typeof leg.type === "string" ? leg.type : "";
			if (type.toUpperCase() === "WALK") {
				const durationFromIso =
					legDepartAt && legArriveAt
						? Date.parse(legArriveAt) - Date.parse(legDepartAt)
						: null;
				const durationMs =
					typeof durationFromIso === "number" &&
					Number.isFinite(durationFromIso)
						? durationFromIso > 0
							? durationFromIso
							: null
						: parseIsoDurationMs(leg.duration);

				normalizedLegs.push({
					kind: "walk",
					fromName,
					toName,
					departAt: legDepartAt,
					arriveAt: legArriveAt,
					durationMs,
					distanceM: parseDistanceMeters(leg.dist),
				});
				continue;
			}

			const product = pickProduct(leg.Product);
			normalizedLegs.push({
				kind: "transit",
				fromName,
				toName,
				departAt: legDepartAt,
				arriveAt: legArriveAt,
				line: product?.num ?? null,
				productName: product?.name ?? null,
				catCode: product?.catCode ?? null,
				direction: typeof leg.direction === "string" ? leg.direction : null,
				operator: product?.operator ?? null,
			});
		}

		const candidate = {
			durationMs,
			departAt: tripDepartIso,
			arriveAt: tripArriveIso,
			changes,
			legs: normalizedLegs,
		};
		if (!best) {
			best = candidate;
			continue;
		}
		// prefer shorter duration
		if (candidate.durationMs < best.durationMs) best = candidate;
	}

	if (!best) {
		throw new Error("ResRobot trip returned unexpected payload");
	}
	return best;
}
