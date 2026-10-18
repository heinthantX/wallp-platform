"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Dominant-colour placeholder that cross-fades to the image once loaded (no blurhash dep installed). */
export function BlurImage({
  src,
  dominant,
  alt,
  className,
}: {
  src: string;
  dominant?: string;
  alt: string;
  className?: string;
}) {
  const [loaded, setLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ backgroundColor: dominant || "#1b1035" }}
    >
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            "h-full w-full object-cover transition-opacity duration-500",
            loaded ? "opacity-100" : "opacity-0"
          )}
        />
      )}
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-white/60">
          image unavailable
        </div>
      )}
    </div>
  );
}
