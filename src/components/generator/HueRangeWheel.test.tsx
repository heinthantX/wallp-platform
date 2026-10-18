import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HueRangeWheel, getHueRangeSpan } from "./HueRangeWheel";

describe("HueRangeWheel", () => {
  it("calculates wrap-around span correctly", () => {
    expect(getHueRangeSpan(10, 50)).toBe(40);
    expect(getHueRangeSpan(350, 20)).toBe(30);
    expect(getHueRangeSpan(0, 0)).toBe(0);
    expect(getHueRangeSpan(300, 300)).toBe(0);
    expect(getHueRangeSpan(355, 5)).toBe(10);
  });

  it("renders handles with accessible roles and labels", () => {
    const value: [number, number][] = [[40, 100]];
    const onChange = vi.fn();

    render(<HueRangeWheel value={value} onChange={onChange} />);

    const startHandle = screen.getByLabelText(/range 1 start hue/i);
    const endHandle = screen.getByLabelText(/range 1 end hue/i);

    expect(startHandle).toBeInTheDocument();
    expect(endHandle).toBeInTheDocument();
    expect(startHandle).toHaveAttribute("aria-valuenow", "40");
    expect(endHandle).toHaveAttribute("aria-valuenow", "100");
  });

  it("adjusts hue by 1 degree with arrow keys and 10 degrees with shift", () => {
    const value: [number, number][] = [[50, 120]];
    const onChange = vi.fn();

    render(<HueRangeWheel value={value} onChange={onChange} />);

    const startHandle = screen.getByLabelText(/range 1 start hue/i);

    // ArrowRight -> +1
    fireEvent.keyDown(startHandle, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith([[51, 120]]);

    // ArrowLeft + Shift -> -10
    fireEvent.keyDown(startHandle, { key: "ArrowLeft", shiftKey: true });
    expect(onChange).toHaveBeenCalledWith([[40, 120]]);
  });

  it("removes range on delete or backspace key", () => {
    const value: [number, number][] = [
      [30, 90],
      [180, 240],
    ];
    const onChange = vi.fn();

    render(<HueRangeWheel value={value} onChange={onChange} />);

    const handle = screen.getByLabelText(/range 2 start hue/i);
    fireEvent.keyDown(handle, { key: "Backspace" });

    expect(onChange).toHaveBeenCalledWith([[30, 90]]);
  });
});
