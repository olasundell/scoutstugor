// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

declare module "$env/dynamic/private" {
	export const GRAPHHOPPER_API_KEY: string;
	export const TRAFIKLAB_RESROBOT_ACCESS_ID: string;
}

export {};
