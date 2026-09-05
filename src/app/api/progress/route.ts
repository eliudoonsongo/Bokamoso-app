import { z } from "zod";
import { claimQuest, gradeAnswer } from "@/lib/learning";
import { errorResponse, learnerId, readJson, RequestError } from "@/lib/server";
import { getNotebook, getSuite, updateProgress } from "@/lib/store";

export const runtime = "nodejs";

const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("answer"), notebookId: z.string(), suiteId: z.string(), questionId: z.string(), optionIndex: z.number().int().min(0).max(4) }),
  z.object({ action: z.literal("claim-quest"), notebookId: z.string(), suiteId: z.string() }),
  z.object({ action: z.literal("review-card"), notebookId: z.string(), suiteId: z.string(), cardId: z.string() }),
]);

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await readJson(request));
    const notebook = await getNotebook(await learnerId(), input.notebookId);
    const stored = await getSuite(notebook.id);
    if (!stored || stored.id !== input.suiteId) throw new RequestError("This study suite has changed. Reload the notebook and try again.", 409);
    if (input.action === "answer") {
      if (!stored.suite.diagnosticAssessment.some((question) => question.questionId === input.questionId && input.optionIndex < question.options.length)) throw new RequestError("Invalid assessment answer.");
      return Response.json(await updateProgress(notebook.id, (progress) => gradeAnswer(progress, stored.suite, input.questionId, input.optionIndex)));
    }
    if (input.action === "review-card") {
      if (!stored.suite.flashcards.some((card) => card.cardId === input.cardId)) throw new RequestError("Flashcard not found.");
      return Response.json(await updateProgress(notebook.id, (progress) => ({ progress: { ...progress, reviewedCardIds: [...new Set([...progress.reviewedCardIds, input.cardId])] } })));
    }
    return Response.json(await updateProgress(notebook.id, (progress) => {
      try { return { progress: claimQuest(progress, stored.suite, stored.id) }; }
      catch { throw new RequestError("Complete all three diagnostic questions and close the prerequisite gaps before claiming this quest.", 409); }
    }));
  } catch (error) { return errorResponse(error); }
}