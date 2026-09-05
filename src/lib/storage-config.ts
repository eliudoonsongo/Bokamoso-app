export function storageBackend(environment: NodeJS.ProcessEnv = process.env): "sqlite" | "supabase" {
  const configured = environment.BOKAMOSO_STORAGE;
  if (configured === "sqlite" || configured === "supabase") return configured;
  if (configured) throw new Error("BOKAMOSO_STORAGE must be sqlite or supabase.");
  return environment.SUPABASE_URL || environment.SUPABASE_SECRET_KEY || environment.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "sqlite";
}

export function supabaseSettings(environment: NodeJS.ProcessEnv = process.env) {
  const url = environment.SUPABASE_URL;
  const key = environment.SUPABASE_SECRET_KEY || environment.SUPABASE_SERVICE_ROLE_KEY;
  const namespace = environment.BOKAMOSO_DB_NAMESPACE || "default";
  if (!url || !key) throw new Error("Supabase requires SUPABASE_URL and SUPABASE_SECRET_KEY on the server.");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname))) {
    throw new Error("SUPABASE_URL must use HTTPS, except for a local Supabase instance.");
  }
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(namespace)) throw new Error("BOKAMOSO_DB_NAMESPACE must contain 1-100 letters, numbers, underscores or hyphens.");
  return { url, key, namespace };
}