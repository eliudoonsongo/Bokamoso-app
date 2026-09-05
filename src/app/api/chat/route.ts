import { randomUUID } from "node:crypto";
import { z } from "zod";
import { answerQuestion } from "@/lib/ai";
import { aiConfig } from "@/lib/ai-config";
import { errorResponse, learnerId, rateLimit, readJson, selectedContext, selectionSchema } from "@/lib/server";
import { clearMessages, getNotebook, getProgress, saveMessage } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const input = selectionSchema.extend({ question: z.string().trim().min(2).max(2000) }).parse(await readJson(request));
    const context = await selectedContext(input);
    rateLimit(context.owner);
    const result = await answerQuestion(input.question, context.notebook, context.sources, await getProgress(context.notebook.id));
    const user = { id: randomUUID(), role: "user" as const, content: input.question };
    const assistant = { id: randomUUID(), role: "assistant" as const, content: result.answer, citations: result.citations };
    await saveMessage(context.notebook.id, user);
    await saveMessage(context.notebook.id, assistant);
    return Response.json({ user, assistant, mode: aiConfig()?.provider || "source-excerpts" });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const { notebookId } = z.object({ notebookId: z.string() }).parse(await readJson(request));
    const notebook = await getNotebook(await learnerId(), notebookId);
    await clearMessages(notebook.id);
    return Response.json({ cleared: true });
  } catch (error) { return errorResponse(error); }
}