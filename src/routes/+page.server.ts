import { loadScoutstugor } from "$lib/server/scoutstugor";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const stugor = await loadScoutstugor();
	return { stugor };
};
