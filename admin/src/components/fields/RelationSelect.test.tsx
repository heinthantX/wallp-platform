import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import { RelationSelect } from "./RelationSelect";

const item = (id: string, family: string) => ({
  id,
  status: "published",
  data: JSON.stringify({ family }),
});

function setup(props: Partial<React.ComponentProps<typeof RelationSelect>> = {}) {
  const onChange = vi.fn();
  vi.spyOn(client, "GET").mockResolvedValue({
    data: { items: [item("padauk", "Padauk"), item("orbitron", "Orbitron")], total: 2 },
  } as never);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RelationSelect kind="fonts" label="Font" onChange={onChange} {...props} />
    </QueryClientProvider>
  );
  return onChange;
}

async function openList() {
  const trigger = await screen.findByRole("combobox");
  await waitFor(() => expect(trigger).not.toBeDisabled());
  fireEvent.click(trigger);
}

describe("RelationSelect", () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  beforeEach(() => vi.restoreAllMocks());

  it("filters by search and selects by id", async () => {
    const onChange = setup();
    await openList();
    fireEvent.change(await screen.findByPlaceholderText(/search fonts/i), {
      target: { value: "orbi" },
    });
    await waitFor(() => expect(screen.queryByText("Padauk")).toBeNull());
    fireEvent.click(screen.getByText("Orbitron"));
    expect(onChange).toHaveBeenCalledWith("orbitron");
  });

  it("None clears the value when optional", async () => {
    const onChange = setup({ optional: true, value: "padauk" });
    await openList();
    fireEvent.click(await screen.findByText("None"));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("warns about a missing reference", async () => {
    setup({ value: "ghost" });
    expect(await screen.findByText("Missing: ghost")).toBeTruthy();
  });
});
