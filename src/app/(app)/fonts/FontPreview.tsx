"use client";

import * as React from "react";
import { useAuthStore } from "@/lib/auth/store";

export interface PreviewFile {
  asset: { sha256: string; format: string };
}

/** Loads the font through FontFace from <apiUrl>/assets/<sha256>.<ext>; falls back to the page font. */
export function useFontFace(family: string, file?: PreviewFile) {
  const apiUrl = useAuthStore((s) => s.apiUrl);
  const [loaded, setLoaded] = React.useState(false);
  const sha = file?.asset.sha256;
  const ext = file?.asset.format;
  React.useEffect(() => {
    setLoaded(false);
    if (!sha || !ext || typeof FontFace === "undefined" || typeof document === "undefined") return;
    let cancelled = false;
    const face = new FontFace(family, `url(${apiUrl.replace(/\/+$/, "")}/assets/${sha}.${ext})`);
    face
      .load()
      .then(() => {
        if (cancelled) return;
        document.fonts.add(face);
        setLoaded(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [apiUrl, family, sha, ext]);
  return loaded;
}

export function FontPreview({
  family,
  file,
  sampleText,
  compact,
}: {
  family: string;
  file?: PreviewFile;
  sampleText?: Record<string, string> | string;
  compact?: boolean;
}) {
  const loaded = useFontFace(family, file);
  const style = loaded ? { fontFamily: `"${family}"` } : undefined;
  const sample =
    typeof sampleText === "string" ? sampleText : sampleText?.en || "Welcome";
  const lines = compact
    ? [sample]
    : [sample, "19:47", "ကြိုဆိုပါတယ်", ...Object.entries(typeof sampleText === "object" ? sampleText : {}).filter(([k, v]) => k !== "en" && v).map(([, v]) => v)];
  return (
    <div style={style} className="space-y-1" data-font-loaded={loaded}>
      {lines.map((l, i) => (
        <div key={i} className={i === 0 ? "text-2xl" : "text-lg text-muted-foreground"}>
          {l}
        </div>
      ))}
    </div>
  );
}
