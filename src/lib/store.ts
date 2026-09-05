import "server-only";
import type { LearnerProgress, LearningSuite, Source } from "./learning";
import { storageBackend } from "./storage-config";
import type { ChatMessage, Notebook } from "./types";

async function storage() {
  return storageBackend() === "supabase" ? import("./supabase-store") : import("./sqlite-store");
}

export async function listNotebooks(owner: string) {
  return (await storage()).listNotebooks(owner);
}

export async function createNotebook(owner: string, input: Omit<Notebook, "id">, sample = false) {
  return (await storage()).createNotebook(owner, input, sample);
}

export async function getNotebook(owner: string, id?: string | null) {
  return (await storage()).getNotebook(owner, id);
}

export async function getSources(notebookId: string) {
  return (await storage()).getSources(notebookId);
}

export async function saveSource(notebookId: string, source: Source) {
  return (await storage()).saveSource(notebookId, source);
}

export async function deleteSource(notebookId: string, sourceId: string) {
  return (await storage()).deleteSource(notebookId, sourceId);
}

export async function saveSuite(notebookId: string, suite: LearningSuite, sourceIds: string[]) {
  return (await storage()).saveSuite(notebookId, suite, sourceIds);
}

export async function getSuite(notebookId: string) {
  return (await storage()).getSuite(notebookId);
}

export async function getProgress(notebookId: string) {
  return (await storage()).getProgress(notebookId);
}

export async function updateProgress<Type>(notebookId: string, update: (progress: LearnerProgress) => { progress: LearnerProgress } & Type) {
  return (await storage()).updateProgress(notebookId, update);
}

export async function getNotes(notebookId: string) {
  return (await storage()).getNotes(notebookId);
}

export async function saveNote(notebookId: string, title: string, content: string) {
  return (await storage()).saveNote(notebookId, title, content);
}

export async function deleteNote(notebookId: string, noteId: string) {
  return (await storage()).deleteNote(notebookId, noteId);
}

export async function getMessages(notebookId: string) {
  return (await storage()).getMessages(notebookId);
}

export async function saveMessage(notebookId: string, message: ChatMessage) {
  return (await storage()).saveMessage(notebookId, message);
}

export async function clearMessages(notebookId: string) {
  return (await storage()).clearMessages(notebookId);
}