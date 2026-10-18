"use client";

import * as React from "react";
import { WallpaperEditor } from "../_components/WallpaperEditor";
import { Skeleton } from "@/components/ui/skeleton";

export default function WallpaperNewPage() {
  return (
    <React.Suspense fallback={<Skeleton className="m-6 h-96 w-full" />}>
      <WallpaperEditor />
    </React.Suspense>
  );
}
