import { z } from "zod";
import { errorResponse, learnerId, readJson, RequestError } from "@/lib/server";
import { createNotebook, listNotebooks } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = z.object({ title: z.string().trim().min(2).max(100), grade: z.number().int().min(1).max(12), subject: z.string().trim().min(2).max(80), module: z.string().trim().min(2).max(100) }).parse(await readJson(request));
    const owner = await learnerId();
    if ((await listNotebooks(owner)).length >= 25) throw new RequestError("This workspace has reached its 25-notebook limit.");
    return Response.json(await createNotebook(owner, input), { status: 201 });
  } catch (error) { return errorResponse(error); }
}