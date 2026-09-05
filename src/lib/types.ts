import type { LearnerProgress, LearningSuite, Source } from "./learning";

export type Notebook = { id: string; title: string; grade: number; subject: string; module: string };
export type Note = { id: string; title: string; content: string; createdAt: string };
export type Citation = { sourceId: string; chunkId: string; quote: string };
export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; citations?: Citation[] };
export type WorkspaceData = {
  notebook: Notebook;
  notebooks: Notebook[];
  sources: Source[];
  suite: LearningSuite | null;
  suiteId: string | null;
  suiteSourceIds: string[];
  progress: LearnerProgress;
  notes: Note[];
  messages: ChatMessage[];
  aiConfigured: boolean;
  adminProtected: boolean;
};