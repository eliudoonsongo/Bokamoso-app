import { test, expect, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { ATLAS_TOPICS } from "../src/lib/atlas-study";
import type { Notebook, WorkspaceData } from "../src/lib/types";

test.use({ launchOptions: { args: ["--enable-unsafe-swiftshader"] } });
test.setTimeout(240_000);

type GraphicsCount = { buffers: number; textures: number; programs: number; lost: boolean };
type GraphicsWindow = Window & { atlasGraphics: GraphicsCount[] };

async function trackGraphics(page: Page) {
  await page.addInitScript(() => {
    const counts: GraphicsCount[] = [];
    (window as unknown as GraphicsWindow).atlasGraphics = counts;
    const contexts = new WeakMap<object, GraphicsCount>();
    const prototypes = [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype];
    const resources = [["Buffer", "buffers"], ["Texture", "textures"], ["Program", "programs"]] as const;
    for (const prototype of prototypes) for (const [resource, field] of resources) {
      for (const action of ["create", "delete"] as const) {
        const method = `${action}${resource}`;
        const original = Reflect.get(prototype, method);
        Object.defineProperty(prototype, method, {
          configurable: true,
          value: function (this: WebGLRenderingContext, ...args: unknown[]) {
            let metrics = contexts.get(this);
            if (!metrics) {
              metrics = { buffers: 0, textures: 0, programs: 0, lost: false };
              contexts.set(this, metrics);
              counts.push(metrics);
              const resources = metrics;
              this.canvas.addEventListener("webglcontextlost", () => { resources.lost = true; });
            }
            const result = Reflect.apply(original, this, args);
            if (action === "create" && result) metrics[field]++;
            if (action === "delete" && args[0]) metrics[field]--;
            return result;
          },
        });
      }
    }
  });
}

async function expectRendered(page: Page) {
  await expect(page.locator('[data-ready="true"]')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect.poll(async () => {
    const image = PNG.sync.read(await page.locator("canvas").screenshot());
    let colored = 0;
    for (let offset = 0; offset < image.data.length; offset += 4) {
      const red = image.data[offset];
      const green = image.data[offset + 1];
      const blue = image.data[offset + 2];
      if (Math.max(red, green, blue) - Math.min(red, green, blue) > 20) colored++;
    }
    return colored;
  }, { timeout: 20_000 }).toBeGreaterThan(150);
}

async function chooseStructure(page: Page, identifier: string) {
  if (page.viewportSize()!.width <= 900) await page.getByRole("navigation", { name: "Atlas panels" }).getByRole("button", { name: "Find & layers", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search anatomy" }).fill(identifier);
  const result = page.getByRole("region", { name: "Anatomy search results" }).getByRole("button").first();
  await expect(result).toContainText(identifier);
  await result.click();
}

async function studyPanel(page: Page) {
  if (page.viewportSize()!.width <= 900) await page.getByRole("navigation", { name: "Atlas panels" }).getByRole("button", { name: "Study", exact: true }).click();
  return page.getByRole("complementary", { name: "Anatomy study panel" });
}

test("failed chunks and repeated context loss recover without retained graphics resources", async ({ page }, testInfo) => {
  await trackGraphics(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let corruptChunk = true;
  await page.route("**/body-0.bin.gz", (route) => corruptChunk
    ? route.fulfill({ status: 200, contentType: "application/octet-stream", body: Buffer.from([3, 1, 4]) })
    : route.continue());
  await page.goto("/atlas");
  const alert = page.getByRole("region", { name: "3D anatomy explorer" }).getByRole("alert");
  await expect(alert).toContainText("incomplete");
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => (window as unknown as GraphicsWindow).atlasGraphics.filter((metrics) => !metrics.lost).reduce((total, metrics) => total + metrics.buffers + metrics.textures + metrics.programs, 0))).toBe(0);
  corruptChunk = false;
  await page.getByRole("button", { name: "Retry viewer", exact: true }).click();
  await expectRendered(page);
  for (let cycle = 0; cycle < 3; cycle++) {
    const supported = await page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
      const graphics = canvas.getContext("webgl2") || canvas.getContext("webgl");
      const extension = graphics?.getExtension("WEBGL_lose_context");
      if (!extension) return false;
      extension.loseContext();
      return true;
    });
    expect(supported).toBeTruthy();
    await expect(alert).toContainText("paused by your device");
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect.poll(async () => page.evaluate(() => (window as unknown as GraphicsWindow).atlasGraphics.filter((metrics) => !metrics.lost).reduce((total, metrics) => total + metrics.buffers + metrics.textures + metrics.programs, 0))).toBe(0);
    await page.getByRole("button", { name: "Retry viewer", exact: true }).click();
    await expectRendered(page);
  }
  const graphics = await page.evaluate(() => (window as unknown as GraphicsWindow).atlasGraphics);
  expect(graphics.filter((metrics) => !metrics.lost && (metrics.buffers > 0 || metrics.textures > 0 || metrics.programs > 0))).toHaveLength(1);
  expect(errors).toEqual([]);
  await testInfo.attach("graphics-resource-cycles", { body: JSON.stringify(graphics, null, 2), contentType: "application/json" });
  await page.screenshot({ path: testInfo.outputPath("recovered-atlas.png"), fullPage: true });
});

test("leaving a stalled download and repeatedly reopening the atlas retires every old context", async ({ page }) => {
  await trackGraphics(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const created = await page.request.post("/api/notebooks", { data: { title: "Atlas lifecycle", grade: 11, subject: "Life Sciences", module: "Human body" } });
  expect(created.status()).toBe(201);
  const notebook: Notebook = await created.json();
  const blocked = Promise.withResolvers<void>();
  let holdChunks = true;
  let pendingChunks = 0;
  await page.route("**/atlas/bodyparts3d-v4/*.bin*", async (route) => {
    if (holdChunks) { pendingChunks++; await blocked.promise; }
    await route.continue().catch(() => {});
  });
  await page.goto(`/?notebook=${notebook.id}`);
  await page.getByRole("link", { name: /Human Atlas/ }).click();
  await expect.poll(() => pendingChunks).toBeGreaterThan(0);
  await chooseStructure(page, "FMA7088");
  await expect((await studyPanel(page)).getByRole("heading", { name: "heart", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Isolate structure", exact: true })).toBeDisabled();
  await page.getByRole("link", { name: "Notebook", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Atlas lifecycle");
  holdChunks = false;
  blocked.resolve();
  for (let cycle = 0; cycle < 3; cycle++) {
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect.poll(async () => page.evaluate(() => (window as unknown as GraphicsWindow).atlasGraphics.filter((metrics) => !metrics.lost).reduce((total, metrics) => total + metrics.buffers + metrics.textures + metrics.programs, 0))).toBe(0);
    await page.getByRole("link", { name: /Human Atlas/ }).click();
    await expectRendered(page);
    await page.getByRole("button", { name: "Rotate anatomy", exact: true }).click();
    await page.getByRole("link", { name: "Notebook", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Atlas lifecycle");
  }
  await expect.poll(async () => page.evaluate(() => (window as unknown as GraphicsWindow).atlasGraphics.filter((metrics) => !metrics.lost).length)).toBe(0);
  expect(errors).toEqual([]);
});

test("throttled loading and sustained camera, topic and mobile changes keep one responsive scene", async ({ page, context }, testInfo) => {
  await trackGraphics(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const diagnostics = await context.newCDPSession(page);
  await diagnostics.send("Network.enable");
  await diagnostics.send("Network.emulateNetworkConditions", { offline: false, latency: 120, downloadThroughput: 4 * 1024 * 1024, uploadThroughput: 1024 * 1024 });
  await diagnostics.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await diagnostics.send("Performance.enable");
  const errors: string[] = [];
  const downloads: string[] = [];
  const aiCalls: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/atlas/bodyparts3d-v4/")) downloads.push(request.url());
    if (/\/api\/(chat|suite)$/.test(request.url())) aiCalls.push(request.url());
  });
  const started = Date.now();
  await page.goto("/atlas");
  await expectRendered(page);
  const loadMilliseconds = Date.now() - started;
  const initialDownloads = downloads.length;
  const initial = await diagnostics.send("Performance.getMetrics");
  const actionsStarted = Date.now();
  for (const topic of ATLAS_TOPICS) {
    await page.getByRole("combobox", { name: "Study topic" }).selectOption(topic.id);
    await page.getByRole("button", { name: "All", exact: true }).click();
    const toggles = page.getByRole("region", { name: "Anatomical systems" }).getByRole("checkbox");
    for (let index = 0; index < await toggles.count(); index++) await toggles.nth(index).uncheck();
    await expect(page.getByText("No systems visible", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Restore topic systems", exact: true }).click();
    const explosion = page.getByRole("slider", { name: "Explode anatomy", exact: true });
    await explosion.focus();
    await explosion.press("End");
    await expect(explosion).toHaveValue("100");
    await explosion.press("Home");
    await expect(explosion).toHaveValue("0");
    await chooseStructure(page, "FMA7088");
    await page.getByRole("button", { name: "Isolate structure", exact: true }).click();
    await expectRendered(page);
    for (const view of ["side", "back", "three-quarter", "front"]) await page.getByRole("combobox", { name: "Camera view" }).selectOption(view);
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    await page.getByRole("button", { name: "Reset anatomy view", exact: true }).click();
  }
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await chooseStructure(page, "FMA7205");
    await (await studyPanel(page)).getByRole("button", { name: "Isolate structure", exact: true }).click();
    await expectRendered(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath(`stress-${viewport.width}.png`), fullPage: true });
  }
  const final = await diagnostics.send("Performance.getMetrics");
  const graphics = await page.evaluate(() => (window as unknown as GraphicsWindow).atlasGraphics);
  expect(graphics.filter((metrics) => !metrics.lost)).toHaveLength(1);
  expect(downloads).toHaveLength(initialDownloads);
  expect(aiCalls).toEqual([]);
  expect(errors).toEqual([]);
  await testInfo.attach("stress-metrics", { body: JSON.stringify({ cpuSlowdown: 4, networkBytesPerSecond: 4 * 1024 * 1024, latencyMilliseconds: 120, loadMilliseconds, actionMilliseconds: Date.now() - actionsStarted, topics: ATLAS_TOPICS.length, initial, final, graphics }, null, 2), contentType: "application/json" });
});

test("overlapping observation edits, a failed save and a selection change preserve the right note", async ({ page }) => {
  const created = await page.request.post("/api/notebooks", { data: { title: "Atlas note race", grade: 11, subject: "Life Sciences", module: "Circulation" } });
  expect(created.status()).toBe(201);
  const notebook: Notebook = await created.json();
  await page.goto(`/atlas?notebook=${notebook.id}`);
  await expectRendered(page);
  const requests: { title: string; content: string }[] = [];
  const release = Promise.withResolvers<void>();
  const posted = Promise.withResolvers<void>();
  let failSave = true;
  await page.route("**/api/notes", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    requests.push(route.request().postDataJSON());
    if (failSave) return route.fulfill({ status: 503, json: { error: "Temporary note-service failure" } });
    posted.resolve();
    await release.promise;
    await route.continue();
  });
  await chooseStructure(page, "FMA7088");
  await page.getByRole("textbox", { name: "Your observation" }).fill("First heart observation.");
  await page.getByRole("button", { name: "Save observation", exact: true }).click();
  await expect(page.locator('div[role="status"]')).toContainText("Temporary note-service failure");
  await expect(page.getByRole("textbox", { name: "Your observation" })).toHaveValue("First heart observation.");
  failSave = false;
  await page.getByRole("button", { name: "Save observation", exact: true }).click();
  await posted.promise;
  await expect(page.getByRole("button", { name: "Save observation", exact: true })).toBeDisabled();
  await page.getByRole("textbox", { name: "Your observation" }).fill("Revised heart observation while saving.");
  await chooseStructure(page, "FMA7205");
  await page.getByRole("textbox", { name: "Your observation" }).fill("Kidney observation stays separate.");
  release.resolve();
  await expect(page.locator('div[role="status"]')).toContainText("Saved heart");
  await expect(page.getByRole("textbox", { name: "Your observation" })).toHaveValue("Kidney observation stays separate.");
  await chooseStructure(page, "FMA7088");
  await expect(page.getByRole("textbox", { name: "Your observation" })).toHaveValue("Revised heart observation while saving.");
  await expect(page.getByRole("button", { name: "Save observation", exact: true })).toBeEnabled();
  const workspace: WorkspaceData = await (await page.request.get(`/api/workspace?notebookId=${notebook.id}`)).json();
  expect(workspace.notes).toHaveLength(1);
  expect(workspace.notes[0].content).toContain("First heart observation.");
  expect(workspace.notes[0].content).not.toContain("Kidney observation");
  expect(workspace.progress.xp).toBe(0);
  expect(requests).toHaveLength(2);
});

test("uncompressed geometry fallback renders the full catalog without gzip support", async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, "DecompressionStream", { value: undefined, configurable: true }); });
  const downloads: string[] = [];
  page.on("request", (request) => { if (/\/body-\d+\.bin/.test(request.url())) downloads.push(request.url()); });
  await page.goto("/atlas");
  await expectRendered(page);
  expect(new Set(downloads.map((url) => new URL(url).pathname)).size).toBe(15);
  expect(downloads.some((url) => url.endsWith(".gz"))).toBeFalsy();
});

test("twelve concurrent learners retain their own notes and reject cross-notebook writes", async ({ playwright, baseURL }, testInfo) => {
  const learners = await Promise.all(Array.from({ length: 12 }, () => playwright.request.newContext({ baseURL, timeout: 60_000, ignoreHTTPSErrors: true })));
  const timings: number[] = [];
  try {
    const notebooks = await Promise.all(learners.map(async (learner, index) => {
      const created = await learner.post("/api/notebooks", { data: { title: `Concurrent atlas learner ${index}`, grade: 11, subject: "Life Sciences", module: "Circulation" } });
      expect(created.status()).toBe(201);
      return created.json() as Promise<Notebook>;
    }));
    for (let round = 0; round < 12; round++) {
      await Promise.all(learners.map(async (learner, index) => {
        const started = Date.now();
        const saved = await learner.post("/api/notes", { data: { notebookId: notebooks[index].id, title: `Atlas observation ${round}`, content: `Learner ${index}, observation ${round}. BodyParts3D reference: heart FMA7088. Personal observation, not assessed mastery.` } });
        timings.push(Date.now() - started);
        expect(saved.status()).toBe(201);
      }));
    }
    await Promise.all(learners.map(async (learner, index) => {
      const workspace: WorkspaceData = await (await learner.get(`/api/workspace?notebookId=${notebooks[index].id}`)).json();
      expect(workspace.notes).toHaveLength(12);
      expect(workspace.notes.every((note) => note.content.startsWith(`Learner ${index},`))).toBeTruthy();
      expect(workspace.progress.xp).toBe(0);
      const foreign = notebooks[(index + 1) % notebooks.length].id;
      expect((await learner.get(`/api/workspace?notebookId=${foreign}`)).status()).toBe(404);
      expect((await learner.post("/api/notes", { data: { notebookId: foreign, title: "Foreign write", content: "Must not be accepted." } })).status()).toBe(404);
    }));
    timings.sort((first, second) => first - second);
    await testInfo.attach("local-concurrency-metrics", { body: JSON.stringify({ learners: learners.length, writes: timings.length, medianMilliseconds: timings[Math.floor(timings.length / 2)], p95Milliseconds: timings[Math.floor(timings.length * 0.95)], maximumMilliseconds: timings.at(-1) }), contentType: "application/json" });
  } finally { await Promise.all(learners.map((learner) => learner.dispose())); }
});