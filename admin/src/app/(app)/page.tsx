"use client";

import { OverviewCards } from "./_overview/OverviewCards";

export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
      <OverviewCards />
    </div>
  );
}
