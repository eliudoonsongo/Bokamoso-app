import { test, expect, type APIRequestContext } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { validateSuite } from "../src/lib/learning";
import type { WorkspaceData } from "../src/lib/types";

async function workspace(request: APIRequestContext): Promise<WorkspaceData> {
  const response = await request.get("/api/workspace");
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function progress(request: APIRequestContext, data: WorkspaceData, action: Record<string, unknown>) {
  return request.post("/api/progress", { data: { notebookId: data.notebook.id, suiteId: data.suiteId, ...action } });
}

test("browser origin checks accept the external host and reject foreign origins", async ({ request }) => {
  const data = await workspace(request);
  expect(data.aiConfigured).toBe(false);
  expect(data.ai).toBeNull();
  const note = { notebookId: data.notebook.id, title: "Origin check", content: "A note from the same browser origin." };
  const allowed = await request.post("/api/notes", { data: note, headers: { origin: "http://127.0.0.1:3107" } });
  expect(allowed.status()).toBe(201);
  for (const origin of ["https://foreign.example", "http://127.0.0.1:3108", "null"]) {
    const rejected = await request.post("/api/notes", { data: note, headers: { origin } });
    expect(rejected.status()).toBe(403);
  }
});

test("diagnostics persist gaps, mastery and idempotent rewards", async ({ request }) => {
  const data = await workspace(request);
  const suite = validateSuite(data.suite);
  expect((await progress(request, data, { action: "claim-quest" })).status()).toBe(409);
  const first = suite.diagnosticAssessment[0];
  const wrong = await progress(request, data, { action: "answer", questionId: first.questionId, optionIndex: 0 });
  expect((await wrong.json()).progress.gapNodes).toContain(first.gapNodeIfWrong);
  for (const question of suite.diagnosticAssessment) {
    const result = await progress(request, data, { action: "answer", questionId: question.questionId, optionIndex: question.correctOptionIndex });
    expect(result.ok()).toBeTruthy();
  }
  expect((await workspace(request)).progress.xp).toBe(60);
  for (let attempt = 0; attempt < 2; attempt++) {
    const claimed = await progress(request, data, { action: "claim-quest" });
    expect(claimed.ok()).toBeTruthy();
    expect((await claimed.json()).progress.xp).toBe(160);
  }
  const saved = await workspace(request);
  expect(saved.progress.gapNodes).toEqual([]);
  expect(saved.progress.masteredNodes).toHaveLength(3);
  expect(saved.progress.claimedQuests).toHaveLength(1);
});

test("regenerating a quest cannot re-award a completed module", async ({ request }) => {
  const data = await workspace(request);
  const suite = validateSuite(data.suite);
  for (const question of suite.diagnosticAssessment) {
    await progress(request, data, { action: "answer", questionId: question.questionId, optionIndex: question.correctOptionIndex });
  }
  await progress(request, data, { action: "claim-quest" });
  const question = suite.diagnosticAssessment[0];
  await progress(request, data, { action: "answer", questionId: question.questionId, optionIndex: 0 });
  const generated = await request.post("/api/suite", { data: { notebookId: data.notebook.id, sourceIds: data.sources.map((source) => source.id) } });
  expect(generated.ok()).toBeTruthy();
  expect(generated.headers()["x-generation-mode"]).toBe("sample");
  validateSuite(await generated.json());
  const regenerated = await workspace(request);
  expect(regenerated.suiteId).not.toBe(data.suiteId);
  expect((await progress(request, data, { action: "claim-quest" })).status()).toBe(409);
  await progress(request, regenerated, { action: "answer", questionId: question.questionId, optionIndex: question.correctOptionIndex });
  const claimed = await progress(request, regenerated, { action: "claim-quest" });
  expect(claimed.ok()).toBeTruthy();
  expect((await claimed.json()).progress.xp).toBe(160);
});

test("selected sources ground chat and unsupported questions abstain", async ({ request }) => {
  const data = await workspace(request);
  const source = data.sources[0];
  const response = await request.post("/api/chat", { data: { notebookId: data.notebook.id, sourceIds: [source.id], question: "Explain inertia" } });
  expect(response.ok()).toBeTruthy();
  expect((await response.json()).mode).toBe("source-excerpts");
  const saved = await workspace(request);
  const answer = saved.messages.at(-1)!;
  expect(answer.citations?.length).toBeGreaterThan(0);
  for (const citation of answer.citations || []) {
    expect(citation.sourceId).toBe(source.id);
    expect(source.chunks.find((chunk) => chunk.id === citation.chunkId)?.text).toContain(citation.quote);
  }
  const unsupported = await request.post("/api/chat", { data: { notebookId: data.notebook.id, sourceIds: [source.id], question: "Describe Byzantine embroidery" } });
  expect(unsupported.ok()).toBeTruthy();
  expect((await workspace(request)).messages.at(-1)?.citations).toEqual([]);
  expect((await request.post("/api/suite", { data: { notebookId: data.notebook.id, sourceIds: [] } })).status()).toBe(400);
});

test("text and real PDF uploads preserve module metadata and invalidate deleted-source suites", async ({ request }) => {
  const data = await workspace(request);
  const content = "A force is an interaction between objects. Net force is the vector sum of all forces acting on one object. An object's acceleration is its net force divided by its mass.";
  const text = await request.post("/api/sources", { multipart: { notebookId: data.notebook.id, title: "Force notes", type: "textbook_chapter", text: content } });
  expect(text.status()).toBe(201);
  const source = await text.json();
  expect(source.chunks[0].metadata).toEqual({ grade: 11, subject: "Physical Sciences", module: data.notebook.module, type: "textbook_chapter" });
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pdfPage = pdf.addPage();
  pdfPage.drawText(content, { x: 40, y: 760, size: 12, maxWidth: 500, lineHeight: 18, font });
  const uploaded = await request.post("/api/sources", { multipart: { notebookId: data.notebook.id, title: "Force PDF", type: "curriculum_syllabus", file: { name: "forces.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()) } } });
  expect(uploaded.status(), await uploaded.text()).toBe(201);
  const pdfSource = await uploaded.json();
  expect(pdfSource.format).toBe("pdf");
  expect(pdfSource.text).toContain("Net force");
  const customGeneration = await request.post("/api/suite", { data: { notebookId: data.notebook.id, sourceIds: [source.id] } });
  expect(customGeneration.status()).toBe(503);
  const removed = await request.delete("/api/sources", { data: { notebookId: data.notebook.id, sourceId: data.sources[0].id } });
  expect(removed.ok()).toBeTruthy();
  expect((await workspace(request)).suite).toBeNull();
});

test("notebooks and notes are isolated to the learner cookie", async ({ request, playwright }) => {
  const data = await workspace(request);
  const created = await request.post("/api/notes", { data: { notebookId: data.notebook.id, title: "My revision", content: "Net force acts on one object." } });
  expect(created.status()).toBe(201);
  const note = await created.json();
  expect((await workspace(request)).notes.some((item) => item.id === note.id)).toBeTruthy();
  const other = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3107" });
  try {
    expect((await other.get(`/api/workspace?notebookId=${data.notebook.id}`)).status()).toBe(404);
    expect((await other.post("/api/notes", { data: { notebookId: data.notebook.id, title: "Foreign", content: "Not my notebook." } })).status()).toBe(404);
  } finally { await other.dispose(); }
  expect((await request.delete("/api/notes", { data: { notebookId: data.notebook.id, noteId: note.id } })).ok()).toBeTruthy();
  expect((await workspace(request)).notes).toHaveLength(0);
});