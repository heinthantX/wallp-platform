"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WizardStep {
  id: number;
  title: string;
  description?: string;
}

export interface StepperProps {
  currentStep: number;
  steps?: WizardStep[];
  onStepClick?: (step: number) => void;
  className?: string;
}

const DEFAULT_STEPS: WizardStep[] = [
  {
    id: 1,
    title: "Configure Inputs",
    description: "Festival, mood, colors & engine",
  },
  {
    id: 2,
    title: "Pick & Refine",
    description: "6 option cards, locks, checks",
  },
  {
    id: 3,
    title: "Review & Save",
    description: "Save generated theme to catalog",
  },
];

export function Stepper({
  currentStep,
  steps = DEFAULT_STEPS,
  onStepClick,
  className,
}: StepperProps) {
  const shouldReduceMotion = useReducedMotion();

  // Progress percentage (0% to 100%)
  const progress =
    steps.length > 1
      ? Math.max(
          0,
          Math.min(100, ((currentStep - 1) / (steps.length - 1)) * 100)
        )
      : 100;

  const transitionConfig = shouldReduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 300, damping: 28 };

  return (
    <div className={cn("w-full py-4 select-none", className)}>
      <div className="relative">
        {/* Background Connecting Bar */}
        <div
          className="absolute top-5 left-6 right-6 h-0.5 bg-border -translate-y-1/2 z-0"
          aria-hidden="true"
        />

        {/* Animated Active Progress Fill Bar */}
        <motion.div
          className="absolute top-5 left-6 h-0.5 bg-primary -translate-y-1/2 z-0 origin-left"
          initial={false}
          animate={{
            width: `calc(${progress}% - 3rem)`,
          }}
          transition={transitionConfig}
          aria-hidden="true"
        />

        {/* Steps List */}
        <ol className="relative z-10 flex justify-between items-start" role="list">
          {steps.map((step) => {
            const isCompleted = step.id < currentStep;
            const isActive = step.id === currentStep;
            const isUpcoming = step.id > currentStep;
            const isClickable = Boolean(onStepClick && step.id <= currentStep + 1);

            return (
              <li
                key={step.id}
                role="listitem"
                className="flex flex-col items-center text-center flex-1"
                aria-current={isActive ? "step" : undefined}
              >
                <button
                  type="button"
                  disabled={!isClickable}
                  onClick={() => onStepClick?.(step.id)}
                  className={cn(
                    "group flex flex-col items-center focus:outline-hidden",
                    isClickable ? "cursor-pointer" : "cursor-default"
                  )}
                >
                  {/* Step Indicator Circle */}
                  <div className="relative flex items-center justify-center">
                    {/* Active highlight glow/ring */}
                    {isActive && (
                      <motion.div
                        layoutId="stepper-active-glow"
                        className="absolute -inset-1.5 rounded-full bg-primary/20"
                        transition={transitionConfig}
                        aria-hidden="true"
                      />
                    )}

                    <motion.div
                      initial={false}
                      animate={{
                        scale: isActive ? 1.05 : 1,
                      }}
                      transition={transitionConfig}
                      className={cn(
                        "relative flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold transition-colors shadow-xs border-2",
                        isCompleted &&
                          "border-primary bg-primary text-primary-foreground",
                        isActive &&
                          "border-primary bg-background text-primary ring-2 ring-primary/30",
                        isUpcoming &&
                          "border-muted-foreground/30 bg-muted/60 text-muted-foreground"
                      )}
                    >
                      {isCompleted ? (
                        <Check className="h-4 w-4 stroke-[3]" />
                      ) : (
                        <span>{step.id}</span>
                      )}
                    </motion.div>
                  </div>

                  {/* Step Title & Description */}
                  <div className="mt-2.5 max-w-[150px] space-y-0.5">
                    <p
                      className={cn(
                        "text-xs font-semibold tracking-tight transition-colors",
                        isActive && "text-primary",
                        isCompleted && "text-foreground",
                        isUpcoming && "text-muted-foreground"
                      )}
                    >
                      {step.title}
                    </p>
                    {step.description && (
                      <p className="text-[10px] text-muted-foreground/80 hidden sm:block leading-tight">
                        {step.description}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
