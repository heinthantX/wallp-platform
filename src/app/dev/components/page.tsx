"use client";

import * as React from "react";
import neonNightJson from "@/fixtures/neon-night.1.json";
import halloweenNightJson from "@/fixtures/halloween-night.3.json";
import type { ThemeDetail, Localized } from "@/lib/catalog/types";
import { PhonePreview } from "@/components/preview/PhonePreview";
import { LayersCanvas } from "@/components/preview/LayersCanvas";
import {
  ColorField,
  LocalizedField,
  TagsField,
  DatesTableField,
  IdField,
  FontSelect,
  EngineSelect,
  EventIconSelect,
  JsonEditor,
} from "@/components/fields";
import { StatusBadge, ReviewBar, AuditTimeline } from "@/components/items";
import { getNextFestivalRun } from "@/lib/festival/countdown";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const neonTheme = neonNightJson as unknown as ThemeDetail;
const halloweenTheme = halloweenNightJson as unknown as ThemeDetail;

export default function DevComponentsPage() {
  const [selectedThemeId, setSelectedThemeId] = React.useState<"neon" | "halloween">("neon");
  const activeTheme = selectedThemeId === "neon" ? neonTheme : halloweenTheme;

  // Field test states
  const [colorVal, setColorVal] = React.useState("#FF3EA5");
  const [localizedVal, setLocalizedVal] = React.useState<Localized>({
    en: "Neon Night",
    my: "နီယွန် ည",
  });
  const [tagsVal, setTagsVal] = React.useState<string[]>([
    "neon",
    "synthwave",
    "retro",
    "grid",
  ]);
  const [datesVal, setDatesVal] = React.useState<string[]>([
    "2027-04-13",
    "2028-04-13",
    "2029-04-13",
  ]);
  const [nameForSlug, setNameForSlug] = React.useState("Water Splash Festival");
  const [slugVal, setSlugVal] = React.useState("water-splash-festival");
  const [fontVal, setFontVal] = React.useState("orbitron");
  const [engineVal, setEngineVal] = React.useState("layers");
  const [iconVal, setIconVal] = React.useState("music_note_rounded");
  const [jsonVal, setJsonVal] = React.useState(
    JSON.stringify(
      {
        engine: "layers",
        sampleParam: "test-value",
        active: true,
      },
      null,
      2
    )
  );

  // Review bar mock state
  const [itemStatus, setItemStatus] = React.useState<string>("draft");
  const [mockRole, setMockRole] = React.useState<"admin" | "designer" | "reviewer" | "viewer">("admin");

  // Countdown calculations
  const thingyanRun = React.useMemo(() => {
    return getNextFestivalRun(
      {
        id: "thingyan",
        kind: "festival",
        durationDays: 4,
        unit: "day",
        occurrences: datesVal,
        fallbackDate: { month: 4, day: 13 },
      },
      new Date()
    );
  }, [datesVal]);

  const halloweenRun = React.useMemo(() => {
    return getNextFestivalRun(
      {
        id: "halloween",
        kind: "festival",
        durationDays: 1,
        unit: "night",
        occurrences: ["2026-10-31"],
        fallbackDate: { month: 10, day: 31 },
      },
      new Date()
    );
  }, []);

  return (
    <div className="container mx-auto py-10 px-4 max-w-7xl space-y-12 pb-24">
      {/* Header */}
      <div className="border-b pb-6">
        <div className="inline-block rounded-md bg-primary/10 text-primary px-2.5 py-1 text-xs font-mono font-semibold uppercase mb-2">
          Development Showcase
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Phase 2 Catalog & Preview Components</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Interactive showcase of all standalone field editors, live phone preview, layers canvas, and status workflow components.
        </p>
      </div>

      {/* Section 1: Phone Preview & Layers Canvas */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight">1. Phone Preview & Layers Renderer</h2>
            <p className="text-xs text-muted-foreground">
              390×844 scaled viewport with Lock, Home and Card tabs, token resolution and canvas particle rendering.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Select Mock Theme:</span>
            <Button
              type="button"
              size="sm"
              variant={selectedThemeId === "neon" ? "default" : "outline"}
              onClick={() => setSelectedThemeId("neon")}
              className="text-xs h-8"
            >
              Neon Night (Layers)
            </Button>
            <Button
              type="button"
              size="sm"
              variant={selectedThemeId === "halloween" ? "default" : "outline"}
              onClick={() => setSelectedThemeId("halloween")}
              className="text-xs h-8"
            >
              Haunted Moon (Halloween)
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <PhonePreview theme={activeTheme} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Standalone LayersCanvas (Static)</CardTitle>
              <CardDescription className="text-xs">
                Renders scene layers from palette tokens without animation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="w-full max-w-[280px] mx-auto rounded-2xl overflow-hidden border shadow-md">
                <LayersCanvas
                  scene={activeTheme.scene}
                  palette={activeTheme.palette}
                  accent={activeTheme.accents[0]}
                  animate={false}
                  width={280}
                  height={420}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Standalone LayersCanvas (Animated)</CardTitle>
              <CardDescription className="text-xs">
                requestAnimationFrame loop with seeded particles &amp; motion pulses
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="w-full max-w-[280px] mx-auto rounded-2xl overflow-hidden border shadow-md">
                <LayersCanvas
                  scene={activeTheme.scene}
                  palette={activeTheme.palette}
                  accent={activeTheme.accents[0]}
                  animate={true}
                  width={280}
                  height={420}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Section 2: Form Field Components */}
      <section className="space-y-6 border-t pt-8">
        <div>
          <h2 className="text-xl font-bold tracking-tight">2. Accessible Form Fields</h2>
          <p className="text-xs text-muted-foreground">
            Controlled form components with accessible labels, live validation, and contrast calculation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* ColorField against Dark */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">ColorField (vs Dark Background)</CardTitle>
              <CardDescription className="text-xs">
                react-colorful popover + hex input + live WCAG contrast badge vs #120326
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ColorField
                label="Accent Color"
                value={colorVal}
                onChange={setColorVal}
                contrastVs="#120326"
                contrastMin={3.0}
                helperText="Minimum 3.0:1 required for accent icons"
              />
            </CardContent>
          </Card>

          {/* ColorField against Light */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">ColorField (vs White Background)</CardTitle>
              <CardDescription className="text-xs">
                Live WCAG contrast calculation against #FFFFFF
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ColorField
                label="Text Color"
                value={colorVal}
                onChange={setColorVal}
                contrastVs="#FFFFFF"
                contrastMin={4.5}
                helperText="Minimum 4.5:1 required for normal text"
              />
            </CardContent>
          </Card>

          {/* LocalizedField */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">LocalizedField</CardTitle>
              <CardDescription className="text-xs">
                English required + dynamic &quot;Add language&quot; for Myanmar (my), etc.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LocalizedField
                label="Theme Name"
                value={localizedVal}
                onChange={setLocalizedVal}
                helperText="Type in English and add localized translations"
              />
            </CardContent>
          </Card>

          {/* TagsField */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">TagsField</CardTitle>
              <CardDescription className="text-xs">
                Interactive tags with backspace removal and auto-sanitization
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TagsField
                label="Catalog Tags"
                value={tagsVal}
                onChange={setTagsVal}
                placeholder="Type and press Enter..."
              />
            </CardContent>
          </Card>

          {/* IdField */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">IdField (Auto-slug + Manual override)</CardTitle>
              <CardDescription className="text-xs">
                Auto-derives kebab-case slug until manually edited
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Change English Name to test auto-slug:
                </label>
                <input
                  type="text"
                  value={nameForSlug}
                  onChange={(e) => setNameForSlug(e.target.value)}
                  className="h-8 w-full rounded border px-2 text-xs"
                />
              </div>

              <IdField
                label="Generated Slug"
                nameValue={nameForSlug}
                value={slugVal}
                onChange={setSlugVal}
                helperText="Valid kebab-case ID"
              />

              <IdField
                label="Locked ID (Post-publish)"
                value="thingyan-water"
                locked={true}
              />
            </CardContent>
          </Card>

          {/* Font & Engine Select */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Select Fields</CardTitle>
              <CardDescription className="text-xs">
                FontSelect, EngineSelect, and EventIconSelect
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FontSelect
                label="Display Font"
                value={fontVal}
                onChange={setFontVal}
              />
              <EngineSelect
                label="Scene Engine"
                value={engineVal}
                onChange={setEngineVal}
              />
              <EventIconSelect
                label="Event Icon (Allowlist)"
                value={iconVal}
                onChange={setIconVal}
              />
            </CardContent>
          </Card>
        </div>

        {/* DatesTableField and JsonEditor */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">DatesTableField</CardTitle>
              <CardDescription className="text-xs">
                Yearly occurrences with &quot;Fill next 5 years&quot; button and countdown status
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <DatesTableField
                label="Thingyan Occurrences"
                value={datesVal}
                onChange={setDatesVal}
                fallbackDate={{ month: 4, day: 13 }}
              />

              {thingyanRun && (
                <div className="rounded-md border bg-muted/30 p-2.5 text-xs space-y-1 font-mono">
                  <div className="font-semibold text-foreground">Thingyan (4-day) Countdown:</div>
                  <div>Next Run: {thingyanRun.startDate} to {thingyanRun.endDate}</div>
                  <div>Status: {thingyanRun.label} ({thingyanRun.daysUntil} days away)</div>
                  <div>Fallback Used: {String(thingyanRun.isFallback)}</div>
                </div>
              )}

              {halloweenRun && (
                <div className="rounded-md border bg-muted/30 p-2.5 text-xs space-y-1 font-mono">
                  <div className="font-semibold text-foreground">Halloween (1-night) Countdown:</div>
                  <div>Next Run: {halloweenRun.startDate}</div>
                  <div>Status: {halloweenRun.label} ({halloweenRun.daysUntil} nights away)</div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">JsonEditor</CardTitle>
              <CardDescription className="text-xs">
                CodeMirror 6 JSON editor with live syntax checking and format button
              </CardDescription>
            </CardHeader>
            <CardContent>
              <JsonEditor
                label="Scene Parameters"
                value={jsonVal}
                onChange={setJsonVal}
                height="220px"
              />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Section 3: Status & Review Workflow */}
      <section className="space-y-6 border-t pt-8">
        <div>
          <h2 className="text-xl font-bold tracking-tight">3. Item Workflow & Review Components</h2>
          <p className="text-xs text-muted-foreground">
            Status badges, role-aware review action bar, and audit log history timeline.
          </p>
        </div>

        {/* StatusBadges */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">StatusBadges</CardTitle>
            <CardDescription className="text-xs">
              Visual badges for all 6 catalog lifecycle states
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <StatusBadge status="draft" />
            <StatusBadge status="in_review" />
            <StatusBadge status="approved" />
            <StatusBadge status="scheduled" />
            <StatusBadge status="published" />
            <StatusBadge status="archived" />
          </CardContent>
        </Card>

        {/* ReviewBar Simulator */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ReviewBar Role &amp; Status Simulator</CardTitle>
            <CardDescription className="text-xs">
              Toggle role and item status to test role-aware button visibility
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="space-y-1">
                <span className="font-semibold block">Simulate Role:</span>
                <div className="flex gap-1.5">
                  {(["admin", "reviewer", "designer", "viewer"] as const).map((r) => (
                    <Button
                      key={r}
                      type="button"
                      size="sm"
                      variant={mockRole === r ? "default" : "outline"}
                      onClick={() => setMockRole(r)}
                      className="text-xs h-7 capitalize"
                    >
                      {r}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <span className="font-semibold block">Simulate Status:</span>
                <div className="flex gap-1.5">
                  {(["draft", "in_review", "approved", "scheduled", "published", "archived"] as const).map((s) => (
                    <Button
                      key={s}
                      type="button"
                      size="sm"
                      variant={itemStatus === s ? "secondary" : "outline"}
                      onClick={() => setItemStatus(s)}
                      className="text-xs h-7 capitalize"
                    >
                      {s.replace("_", " ")}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden mt-4">
              <ReviewBar
                status={itemStatus}
                user={{ role: mockRole, email: `${mockRole}@wallp.internal`, id: "u-dev", name: `${mockRole} User` }}
                onSaveDraft={() => toast.success("Draft saved")}
                onRequestReview={() => {
                  setItemStatus("in_review");
                  toast.success("Review requested!");
                }}
                onApprove={() => {
                  setItemStatus("approved");
                  toast.success("Item approved!");
                }}
                onReject={(note) => {
                  setItemStatus("draft");
                  toast.error(`Draft rejected with note: "${note || "No note"}"`);
                }}
                onSchedule={(at) => {
                  setItemStatus("scheduled");
                  toast.success(`Scheduled for: ${at}`);
                }}
                onDuplicate={() => toast.info("Item duplicated")}
                onExportJson={() => toast.info("Exporting JSON")}
                onArchive={() => {
                  setItemStatus("archived");
                  toast.warning("Item archived");
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* AuditTimeline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AuditTimeline Panel</CardTitle>
            <CardDescription className="text-xs">
              Fetches and displays audit log with before/after diff viewer
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AuditTimeline itemType="theme" itemId="neon-night" />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
