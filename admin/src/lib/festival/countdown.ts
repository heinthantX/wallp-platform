export interface FestivalFallbackDate {
  month: number;
  day: number;
}

export interface NextFestivalRunOptions {
  id?: string;
  occurrences?: string[];
  fallbackDate?: FestivalFallbackDate;
  durationDays?: number;
  unit?: "day" | "night";
  kind?: "festival" | "collection" | string;
  comingSoon?: boolean;
}

export interface NextFestivalRun {
  startDate: string;
  endDate: string;
  durationDays: number;
  unit: "day" | "night";
  daysUntil: number;
  isHappening: boolean;
  currentDay?: number;
  isFallback: boolean;
  label: string;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function formatYMD(date: Date): string {
  const y = date.getUTCFullYear();
  const m = pad2(date.getUTCMonth() + 1);
  const d = pad2(date.getUTCDate());
  return `${y}-${m}-${d}`;
}

export function ymdToUtcDate(ymd: string): Date {
  const parts = ymd.split("-");
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(ymd: string, days: number): string {
  const dt = ymdToUtcDate(ymd);
  dt.setUTCDate(dt.getUTCDate() + days);
  return formatYMD(dt);
}

export function daysBetween(ymd1: string, ymd2: string): number {
  const t1 = ymdToUtcDate(ymd1).getTime();
  const t2 = ymdToUtcDate(ymd2).getTime();
  return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
}

function normalizeToday(today?: Date | string): string {
  if (!today) {
    return formatYMD(new Date());
  }
  if (typeof today === "string") {
    // If it's already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(today.trim())) {
      return today.trim();
    }
    const parsed = new Date(today);
    return formatYMD(parsed);
  }
  return formatYMD(today);
}

/**
 * Computes the next run of a festival per theme-api.md § 4.2 countdown rule:
 * - Kind "collection" or comingSoon = true -> no countdown (returns null).
 * - Next run is the first occurrence whose last day (start + duration - 1) is on or after today.
 * - When occurrences run out, fallbackDate is used, but never in a year the list already covered.
 * - A dated festival needs at least one of occurrences and fallbackDate.
 */
export function getNextFestivalRun(
  festival: NextFestivalRunOptions,
  todayInput?: Date | string
): NextFestivalRun | null {
  if (festival.comingSoon || festival.kind === "collection") {
    return null;
  }

  const today = normalizeToday(todayInput);
  const duration = Math.max(1, festival.durationDays ?? 1);
  const unit: "day" | "night" = festival.unit === "night" ? "night" : "day";

  const occurrences = festival.occurrences ?? [];
  const coveredYears = new Set<number>();
  for (const occ of occurrences) {
    if (occ.length >= 4) {
      const yr = parseInt(occ.slice(0, 4), 10);
      if (!isNaN(yr)) {
        coveredYears.add(yr);
      }
    }
  }

  // 1. Check occurrences
  for (const occ of occurrences) {
    const startDate = occ.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) continue;
    const endDate = addDays(startDate, duration - 1);

    // "The next run is the first occurrence whose last day is on or after today."
    if (endDate >= today) {
      return buildNextRunResult({
        startDate,
        endDate,
        duration,
        unit,
        today,
        isFallback: false,
      });
    }
  }

  // 2. When list runs out, fallbackDate is used, but never in a year the list already covered
  if (!festival.fallbackDate) {
    return null;
  }

  const { month, day } = festival.fallbackDate;
  if (!month || !day || (month === 2 && day === 29)) {
    return null;
  }

  const todayYear = parseInt(today.slice(0, 4), 10);
  const maxSearchYear = todayYear + 20;

  for (let year = todayYear; year <= maxSearchYear; year++) {
    // Never in a year the list already covered
    if (coveredYears.has(year)) {
      continue;
    }

    const startDate = `${year}-${pad2(month)}-${pad2(day)}`;
    const endDate = addDays(startDate, duration - 1);

    if (endDate >= today) {
      return buildNextRunResult({
        startDate,
        endDate,
        duration,
        unit,
        today,
        isFallback: true,
      });
    }
  }

  return null;
}

function buildNextRunResult({
  startDate,
  endDate,
  duration,
  unit,
  today,
  isFallback,
}: {
  startDate: string;
  endDate: string;
  duration: number;
  unit: "day" | "night";
  today: string;
  isFallback: boolean;
}): NextFestivalRun {
  const isHappening = today >= startDate && today <= endDate;
  const currentDay = isHappening ? daysBetween(startDate, today) + 1 : undefined;
  const daysUntil = isHappening ? 0 : Math.max(0, daysBetween(today, startDate));

  let label: string;
  if (isHappening) {
    if (duration > 1) {
      label = `Day ${currentDay} of ${duration}`;
    } else {
      label = unit === "night" ? "Tonight" : "Today";
    }
  } else if (daysUntil === 1) {
    label = unit === "night" ? "in 1 night" : "in 1 day";
  } else if (daysUntil === 0) {
    label = unit === "night" ? "Tonight" : "Today";
  } else {
    label = unit === "night" ? `in ${daysUntil} nights` : `in ${daysUntil} days`;
  }

  return {
    startDate,
    endDate,
    durationDays: duration,
    unit,
    daysUntil,
    isHappening,
    currentDay,
    isFallback,
    label,
  };
}
