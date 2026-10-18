import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { QueryProvider } from "./query-provider";

describe("QueryProvider", () => {
  it("refetches audit history after any successful write", async () => {
    const auditFn = vi.fn(async () => []);
    let save: () => void = () => {};
    function Probe() {
      useQuery({ queryKey: ["audit", { itemId: "x" }], queryFn: auditFn });
      const m = useMutation({ mutationFn: async () => "ok" });
      save = () => m.mutate();
      return null;
    }
    render(<QueryProvider><Probe /></QueryProvider>);
    await waitFor(() => expect(auditFn).toHaveBeenCalledTimes(1));
    save();
    await waitFor(() => expect(auditFn).toHaveBeenCalledTimes(2));
  });
});
