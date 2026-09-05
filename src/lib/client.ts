export async function api<Type>(url: string, init?: RequestInit): Promise<Type> {
  const response = await fetch(url, {
    ...init,
    headers: { ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...init?.headers },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Something went wrong. Please try again.");
  return body as Type;
}

export function downloadJson(data: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}