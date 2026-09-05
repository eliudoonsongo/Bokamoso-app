import { aiConfig } from "@/lib/ai-config";
import { errorResponse, learnerId } from "@/lib/server";
import { getMessages, getNotebook, getNotes, getProgress, getSources, getSuite, listNotebooks } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const owner = await learnerId();
    const notebook = await getNotebook(owner, new URL(request.url).searchParams.get("notebookId"));
    const [stored, notebooks, sources, progress, notes, messages] = await Promise.all([
      getSuite(notebook.id), listNotebooks(owner), getSources(notebook.id),
      getProgress(notebook.id), getNotes(notebook.id), getMessages(notebook.id),
    ]);
    const ai = aiConfig();
    return Response.json({
      notebook, notebooks, sources,
      suite: stored?.suite || null, suiteId: stored?.id || null, suiteSourceIds: stored?.sourceIds || [],
      progress, notes, messages,
      ai, aiConfigured: Boolean(ai), adminProtected: Boolean(process.env.ADMIN_UPLOAD_KEY) || process.env.NODE_ENV === "production",
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}