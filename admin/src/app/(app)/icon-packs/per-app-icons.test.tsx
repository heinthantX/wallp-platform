import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PerAppIcons } from "./PerAppIcons";
import { COMMON_APPS } from "./common-apps";
import type { Asset } from "@/lib/catalog/types";

vi.mock("@/lib/api/hooks/useFonts", () => ({
  useUploadAsset: () => ({
    mutateAsync: async (f: File) => ({ url: `/assets/${f.name}`, sha256: `sha-${f.name}`, bytes: 10, format: "png" }),
  }),
}));

function Harness({ spy }: { spy: (a: Record<string, Asset>) => void }) {
  const [apps, setApps] = React.useState<Record<string, Asset>>({});
  return <PerAppIcons apps={apps} tile="#111111" onChange={(n) => { spy(n); setApps(n); }} />;
}

const png = (name: string) => new File(["x"], name, { type: "image/png" });

describe("PerAppIcons", () => {
  it("bulk upload maps matches, leaves unmatched with a select, updates missing count", async () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    expect(screen.getByTestId("apps-counter")).toHaveTextContent(`0 / ${COMMON_APPS.length} · ${COMMON_APPS.length} missing`);
    fireEvent.change(screen.getByLabelText("Upload app icons"), { target: { files: [png("com.whatsapp.png"), png("maps.png"), png("random.png")] } });
    await waitFor(() => expect(screen.getByTestId("apps-counter")).toHaveTextContent(`2 / ${COMMON_APPS.length} · ${COMMON_APPS.length - 2} missing`));
    const last = spy.mock.calls.at(-1)![0];
    expect(Object.keys(last).sort()).toEqual(["com.google.android.apps.maps", "com.whatsapp"]);
    expect(screen.getByLabelText("Map random.png to app")).toBeInTheDocument();
    expect(screen.getAllByTestId("app-row")).toHaveLength(2);
  });
});

describe("PerAppIcons sprite import", () => {
  it("offers the import button", () => {
    render(<Harness spy={() => {}} />);
    expect(screen.getByLabelText("Import sprite sheet")).toBeInTheDocument();
  });

  describe("whole sheet dropped or pasted", () => {
    beforeEach(() => {
      vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1536, height: 1024, close() {} })));
    });
    afterEach(() => vi.unstubAllGlobals());

    it("opens the slicer for one wide image with no app name", async () => {
      render(<Harness spy={() => {}} />);
      fireEvent.change(screen.getByLabelText("Upload app icons"), { target: { files: [png("Minimalist White App Icon Grid.png")] } });
      expect(await screen.findByRole("dialog", { name: "Import sprite sheet" })).toBeInTheDocument();
      expect(screen.queryByTestId("pending-row")).not.toBeInTheDocument();
    });

    it("opens the slicer for a pasted image", async () => {
      render(<Harness spy={() => {}} />);
      const paste = new Event("paste") as Event & { clipboardData: { files: File[] } };
      paste.clipboardData = { files: [new File(["x"], "image", { type: "image/png" })] };
      window.dispatchEvent(paste);
      expect(await screen.findByRole("dialog", { name: "Import sprite sheet" })).toBeInTheDocument();
    });

    it("keeps a named app icon as a single upload", async () => {
      render(<Harness spy={() => {}} />);
      fireEvent.change(screen.getByLabelText("Upload app icons"), { target: { files: [png("maps.png")] } });
      await waitFor(() => expect(screen.getAllByTestId("app-row")).toHaveLength(1));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
