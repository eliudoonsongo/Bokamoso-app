import { randomUUID } from "node:crypto";
import { z } from "zod";
import { segmentSource } from "@/lib/learning";
import { assertAdmin, assertSameOrigin, errorResponse, learnerId, readJson, RequestError } from "@/lib/server";
import { deleteSource, getNotebook, getSources, saveSource } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    assertAdmin(request);
    if (Number(request.headers.get("content-length") || 0) > 6_000_000) throw new RequestError("Files must be smaller than 5 MB.", 413);
    const form = await request.formData();
    const notebook = await getNotebook(await learnerId(), z.string().min(1).parse(form.get("notebookId")));
    if ((await getSources(notebook.id)).length >= 20) throw new RequestError("A notebook supports up to 20 sources.");
    const type = z.enum(["curriculum_syllabus", "textbook_chapter"]).parse(form.get("type"));
    const file = form.get("file");
    let content = String(form.get("text") || "");
    let title = String(form.get("title") || "").trim();
    let format: "text" | "pdf" = "text";
    if (file instanceof File && file.size) {
      if (file.size > 5_000_000) throw new RequestError("Files must be smaller than 5 MB.", 413);
      title ||= file.name.replace(/\.(pdf|txt|md)$/i, "");
      if (/\.pdf$/i.test(file.name)) {
        const bytes = Buffer.from(await file.arrayBuffer());
        if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new RequestError("This file is not a valid PDF.");
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: bytes });
        try { content = (await parser.getText()).text; } catch { throw new RequestError("This PDF could not be read. Try a text-based PDF or paste the chapter text.", 422); } finally { await parser.destroy(); }
        format = "pdf";
      } else if (/\.(txt|md)$/i.test(file.name)) {
        content = await file.text();
      } else throw new RequestError("Upload a PDF, TXT or Markdown file.");
    }
    if (content.trim().length < 100) throw new RequestError("Add at least 100 characters of study material. Scanned PDFs need text extraction first.", 422);
    if (content.length > 60_000) throw new RequestError("This source is too long. Upload a chapter of up to 60,000 characters.", 413);
    if (!title || title.length > 160) throw new RequestError("Give this source a title of up to 160 characters.");
    const source = segmentSource({ id: randomUUID(), title, type, format, grade: notebook.grade, subject: notebook.subject, module: notebook.module, text: content, sample: false });
    await saveSource(notebook.id, source);
    return Response.json(source, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    assertAdmin(request);
    const input = z.object({ notebookId: z.string(), sourceId: z.string() }).parse(await readJson(request));
    const notebook = await getNotebook(await learnerId(), input.notebookId);
    await deleteSource(notebook.id, input.sourceId);
    return Response.json({ deleted: true });
  } catch (error) { return errorResponse(error); }
}