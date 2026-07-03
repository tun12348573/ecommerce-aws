"use client";

import {
  CustomerAuthError,
  getValidCustomerIdToken,
} from "@/lib/customer-auth";

export class CustomerApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CustomerApiError";
    this.status = status;
  }
}

function getApiUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (!apiUrl) {
    throw new CustomerAuthError(
      "NEXT_PUBLIC_API_URL is missing in frontend/.env.local"
    );
  }

  return apiUrl.replace(/\/$/, "");
}

async function handleResponse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as
    | T
    | { message?: string }
    | null;

  if (!response.ok) {
    const message =
      data &&
      typeof data === "object" &&
      "message" in data &&
      typeof data.message === "string"
        ? data.message
        : "Không thể gọi Customer API.";

    if (response.status === 401 || response.status === 403) {
      throw new CustomerAuthError(message);
    }

    throw new CustomerApiError(message, response.status);
  }

  if (!data) {
    throw new CustomerApiError(
      "Customer API returned an empty response.",
      response.status
    );
  }

  return data as T;
}

async function customerFetch(
  path: string,
  method: "GET" | "POST" | "PATCH",
  body?: unknown
): Promise<Response> {
  const idToken = await getValidCustomerIdToken();

  return fetch(`${getApiUrl()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${idToken}`,
      ...(body === undefined
        ? {}
        : {
            "Content-Type": "application/json",
          }),
    },
    ...(body === undefined
      ? {}
      : {
          body: JSON.stringify(body),
        }),
    cache: "no-store",
  });
}

export async function customerGet<T>(path: string): Promise<T> {
  const response = await customerFetch(path, "GET");

  return handleResponse<T>(response);
}

export async function customerPost<TResponse, TBody>(
  path: string,
  body: TBody
): Promise<TResponse> {
  const response = await customerFetch(path, "POST", body);

  return handleResponse<TResponse>(response);
}

export async function customerPatch<TResponse, TBody>(
  path: string,
  body: TBody
): Promise<TResponse> {
  const response = await customerFetch(path, "PATCH", body);

  return handleResponse<TResponse>(response);
}

export async function getOptionalCustomerIdToken(): Promise<string | null> {
  try {
    return await getValidCustomerIdToken();
  } catch {
    return null;
  }
}
