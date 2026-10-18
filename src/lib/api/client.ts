import createClient from "openapi-fetch";
import type { paths } from "./schema";
import { useAuthStore } from "@/lib/auth/store";
import { ApiError } from "./error";
import type { AdminSession } from "./types";

export { ApiError };

export function parseApiError(status: number, body: unknown): ApiError {
  const errorObj = (body as { error?: { code?: string; message?: string; field?: string; details?: import("./types").ApiErrorDetail[] | null } })?.error;
  if (errorObj && typeof errorObj === "object") {
    return new ApiError(
      status,
      errorObj.code || "unknown_error",
      errorObj.message || "An unexpected error occurred",
      errorObj.field,
      errorObj.details
    );
  }

  const message = (body as { message?: string })?.message || `HTTP ${status}`;
  return new ApiError(status, "http_error", message);
}

function redirectToLogin() {
  try {
    if (typeof window !== "undefined" && window.location && !process.env.VITEST) {
      const next = encodeURIComponent(
        window.location.pathname + window.location.search
      );
      const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
      window.location.href = `${base}/login/?next=${next}`;
    }
  } catch {
    // Ignore in non-browser or test environments
  }
}

// Placeholder origin: onRequest swaps it for the store's current apiUrl, so a
// server changed on the login page (or restored from localStorage) applies at once.
const BASE_PLACEHOLDER = "http://api.placeholder";

function currentApiUrl() {
  return (
    useAuthStore.getState().apiUrl ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8080"
  ).replace(/\/+$/, "");
}

// Untouched copies of sent requests, so a 401 retry can resend the body.
const pending = new WeakMap<Request, Request>();

// Single-flight shared refresh promise
let refreshPromise: Promise<AdminSession | null> | null = null;

export function resetRefreshPromise() {
  refreshPromise = null;
}

export function createApiClient(customFetch?: typeof fetch) {
  const fetchFn = customFetch || globalThis.fetch;

  const client = createClient<paths>({
    baseUrl: BASE_PLACEHOLDER,
    fetch: fetchFn,
  });

  client.use({
    async onRequest({ request }) {
      if (request.url.startsWith(BASE_PLACEHOLDER)) {
        request = new Request(currentApiUrl() + request.url.slice(BASE_PLACEHOLDER.length), request);
      }
      const token = useAuthStore.getState().accessToken;
      if (token && !request.headers.has("Authorization")) {
        request.headers.set("Authorization", `Bearer ${token}`);
      }
      pending.set(request, request.clone());
      return request;
    },

    async onResponse({ request, response }) {
      // Don't intercept refresh endpoint itself to prevent recursion
      const isRefreshRequest = request.url.includes("/admin/v1/auth/refresh");
      if (isRefreshRequest) {
        if (!response.ok) {
          const body = await response.clone().json().catch(() => null);
          throw parseApiError(response.status, body);
        }
        return response;
      }

      // Check 401 token_expired
      if (response.status === 401) {
        const clone = response.clone();
        const body = await clone.json().catch(() => null);
        const code = body?.error?.code;

        if (code === "token_expired") {
          if (!refreshPromise) {
            refreshPromise = (async () => {
              const state = useAuthStore.getState();
              const refreshToken = state.refreshToken;

              if (!refreshToken) {
                state.clear();
                return null;
              }

              try {
                const refreshRes = await fetchFn(
                  `${currentApiUrl()}/admin/v1/auth/refresh`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ refreshToken }),
                  }
                );

                if (!refreshRes.ok) {
                  state.clear();
                  redirectToLogin();
                  return null;
                }

                const newSession: AdminSession = await refreshRes.json();
                state.setSession(newSession);
                return newSession;
              } catch {
                state.clear();
                redirectToLogin();
                return null;
              } finally {
                refreshPromise = null;
              }
            })();
          }

          const newSession = await refreshPromise;
          if (!newSession) {
            throw new ApiError(
              401,
              "token_expired",
              "Session expired, please log in again"
            );
          }

          // Retry the original request once with new token
          const retryHeaders = new Headers(request.headers);
          retryHeaders.set("Authorization", `Bearer ${newSession.accessToken}`);

          const retryReq = new Request(pending.get(request) ?? request, {
            headers: retryHeaders,
          });

          const retryRes = await fetchFn(retryReq);
          if (!retryRes.ok) {
            const retryBody = await retryRes.clone().json().catch(() => null);
            throw parseApiError(retryRes.status, retryBody);
          }
          return retryRes;
        }
      }

      if (!response.ok) {
        const body = await response.clone().json().catch(() => null);
        throw parseApiError(response.status, body);
      }

      return response;
    },
  });

  return client;
}

export const client = createApiClient();
