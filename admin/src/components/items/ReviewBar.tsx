"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge, type ItemStatus } from "./StatusBadge";
import { can } from "@/lib/auth/can";
import { useAuthStore } from "@/lib/auth/store";
import type { AdminUserView, Role } from "@/lib/api/types";
import {
  Save,
  Send,
  CheckCircle,
  XCircle,
  Calendar,
  Copy,
  Download,
  Archive,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ReviewBarProps {
  status: ItemStatus;
  user?: AdminUserView | { role?: Role } | null;
  onSaveDraft?: () => void;
  onRequestReview?: () => void;
  onApprove?: () => void;
  onReject?: (note?: string) => void;
  onSchedule?: (at: string) => void;
  onDuplicate?: () => void;
  onExportJson?: () => void;
  onArchive?: () => void;
  isSaving?: boolean;
  disabled?: boolean;
  className?: string;
}

export function ReviewBar({
  status = "draft",
  user: userProp,
  onSaveDraft,
  onRequestReview,
  onApprove,
  onReject,
  onSchedule,
  onDuplicate,
  onExportJson,
  onArchive,
  isSaving = false,
  disabled = false,
  className,
}: ReviewBarProps) {
  const storeUser = useAuthStore((state) => state.user);
  const currentUser = userProp !== undefined ? userProp : storeUser;

  // Modals state
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectNote, setRejectNote] = React.useState("");

  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [scheduleTime, setScheduleTime] = React.useState("");

  const normalizedStatus = (status || "draft").toLowerCase();
  const isDraft = normalizedStatus === "draft" || !normalizedStatus;
  // Admins skip the review request: they approve a draft directly (the API allows it).
  const adminApprovesDraft = currentUser?.role === "admin" && isDraft && Boolean(onApprove);

  const handleConfirmReject = () => {
    onReject?.(rejectNote);
    setRejectNote("");
    setRejectOpen(false);
  };

  const handleConfirmSchedule = () => {
    if (!scheduleTime) return;
    onSchedule?.(new Date(scheduleTime).toISOString());
    setScheduleOpen(false);
  };

  return (
    <>
      <div
        className={cn(
          "sticky bottom-0 z-30 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 p-3.5 backdrop-blur-md shadow-lg",
          className
        )}
      >
        {/* Left: Status Badge & Auto-save indicator */}
        <div className="flex items-center gap-3">
          <StatusBadge status={status} />
          {isSaving && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground animate-pulse">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving...
            </span>
          )}
        </div>

        {/* Right: Actions based on role and status */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Save Draft */}
          {onSaveDraft && can(currentUser, "items:save_draft") && normalizedStatus !== "archived" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSaveDraft}
              disabled={disabled || isSaving}
              className="text-xs h-8"
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              Save draft
            </Button>
          )}

          {/* Request Review (draft -> in_review) */}
          {onRequestReview && !adminApprovesDraft && can(currentUser, "items:request_review") && isDraft && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onRequestReview}
                disabled={disabled || isSaving}
                className="text-xs h-8"
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Request review
              </Button>
            )}

          {adminApprovesDraft && (
            <Button
              type="button"
              size="sm"
              onClick={onApprove}
              disabled={disabled || isSaving}
              className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
              Approve
            </Button>
          )}

          {/* Reviewer Actions (in_review -> approve / reject) */}
          {normalizedStatus === "in_review" && (
            <>
              {onReject && can(currentUser, "items:reject") && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRejectOpen(true)}
                  disabled={disabled || isSaving}
                  className="text-xs h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <XCircle className="h-3.5 w-3.5 mr-1.5" />
                  Reject
                </Button>
              )}
              {onApprove && can(currentUser, "items:approve") && (
                <Button
                  type="button"
                  size="sm"
                  onClick={onApprove}
                  disabled={disabled || isSaving}
                  className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                  Approve
                </Button>
              )}
            </>
          )}

          {/* Schedule (approved -> scheduled) */}
          {onSchedule && normalizedStatus === "approved" && can(currentUser, "items:schedule") && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setScheduleOpen(true)}
              disabled={disabled || isSaving}
              className="text-xs h-8"
            >
              <Calendar className="h-3.5 w-3.5 mr-1.5" />
              Schedule release
            </Button>
          )}

          {/* Duplicate */}
          {onDuplicate && can(currentUser, "items:duplicate") && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDuplicate}
              disabled={disabled || isSaving}
              className="text-xs h-8 text-muted-foreground hover:text-foreground"
            >
              <Copy className="h-3.5 w-3.5 mr-1" />
              Duplicate
            </Button>
          )}

          {/* Export JSON */}
          {onExportJson && can(currentUser, "items:export") && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onExportJson}
              disabled={disabled || isSaving}
              className="text-xs h-8 text-muted-foreground hover:text-foreground"
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              Export JSON
            </Button>
          )}

          {/* Archive */}
          {onArchive && can(currentUser, "items:archive") && normalizedStatus !== "archived" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onArchive}
              disabled={disabled || isSaving}
              className="text-xs h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Archive className="h-3.5 w-3.5 mr-1" />
              Archive
            </Button>
          )}
        </div>
      </div>

      {/* Reject Modal */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Draft</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="reject-note">Rejection Note</Label>
            <Input
              id="reject-note"
              placeholder="Explain reasons for rejection..."
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmReject}>
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Modal */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Publication</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="schedule-time">Release Date & Time</Label>
            <Input
              id="schedule-time"
              type="datetime-local"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmSchedule} disabled={!scheduleTime}>
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
