import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApiClient, resetRefreshPromise, ApiError } from "./client";
import { useAuthStore } from "@/lib/auth/store";
import type { AdminUserView } from "./types";

describe("API client with single-flight refresh", () => {
  const dummyUser: AdminUserView = {
    id: "u-1",
    email: "admin@example.com",
    name: "Admin",
    role: "admin",
    disabled: false,
    totpEnabled: false,
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    resetRefreshPromise();
    useAuthStore.setState({
      apiUrl: "http://localhost:8080",
      accessToken: "initial-expired-token",
      refreshToken: "initial-refresh-token",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      user: dummyUser,
    });
  });

  it("two parallel requests getting 401 token_expired trigger exactly ONE refresh call and both retry successfully", async () => {
    let refreshCalls = 0;
    let meAttempts = 0;
    let usersAttempts = 0;

    const mockFetch: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();

      if (url.includes("/admin/v1/auth/refresh")) {
        refreshCalls++;
        // Simulate network delay to ensure parallel overlapping
        await new Promise((r) => setTimeout(r, 20));
        return new Response(
          JSON.stringify({
            accessToken: "new-refreshed-token",
            refreshToken: "new-refreshed-refresh-token",
            expiresAt: new Date(Date.now() + 7200000).toISOString(),
            user: dummyUser,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.includes("/admin/v1/auth/me")) {
        meAttempts++;
        const authHeader = input instanceof Request
          ? input.headers.get("Authorization")
          : new Headers(init?.headers).get("Authorization");
        if (authHeader === "Bearer initial-expired-token") {
          return new Response(
            JSON.stringify({
              error: {
                code: "token_expired",
                message: "Access token expired",
              },
            }),
            { status: 401, headers: { "Content-Type": "application/json" } }
          );
        }
        if (authHeader === "Bearer new-refreshed-token") {
          return new Response(JSON.stringify(dummyUser), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      if (url.includes("/admin/v1/users")) {
        usersAttempts++;
        const authHeader = input instanceof Request
          ? input.headers.get("Authorization")
          : new Headers(init?.headers).get("Authorization");
        if (authHeader === "Bearer initial-expired-token") {
          return new Response(
            JSON.stringify({
              error: {
                code: "token_expired",
                message: "Access token expired",
              },
            }),
            { status: 401, headers: { "Content-Type": "application/json" } }
          );
        }
        if (authHeader === "Bearer new-refreshed-token") {
          return new Response(
            JSON.stringify({
              items: [dummyUser],
              total: 1,
              page: 1,
              perPage: 20,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      }

      return new Response("Not found", { status: 404 });
    });

    const testClient = createApiClient(mockFetch);

    // Run two requests in parallel
    const [res1, res2] = await Promise.all([
      testClient.GET("/admin/v1/auth/me"),
      testClient.GET("/admin/v1/users", { params: { query: { page: 1, perPage: 20 } } }),
    ]);

    expect(refreshCalls).toBe(1);
    expect(meAttempts).toBe(2);
    expect(usersAttempts).toBe(2);

    expect(res1.data).toBeDefined();
    expect((res1.data as AdminUserView).email).toBe("admin@example.com");

    expect(res2.data).toBeDefined();
    expect((res2.data as { total: number }).total).toBe(1);

    // Verify auth store was updated with new token
    const updatedStore = useAuthStore.getState();
    expect(updatedStore.accessToken).toBe("new-refreshed-token");
    expect(updatedStore.refreshToken).toBe("new-refreshed-refresh-token");
  });

  it("refresh failure clears the store", async () => {
    let refreshCalls = 0;

    const mockFetch: typeof fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();

      if (url.includes("/admin/v1/auth/refresh")) {
        refreshCalls++;
        return new Response(
          JSON.stringify({
            error: {
              code: "invalid_refresh_token",
              message: "Refresh token is invalid or expired",
            },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }

      // Initial request returns 401 token_expired
      return new Response(
        JSON.stringify({
          error: {
            code: "token_expired",
            message: "Access token expired",
          },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    });

    const testClient = createApiClient(mockFetch);

    // Expect request to fail
    await expect(testClient.GET("/admin/v1/auth/me")).rejects.toThrow(ApiError);

    expect(refreshCalls).toBe(1);

    // Auth store must be cleared
    const store = useAuthStore.getState();
    expect(store.accessToken).toBeNull();
    expect(store.refreshToken).toBeNull();
    expect(store.user).toBeNull();
  });
});
