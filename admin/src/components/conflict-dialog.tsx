"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw, Save } from "lucide-react";

export interface ConflictDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReload: () => void;
  onOverwrite: () => void;
}

export function ConflictDialog({
  open,
  onOpenChange,
  onReload,
  onOverwrite,
}: ConflictDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <AlertDialogTitle>Someone else changed this</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-sm text-muted-foreground pt-1">
            This item was updated on the server while you were editing it.
            You can reload the latest server version (losing unsaved local changes)
            or overwrite the server version with your current edits.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onReload}
            className="w-full sm:w-auto"
          >
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Reload server version
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onOverwrite}
            className="w-full sm:w-auto"
          >
            <Save className="h-4 w-4 mr-1.5" />
            Overwrite server version
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
