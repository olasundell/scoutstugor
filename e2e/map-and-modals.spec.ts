import { expect, test } from "@playwright/test";
import { resolveRegionLabel } from "./utils/scoutstugor";

test("opens detail card from map marker and toggles modals", async ({
	page,
}) => {
	await page.goto("/");
	const regionLabel = resolveRegionLabel();
	await expect(
		page.getByRole("heading", { name: `Scoutstugor i ${regionLabel}` }),
	).toBeVisible();

	await page.locator(".leaflet-marker-icon").first().waitFor();
	await page.locator(".leaflet-marker-icon").first().click();

	await expect(page.locator(".detailSection .card")).toBeVisible();
	await expect(page.locator(".detailSection .name")).toBeVisible();

	await page
		.getByRole("button", { name: "Planera övernattning/hajk" })
		.click();
	const travelDialog = page.getByRole("dialog", {
		name: "Planera övernattning/hajk",
	});
	await expect(travelDialog).toBeVisible();
	await travelDialog.getByLabel("Stäng").click();
	await expect(travelDialog).toBeHidden();

	await page
		.getByRole("button", { name: /Beräkna restider \(kollektivtrafik\)/ })
		.click();
	const batchDialog = page.getByRole("dialog", {
		name: "Beräkna restider för urval",
	});
	await expect(batchDialog).toBeVisible();
	await batchDialog.getByRole("button", { name: "Avbryt" }).click();
	await expect(batchDialog).toBeHidden();
});
