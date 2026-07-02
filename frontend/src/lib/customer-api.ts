"use client";

import {
  CustomerAuthError,
  getValidCustomerIdToken,
} from "@/lib/customer-auth";

function getApiUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (!apiUrl) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is missing in frontend/.env.local"
    );
  }

  return apiUrl.replace(/\/$/, "");
}

async function handleResponse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as
    | T
    | { message?: unknown }
    | null;

  if (response.status === 401 || response.status === 403) {
    throw new CustomerAuthError("Phiên đăng nhập đã hết hạn.");
  }

  if (!response.ok) {
    const message =
      data &&
      typeof data === "object" &&
      "message" in data &&
      typeof data.message === "string"
        ? data.message
        : "Không thể kết nối đến Customer API.";

    throw new Error(message);
  }

  if (!data) {
    throw new Error("Customer API returned an empty response.");
  }

  return data as T;
}

async function customerFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const idToken = await getValidCustomerIdToken();

  const response = await fetch(`${getApiUrl()}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${idToken}`,
    },
    cache: "no-store",
  });

  return handleResponse<T>(response);
}

export async function customerGet<T>(path: string): Promise<T> {
  return customerFetch<T>(path, {
    method: "GET",
  });
}

export async function customerPost<TResponse, TBody>(
  path: string,
  body: TBody
): Promise<TResponse> {
  return customerFetch<TResponse>(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
