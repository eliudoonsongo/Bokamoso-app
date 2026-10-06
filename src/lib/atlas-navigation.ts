import type { AtlasModelId } from "./atlas-models";

export function isLifeSciences(subject: string) {
  return /^(life sciences?|biology)$/.test(subject.trim().toLowerCase().replace(/[-_\s]+/g, " "));
}

export function atlasUrl(notebookId: string, sourceIds: string[], model: AtlasModelId = "male") {
  const params = new URLSearchParams({ notebook: notebookId });
  if (model === "female") params.set("model", model);
  sourceIds.forEach((id) => params.append("source", id));
  return `/atlas?${params}`;
}

export function atlasNotebookUrl(notebookId: string | null, sourceIds: string[], question = "", model: AtlasModelId = "male") {
  if (!notebookId) return "/";
  const params = new URLSearchParams({ notebook: notebookId, from: "atlas" });
  if (model === "female") params.set("atlasModel", model);
  sourceIds.forEach((id) => params.append("source", id));
  if (question) params.set("question", question.slice(0, 2000));
  return `/?${params}`;
}

export function atlasReturnState(params: URLSearchParams, availableSourceIds: string[]) {
  if (params.get("from") !== "atlas") return null;
  const requested = new Set(params.getAll("source"));
  return {
    sourceIds: availableSourceIds.filter((id) => requested.has(id)),
    question: (params.get("question") || "").slice(0, 2000),
  };
}