import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ThemeGeneratePage from "./page";
import { client } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/keys";
import type { ThemeDetail } from "@/lib/catalog/types";

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/themes/generate",
}));

function createMockTheme(id: string, name: string): ThemeDetail {
  return {
    id,
    rev: 1,
    festivalId: "christmas",
    name: { en: name },
    style: "cozy",
    palette: {
      background: "#0c0a1a",
      deep: "#05040a",
      surface: "#18142c",
      text: "#ffffff",
      textMuted: "#9b92c4",
      motif: "#ff7700",
    },
    accents: [
      {
        id: "accent-1",
        name: { en: "Warm Gold" },
        type: "solid",
        colors: ["#ffd700"],
      },
    ],
    fonts: {
      display: "Inter",
      body: "Inter",
      labels: "Inter",
    },
    clock: {
      useAccent: true,
    },
    labels: {
      color: "#ffffff",
    },
    scene: {
      engine: "layers",
      params: {},
    },
  };
}

describe("ThemeGeneratePage Wizard", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Provide festivals in cache
    queryClient.setQueryData(queryKeys.festivals({ perPage: 100 }), {
      items: [
        { id: "christmas", data: JSON.stringify({ name: { en: "Christmas" } }) },
        { id: "thingyan", data: JSON.stringify({ name: { en: "Thingyan" } }) },
      ],
      page: 1,
      perPage: 100,
      total: 2,
    });
  });

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ThemeGeneratePage />
      </QueryClientProvider>
    );
  };

  it("validates step 1: festival required", async () => {
    const postSpy = vi.spyOn(client, "POST");
    renderComponent();

    // Click "Generate Themes" without selecting a festival
    const submitBtn = screen.getByRole("button", { name: /generate themes/i });
    fireEvent.click(submitBtn);

    // Festival is required error should appear
    await waitFor(() => {
      expect(screen.getByText("Festival is required")).toBeInTheDocument();
    });

    // No POST to generate endpoint should have occurred
    expect(postSpy).not.toHaveBeenCalled();
  });

  it("shuffles only one slot and undo restores it", async () => {
    const initialOptions = Array.from({ length: 6 }).map((_, i) => ({
      seed: 1000 + i,
      data: createMockTheme(`theme-${i}`, `Theme Option ${i}`),
      checks: [{ name: "text_contrast", field: "text", ratio: 5.5, min: 4.5, pass: true }],
    }));

    const shuffledOption = {
      seed: 9999,
      data: createMockTheme("shuffled-theme-1", "Shuffled Theme 1"),
      checks: [{ name: "text_contrast", field: "text", ratio: 6.0, min: 4.5, pass: true }],
    };

    const postSpy = vi.spyOn(client, "POST").mockImplementation(async (path: string) => {
      if (path === "/admin/v1/themes/generate") {
        return {
          data: {
            seed: 12345,
            options: initialOptions,
          },
        } as unknown as Awaited<ReturnType<typeof client.POST>>;
      }
      return { data: {} } as unknown as Awaited<ReturnType<typeof client.POST>>;
    });

    // Prefill festival so form is valid
    mockSearchParams = new URLSearchParams("festivalId=christmas&mood=cozy");
    renderComponent();

    // Submit Step 1 to generate initial 6 options
    const submitBtn = screen.getByRole("button", { name: /generate themes/i });
    fireEvent.click(submitBtn);

    // Step 2 should render the 6 options
    await waitFor(() => {
      expect(screen.getByText("Pick & Refine Options")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getAllByText("Theme Option 0").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Theme Option 1").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Theme Option 2").length).toBeGreaterThan(0);
    });

    // Mock next generate call for shuffle (returns count 1)
    postSpy.mockImplementationOnce(async () => {
      return {
        data: {
          seed: 9999,
          options: [shuffledOption],
        },
      } as unknown as Awaited<ReturnType<typeof client.POST>>;
    });

    // Find all "Shuffle" buttons (one per card)
    const shuffleButtons = screen.getAllByRole("button", { name: /^shuffle$/i });
    expect(shuffleButtons.length).toBe(6);

    // Click shuffle on slot 1
    fireEvent.click(shuffleButtons[1]);

    // Slot 1 now displays "Shuffled Theme 1"
    await waitFor(() => {
      expect(screen.getAllByText("Shuffled Theme 1").length).toBeGreaterThan(0);
    });

    // Other slots are unchanged
    expect(screen.getAllByText("Theme Option 0").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Theme Option 2").length).toBeGreaterThan(0);

    // Click "Undo" on slot 1
    const undoButtons = screen.getAllByRole("button", { name: /^undo$/i });
    expect(undoButtons[1]).not.toBeDisabled();
    fireEvent.click(undoButtons[1]);

    // Slot 1 is restored to "Theme Option 1"
    await waitFor(() => {
      expect(screen.getAllByText("Theme Option 1").length).toBeGreaterThan(0);
    });
  });

  it("calls create theme mutation with data + generatedFrom on Use this", async () => {
    const initialOptions = Array.from({ length: 6 }).map((_, i) => ({
      seed: 5000 + i,
      data: createMockTheme(`theme-${i}`, `Theme Choice ${i}`),
      checks: [],
    }));

    const postSpy = vi.spyOn(client, "POST").mockImplementation(async (path: string, _opts?: unknown) => {
      if (path === "/admin/v1/themes/generate") {
        return {
          data: {
            seed: 7777,
            options: initialOptions,
          },
        } as unknown as Awaited<ReturnType<typeof client.POST>>;
      }
      if (path === "/admin/v1/themes") {
        return {
          data: {
            id: "theme-0",
            rev: 1,
            status: "draft",
          },
        } as unknown as Awaited<ReturnType<typeof client.POST>>;
      }
      return { data: {} } as unknown as Awaited<ReturnType<typeof client.POST>>;
    });

    mockSearchParams = new URLSearchParams("festivalId=thingyan&mood=cute");
    renderComponent();

    // Submit step 1
    fireEvent.click(screen.getByRole("button", { name: /generate themes/i }));

    await waitFor(() => {
      expect(screen.getAllByText("Theme Choice 0").length).toBeGreaterThan(0);
    });

    // Click "Use this" on slot 0
    const useThisButtons = screen.getAllByRole("button", { name: /^use this$/i });
    fireEvent.click(useThisButtons[0]);

    // Should navigate to Step 3: Review & Save
    await waitFor(() => {
      expect(screen.getByText("Review & Save Theme")).toBeInTheDocument();
    });

    // Click "Use this theme" on review step
    const finalUseThisBtn = screen.getByRole("button", { name: /use this theme/i });
    fireEvent.click(finalUseThisBtn);

    // Verify client.POST called for /admin/v1/themes with generatedFrom
    await waitFor(() => {
      const createCall = postSpy.mock.calls.find((call) => call[0] === "/admin/v1/themes");
      expect(createCall).toBeDefined();

      const bodyPayload = JSON.parse((createCall![1] as { body: string }).body);
      expect(bodyPayload.data).toBeDefined();
      expect(bodyPayload.data.id).toBe("theme-0");
      expect(bodyPayload.generatedFrom).toBeDefined();
      expect(bodyPayload.generatedFrom.inputs.festivalId).toBe("thingyan");
      expect(bodyPayload.generatedFrom.inputs.mood).toBe("cute");
      expect(bodyPayload.generatedFrom.optionSeed).toBe(5000);

      // Verify router.push called
      expect(mockPush).toHaveBeenCalledWith("/themes/edit/?id=theme-0");
    });
  });

  it("interpret chips render matched words", async () => {
    vi.spyOn(client, "POST").mockImplementation(async (path: string) => {
      if (path === "/admin/v1/themes/generate/interpret") {
        return {
          data: {
            matched: ["cozy", "snow", "lantern"],
            mood: "cozy",
          },
        } as unknown as Awaited<ReturnType<typeof client.POST>>;
      }
      return { data: {} } as unknown as Awaited<ReturnType<typeof client.POST>>;
    });

    renderComponent();

    const descTextarea = screen.getByPlaceholderText(/cozy warm fireplace/i);
    fireEvent.change(descTextarea, {
      target: { value: "cozy snow cabin with lantern" },
    });

    // Debounced 400ms -> wait for chips to render
    await waitFor(
      () => {
        expect(screen.getByText("cozy")).toBeInTheDocument();
        expect(screen.getByText("snow")).toBeInTheDocument();
        expect(screen.getByText("lantern")).toBeInTheDocument();
      },
      { timeout: 2000 }
    );
  });

  it("locks are sent in the shuffle request body", async () => {
    const initialOptions = Array.from({ length: 6 }).map((_, i) => ({
      seed: 1000 + i,
      data: createMockTheme(`theme-${i}`, `Theme Option ${i}`),
      checks: [{ name: "text_contrast", field: "text", ratio: 5.5, min: 4.5, pass: true }],
    }));

    const postSpy = vi.spyOn(client, "POST").mockImplementation(async (path: string) => {
      if (path === "/admin/v1/themes/generate") {
        return {
          data: {
            seed: 12345,
            options: initialOptions,
          },
        } as unknown as Awaited<ReturnType<typeof client.POST>>;
      }
      return { data: {} } as unknown as Awaited<ReturnType<typeof client.POST>>;
    });

    mockSearchParams = new URLSearchParams("festivalId=christmas&mood=cozy");
    renderComponent();

    // Generate initial options
    fireEvent.click(screen.getByRole("button", { name: /generate themes/i }));

    await waitFor(() => {
      expect(screen.getByText("Pick & Refine Options")).toBeInTheDocument();
    });

    // Lock the background role on card 0
    const bgSwatchBtns = screen.getAllByRole("button", {
      name: /Palette role background/i,
    });
    fireEvent.click(bgSwatchBtns[0]);

    // Mock next generate call for shuffle
    postSpy.mockImplementationOnce(async () => {
      return {
        data: {
          seed: 8888,
          options: [
            {
              seed: 8888,
              data: createMockTheme("shuffled-0", "Shuffled 0"),
              checks: [],
            },
          ],
        },
      } as unknown as Awaited<ReturnType<typeof client.POST>>;
    });

    // Shuffle slot 0
    const shuffleButtons = screen.getAllByRole("button", { name: /^shuffle$/i });
    fireEvent.click(shuffleButtons[0]);

    // Verify client.POST called with locked background in body
    await waitFor(() => {
      const shuffleCall = postSpy.mock.calls.find(
        (call) =>
          call[0] === "/admin/v1/themes/generate" &&
          (call[1] as { body: { count?: number } })?.body?.count === 1
      );
      expect(shuffleCall).toBeDefined();

      const reqBody = (shuffleCall![1] as { body: { locked?: { background?: string } } })?.body;
      expect(reqBody.locked).toBeDefined();
      expect(reqBody.locked?.background).toBe("#0c0a1a");
    });
  });
});
