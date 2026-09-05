import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sampleNotebook, sampleSources, sampleSuite } from "./demo";
import { emptyProgress, type LearnerProgress, type LearningSuite, type Source } from "./learning";
import { supabaseSettings } from "./storage-config";
import type { ChatMessage, Notebook, Note } from "./types";

let client: SupabaseClient | undefined;

function database() {
  if (!client) {
    const { url, key } = supabaseSettings();
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: (input, init) => fetch(input, {
          ...init,
          signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
        }),
      },
    });
  }
  return client;
}

function suiteId(suite: LearningSuite, sourceIds: string[]) {
  return createHash("sha256").update(JSON.stringify({ suite, sourceIds: [...sourceIds].sort() })).digest("hex").slice(0, 24);
}

export async function listNotebooks(owner: string): Promise<Notebook[]> {
  const { data } = await database().from("bokamoso_notebooks").select("data")
    .eq("namespace", supabaseSettings().namespace).eq("owner", owner).order("position")
    .returns<{ data: Notebook }[]>().throwOnError();
  return (data || []).map((row) => row.data);
}

async function insertNotebook(owner: string, input: Omit<Notebook, "id">, sample: boolean, ifEmpty = false) {
  const notebook = { ...input, id: randomUUID() };
  const { data } = await database().rpc("bokamoso_create_notebook", {
    p_namespace: supabaseSettings().namespace,
    p_owner: owner,
    p_notebook: notebook,
    p_progress: emptyProgress(),
    p_sources: sample ? sampleSources : [],
    p_suite: sample ? sampleSuite : null,
    p_suite_id: sample ? suiteId(sampleSuite, sampleSources.map((source) => source.id)) : null,
    p_if_empty: ifEmpty,
  }).returns<Notebook>().throwOnError();
  if (!data) throw new Error("Notebook creation returned no data.");
  return data;
}

export async function createNotebook(owner: string, input: Omit<Notebook, "id">, sample = false) {
  return insertNotebook(owner, input, sample);
}

export async function getNotebook(owner: string, id?: string | null): Promise<Notebook> {
  if (!id) return (await listNotebooks(owner))[0] || insertNotebook(owner, sampleNotebook, true, true);
  const { data } = await database().from("bokamoso_notebooks").select("data")
    .eq("namespace", supabaseSettings().namespace).eq("owner", owner).eq("id", id)
    .maybeSingle<{ data: Notebook }>().throwOnError();
  if (!data) throw new Error("Notebook not found.");
  return data.data;
}

export async function getSources(notebookId: string): Promise<Source[]> {
  const { data } = await database().from("bokamoso_sources").select("data").eq("notebook_id", notebookId)
    .order("position").returns<{ data: Source }[]>().throwOnError();
  return (data || []).map((row) => row.data);
}

export async function saveSource(notebookId: string, source: Source) {
  await database().from("bokamoso_sources").insert({ id: source.id, notebook_id: notebookId, data: source }).throwOnError();
}

export async function deleteSource(notebookId: string, sourceId: string) {
  await database().rpc("bokamoso_delete_source", { p_notebook_id: notebookId, p_source_id: sourceId }).throwOnError();
}

export async function saveSuite(notebookId: string, suite: LearningSuite, sourceIds: string[]) {
  const id = suiteId(suite, sourceIds);
  await database().rpc("bokamoso_save_suite", { p_notebook_id: notebookId, p_suite_id: id, p_suite: suite, p_source_ids: sourceIds }).throwOnError();
  return id;
}

export async function getSuite(notebookId: string) {
  const { data } = await database().from("bokamoso_suites").select("id, data, source_ids").eq("notebook_id", notebookId)
    .order("position", { ascending: false }).limit(1)
    .maybeSingle<{ id: string; data: LearningSuite; source_ids: string[] }>().throwOnError();
  return data ? { id: data.id, suite: data.data, sourceIds: data.source_ids } : null;
}

export async function getProgress(notebookId: string): Promise<LearnerProgress> {
  const { data } = await database().from("bokamoso_progress").select("data").eq("notebook_id", notebookId)
    .single<{ data: LearnerProgress }>().throwOnError();
  return data.data;
}

export async function updateProgress<Type>(notebookId: string, update: (progress: LearnerProgress) => { progress: LearnerProgress } & Type) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const { data: current } = await database().from("bokamoso_progress").select("data, revision").eq("notebook_id", notebookId)
      .single<{ data: LearnerProgress; revision: number }>().throwOnError();
    const result = update(current.data);
    const { data: saved } = await database().from("bokamoso_progress")
      .update({ data: result.progress, revision: current.revision + 1 }).eq("notebook_id", notebookId).eq("revision", current.revision)
      .select("notebook_id").maybeSingle<{ notebook_id: string }>().throwOnError();
    if (saved) return result;
  }
  throw new Error("Progress changed repeatedly. Please retry the request.");
}

export async function getNotes(notebookId: string): Promise<Note[]> {
  const { data } = await database().from("bokamoso_notes").select("data").eq("notebook_id", notebookId)
    .order("position", { ascending: false }).returns<{ data: Note }[]>().throwOnError();
  return (data || []).map((row) => row.data);
}

export async function saveNote(notebookId: string, title: string, content: string) {
  const note: Note = { id: randomUUID(), title, content, createdAt: new Date().toISOString() };
  await database().from("bokamoso_notes").insert({ id: note.id, notebook_id: notebookId, data: note }).throwOnError();
  return note;
}

export async function deleteNote(notebookId: string, noteId: string) {
  await database().from("bokamoso_notes").delete().eq("notebook_id", notebookId).eq("id", noteId).throwOnError();
}

export async function getMessages(notebookId: string): Promise<ChatMessage[]> {
  const { data } = await database().from("bokamoso_messages").select("data").eq("notebook_id", notebookId)
    .order("position", { ascending: false }).limit(60).returns<{ data: ChatMessage }[]>().throwOnError();
  return (data || []).reverse().map((row) => row.data);
}

export async function saveMessage(notebookId: string, message: ChatMessage) {
  await database().from("bokamoso_messages").insert({ id: message.id, notebook_id: notebookId, data: message }).throwOnError();
}

export async function clearMessages(notebookId: string) {
  await database().from("bokamoso_messages").delete().eq("notebook_id", notebookId).throwOnError();
}