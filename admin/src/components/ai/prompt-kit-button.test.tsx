import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PromptKitButton } from "./PromptKitButton";

describe("PromptKitButton", () => {
  it("copies the kit", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<PromptKitButton kit={() => "KIT TEXT"} />);
    fireEvent.click(screen.getByRole("button", { name: /copy prompt kit/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("KIT TEXT"));
  });
});
