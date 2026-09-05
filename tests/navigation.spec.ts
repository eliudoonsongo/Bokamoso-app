import { test, expect } from "@playwright/test";
import type { WorkspaceData } from "../src/lib/types";

test("a delayed chat response cannot overwrite a newly selected notebook", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Newton's laws of motion" })).toBeVisible();
  await page.getByRole("button", { name: "Bokamoso notebooks" }).click();
  await page.getByRole("button", { name: "New notebook", exact: true }).click();
  await page.getByLabel("Notebook name").fill("Chemical bonds");
  await page.getByLabel("Module / unit").fill("Chemical bonding");
  await page.getByRole("button", { name: "Create notebook", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Chemical bonds" })).toBeVisible();
  await page.getByRole("button", { name: "Bokamoso notebooks" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Newton's laws/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Newton's laws of motion" })).toBeVisible();

  let releaseResponse!: () => void;
  let reportIntercepted!: () => void;
  const gate = new Promise<void>((resolve) => { releaseResponse = resolve; });
  const intercepted = new Promise<void>((resolve) => { reportIntercepted = resolve; });
  await page.route("**/api/chat", async (route) => {
    const response = await route.fetch();
    reportIntercepted();
    await gate;
    await route.fulfill({ response });
  });
  await page.getByRole("textbox", { name: "Ask a question about your sources" }).fill("Explain inertia");
  await page.getByRole("button", { name: "Send question" }).click();
  await intercepted;
  await page.getByRole("button", { name: "Bokamoso notebooks" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Chemical bonds/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Chemical bonds" })).toBeVisible();
  const responseReceived = page.waitForResponse("**/api/chat");
  releaseResponse();
  await responseReceived;
  await expect(page.locator(".thinking-indicator")).toHaveCount(0);
  await expect(page.locator(".chat-message")).toHaveCount(0);
  const notebookId = new URL(page.url()).searchParams.get("notebook");
  const current = await (await page.request.get(`/api/workspace?notebookId=${notebookId}`)).json() as WorkspaceData;
  expect(current.notebook.title).toBe("Chemical bonds");
  expect(current.messages).toHaveLength(0);
  expect(current.progress.xp).toBe(0);
});