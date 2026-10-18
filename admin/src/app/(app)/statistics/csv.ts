import type { ThemeStat } from "@/lib/api/types";

export function statsToCsv(rows: ThemeStat[]) {
  return [
    "themeId,applies,favourites,popularity",
    ...rows.map((r) => [JSON.stringify(r.themeId), r.applies, r.favourites, r.popularity].join(",")),
  ].join("\n");
}

export function downloadCsv(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
