"use client";

import * as React from "react";
import { UploadCloud, Image as ImageIcon, X, AlertCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

export interface ImageDropZoneProps {
  onFile: (file: File) => void;
  onError?: (error: string) => void;
  className?: string;
  disabled?: boolean;
}

export function ImageDropZone({
  onFile,
  onError,
  className,
  disabled = false,
}: ImageDropZoneProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const dropZoneRef = React.useRef<HTMLDivElement>(null);

  // Clean up object URL on unmount or file change
  React.useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function validateAndProcessFile(file: File) {
    setErrorMessage(null);

    // Validate type
    const isAcceptedType =
      ACCEPTED_TYPES.includes(file.type) ||
      /\.(png|jpe?g|webp)$/i.test(file.name);

    if (!isAcceptedType) {
      const msg = "Invalid file type. Only PNG, JPG, and WebP images are supported.";
      setErrorMessage(msg);
      onError?.(msg);
      return;
    }

    // Validate size (<= 10MB)
    if (file.size > MAX_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      const msg = `File is too large (${sizeMb} MB). Maximum allowed size is 10 MB.`;
      setErrorMessage(msg);
      onError?.(msg);
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setSelectedFile(file);
    onFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndProcessFile(e.dataTransfer.files[0]);
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    if (disabled) return;
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      const file = e.clipboardData.files[0];
      if (file.type.startsWith("image/")) {
        e.preventDefault();
        validateAndProcessFile(file);
      }
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      validateAndProcessFile(e.target.files[0]);
    }
  }

  function clearImage() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setSelectedFile(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled}
      />

      <div
        ref={dropZoneRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handlePaste}
        onClick={() => !selectedFile && !disabled && fileInputRef.current?.click()}
        tabIndex={0}
        role="button"
        aria-label="Upload photo drop zone"
        className={cn(
          "relative flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed transition-all focus:outline-hidden focus:ring-2 focus:ring-primary select-none",
          isDragging
            ? "border-primary bg-primary/10 scale-[1.01]"
            : "border-border/70 bg-muted/20 hover:border-primary/50 hover:bg-muted/40",
          selectedFile ? "cursor-default" : "cursor-pointer",
          disabled && "opacity-50 pointer-events-none"
        )}
      >
        {selectedFile && previewUrl ? (
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full">
            {/* Thumbnail */}
            <div className="relative h-28 w-28 shrink-0 rounded-lg overflow-hidden border shadow-md bg-black/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Selected photo preview"
                className="h-full w-full object-cover"
              />
            </div>

            {/* File info */}
            <div className="flex-1 min-w-0 space-y-1 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs font-semibold text-foreground truncate">
                <ImageIcon className="h-4 w-4 text-primary shrink-0" />
                <span className="truncate">{selectedFile.name}</span>
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · {selectedFile.type || "image"}
              </p>
              <div className="pt-2 flex items-center justify-center sm:justify-start gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="h-7 text-xs"
                >
                  Change Photo
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearImage();
                  }}
                  className="h-7 text-xs text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Remove
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center pointer-events-none">
            <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center shadow-xs">
              <UploadCloud className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                Drag and drop a photo, or <span className="text-primary underline">browse</span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                PNG, JPG or WebP (max 10 MB) · Paste from clipboard supported
              </p>
            </div>
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="flex items-center gap-1.5 text-xs text-destructive bg-destructive/10 border border-destructive/20 p-2 rounded-md">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}

export interface SwatchItem {
  hex: string;
  share: number; // proportional pixel share (e.g. 0.35 = 35%)
}

export interface SwatchPickerProps {
  swatches: SwatchItem[];
  selectedHex?: string;
  onPick: (hex: string) => void;
  className?: string;
}

export function SwatchPicker({
  swatches,
  selectedHex,
  onPick,
  className,
}: SwatchPickerProps) {
  if (!swatches || swatches.length === 0) return null;

  const totalShare = swatches.reduce((sum, s) => sum + s.share, 0) || 1;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-foreground">Extracted Palette Swatches</span>
        <span className="text-muted-foreground text-[11px]">
          Click a swatch to set as base color
        </span>
      </div>

      {/* Proportional width swatch bar */}
      <div className="w-full h-8 rounded-lg overflow-hidden flex border shadow-inner">
        {swatches.map((item, index) => {
          const percentage = (item.share / totalShare) * 100;
          const isSelected = selectedHex?.toLowerCase() === item.hex.toLowerCase();

          return (
            <button
              key={`${item.hex}-${index}`}
              type="button"
              onClick={() => onPick(item.hex)}
              style={{
                width: `${percentage}%`,
                backgroundColor: item.hex,
              }}
              className={cn(
                "h-full relative group transition-all hover:opacity-90 focus:outline-hidden",
                isSelected && "ring-2 ring-white ring-inset z-10"
              )}
              title={`${item.hex} (${Math.round(percentage)}% share)`}
              aria-label={`Pick color ${item.hex}, ${Math.round(percentage)} percent share`}
            >
              {isSelected && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <Check className="h-3.5 w-3.5 text-white drop-shadow-md stroke-[3]" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Swatch chips grid */}
      <div className="flex flex-wrap gap-2">
        {swatches.map((item, index) => {
          const percentage = Math.round((item.share / totalShare) * 100);
          const isSelected = selectedHex?.toLowerCase() === item.hex.toLowerCase();

          return (
            <button
              key={`${item.hex}-${index}-chip`}
              type="button"
              onClick={() => onPick(item.hex)}
              className={cn(
                "flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs font-mono transition-all",
                isSelected
                  ? "border-primary bg-primary/10 ring-1 ring-primary font-bold"
                  : "bg-muted/30 hover:bg-muted"
              )}
            >
              <span
                className="h-3.5 w-3.5 rounded-full border border-black/20 shrink-0"
                style={{ backgroundColor: item.hex }}
              />
              <span>{item.hex.toUpperCase()}</span>
              <span className="text-[10px] text-muted-foreground">({percentage}%)</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
