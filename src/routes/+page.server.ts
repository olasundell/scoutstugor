import { env } from "$env/dynamic/private";
import { loadScoutstugor } from "$lib/server/scoutstugor";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const stugor = await loadScoutstugor();
	const regionLabel = env.SCOUTSTUGOR_REGION_LABEL?.trim() || "Stockholms län";
	return { stugor, regionLabel };
};
