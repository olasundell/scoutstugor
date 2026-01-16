import { env } from "$env/dynamic/private";
import { loadScoutstugor } from "$lib/server/scoutstugor";
import { resolveScoutstugorDataPaths } from "$lib/server/scoutstugorDataPaths";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const stugor = await loadScoutstugor();
	const dataPaths = resolveScoutstugorDataPaths();
	const regionLabel =
		env.SCOUTSTUGOR_REGION_LABEL?.trim() ||
		(dataPaths.length > 1 ? "Sverige" : "Stockholms län");
	return { stugor, regionLabel };
};
