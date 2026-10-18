import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Stepper } from "./Stepper";

describe("Stepper", () => {
  it("renders 3 steps with titles and highlights current step", () => {
    render(<Stepper currentStep={2} />);

    expect(screen.getByText("Configure Inputs")).toBeInTheDocument();
    expect(screen.getByText("Pick & Refine")).toBeInTheDocument();
    expect(screen.getByText("Review & Save")).toBeInTheDocument();

    const activeItem = screen.getByRole("listitem", { current: "step" });
    expect(activeItem).toBeInTheDocument();
    expect(activeItem).toHaveTextContent("Pick & Refine");
  });

  it("calls onStepClick when clickable step is clicked", () => {
    const onStepClick = vi.fn();
    render(<Stepper currentStep={2} onStepClick={onStepClick} />);

    // Click step 1 (completed, clickable)
    const step1Btn = screen.getByText("Configure Inputs").closest("button");
    expect(step1Btn).toBeInTheDocument();
    fireEvent.click(step1Btn!);

    expect(onStepClick).toHaveBeenCalledWith(1);
  });
});
