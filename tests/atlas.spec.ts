import { createHash } from "node:crypto";
import { test, expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { PNG } from "pngjs";

test.use({ launchOptions: { args: ["--enable-unsafe-swiftshader"] } });
test.setTimeout(180_000);

async function loadedCanvas(page: Page) {
  await expect(page.locator('[data-ready="true"]')).toBeVisible({ timeout: 120_000 });
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  return canvas;
}

function anatomyPixels(buffer: Buffer) {
  const image = PNG.sync.read(buffer);
  let colored = 0;
  let left = image.width;
  let right = 0;
  let top = image.height;
  let bottom = 0;
  for (let row = 0; row < image.height; row++) for (let column = 0; column < image.width; column++) {
    const offset = (row * image.width + column) * 4;
    const channels = [image.data[offset], image.data[offset + 1], image.data[offset + 2]];
    if (Math.max(...channels) - Math.min(...channels) > 20) {
      colored++;
      left = Math.min(left, column); right = Math.max(right, column);
      top = Math.min(top, row); bottom = Math.max(bottom, row);
    }
  }
  return { colored, left, right, top, bottom, width: image.width, height: image.height };
}

async function expectAnatomy(canvas: Locator, testInfo: TestInfo, name: string) {
  await expect.poll(async () => anatomyPixels(await canvas.screenshot()).colored, { timeout: 20_000 }).toBeGreaterThan(150);
  const pixels = anatomyPixels(await canvas.screenshot({ path: testInfo.outputPath(`${name}-canvas.png`) }));
  expect(pixels.width).toBeGreaterThan(100);
  expect(pixels.height).toBeGreaterThan(100);
  expect(pixels.colored).toBeGreaterThan(pixels.width * pixels.height * 0.004);
  expect(pixels.left).toBeGreaterThan(0);
  expect(pixels.right).toBeLessThan(pixels.width - 1);
  expect(pixels.top).toBeGreaterThan(0);
  expect(pixels.bottom).toBeLessThan(pixels.height - 1);
}

async function selectHeart(page: Page) {
  await page.getByRole("searchbox", { name: "Search anatomy" }).fill("FMA7088");
  await page.getByRole("region", { name: "Anatomy search results" }).getByRole("button").first().click();
}

test("Life Sciences students explore, save an observation and return to the same selected sources", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const anatomyRequests: string[] = [];
  const aiRequests: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/atlas/bodyparts3d-v4/")) anatomyRequests.push(request.url());
    if (/\/api\/(chat|suite)$/.test(request.url())) aiRequests.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Newton");
  await expect(page.getByRole("link", { name: /Human Atlas/ })).toHaveCount(0);
  expect(anatomyRequests).toEqual([]);

  await page.getByRole("button", { name: "Bokamoso notebooks", exact: true }).click();
  await page.getByRole("button", { name: "New notebook", exact: true }).click();
  await page.getByLabel("Notebook name", { exact: true }).fill("Life Sciences: circulation");
  await page.getByLabel("Subject", { exact: true }).fill("Life Sciences");
  await page.getByLabel("Module / unit", { exact: true }).fill("Transport in humans");
  const creating = page.waitForResponse((response) => response.url().endsWith("/api/notebooks") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Create notebook", exact: true }).click();
  const created = await creating;
  expect(created.status()).toBe(201);
  const notebook = await created.json();
  await expect(page.getByRole("link", { name: /Human Atlas/ })).toBeVisible();
  expect(anatomyRequests).toEqual([]);
  const sources = [];
  for (const title of ["Circulation chapter", "Revision notes"]) {
    const response = await page.request.post("/api/sources", { multipart: { notebookId: notebook.id, title, type: "textbook_chapter", text: "The heart is a muscular pump. The right side sends blood to the lungs and the left side sends blood through the systemic circulation. Valves help direct blood flow through the heart." } });
    expect(response.status()).toBe(201);
    sources.push(await response.json());
  }
  await page.goto(`/?notebook=${notebook.id}`);
  const before = await (await page.request.get(`/api/workspace?notebookId=${notebook.id}`)).json();
  await expect(page.getByRole("link", { name: /Human Atlas/ })).toBeVisible();
  await page.getByRole("checkbox", { name: "Select Revision notes", exact: true }).uncheck();
  expect(anatomyRequests).toEqual([]);
  await page.getByRole("link", { name: /Human Atlas/ }).click();
  await expect(page).toHaveURL(/\/atlas\?/);
  const canvas = await loadedCanvas(page);
  await expectAnatomy(canvas, testInfo, "desktop-body");
  expect(anatomyRequests.some((url) => url.endsWith(".bin.gz"))).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath("desktop-atlas.png"), fullPage: true });

  const bounds = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: bounds.width / 2, y: bounds.height * 0.35 } });
  await expect(page.getByRole("heading", { name: "Selected structure", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reset anatomy view", exact: true }).click();
  const stillFrame = createHash("sha256").update(await canvas.screenshot()).digest("hex");
  await page.getByRole("button", { name: "Rotate anatomy", exact: true }).click();
  await expect.poll(async () => createHash("sha256").update(await canvas.screenshot()).digest("hex"), { timeout: 15_000 }).not.toBe(stillFrame);
  await page.getByRole("button", { name: "Pause rotation", exact: true }).click();

  await page.getByRole("button", { name: "Reset anatomy view", exact: true }).click();
  const frontFrame = createHash("sha256").update(await canvas.screenshot()).digest("hex");
  await page.getByRole("combobox", { name: "Camera view" }).selectOption("side");
  await expect.poll(async () => createHash("sha256").update(await canvas.screenshot()).digest("hex")).not.toBe(frontFrame);
  await page.getByRole("combobox", { name: "Camera view" }).selectOption("front");
  const unzoomed = createHash("sha256").update(await canvas.screenshot()).digest("hex");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect.poll(async () => createHash("sha256").update(await canvas.screenshot()).digest("hex")).not.toBe(unzoomed);
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 80, bounds.y + bounds.height / 2 + 20, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByRole("heading", { name: "Study focus", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Organs", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Show heart", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Show muscles", exact: true })).not.toBeChecked();
  await page.getByRole("checkbox", { name: "Show skeleton", exact: true }).check();
  await page.getByRole("button", { name: "Skeleton", exact: true }).click();
  const explode = page.getByRole("slider", { name: "Explode anatomy", exact: true });
  await explode.focus();
  await explode.press("End");
  await expect(explode).toHaveValue("100");
  await expect(page.getByRole("combobox", { name: "Camera view" })).toBeDisabled();
  await expectAnatomy(canvas, testInfo, "desktop-exploded");
  await page.screenshot({ path: testInfo.outputPath("desktop-exploded-atlas.png"), fullPage: true });
  await explode.press("Home");
  await expect(explode).toHaveValue("0");
  await page.getByRole("combobox", { name: "Study topic" }).selectOption("circulation");
  await selectHeart(page);
  const inspector = page.getByRole("complementary", { name: "Anatomy study panel" });
  await expect(inspector.getByRole("heading", { name: "heart", exact: true })).toBeVisible();
  await expect(inspector).toContainText("83 included pieces");
  await inspector.getByRole("button", { name: "Isolate structure", exact: true }).click();
  await expectAnatomy(canvas, testInfo, "desktop-heart");
  await page.screenshot({ path: testInfo.outputPath("desktop-heart-study.png"), fullPage: true });
  await page.getByRole("textbox", { name: "Your observation" }).fill("The heart connects the pulmonary and systemic circuits.");
  await page.getByRole("button", { name: "Save observation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved to notebook", exact: true })).toBeDisabled();
  const stored = await (await page.request.get(`/api/workspace?notebookId=${notebook.id}`)).json();
  expect(stored.notes).toHaveLength(1);
  expect(stored.notes[0].content).toContain("The heart connects the pulmonary and systemic circuits.");
  expect(stored.notes[0].content).toContain("CC BY 4.0");
  expect(stored.progress).toEqual(before.progress);
  expect(stored.suite).toBeNull();

  await page.getByRole("link", { name: "Ask notebook", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`notebook=${notebook.id}`));
  await expect(page.getByRole("textbox", { name: "Ask a question about your sources" })).toHaveValue(/only my selected Life Sciences sources.*heart/);
  await expect(page.getByRole("checkbox", { name: "Select Circulation chapter", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Select Revision notes", exact: true })).not.toBeChecked();
  expect(aiRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("the real 3D atlas stays visible, selectable and framed on small phones and landscape", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/atlas");
  const canvas = await loadedCanvas(page);
  await expectAnatomy(canvas, testInfo, "phone-body");
  await page.screenshot({ path: testInfo.outputPath("phone-atlas.png"), fullPage: true });
  const tabs = page.getByRole("navigation", { name: "Atlas panels" });
  await tabs.getByRole("button", { name: "Find & layers", exact: true }).click();
  await selectHeart(page);
  await page.getByRole("button", { name: "Inspect", exact: true }).click();
  await page.getByRole("button", { name: "Isolate structure", exact: true }).click();
  await expectAnatomy(canvas, testInfo, "phone-heart");
  await page.screenshot({ path: testInfo.outputPath("phone-heart.png"), fullPage: true });
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await expectAnatomy(canvas, testInfo, `heart-${viewport.width}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath(`atlas-${viewport.width}.png`), fullPage: true });
  }
  await tabs.getByRole("button", { name: "Study", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save observation", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Show surrounding anatomy", exact: true }).click();
  await tabs.getByRole("button", { name: "Find & layers", exact: true }).click();
  await page.getByRole("button", { name: "Hide all systems", exact: true }).click();
  await tabs.getByRole("button", { name: "3D view", exact: true }).click();
  await expect(page.getByText("No systems visible", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Restore topic systems", exact: true }).click();
  await expectAnatomy(canvas, testInfo, "landscape-restored");
  expect(errors).toEqual([]);
});

test("returning before notebook context loads preserves the original source selection", async ({ page }) => {
  const created = await page.request.post("/api/notebooks", { data: { title: "Biology context check", grade: 11, subject: "Biology", module: "Circulation" } });
  expect(created.status()).toBe(201);
  const notebook = await created.json();
  const uploaded = await page.request.post("/api/sources", { multipart: { notebookId: notebook.id, title: "Heart chapter", type: "textbook_chapter", text: "The heart pumps blood through the circulatory system. Blood flows to the lungs and to the rest of the body through connected pulmonary and systemic circuits." } });
  expect(uploaded.status()).toBe(201);
  const source = await uploaded.json();
  await page.addInitScript(() => {
    const originalFetch = window.fetch;
    window.fetch = (input, init) => {
      if (window.location.pathname === "/atlas" && typeof input === "string" && input.startsWith("/api/workspace")) return new Promise<Response>(() => {});
      return originalFetch(input, init);
    };
  });
  await page.route("**/atlas/bodyparts3d-v4/atlas.json", (route) => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.goto(`/atlas?notebook=${notebook.id}&source=${source.id}`);
  await expect(page.getByText("Opening notebook...", { exact: true })).toBeVisible();
  const back = page.getByRole("link", { name: "Notebook", exact: true });
  const destination = new URL((await back.getAttribute("href"))!, "http://127.0.0.1:3107");
  expect(destination.searchParams.getAll("source")).toEqual([source.id]);
  await back.click();
  await expect(page.getByRole("checkbox", { name: "Select Heart chapter", exact: true })).toBeChecked();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Biology context check");
});

test("catalog retry and WebGL fallback retain accessible anatomy search and truthful scope", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
      if (String(args[0]).includes("webgl")) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  let failCatalog = true;
  await page.route("**/atlas/bodyparts3d-v4/atlas.json", (route) => failCatalog ? route.fulfill({ status: 503, body: "Unavailable" }) : route.continue());
  await page.goto("/atlas");
  const viewerAlert = page.getByRole("region", { name: "3D anatomy explorer" }).getByRole("alert");
  await expect(viewerAlert).toContainText("The anatomy catalog could not be loaded.");
  failCatalog = false;
  await page.getByRole("button", { name: "Retry viewer", exact: true }).click();
  await expect(viewerAlert).toContainText("3D rendering is unavailable");
  await selectHeart(page);
  await expect(page.getByRole("heading", { name: "heart", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Isolate structure", exact: true })).toBeDisabled();
  await page.getByRole("searchbox", { name: "Search anatomy" }).fill("unmodeled structure xyz");
  await expect(page.getByText("No matching modeled structures.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Atlas source and scope", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Female reproductive anatomy is not included.");
  await expect(page.getByRole("dialog").getByRole("link", { name: "Human Atlas MIT license" })).toHaveAttribute("href", "/atlas/HUMAN-ATLAS-LICENSE.txt");
});