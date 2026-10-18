"use client";

import * as React from "react";
import { ThemeEditor } from "@/components/theme-editor/ThemeEditor";
import { Skeleton } from "@/components/ui/skeleton";

export default function ThemeNewPage() {
  return (
    <React.Suspense
      fallback={
        <div className="p-6 max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <ThemeEditor isNew={true} />
    </React.Suspense>
  );
}
