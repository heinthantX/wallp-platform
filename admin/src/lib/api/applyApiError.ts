import { toast } from "sonner";
import type { FieldValues, UseFormReturn, Path } from "react-hook-form";
import { ApiError } from "./error";

export function applyApiError<TFieldValues extends FieldValues>(
  form: UseFormReturn<TFieldValues>,
  err: unknown,
  fallbackMessage = "An unexpected error occurred"
): void {
  if (err instanceof ApiError) {
    let matchedField = false;

    if (err.field) {
      const formValues = form.getValues();
      const hasKey = Object.prototype.hasOwnProperty.call(formValues, err.field);
      let fieldExists = hasKey;

      if (!fieldExists) {
        try {
          const state = form.getFieldState(err.field as Path<TFieldValues>);
          if (state) fieldExists = true;
        } catch {
          fieldExists = false;
        }
      }

      if (fieldExists) {
        form.setError(err.field as Path<TFieldValues>, {
          type: "server",
          message: err.message,
        });
        matchedField = true;
      }
    }

    if (err.details && Array.isArray(err.details)) {
      for (const detail of err.details) {
        if (detail.field && detail.message) {
          const formValues = form.getValues();
          const hasKey = Object.prototype.hasOwnProperty.call(formValues, detail.field);
          let fieldExists = hasKey;

          if (!fieldExists) {
            try {
              const state = form.getFieldState(detail.field as Path<TFieldValues>);
              if (state) fieldExists = true;
            } catch {
              fieldExists = false;
            }
          }

          if (fieldExists) {
            form.setError(detail.field as Path<TFieldValues>, {
              type: "server",
              message: detail.message,
            });
            matchedField = true;
          }
        }
      }
    }

    if (!matchedField) {
      toast.error(err.message || fallbackMessage);
    }
    return;
  }

  if (err instanceof Error) {
    toast.error(err.message || fallbackMessage);
    return;
  }

  toast.error(fallbackMessage);
}
