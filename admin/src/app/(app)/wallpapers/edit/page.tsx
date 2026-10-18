"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { WallpaperEditor } from "../_components/WallpaperEditor";
import { Skeleton } from "@/components/ui/skeleton";

function EditWrapper() {
  const id = useSearchParams().get("id");
  return <WallpaperEditor id={id || undefined} />;
}

export default function WallpaperEditPage() {
  return (
    <React.Suspense fallback={<Skeleton className="m-6 h-96 w-full" />}>
      <EditWrapper />
    </React.Suspense>
  );
}
