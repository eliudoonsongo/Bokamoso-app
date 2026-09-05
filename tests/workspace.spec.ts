import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { validateSuite } from "../src/lib/learning";
import type { WorkspaceData } from "../src/lib/types";

async function openWorkspace(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Newton's laws of motion", level: 1 })).toBeVisible();
  return (await page.request.get("/api/workspace")).json() as Promise<WorkspaceData>;
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
}

test("quiz retry, quest completion and reviewed cards survive reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const data = await openWorkspace(page);
  await page.getByRole("button", { name: /^Quick quiz/ }).click();
  let dialog = page.getByRole("dialog");
  await dialog.locator(".answer-option").nth(0).click();
  await dialog.getByRole("button", { name: "Check answer" }).click();
  await expect(dialog.getByText("Let's close this gap.", { exact: true })).toBeVisible();
  await expect(dialog.locator(".gap-feedback")).toContainText(/inertia/i);
  await dialog.getByRole("button", { name: "Try again", exact: true }).click();
  for (const [index, question] of data.suite!.diagnosticAssessment.entries()) {
    await dialog.locator(".answer-option").nth(question.correctOptionIndex).click();
    await dialog.getByRole("button", { name: "Check answer" }).click();
    await expect(dialog.getByText("That's right.", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: index === 2 ? "See results" : "Next question" }).click();
  }
  await dialog.getByRole("button", { name: "View my quest" }).click();
  await dialog.getByRole("button", { name: "Claim 100 XP" }).click();
  await expect(dialog.getByRole("button", { name: "Quest complete. Reward earned." })).toBeDisabled();
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: /^Flashcards Make it stick/ }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Show hint" }).click();
  await expect(dialog.locator(".flashcard-hint")).toContainText(data.suite!.flashcards[0].hint);
  await dialog.getByRole("button", { name: "Reveal answer", exact: true }).click();
  await expect(dialog.locator(".flashcard-text")).toHaveText(data.suite!.flashcards[0].back);
  await dialog.getByRole("button", { name: "Got it" }).click();
  await expect(dialog.getByText("Card 2 of 5", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator(".xp-indicator")).toContainText("160");
  const saved = await (await page.request.get("/api/workspace")).json() as WorkspaceData;
  expect(saved.progress.reviewedCardIds).toContain(data.suite!.flashcards[0].cardId);
  expect(saved.progress.gapNodes).toEqual([]);
  expect(errors).toEqual([]);
});

test("map, explainer, notes and exact JSON export are usable", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await openWorkspace(page);
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("desktop-workspace.png"), fullPage: true });
  await page.getByRole("button", { name: /^Mind map Connect the dots/ }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.locator(".react-flow__node")).toHaveCount(9);
  await dialog.locator('.react-flow__node[data-id="mass"]').click();
  await expect(dialog.locator(".concept-detail h3")).toContainText("Mass");
  const before = await dialog.locator(".react-flow__viewport").getAttribute("style");
  await dialog.getByRole("button", { name: /^zoom in$/i }).click();
  await expect(dialog.locator(".react-flow__viewport")).not.toHaveAttribute("style", before!);
  await page.screenshot({ path: testInfo.outputPath("mind-map.png") });
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: /^Video overview See the bigger picture/ }).click();
  dialog = page.getByRole("dialog");
  const image = await page.request.get("/motion.jpg");
  expect(image.ok()).toBeTruthy();
  expect(image.headers()["content-type"]).toContain("image/jpeg");
  await dialog.getByRole("button", { name: "Play explainer", exact: true }).first().click();
  await expect.poll(async () => Number(await dialog.getByRole("slider", { name: "Explainer position" }).inputValue())).toBeGreaterThan(0.5);
  await dialog.getByRole("button", { name: "Pause explainer" }).click();
  await page.screenshot({ path: testInfo.outputPath("explainer-stage.png"), animations: "disabled" });
  await dialog.getByRole("button", { name: "Read full script" }).click();
  await expect(dialog.locator(".script-list article")).toHaveCount(6);
  await dialog.getByRole("button", { name: "01:15", exact: true }).click();
  await expect(dialog.getByRole("slider")).toHaveValue("75");
  await page.screenshot({ path: testInfo.outputPath("explainer.png") });
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Save to note", exact: true }).click();
  await page.getByRole("button", { name: /^My notes/ }).click();
  await expect(page.locator(".note-preview-row")).toHaveCount(1);
  await page.locator(".note-preview-row").click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete note" }).click();
  await expect(page.locator(".note-preview-row")).toHaveCount(0);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  const download = await downloadEvent;
  const suite = validateSuite(JSON.parse(await readFile((await download.path())!, "utf8")));
  expect(Object.keys(suite)).toHaveLength(6);
});

test("source selection and collapsed desktop sources work on mobile", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await openWorkspace(page);
  await page.getByRole("button", { name: "Collapse sources" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("navigation", { name: "Workspace panels" }).getByRole("button", { name: /^Sources/ }).click();
  await expect(page.getByRole("button", { name: "Add sources", exact: true })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("mobile-sources.png"), fullPage: true });
  await page.getByRole("checkbox", { name: "Select all sources" }).uncheck();
  await page.getByRole("navigation", { name: "Workspace panels" }).getByRole("button", { name: "Learn", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Ask a question about your sources" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeDisabled();
  await page.getByRole("navigation", { name: "Workspace panels" }).getByRole("button", { name: /^Sources/ }).click();
  await page.getByRole("checkbox", { name: "Select all sources" }).check();
  await page.getByRole("button", { name: "Add sources", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--visual-height", "380px");
    document.documentElement.style.setProperty("--visual-top", "120px");
  });
  const bounds = await page.getByRole("dialog").boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(120);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(500);
  await page.getByRole("dialog").getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("navigation", { name: "Workspace panels" }).getByRole("button", { name: "Learn", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("mobile-learning.png"), fullPage: true });
});