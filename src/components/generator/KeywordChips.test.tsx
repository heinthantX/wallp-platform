import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KeywordChips } from "./KeywordChips";

describe("KeywordChips", () => {
  it("renders matched keywords with remove buttons", () => {
    const onRemove = vi.fn();
    const matched = ["snow", "cozy", "fire", "မီး"];

    render(<KeywordChips matched={matched} onRemove={onRemove} />);

    expect(screen.getByText("snow")).toBeInTheDocument();
    expect(screen.getByText("cozy")).toBeInTheDocument();
    expect(screen.getByText("fire")).toBeInTheDocument();
    expect(screen.getByText("မီး")).toBeInTheDocument();

    const removeBtn = screen.getByLabelText("Remove keyword snow");
    fireEvent.click(removeBtn);

    expect(onRemove).toHaveBeenCalledWith("snow", 0);
  });

  it("handles empty matched gracefully", () => {
    const { container } = render(<KeywordChips matched={[]} />);
    expect(container.firstChild).toBeNull();

    render(<KeywordChips matched={[]} emptyText="No keywords found" />);
    expect(screen.getByText("No keywords found")).toBeInTheDocument();
  });
});
