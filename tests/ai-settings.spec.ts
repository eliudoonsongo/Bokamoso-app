import { test, expect } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`NVIDIA settings identify the actual model without overlap at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route("**/api/workspace*", async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      await route.fulfill({ response, json: { ...data, aiConfigured: true, ai: { provider: "nvidia", model: "nvidia/nemotron-3-super-120b-a12b" } } });
    });
    await page.goto("/");
    if (width < 768) {
      await page.getByRole("navigation", { name: "Workspace panels" }).getByRole("button", { name: "Studio", exact: true }).click();
      await page.getByRole("button", { name: "Studio settings", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "Workspace settings", exact: true }).click();
    }
    const dialog = page.getByRole("dialog");
    const engine = dialog.locator(".settings-row").first();
    await expect(engine.locator("small")).toHaveText("NVIDIA \u00b7 nvidia/nemotron-3-super-120b-a12b");
    await expect(engine.locator(".status-tag")).toHaveText("Configured");
    const description = await engine.locator("small").boundingBox();
    const status = await engine.locator(".status-tag").boundingBox();
    expect(description).not.toBeNull();
    expect(status).not.toBeNull();
    expect(description!.x + description!.width).toBeLessThanOrEqual(status!.x);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBeTruthy();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath("nvidia-settings.png"), fullPage: true });
  });
}