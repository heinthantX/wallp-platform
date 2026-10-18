"use client";

import { ClipboardCopy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function PromptKitButton({ kit, label = "Copy prompt kit", tip = true }: { kit: () => string; label?: string; tip?: boolean }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(kit());
      toast.success("Prompt kit copied");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not copy");
    }
  };
  return (
    <div className="space-y-1">
      <Button type="button" variant="outline" size="sm" onClick={copy}>
        <ClipboardCopy className="h-4 w-4" />
        {label}
      </Button>
      {tip && (
        <p className="text-xs text-muted-foreground">
          Approve the first icon, then reuse it as a style reference (chat tools: &quot;match the previous image&quot;; Midjourney: --sref &lt;url&gt; --ar 1:1; Ideogram: style-reference upload).
        </p>
      )}
    </div>
  );
}
