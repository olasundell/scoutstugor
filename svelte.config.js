import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

const basePathEnv = process.env.BASE_PATH ?? "";
const basePathValue = basePathEnv.replace(/^\/+|\/+$/g, "");
const basePath = basePathValue ? `/${basePathValue}` : "";

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter(),
		paths: {
			base: basePath,
		},
	},
};

export default config;
