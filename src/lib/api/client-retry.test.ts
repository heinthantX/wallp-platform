import { describe, it, expect, beforeEach } from "vitest";
import { createApiClient, resetRefreshPromise } from "./client";
import { useAuthStore } from "@/lib/auth/store";

const user = {
  id: "u-1", email: "a@example.com", name: "A", role: "admin" as const,
  disabled: false, totpEnabled: false, createdAt: new Date().toISOString(),
};

describe("API client URL + retry", () => {
  beforeEach(() => {
    resetRefreshPromise();
    useAuthStore.setState({
      apiUrl: "http://first.test", accessToken: "old", refreshToken: "r1",
      expiresAt: new Date(Date.now() + 3600000).toISOString(), user,
    });
  });

  it("uses the store's current apiUrl and resends the body after a refresh", async () => {
    const seen: { url: string; auth: string | null; body: string }[] = [];
    let posts = 0;
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      const body = await req.clone().text();
      seen.push({ url: req.url, auth: req.headers.get("Authorization"), body });
      if (req.url.endsWith("/admin/v1/auth/refresh")) {
        return Response.json({ accessToken: "new", refreshToken: "r2", expiresAt: new Date().toISOString(), user });
      }
      posts++;
      if (posts === 1) {
        return Response.json({ error: { code: "token_expired", message: "x" } }, { status: 401 });
      }
      return Response.json({ id: "u-2", email: "b@example.com", name: "B", role: "viewer", disabled: false, totpEnabled: false, createdAt: user.createdAt }, { status: 201 });
    }) as typeof fetch;

    const client = createApiClient(fetchFn);
    useAuthStore.setState({ apiUrl: "http://second.test/" }); // changed after the client was made

    const { data } = await client.POST("/admin/v1/users", {
      body: { email: "b@example.com", name: "B", password: "password12345", role: "viewer" },
    });

    expect(data?.id).toBe("u-2");
    expect(seen.map((s) => s.url)).toEqual([
      "http://second.test/admin/v1/users",
      "http://second.test/admin/v1/auth/refresh",
      "http://second.test/admin/v1/users",
    ]);
    expect(seen[2].auth).toBe("Bearer new");
    expect(JSON.parse(seen[2].body).email).toBe("b@example.com");
  });
});
