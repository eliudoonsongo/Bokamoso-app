import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { sampleNotebook, sampleSources, sampleSuite } from "./demo";
import { emptyProgress, type LearnerProgress, type LearningSuite, type Source } from "./learning";
import type { ChatMessage, Notebook, Note } from "./types";

const globalStore = globalThis as unknown as { bokamosoDb?: DatabaseSync };

function database() {
  if (globalStore.bokamosoDb) return globalStore.bokamosoDb;
  const filename = process.env.BOKAMOSO_DB_PATH || path.join(process.cwd(), "data", "bokamoso.sqlite");
  mkdirSync(path.dirname(filename), { recursive: true });
  const connection = new DatabaseSync(filename);
  connection.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS notebooks (id TEXT PRIMARY KEY, owner TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS sources (id TEXT NOT NULL, notebook_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (id, notebook_id));
    CREATE TABLE IF NOT EXISTS suites (id TEXT NOT NULL, notebook_id TEXT NOT NULL, source_ids TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (id, notebook_id));
    CREATE TABLE IF NOT EXISTS progress (notebook_id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, notebook_id TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, notebook_id TEXT NOT NULL, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS notebooks_owner ON notebooks(owner);
  `);
  globalStore.bokamosoDb = connection;
  return connection;
}

function decode<Type>(row: unknown): Type | null {
  return row ? JSON.parse((row as { data: string }).data) as Type : null;
}

export function listNotebooks(owner: string): Notebook[] {
  return database().prepare("SELECT data FROM notebooks WHERE owner = ? ORDER BY rowid").all(owner).map((row) => decode<Notebook>(row)!);
}

export function createNotebook(owner: string, input: Omit<Notebook, "id">, sample = false) {
  const notebook = { ...input, id: randomUUID() };
  const connection = database();
  connection.exec("BEGIN IMMEDIATE");
  try {
    connection.prepare("INSERT INTO notebooks(id, owner, data) VALUES (?, ?, ?)").run(notebook.id, owner, JSON.stringify(notebook));
    connection.prepare("INSERT INTO progress(notebook_id, data) VALUES (?, ?)").run(notebook.id, JSON.stringify(emptyProgress()));
    if (sample) {
      for (const source of sampleSources) saveSource(notebook.id, source);
      saveSuite(notebook.id, sampleSuite, sampleSources.map((source) => source.id));
    }
    connection.exec("COMMIT");
    return notebook;
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
}

export function getNotebook(owner: string, id?: string | null) {
  if (!id) {
    const existing = listNotebooks(owner);
    return existing[0] || createNotebook(owner, sampleNotebook, true);
  }
  const notebook = decode<Notebook>(database().prepare("SELECT data FROM notebooks WHERE id = ? AND owner = ?").get(id, owner));
  if (!notebook) throw new Error("Notebook not found.");
  return notebook;
}

export function getSources(notebookId: string): Source[] {
  return database().prepare("SELECT data FROM sources WHERE notebook_id = ? ORDER BY rowid").all(notebookId).map((row) => decode<Source>(row)!);
}

export function saveSource(notebookId: string, source: Source) {
  database().prepare("INSERT INTO sources(id, notebook_id, data) VALUES (?, ?, ?)").run(source.id, notebookId, JSON.stringify(source));
}

export function deleteSource(notebookId: string, sourceId: string) {
  const connection = database();
  connection.prepare("DELETE FROM sources WHERE id = ? AND notebook_id = ?").run(sourceId, notebookId);
  connection.prepare("DELETE FROM suites WHERE notebook_id = ?").run(notebookId);
}

export function saveSuite(notebookId: string, suite: LearningSuite, sourceIds: string[]) {
  const id = createHash("sha256").update(JSON.stringify({ suite, sourceIds: [...sourceIds].sort() })).digest("hex").slice(0, 24);
  database().prepare("INSERT OR REPLACE INTO suites(id, notebook_id, source_ids, data) VALUES (?, ?, ?, ?)").run(id, notebookId, JSON.stringify(sourceIds), JSON.stringify(suite));
  return id;
}

export function getSuite(notebookId: string) {
  const row = database().prepare("SELECT id, data, source_ids FROM suites WHERE notebook_id = ? ORDER BY rowid DESC LIMIT 1").get(notebookId) as { id: string; data: string; source_ids: string } | undefined;
  return row ? { id: row.id, suite: JSON.parse(row.data) as LearningSuite, sourceIds: JSON.parse(row.source_ids) as string[] } : null;
}

export function getProgress(notebookId: string): LearnerProgress {
  return decode<LearnerProgress>(database().prepare("SELECT data FROM progress WHERE notebook_id = ?").get(notebookId)) || emptyProgress();
}

export function updateProgress<Type>(notebookId: string, update: (progress: LearnerProgress) => { progress: LearnerProgress } & Type) {
  const connection = database();
  connection.exec("BEGIN IMMEDIATE");
  try {
    const result = update(getProgress(notebookId));
    connection.prepare("INSERT OR REPLACE INTO progress(notebook_id, data) VALUES (?, ?)").run(notebookId, JSON.stringify(result.progress));
    connection.exec("COMMIT");
    return result;
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
}

export function getNotes(notebookId: string) {
  return database().prepare("SELECT data FROM notes WHERE notebook_id = ? ORDER BY rowid DESC").all(notebookId).map((row) => decode<Note>(row)!);
}

export function saveNote(notebookId: string, title: string, content: string) {
  const note: Note = { id: randomUUID(), title, content, createdAt: new Date().toISOString() };
  database().prepare("INSERT INTO notes(id, notebook_id, data) VALUES (?, ?, ?)").run(note.id, notebookId, JSON.stringify(note));
  return note;
}

export function deleteNote(notebookId: string, noteId: string) {
  database().prepare("DELETE FROM notes WHERE id = ? AND notebook_id = ?").run(noteId, notebookId);
}

export function getMessages(notebookId: string) {
  return database().prepare("SELECT data FROM (SELECT rowid, data FROM messages WHERE notebook_id = ? ORDER BY rowid DESC LIMIT 60) ORDER BY rowid").all(notebookId).map((row) => decode<ChatMessage>(row)!);
}

export function saveMessage(notebookId: string, message: ChatMessage) {
  database().prepare("INSERT INTO messages(id, notebook_id, data) VALUES (?, ?, ?)").run(message.id, notebookId, JSON.stringify(message));
}

export function clearMessages(notebookId: string) {
  database().prepare("DELETE FROM messages WHERE notebook_id = ?").run(notebookId);
}