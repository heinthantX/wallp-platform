"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ThemeEditor } from "@/components/theme-editor/ThemeEditor";
import { Skeleton } from "@/components/ui/skeleton";

function ThemeEditWrapper() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  return <ThemeEditor id={id || undefined} isNew={!id} />;
}

export default function ThemeEditPage() {
  return (
    <React.Suspense
      fallback={
        <div className="p-6 max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <ThemeEditWrapper />
    </React.Suspense>
  );
}
