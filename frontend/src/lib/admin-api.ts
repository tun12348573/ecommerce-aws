"use client";

import {
AdminAuthError,
getValidAdminIdToken,
signOutAdmin,
} from "@/lib/admin-auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function getApiUrl(): string {
if (!API_URL) {
throw new Error("NEXT_PUBLIC_API_URL is missing in frontend/.env.local");
}

return API_URL;
}

async function adminRequest<T>(
path: string,
options: RequestInit = {}
): Promise<T> {
const idToken = await getValidAdminIdToken();

const response = await fetch(`${getApiUrl()}${path}`, {
...options,
cache: "no-store",
headers: {
Authorization: `Bearer ${idToken}`,
"Content-Type": "application/json",
...options.headers,
},
});

const data = await response.json().catch(() => null);

if (response.status === 401) {
signOutAdmin();

throw new AdminAuthError(
  "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại."
);

}

if (!response.ok) {
throw new Error(data?.message || "Admin API request failed.");
}

return data as T;
}

export function adminGet<T>(path: string): Promise<T> {
return adminRequest<T>(path, {
method: "GET",
});
}

export function adminPost<TResponse, TBody>(
path: string,
body: TBody
): Promise<TResponse> {
return adminRequest<TResponse>(path, {
method: "POST",
body: JSON.stringify(body),
});
}

export function adminPatch<TResponse, TBody>(
path: string,
body: TBody
): Promise<TResponse> {
return adminRequest<TResponse>(path, {
method: "PATCH",
body: JSON.stringify(body),
});
}

export function adminPut<TResponse, TBody>(
path: string,
body: TBody
): Promise<TResponse> {
return adminRequest<TResponse>(path, {
method: "PUT",
body: JSON.stringify(body),
});
}

export function adminDelete<TResponse>(path: string): Promise<TResponse> {
return adminRequest<TResponse>(path, {
method: "DELETE",
});
}
