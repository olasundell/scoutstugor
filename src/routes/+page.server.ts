import { loadScoutstugorFromCsv } from "$lib/server/scoutstugor";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const stugor = await loadScoutstugorFromCsv();
	return { stugor };
};
