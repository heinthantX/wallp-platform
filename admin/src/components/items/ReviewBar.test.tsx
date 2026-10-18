import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReviewBar } from "./ReviewBar";

const all = () => ({
  onSaveDraft: vi.fn(),
  onRequestReview: vi.fn(),
  onApprove: vi.fn(),
  onReject: vi.fn(),
  onSchedule: vi.fn(),
  onDuplicate: vi.fn(),
  onExportJson: vi.fn(),
  onArchive: vi.fn(),
});

describe("ReviewBar", () => {
  // P1b (user, 2026-10-19): admins skip the review request and approve drafts directly.
  it("admin on a draft sees Approve instead of Request review", () => {
    const h = all();
    render(<ReviewBar status="draft" user={{ role: "admin" }} {...h} />);
    expect(screen.queryByRole("button", { name: /request review/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^approve$/i }));
    expect(h.onApprove).toHaveBeenCalledTimes(1);
  });

  it("designer on a draft still requests review", () => {
    render(<ReviewBar status="draft" user={{ role: "designer" }} {...all()} />);
    expect(screen.getByRole("button", { name: /request review/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull();
  });

  it("reviewer on an item in review sees Approve and Reject", () => {
    render(<ReviewBar status="in_review" user={{ role: "reviewer" }} {...all()} />);
    expect(screen.getByRole("button", { name: /^approve$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
  });

  // B5 (loop-2 P1): festivals have no review workflow; the bar showed dead buttons with no handler.
  it("hides actions that have no handler", () => {
    render(<ReviewBar status="draft" user={{ role: "admin" }} onSaveDraft={vi.fn()} />);
    expect(screen.getByRole("button", { name: /save draft/i })).toBeInTheDocument();
    for (const name of [/request review/i, /^approve$/i, /duplicate/i, /export json/i, /archive/i]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });
});
