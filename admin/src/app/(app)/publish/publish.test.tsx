import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { useAuthStore } from "@/lib/auth/store";
import PublishPage from "./page";

const issue = (level: string, extra = {}) => ({ code: "c", level, message: "msg", itemType: "theme", itemId: "t1", field: "a.b", ...extra });
const release = { version: "1.0.0", current: false, status: "published", createdBy: "me", publishedAt: "2026-01-01T00:00:00Z", summary: { text: "+1 theme" }, notes: "", catalogSha256: "", manifest: {} };

function setup(report: unknown, post?: (url: string, opts?: unknown) => unknown) {
  vi.spyOn(client, "GET").mockResolvedValue({ data: { items: [release], page: 1, perPage: 50, total: 1 } } as never);
  return vi.spyOn(client, "POST").mockImplementation(((url: string, opts?: unknown) => {
    if (url === "/admin/v1/releases/check") return Promise.resolve({ data: report });
    return post ? post(url, opts) : Promise.resolve({ data: release });
  }) as never);
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><PublishPage /></QueryClientProvider>);
}

beforeEach(() => {
  useAuthStore.setState({ user: { role: "admin" } } as never);
});
afterEach(() => vi.restoreAllMocks());

async function runChecks() {
  fireEvent.click(screen.getByRole("button", { name: /Run checks/ }));
  await screen.findByLabelText(/Check results/);
}

describe("publish page", () => {
  it("disables Publish while errors exist", async () => {
    setup({ errors: [issue("error")], warnings: [], infos: [] });
    renderPage();
    await runChecks();
    await screen.findByText("Errors (1)");
    expect(screen.getByRole("button", { name: /^Publish$/ })).toBeDisabled();
  });

  it("requires the warnings tick and sends ackWarnings", async () => {
    const post = setup({ errors: [], warnings: [issue("warning")], infos: [] });
    renderPage();
    await runChecks();
    const btn = screen.getByRole("button", { name: /^Publish$/ });
    const box = await screen.findByLabelText("I've reviewed the warnings");
    expect(btn).toBeDisabled();
    fireEvent.click(box);
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    const confirm = (await screen.findAllByRole("button", { name: "Publish" })).pop()!;
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/admin/v1/releases", { body: { notes: undefined, ackWarnings: true } })
    );
  });

  it("shows warnings from a 409 warnings_need_ack", async () => {
    setup({ errors: [], warnings: [], infos: [] }, () =>
      Promise.reject(new ApiError(409, "warnings_need_ack", "ack", undefined, [{ field: "theme/t9#x.y", message: "w1: be careful" }]))
    );
    renderPage();
    await runChecks();
    fireEvent.click(await screen.findByRole("button", { name: /^Publish$/ }));
    fireEvent.click((await screen.findAllByRole("button", { name: "Publish" })).pop()!);
    await screen.findByText("Warnings (1)");
    expect(screen.getByText(/be careful/)).toBeInTheDocument();
  });

  it("rolls back after confirm", async () => {
    const post = setup({ errors: [], warnings: [], infos: [] });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Rollback/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Rollback" }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/admin/v1/releases/{version}/rollback", { params: { path: { version: "1.0.0" } } })
    );
  });
});
