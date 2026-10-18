"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const STEPS = ["Checks", "Theme files", "Catalog", "Manifest"];

/** `active` is the index being worked on; STEPS.length means all done. */
export function PublishProgress({ active }: { active: number }) {
  const reduce = useReducedMotion();
  return (
    <ol className="flex flex-wrap items-center gap-3" aria-label="Publish progress">
      {STEPS.map((s, i) => {
        const done = i < active;
        const current = i === active;
        return (
          <motion.li
            key={s}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: done || current ? 1 : 0.45, y: 0 }}
            transition={reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 300, damping: 24, delay: i * 0.05 }}
            className={cn("flex items-center gap-1.5 text-sm", done && "text-emerald-600 dark:text-emerald-400")}
          >
            {done ? <Check className="h-4 w-4" /> : current ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="h-4 w-4 rounded-full border" />}
            {s}
          </motion.li>
        );
      })}
    </ol>
  );
}
