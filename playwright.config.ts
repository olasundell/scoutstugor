import { defineConfig } from "@playwright/test";

const port = process.env.E2E_PORT ?? "5173";
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
	testDir: "e2e",
	timeout: 60_000,
	expect: {
		timeout: 10_000,
	},
	projects: [
		{
			name: "chromium",
			use: { browserName: "chromium" },
		},
	],
	use: {
		baseURL,
		headless: true,
		trace: "on-first-retry",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},
	webServer: {
		command: `bun run dev -- --host 127.0.0.1 --port ${port}`,
		url: baseURL,
		reuseExistingServer: true,
		timeout: 120_000,
	},
});
