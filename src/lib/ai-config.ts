export function aiConfig(environment: NodeJS.ProcessEnv = process.env) {
  if (environment.NVIDIA_API_KEY?.trim()) {
    return { provider: "nvidia" as const, model: environment.NVIDIA_MODEL?.trim() || "nvidia/nemotron-3-super-120b-a12b" };
  }
  if (environment.GEMINI_API_KEY?.trim()) {
    return { provider: "gemini" as const, model: environment.GEMINI_MODEL?.trim() || "gemini-3.8-flash" };
  }
  return null;
}