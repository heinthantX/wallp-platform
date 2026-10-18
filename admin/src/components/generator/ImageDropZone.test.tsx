import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ImageDropZone, SwatchPicker } from "./ImageDropZone";

describe("ImageDropZone", () => {
  beforeEach(() => {
    global.URL.createObjectURL = vi.fn(() => "blob:mock-url");
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts valid image file under 10 MB and calls onFile", () => {
    const onFile = vi.fn();
    render(<ImageDropZone onFile={onFile} />);

    const file = new File(["test image bytes"], "photo.png", { type: "image/png" });
    const dropZone = screen.getByRole("button", { name: /upload photo/i });

    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [file],
      },
    });

    expect(onFile).toHaveBeenCalledWith(file);
    expect(screen.getByText("photo.png")).toBeInTheDocument();
  });

  it("rejects file larger than 10 MB", () => {
    const onFile = vi.fn();
    const onError = vi.fn();
    render(<ImageDropZone onFile={onFile} onError={onError} />);

    // 11 MB dummy file
    const largeFile = new File([new ArrayBuffer(11 * 1024 * 1024)], "large.jpg", {
      type: "image/jpeg",
    });
    const dropZone = screen.getByRole("button", { name: /upload photo/i });

    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [largeFile],
      },
    });

    expect(onFile).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("File is too large"));
    expect(screen.getByText(/maximum allowed size is 10 mb/i)).toBeInTheDocument();
  });

  it("rejects unsupported file format", () => {
    const onFile = vi.fn();
    const onError = vi.fn();
    render(<ImageDropZone onFile={onFile} onError={onError} />);

    const badFile = new File(["pdf"], "doc.pdf", { type: "application/pdf" });
    const dropZone = screen.getByRole("button", { name: /upload photo/i });

    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [badFile],
      },
    });

    expect(onFile).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("Invalid file type"));
  });
});

describe("SwatchPicker", () => {
  it("renders proportional swatches and handles onPick", () => {
    const swatches = [
      { hex: "#FF0000", share: 0.5 },
      { hex: "#00FF00", share: 0.3 },
      { hex: "#0000FF", share: 0.2 },
    ];
    const onPick = vi.fn();

    render(
      <SwatchPicker
        swatches={swatches}
        selectedHex="#FF0000"
        onPick={onPick}
      />
    );

    expect(screen.getByText("#FF0000")).toBeInTheDocument();
    expect(screen.getByText("#00FF00")).toBeInTheDocument();
    expect(screen.getByText("#0000FF")).toBeInTheDocument();

    const greenBtn = screen.getByLabelText(/pick color #00FF00/i);
    fireEvent.click(greenBtn);

    expect(onPick).toHaveBeenCalledWith("#00FF00");
  });
});
