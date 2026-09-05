import { test, expect } from "@playwright/test";
import type { WorkspaceData } from "../src/lib/types";

test("source upload, cited chat and removal work through the browser", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Newton's laws of motion" })).toBeVisible();
  await page.getByRole("textbox", { name: "Ask a question about your sources" }).fill("Explain inertia");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.locator(".chat-message.assistant")).toHaveCount(1);
  await page.locator(".citation-row button").first().click();
  await expect(page.getByRole("dialog").locator(".source-content")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Add sources", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Paste text" }).click();
  await dialog.getByLabel("Study material").fill("Inertia is an object's resistance to a change in its velocity. If the net force acting on an object is zero, it stays at rest or keeps moving at constant velocity in a straight line.");
  await dialog.getByLabel("Source title").fill("Inertia curriculum notes");
  await dialog.getByLabel("Source type").selectOption("curriculum_syllabus");
  await dialog.getByRole("button", { name: "Add source", exact: true }).click();
  await expect(page.locator(".source-row")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: /^Inertia curriculum notes/ }).click();
  await expect(dialog.locator(".source-info-tags")).toContainText("Syllabus");
  await dialog.getByRole("button", { name: "Remove source", exact: true }).click();
  await dialog.getByRole("button", { name: "Remove source", exact: true }).click();
  await expect(page.locator(".source-row")).toHaveCount(3);
  await page.reload();
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeDisabled();
  await page.locator(".generate-button").click();
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeEnabled();
});

test("concept navigation does not require the map root to be first", async ({ page }) => {
  await page.route("**/api/workspace", async (route) => {
    const response = await route.fetch();
    const data = await response.json() as WorkspaceData;
    data.suite!.mindMap.sort((first, second) => Number(first.parentId === null) - Number(second.parentId === null));
    await route.fulfill({ response, json: data });
  });
  await page.goto("/");
  await expect(page.locator(".concept-chips button")).toHaveCount(4);
  await page.getByRole("button", { name: /^Mind map Connect the dots/ }).click();
  await expect(page.getByRole("dialog").locator(".react-flow__node.root-node.selected")).toHaveCount(1);
});