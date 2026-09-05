import "server-only";
import { cookies } from "next/headers";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getNotebook, getSources } from "./store";

export class RequestError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function learnerId() {
  const jar = await cookies();
  const existing = jar.get("bokamoso-learner")?.value;
  if (existing && z.uuid().safeParse(existing).success) return existing;
  const id = randomUUID();
  jar.set("bokamoso-learner", id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return id;
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host") || requestUrl.host;
  let allowed = false;
  try {
    const browserOrigin = new URL(origin);
    allowed = browserOrigin.host === host && browserOrigin.protocol === requestUrl.protocol;
  } catch { allowed = false; }
  if (!allowed) throw new RequestError("Cross-origin requests are not allowed.", 403);
}

export async function readJson(request: Request) {
  assertSameOrigin(request);
  const body = await request.text();
  if (body.length > 100_000) throw new RequestError("Request is too large.", 413);
  try { return JSON.parse(body) as unknown; } catch { throw new RequestError("Invalid JSON body."); }
}

export function assertAdmin(request: Request) {
  const expected = process.env.ADMIN_UPLOAD_KEY;
  if (!expected) {
    if (process.env.NODE_ENV === "production") throw new RequestError("Administrator uploads are not configured.", 403);
    return;
  }
  const provided = request.headers.get("x-admin-key") || "";
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) {
    throw new RequestError("An administrator upload key is required.", 403);
  }
}

export const selectionSchema = z.object({ notebookId: z.string().min(1), sourceIds: z.array(z.string()).min(1).max(20) });

export async function selectedContext(input: z.infer<typeof selectionSchema>) {
  const owner = await learnerId();
  const notebook = await getNotebook(owner, input.notebookId);
  const allSources = await getSources(notebook.id);
  const sources = allSources.filter((source) => input.sourceIds.includes(source.id));
  if (sources.length !== new Set(input.sourceIds).size) throw new RequestError("A selected source is no longer available.");
  if (sources.some((source) => source.grade !== notebook.grade || source.subject !== notebook.subject || source.module !== notebook.module)) {
    throw new RequestError("Selected sources must match the notebook's grade, subject and module.");
  }
  if (sources.reduce((total, source) => total + source.text.length, 0) > 80_000) throw new RequestError("Select a smaller set of chapters (up to 80,000 characters).");
  return { owner, notebook, sources };
}

const requests = new Map<string, number[]>();
export function rateLimit(owner: string) {
  const now = Date.now();
  const recent = (requests.get(owner) || []).filter((timestamp) => timestamp > now - 60_000);
  if (recent.length >= 15) throw new RequestError("Please wait a minute before making another request.", 429);
  requests.set(owner, [...recent, now]);
  if (requests.size > 5000) for (const [id, timestamps] of requests) if (timestamps.every((timestamp) => timestamp < now - 60_000)) requests.delete(id);
}

export function errorResponse(error: unknown) {
  if (error instanceof RequestError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError) return Response.json({ error: "Some fields are missing or invalid. Check your input and try again." }, { status: 400 });
  if (error instanceof Error && error.message === "Notebook not found.") return Response.json({ error: error.message }, { status: 404 });
  console.error("Bokamoso request failed:", error instanceof Error ? error.name : "Unknown error");
  return Response.json({ error: "The request could not be completed. Please try again." }, { status: 500 });
}