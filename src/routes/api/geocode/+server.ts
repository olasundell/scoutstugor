import { json } from "@sveltejs/kit";
import { graphhopperGeocode } from "$lib/server/travel/graphhopper";
import { resrobotLocationNameGeocode } from "$lib/server/travel/resrobotLocations";

export const GET = async ({ url }) => {
	const q = url.searchParams.get("q")?.trim() ?? "";
	if (!q) return json({ error: "Missing query param q" }, { status: 400 });

	const limitRaw = url.searchParams.get("limit");
	const limit = limitRaw
		? Math.max(1, Math.min(10, Number.parseInt(limitRaw, 10)))
		: 5;

	try {
		// Prefer GraphHopper for address-like queries, but it often misses
		// transit-stop terms (e.g. "tunnelbanestation"). Fallback to ResRobot
		// stop lookup when GraphHopper returns no hits or is unavailable.
		let ghError: string | null = null;
		try {
			const gh = await graphhopperGeocode(q, limit);
			if (gh.length > 0) return json({ results: gh });
		} catch (e) {
			ghError = e instanceof Error ? e.message : "Unknown GraphHopper error";
		}

		const rr = await resrobotLocationNameGeocode(q, limit);
		if (rr.length > 0) return json({ results: rr });

		// If both providers are unavailable, treat it as an error.
		if (ghError?.includes("Missing GRAPHHOPPER_API_KEY")) {
			return json(
				{
					error:
						"Geocoding is not configured (missing GRAPHHOPPER_API_KEY and/or TRAFIKLAB_RESROBOT_ACCESS_ID).",
				},
				{ status: 500 },
			);
		}

		return json({ results: [] });
	} catch (error) {
		return json(
			{
				error: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
};
