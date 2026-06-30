const API_URL = process.env.NEXT_PUBLIC_API_URL;

async function handleResponse<T>(response: Response): Promise<T> {
const data = await response.json().catch(() => null);

if (!response.ok) {
throw new Error(data?.message || "API request failed");
}

return data as T;
}

function getApiUrl(): string {
if (!API_URL) {
throw new Error("NEXT_PUBLIC_API_URL is missing in frontend/.env.local");
}

return API_URL;
}

export async function apiGet<T>(path: string): Promise<T> {
const response = await fetch(`${getApiUrl()}${path}`, {
cache: "force-cache",
});

return handleResponse<T>(response);
}

export async function apiGetLive<T>(path: string): Promise<T> {
  const response = await fetch(`${getApiUrl()}${path}`, {
    cache: "no-store",
  });

  return handleResponse<T>(response);
}

export async function apiPost<TResponse, TBody>(
path: string,
body: TBody
): Promise<TResponse> {
const response = await fetch(`${getApiUrl()}${path}`, {
method: "POST",
headers: {
"Content-Type": "application/json",
},
body: JSON.stringify(body),
});

return handleResponse<TResponse>(response);
}

export async function apiPatch<TResponse, TBody>(
path: string,
body: TBody
): Promise<TResponse> {
const response = await fetch(`${getApiUrl()}${path}`, {
method: "PATCH",
headers: {
"Content-Type": "application/json",
},
body: JSON.stringify(body),
});

return handleResponse<TResponse>(response);
}

export async function apiPut<TResponse, TBody>(
path: string,
body: TBody
): Promise<TResponse> {
const response = await fetch(`${getApiUrl()}${path}`, {
method: "PUT",
headers: {
"Content-Type": "application/json",
},
body: JSON.stringify(body),
});

return handleResponse<TResponse>(response);
}

export async function apiDelete<TResponse>(
path: string
): Promise<TResponse> {
const response = await fetch(`${getApiUrl()}${path}`, {
method: "DELETE",
});

return handleResponse<TResponse>(response);
}
