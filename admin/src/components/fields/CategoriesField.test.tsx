import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import { CategoriesField } from "./CategoriesField";

describe("CategoriesField kind=festivals", () => {
  it("lists festivals and toggles festivalIds", async () => {
    const get = vi.spyOn(client, "GET").mockResolvedValue({
      data: { items: [{ id: "thingyan", status: "published", data: { name: { en: "Thingyan" } } }], total: 1 },
    } as never);
    const onChange = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CategoriesField kind="festivals" label="Linked festivals" value={[]} onChange={onChange} />
      </QueryClientProvider>
    );
    fireEvent.click(await screen.findByRole("button", { name: "Thingyan" }));
    expect(onChange).toHaveBeenCalledWith(["thingyan"]);
    expect(String(get.mock.calls[0][0])).toContain("festivals");
  });
});
