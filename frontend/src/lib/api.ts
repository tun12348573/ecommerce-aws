const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "API request failed");
  }

  return data as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
  });

  return handleResponse<T>(response);
}

export async function apiPost<TResponse, TBody>(
  path: string,
  body: TBody
): Promise<TResponse> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return handleResponse<TResponse>(response);
}