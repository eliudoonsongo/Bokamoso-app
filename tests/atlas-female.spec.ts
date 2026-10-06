import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { PNG } from "pngjs";

test.use({ launchOptions: { args: ["--enable-unsafe-swiftshader"] } });
test.setTimeout(240_000);

async function rendered(page: Page, testInfo: TestInfo, name: string) {
  await expect(page.locator('[data-ready="true"]')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect.poll(async () => {
    const image = PNG.sync.read(await page.locator("canvas").screenshot());
    let colored = 0;
    for (let offset = 0; offset < image.data.length; offset += 4) {
      if (Math.max(image.data[offset], image.data[offset + 1], image.data[offset + 2]) - Math.min(image.data[offset], image.data[offset + 1], image.data[offset + 2]) > 20) colored++;
    }
    return colored;
  }, { timeout: 15_000 }).toBeGreaterThan(150);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
}

async function choose(page: Page, identifier: string) {
  if (page.viewportSize()!.width <= 900) await page.getByRole("navigation", { name: "Atlas panels" }).getByRole("button", { name: "Find & layers", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search anatomy" }).fill(identifier);
  const result = page.getByRole("region", { name: "Anatomy search results" }).getByRole("button").first();
  await expect(result).toContainText(identifier);
  await result.click();
  if (page.viewportSize()!.width <= 900) await page.getByRole("navigation", { name: "Atlas panels" }).getByRole("button", { name: "Study", exact: true }).click();
}

test("female anatomy loads independently with real reproductive geometry and opt-in pregnancy references", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/atlas?model=female");
  await rendered(page, testInfo, "female-desktop");
  const models = page.getByRole("group", { name: "Anatomy reference" });
  await expect(models.getByRole("button", { name: "Female", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Adult female reference", { exact: true })).toBeVisible();
  await expect(page.getByText(/Adult female organ reference with partial skeleton/)).toBeVisible();
  expect(requests.some((url) => url.includes("/bodyparts3d-v4/"))).toBeFalsy();
  expect(new Set(requests.filter((url) => /female-\d+\.bin\.gz$/.test(url))).size).toBe(10);
  await expect(page.getByRole("checkbox", { name: "Show pregnancy reference", exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Show pregnancy reference", exact: true })).not.toBeChecked();
  await page.getByRole("combobox", { name: "Study topic" }).selectOption("reproduction");
  await expect(page.getByRole("combobox", { name: "Study topic" })).toHaveValue("reproduction");
  await choose(page, "HRA:VH_F_uterus");
  await expect(page.getByRole("heading", { name: "uterus", exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Anatomy study panel" })).toContainText("menstrual cycle");
  await page.getByRole("button", { name: "Isolate structure", exact: true }).click();
  await rendered(page, testInfo, "female-uterus-desktop");
  await page.getByRole("button", { name: "Atlas source and scope", exact: true }).click();
  const credits = page.getByRole("dialog");
  await expect(credits).toContainText("888 source meshes");
  await expect(credits).toContainText("1,073 named concepts");
  await expect(credits).toContainText("Kristen Browne and Heidi Schlehlein");
  await expect(credits.getByRole("link", { name: "HRA female dataset" })).toHaveAttribute("href", "https://doi.org/10.48539/HBM352.BTSQ.586");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await rendered(page, testInfo, `female-uterus-${viewport.width}`);
    const selector = await models.boundingBox();
    expect(selector).not.toBeNull();
    expect(selector!.x + selector!.width).toBeLessThanOrEqual(viewport.width);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("combobox", { name: "Study topic" }).selectOption("pregnancy");
  await expect(page.getByRole("checkbox", { name: "Show pregnancy reference", exact: true })).toBeChecked();
  await choose(page, "HRA:VH_F_placenta");
  await page.getByRole("button", { name: "Isolate structure", exact: true }).click();
  await rendered(page, testInfo, "pregnancy-reference");
  await models.getByRole("button", { name: "Male", exact: true }).click();
  await rendered(page, testInfo, "male-after-female");
  await expect(page.getByRole("combobox", { name: "Study topic" })).toHaveValue("overview");
  await expect(page.getByRole("checkbox", { name: "Show pregnancy reference", exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(requests.filter((url) => /\/api\/(chat|suite)$/.test(url))).toEqual([]);
});

test("female observations and source-grounded notebook handoffs retain the selected reference", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const created = await page.request.post("/api/notebooks", { data: { title: "Female anatomy observations", grade: 12, subject: "Life Sciences", module: "Human reproduction" } });
  expect(created.status()).toBe(201);
  const notebook = await created.json();
  const sources: { id: string }[] = [];
  for (const title of ["Reproduction chapter", "Additional notes"]) {
    const response = await page.request.post("/api/sources", { multipart: { notebookId: notebook.id, title, type: "textbook_chapter", text: "The uterus is a muscular organ whose lining changes during the menstrual cycle. The ovaries contain developing oocytes and produce hormones. This source is for a learning integration test." } });
    expect(response.status()).toBe(201);
    sources.push(await response.json());
  }
  const calls: string[] = [];
  page.on("request", (request) => { if (/\/api\/(chat|suite)$/.test(request.url())) calls.push(request.url()); });
  await page.goto(`/atlas?notebook=${notebook.id}&source=${sources[0].id}&model=female`);
  await rendered(page, testInfo, "female-notebook");
  await choose(page, "HRA:VH_F_uterus");
  await page.getByRole("textbox", { name: "Your observation" }).fill("The uterus is part of the female reproductive reference.");
  const selector = page.getByRole("group", { name: "Anatomy reference" });
  await selector.getByRole("button", { name: "Male", exact: true }).click();
  await rendered(page, testInfo, "male-draft-check");
  await choose(page, "FMA7088");
  await expect(page.getByRole("textbox", { name: "Your observation" })).toHaveValue("");
  await page.getByRole("textbox", { name: "Your observation" }).fill("A separate male reference observation.");
  await selector.getByRole("button", { name: "Female", exact: true }).click();
  await rendered(page, testInfo, "female-draft-return");
  await choose(page, "HRA:VH_F_uterus");
  await expect(page.getByRole("textbox", { name: "Your observation" })).toHaveValue("The uterus is part of the female reproductive reference.");
  await page.getByRole("button", { name: "Save observation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved to notebook", exact: true })).toBeDisabled();
  const data = await (await page.request.get(`/api/workspace?notebookId=${notebook.id}`)).json();
  expect(data.notes).toHaveLength(1);
  expect(data.notes[0].title).toContain("Female");
  expect(data.notes[0].content).toContain("Browne and Heidi Schlehlein");
  expect(data.notes[0].content).not.toContain("BodyParts3D");
  expect(data.progress.xp).toBe(0);
  await page.getByRole("link", { name: "Ask notebook", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Ask a question about your sources" })).toHaveValue(/uterus.*female anatomy reference/);
  await expect(page.getByRole("checkbox", { name: "Select Reproduction chapter", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Select Additional notes", exact: true })).not.toBeChecked();
  const atlasLink = page.getByRole("link", { name: /Human Atlas/ });
  await expect(atlasLink).toHaveAttribute("href", /model=female/);
  await atlasLink.click();
  await rendered(page, testInfo, "female-reopened");
  await expect(selector.getByRole("button", { name: "Female", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await rendered(page, testInfo, "female-after-reload");
  expect(calls).toEqual([]);
});