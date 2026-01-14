import { json } from "@sveltejs/kit";
import { resrobotTrip } from "$lib/server/travel/resrobot";
import { bucketIsoDateTime, TtlCache } from "$lib/server/ttlCache";

type LatLon = { lat: number; lon: number };

type BatchRequest = {
	mode: "direct" | "hike";
	departAt: string; // ISO 8601
	ptOrigin: LatLon;
	destinations: Array<LatLon & { id: string }>;
};

type BatchResult = {
	id: string;
	pt: {
		durationMs: number;
		departAt: string;
		arriveAt: string;
		changes: number | null;
	};
};

const ptCache = new TtlCache<string, BatchResult["pt"]>({
	defaultTtlMs: 5 * 60_000,
});

type BatchError = { id: string; error: string };

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function validateLatLon(value: unknown): LatLon | null {
	if (typeof value !== "object" || value === null) return null;
	const v = value as Record<string, unknown>;
	const lat = v.lat;
	const lon = v.lon;
	if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) return null;
	if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
	return { lat, lon };
}

async function mapWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let nextIndex = 0;

	const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
		while (true) {
			const index = nextIndex;
			nextIndex += 1;
			if (index >= items.length) return;
			results[index] = await mapper(items[index] as T, index);
		}
	});

	await Promise.all(workers);
	return results;
}

export const POST = async ({ request }) => {
	let body: BatchRequest;
	try {
		body = (await request.json()) as BatchRequest;
	} catch {
		return json({ error: "Invalid JSON" }, { status: 400 });
	}
	console.info("[travel/batch] request", {
		mode: body.mode,
		departAt: body.departAt,
		destinations: Array.isArray(body.destinations)
			? body.destinations.length
			: 0,
	});

	if (body.mode !== "direct" && body.mode !== "hike") {
		return json({ error: "Invalid mode" }, { status: 400 });
	}
	if (body.mode === "hike") {
		return json({ error: "Hiking mode not implemented yet" }, { status: 501 });
	}

	const ptOrigin = validateLatLon(body.ptOrigin);
	if (!ptOrigin) return json({ error: "Invalid origins" }, { status: 400 });

	const departAt = typeof body.departAt === "string" ? body.departAt : "";
	if (!departAt || !Number.isFinite(Date.parse(departAt))) {
		return json(
			{ error: "Invalid departAt (expected ISO 8601)" },
			{ status: 400 },
		);
	}
	const departBucket = bucketIsoDateTime(departAt, 5);

	const destinations = Array.isArray(body.destinations)
		? body.destinations
		: [];
	if (destinations.length === 0)
		return json({ results: [] satisfies BatchResult[] });

	const validated: Array<LatLon & { id: string }> = [];
	for (const item of destinations) {
		if (typeof item !== "object" || item === null) continue;
		const id = (item as { id?: unknown }).id;
		if (typeof id !== "string" || !id) continue;
		const coord = validateLatLon(item);
		if (!coord) continue;
		validated.push({ id, ...coord });
	}

	try {
		// ---- PT (limited concurrency) ----
		const ptById = new Map<string, BatchResult["pt"]>();
		const uncachedPt: Array<LatLon & { id: string }> = [];

		for (const d of validated) {
			const key = `pt:${ptOrigin.lat},${ptOrigin.lon}->${d.lat},${d.lon}@${departBucket}`;
			const cached = ptCache.get(key);
			if (cached) ptById.set(d.id, cached);
			else uncachedPt.push(d);
		}

		const ptResults = await mapWithConcurrency(uncachedPt, 4, async (d) => {
			try {
				const value = await resrobotTrip(
					ptOrigin,
					{ lat: d.lat, lon: d.lon },
					departAt,
				);
				const key = `pt:${ptOrigin.lat},${ptOrigin.lon}->${d.lat},${d.lon}@${departBucket}`;
				ptCache.set(key, value);
				return { id: d.id, value };
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error("[travel/batch] resrobotTrip failed", {
					id: d.id,
					origin: ptOrigin,
					destination: { lat: d.lat, lon: d.lon },
					departAt,
					error: message,
				});
				return { id: d.id, error: message };
			}
		});

		const errors: BatchError[] = [];
		for (const r of ptResults) {
			if ("value" in r && r.value) ptById.set(r.id, r.value);
			else if ("error" in r) errors.push({ id: r.id, error: r.error });
		}

		const results: BatchResult[] = [];
		for (const d of validated) {
			const pt = ptById.get(d.id);
			if (!pt) continue;
			results.push({ id: d.id, pt });
		}

		if (errors.length > 0) {
			console.warn("[travel/batch] completed with errors", {
				successes: results.length,
				errors: errors.length,
			});
		}

		return json({ results, errors });
	} catch (error) {
		console.error("[travel/batch] request failed", {
			mode: body.mode,
			departAt: body.departAt,
			origin: body.ptOrigin,
			destinations: Array.isArray(body.destinations)
				? body.destinations.length
				: 0,
			error: error instanceof Error ? error.message : error,
		});
		return json(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			{ status: 500 },
		);
	}
};
