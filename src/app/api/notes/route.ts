import { z } from "zod";
import { errorResponse, learnerId, readJson, RequestError } from "@/lib/server";
import { deleteNote, getNotebook, getNotes, saveNote } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = z.object({ notebookId: z.string(), title: z.string().trim().min(1).max(160), content: z.string().trim().min(1).max(20000) }).parse(await readJson(request));
    const notebook = await getNotebook(await learnerId(), input.notebookId);
    if ((await getNotes(notebook.id)).length >= 100) throw new RequestError("This notebook has reached its 100-note limit.");
    return Response.json(await saveNote(notebook.id, input.title, input.content), { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const input = z.object({ notebookId: z.string(), noteId: z.string() }).parse(await readJson(request));
    const notebook = await getNotebook(await learnerId(), input.notebookId);
    await deleteNote(notebook.id, input.noteId);
    return Response.json({ deleted: true });
  } catch (error) { return errorResponse(error); }
}