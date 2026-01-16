import { expect, test } from "@playwright/test";
import { loadScoutstugorData, resolveRegionLabel } from "./utils/scoutstugor";

let stugor: Awaited<ReturnType<typeof loadScoutstugorData>>;

test.beforeAll(async () => {
	stugor = await loadScoutstugorData();
});

function parseSummary(text: string): { showing: number; total: number } {
	const match = text.match(/Visar\s+(\d+)\s+av\s+(\d+)/);
	if (!match) {
		throw new Error(`Unexpected summary text: "${text}"`);
	}
	return { showing: Number(match[1]), total: Number(match[2]) };
}

test("filters by kommun and coordinates, then resets", async ({ page }) => {
	await page.goto("/");
	const regionLabel = resolveRegionLabel();
	await expect(
		page.getByRole("heading", { name: `Scoutstugor i ${regionLabel}` }),
	).toBeVisible();

	await page.locator(".leaflet-container").waitFor();

	const summaryText = await page.locator(".summary").innerText();
	const summary = parseSummary(summaryText);
	expect(summary.total).toBe(stugor.length);
	expect(summary.showing).toBe(stugor.length);

	const kommunSelect = page.getByLabel("Kommun");
	await expect
		.poll(async () => kommunSelect.locator("option").count())
		.toBeGreaterThan(1);
	const optionValues = await kommunSelect.locator("option").evaluateAll(
		(options) =>
			options
				.map((option) => option.getAttribute("value") ?? "")
				.filter((value) => value !== ""),
	);
	const optionValue = optionValues[0] ?? "";
	if (!optionValue) {
		test.skip(true, "No kommun options to filter by.");
	}
	const kommunCount = stugor.filter(
		(stuga) => stuga.kommun === optionValue,
	).length;

	await kommunSelect.selectOption(optionValue);
	await expect(kommunSelect).toHaveValue(optionValue);
	await expect
		.poll(async () => parseSummary(await page.locator(".summary").innerText()))
		.toEqual({ showing: kommunCount, total: stugor.length });

	await page.getByText("Avancerat urval").click();
	await page.getByLabel("Har koordinater").check();
	const kommunWithCoords = stugor.filter(
		(stuga) =>
			stuga.kommun === optionValue &&
			stuga.latitud !== null &&
			stuga.longitud !== null,
	).length;

	await expect
		.poll(async () => parseSummary(await page.locator(".summary").innerText()))
		.toEqual({ showing: kommunWithCoords, total: stugor.length });

	await page.getByRole("button", { name: "Rensa" }).click();
	await expect
		.poll(async () => parseSummary(await page.locator(".summary").innerText()))
		.toEqual({ showing: stugor.length, total: stugor.length });
	await expect(page.getByLabel("Har koordinater")).not.toBeChecked();
});
