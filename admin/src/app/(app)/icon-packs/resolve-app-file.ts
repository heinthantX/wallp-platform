import { ALIAS_PACKAGES, COMMON_APPS, PACKAGE_RE } from "./common-apps";

export interface ResolvedFile {
  pkg?: string;
  source: "exact" | "alias" | "unmatched";
  suggestion?: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]/g, "");

const aliasMap = new Map<string, string>();
for (const app of COMMON_APPS) {
  aliasMap.set(norm(app.label), app.pkg);
  for (const al of app.aliases) aliasMap.set(norm(al), app.pkg);
}
for (const [k, v] of Object.entries(ALIAS_PACKAGES)) aliasMap.set(k.toLowerCase(), v);

export function stemOf(filename: string): string {
  return filename
    .replace(/^.*[\\/]/, "")
    .replace(/\.(png|webp|jpe?g)$/i, "")
    .replace(/@[23]x$/i, "")
    .replace(/[-_]\d{2,4}$/, "")
    .trim();
}

export function resolveAppFile(filename: string): ResolvedFile {
  const stem = stemOf(filename);
  if (PACKAGE_RE.test(stem)) return { pkg: stem, source: "exact" };
  const key = norm(stem);
  const hit = aliasMap.get(key);
  if (hit) return { pkg: hit, source: "alias" };
  // ponytail: simple prefix/includes suggestion, never auto-assigned.
  const near = key.length >= 2 && COMMON_APPS.find((app) => [app.label, ...app.aliases].some((n) => {
    const m = norm(n);
    return m.startsWith(key) || (key.length >= 3 && (key.includes(m) || m.includes(key)));
  }));
  return near ? { source: "unmatched", suggestion: near.pkg } : { source: "unmatched" };
}
