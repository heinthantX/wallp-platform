import { describe, it, expect } from "vitest";
import { getNextFestivalRun } from "./countdown";

describe("festival countdown - getNextFestivalRun", () => {
  describe("Thingyan 4-day duration", () => {
    const thingyan = {
      id: "thingyan",
      kind: "festival",
      durationDays: 4,
      unit: "day" as const,
      occurrences: ["2027-04-13", "2028-04-13", "2029-04-13"],
      fallbackDate: { month: 4, day: 13 },
    };

    it("returns daysUntil before the festival starts", () => {
      const nextRun = getNextFestivalRun(thingyan, "2027-04-10");
      expect(nextRun).not.toBeNull();
      expect(nextRun?.startDate).toBe("2027-04-13");
      expect(nextRun?.endDate).toBe("2027-04-16");
      expect(nextRun?.durationDays).toBe(4);
      expect(nextRun?.daysUntil).toBe(3);
      expect(nextRun?.isHappening).toBe(false);
      expect(nextRun?.label).toBe("in 3 days");
      expect(nextRun?.isFallback).toBe(false);
    });

    it("evaluates Day 1 of 4 when today is start date", () => {
      const nextRun = getNextFestivalRun(thingyan, "2027-04-13");
      expect(nextRun).not.toBeNull();
      expect(nextRun?.startDate).toBe("2027-04-13");
      expect(nextRun?.endDate).toBe("2027-04-16");
      expect(nextRun?.daysUntil).toBe(0);
      expect(nextRun?.isHappening).toBe(true);
      expect(nextRun?.currentDay).toBe(1);
      expect(nextRun?.label).toBe("Day 1 of 4");
    });

    it("evaluates Day 2 of 4 while festival is running", () => {
      const nextRun = getNextFestivalRun(thingyan, "2027-04-14");
      expect(nextRun).not.toBeNull();
      expect(nextRun?.startDate).toBe("2027-04-13");
      expect(nextRun?.isHappening).toBe(true);
      expect(nextRun?.currentDay).toBe(2);
      expect(nextRun?.label).toBe("Day 2 of 4");
    });

    it("evaluates Day 4 of 4 on the very last day of occurrence", () => {
      // Last day is on or after today (2027-04-16 >= 2027-04-16) -> still this occurrence!
      const nextRun = getNextFestivalRun(thingyan, "2027-04-16");
      expect(nextRun).not.toBeNull();
      expect(nextRun?.startDate).toBe("2027-04-13");
      expect(nextRun?.endDate).toBe("2027-04-16");
      expect(nextRun?.isHappening).toBe(true);
      expect(nextRun?.currentDay).toBe(4);
      expect(nextRun?.label).toBe("Day 4 of 4");
    });

    it("advances to the next occurrence once the last day has passed", () => {
      // On April 17, 2027-04-16 is strictly in the past, so next run is 2028-04-13
      const nextRun = getNextFestivalRun(thingyan, "2027-04-17");
      expect(nextRun).not.toBeNull();
      expect(nextRun?.startDate).toBe("2028-04-13");
      expect(nextRun?.endDate).toBe("2028-04-16");
      expect(nextRun?.isHappening).toBe(false);
      expect(nextRun?.isFallback).toBe(false);
    });
  });

  describe("list run-out falling back without reusing a covered year", () => {
    it("falls back to next uncovered year when list runs out", () => {
      const halloween = {
        id: "halloween",
        kind: "festival",
        durationDays: 1,
        unit: "night" as const,
        occurrences: ["2025-10-31", "2026-10-31", "2027-10-31"],
        fallbackDate: { month: 10, day: 31 },
      };

      // In late 2027, the occurrences list has run out
      const nextRun = getNextFestivalRun(halloween, "2027-11-01");
      expect(nextRun).not.toBeNull();
      // Covered years: 2025, 2026, 2027. Fallback must use 2028!
      expect(nextRun?.startDate).toBe("2028-10-31");
      expect(nextRun?.isFallback).toBe(true);
      expect(nextRun?.unit).toBe("night");
      expect(nextRun?.label).toMatch(/in \d+ nights/);
    });

    it("never reuses a year already covered in occurrences even if later in the year", () => {
      // Occurrences only covered 2026 and 2028 (e.g. 2027 was omitted or moved)
      const festival = {
        id: "custom",
        kind: "festival",
        durationDays: 1,
        occurrences: ["2026-05-01", "2028-05-01"],
        fallbackDate: { month: 5, day: 1 },
      };

      // Today is after 2028 run: 2028-06-01. List runs out.
      // 2028 is covered. Next candidate is 2029-05-01.
      const nextRun = getNextFestivalRun(festival, "2028-06-01");
      expect(nextRun?.startDate).toBe("2029-05-01");
      expect(nextRun?.isFallback).toBe(true);
    });

    it("uses future occurrence when one exists rather than fallback", () => {
      const festival = {
        id: "custom",
        kind: "festival",
        durationDays: 2,
        occurrences: ["2026-04-10", "2028-04-10"],
        fallbackDate: { month: 4, day: 10 },
      };

      // Today is 2026-05-01. 2026-04-10 has passed, but 2028-04-10 is in the list!
      const nextRun = getNextFestivalRun(festival, "2026-05-01");
      expect(nextRun?.startDate).toBe("2028-04-10");
      expect(nextRun?.isFallback).toBe(false);
    });
  });

  describe("collections and coming soon", () => {
    it("returns null for collection kind", () => {
      const collection = {
        id: "heroes",
        kind: "collection",
        fallbackDate: { month: 1, day: 1 },
      };
      expect(getNextFestivalRun(collection, "2026-10-18")).toBeNull();
    });

    it("returns null for comingSoon festival", () => {
      const comingSoon = {
        id: "future-fest",
        kind: "festival",
        comingSoon: true,
        fallbackDate: { month: 12, day: 25 },
      };
      expect(getNextFestivalRun(comingSoon, "2026-10-18")).toBeNull();
    });
  });

  describe("night countdown formatting", () => {
    it("formats 1 night countdown properly", () => {
      const halloween = {
        id: "halloween",
        kind: "festival",
        durationDays: 1,
        unit: "night" as const,
        occurrences: ["2026-10-31"],
      };

      const runTomorrow = getNextFestivalRun(halloween, "2026-10-30");
      expect(runTomorrow?.daysUntil).toBe(1);
      expect(runTomorrow?.label).toBe("in 1 night");

      const runTonight = getNextFestivalRun(halloween, "2026-10-31");
      expect(runTonight?.daysUntil).toBe(0);
      expect(runTonight?.label).toBe("Tonight");
    });
  });
});
