import { json } from "@sveltejs/kit";
import { graphhopperCarRoute } from "$lib/server/travel/graphhopper";
import { resrobotTrip } from "$lib/server/travel/resrobot";
import { bucketIsoDateTime, TtlCache } from "$lib/server/ttlCache";
import type { TravelRequest, TravelResponse } from "$lib/travel/types";

const carCache = new TtlCache<string, TravelResponse["car"]>({
	defaultTtlMs: 60 * 60_000,
});
const ptCache = new TtlCache<string, TravelResponse["pt"]>({
	defaultTtlMs: 5 * 60_000,
});

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function validateLatLon(value: unknown): { lat: number; lon: number } | null {
	if (typeof value !== "object" || value === null) return null;
	const v = value as Record<string, unknown>;
	const lat = v.lat;
	const lon = v.lon;
	if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) return null;
	if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
	return { lat, lon };
}

function formatHhMm(date: Date): string {
	const hh = String(date.getHours()).padStart(2, "0");
	const mm = String(date.getMinutes()).padStart(2, "0");
	return `${hh}:${mm}`;
}

export const POST = async ({ request, url }) => {
	let body: TravelRequest;
	try {
		body = (await request.json()) as TravelRequest;
	} catch {
		return json({ error: "Invalid JSON" }, { status: 400 });
	}

	if (body.mode !== "direct" && body.mode !== "hike") {
		return json({ error: "Invalid mode" }, { status: 400 });
	}

	// Hiking is reserved for later
	if (body.mode === "hike") {
		return json({ error: "Hiking mode not implemented yet" }, { status: 501 });
	}

	const destination = validateLatLon(body.destination);
	const carOrigin = validateLatLon(body.carOrigin);
	const ptOrigin = validateLatLon(body.ptOrigin);
	if (!destination || !carOrigin || !ptOrigin) {
		return json({ error: "Invalid coordinates" }, { status: 400 });
	}

	const departAt = typeof body.departAt === "string" ? body.departAt : "";
	if (!departAt || !Number.isFinite(Date.parse(departAt))) {
		return json(
			{ error: "Invalid departAt (expected ISO 8601)" },
			{ status: 400 },
		);
	}

	const departBucket = bucketIsoDateTime(departAt, 5);

	const carKey = `car:${carOrigin.lat},${carOrigin.lon}->${destination.lat},${destination.lon}`;
	const ptKey = `pt:${ptOrigin.lat},${ptOrigin.lon}->${destination.lat},${destination.lon}@${departBucket}`;

	try {
		const carCached = carCache.get(carKey);
		const ptCached = ptCache.get(ptKey);

		const [car, pt] = await Promise.all([
			carCached ??
				graphhopperCarRoute(carOrigin, destination).then((result) => {
					carCache.set(carKey, result);
					return result;
				}),
			ptCached ??
				resrobotTrip(ptOrigin, destination, departAt).then((result) => {
					ptCache.set(ptKey, result);
					return result;
				}),
		]);

		const destinationLabel =
			typeof body.destinationLabel === "string"
				? body.destinationLabel
				: undefined;
		const carOriginLabel =
			body.originLabels && typeof body.originLabels.car === "string"
				? body.originLabels.car
				: undefined;
		const ptOriginLabel =
			body.originLabels && typeof body.originLabels.pt === "string"
				? body.originLabels.pt
				: undefined;

		const slDate = departAt.slice(0, 10);
		const slTime = formatHhMm(new Date(departAt));
		const slFrom = ptOriginLabel ?? `${ptOrigin.lat},${ptOrigin.lon}`;
		const slTo = destinationLabel ?? `${destination.lat},${destination.lon}`;

		const base = url.origin;
		const response: TravelResponse = {
			mode: body.mode,
			car,
			pt,
			deepLinks: {
				carGoogleMaps: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
					carOriginLabel ?? `${carOrigin.lat},${carOrigin.lon}`,
				)}&destination=${encodeURIComponent(
					destinationLabel ?? `${destination.lat},${destination.lon}`,
				)}&travelmode=driving`,
				// Best-effort SL deep link (works with text in many cases)
				ptSl: `https://www.sl.se/reseplanering/?from=${encodeURIComponent(
					slFrom,
				)}&to=${encodeURIComponent(slTo)}&date=${encodeURIComponent(
					slDate,
				)}&time=${encodeURIComponent(slTime)}&searchType=DEPARTURE`,
			},
		};

		return json(response, {
			headers: {
				// allow browser caching a little too
				"cache-control": "private, max-age=30",
				"x-debug-origin": base,
			},
		});
	} catch (error) {
		return json(
			{
				error: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
};
