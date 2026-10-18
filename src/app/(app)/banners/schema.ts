import * as z from "zod";

export const ACTION_TYPES = ["festival", "theme", "wallpapers", "icon-packs", "fonts", "url"] as const;
const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be #RRGGBB");
const kebab = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Must be lowercase kebab-case");
const loc = (what: string) =>
  z.object({ en: z.string().min(1, `${what} (English) is required`) }).catchall(z.string());

export const bannerSchema = z
  .object({
    id: kebab,
    tag: loc("Tag"),
    title: loc("Title"),
    subtitle: loc("Subtitle"),
    cta: loc("Button text"),
    action: z.object({
      type: z.enum(ACTION_TYPES),
      id: z.string().optional(),
      url: z.string().optional(),
    }),
    look: z.object({
      background: hex,
      accent: hex,
      titleColor: hex,
      font: kebab,
      artThemeId: z.string().optional(),
    }),
    startsAt: z.string().optional(),
    endsAt: z.string().optional(),
    sort: z.number().optional(),
  })
  .superRefine((b, ctx) => {
    const { type, id, url } = b.action;
    if ((type === "festival" || type === "theme") && !id) {
      ctx.addIssue({ code: "custom", path: ["action", "id"], message: "Action id is required" });
    }
    if (type === "url") {
      if (!url) ctx.addIssue({ code: "custom", path: ["action", "url"], message: "Action url is required" });
      else if (!/^https:\/\/[^\s/]+/i.test(url))
        ctx.addIssue({ code: "custom", path: ["action", "url"], message: "Action url must be https" });
    }
    if (b.startsAt && b.endsAt && b.endsAt < b.startsAt) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End must be after start" });
    }
  });

export type BannerForm = z.infer<typeof bannerSchema>;

export const defaultBanner = {
  id: "",
  tag: { en: "" },
  title: { en: "" },
  subtitle: { en: "" },
  cta: { en: "" },
  action: { type: "wallpapers" },
  look: { background: "#0c0a1a", accent: "#ff7700", titleColor: "#ffffff", font: "baloo-2" },
} as BannerForm;

/** Banners the store shows on `date` (start/end are optional bounds). */
export function activeOn<T extends { startsAt?: string; endsAt?: string }>(banners: T[], date: Date): T[] {
  const t = date.getTime();
  return banners.filter(
    (b) => (!b.startsAt || new Date(b.startsAt).getTime() <= t) && (!b.endsAt || new Date(b.endsAt).getTime() >= t)
  );
}
