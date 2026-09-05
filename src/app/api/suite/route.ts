import { generateSuite } from "@/lib/ai";
import { errorResponse, rateLimit, readJson, selectedContext, selectionSchema } from "@/lib/server";
import { getProgress, saveSuite } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const context = await selectedContext(selectionSchema.parse(await readJson(request)));
    rateLimit(context.owner);
    const suite = await generateSuite(context.notebook, context.sources, await getProgress(context.notebook.id));
    const suiteId = await saveSuite(context.notebook.id, suite, context.sources.map((source) => source.id));
    return Response.json(suite, { headers: { "X-Suite-Id": suiteId, "X-Generation-Mode": process.env.GEMINI_API_KEY ? "gemini" : "sample", "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}