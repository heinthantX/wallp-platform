import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyApiError } from "./applyApiError";
import { ApiError } from "./error";
import { toast } from "sonner";
import type { UseFormReturn, FieldError } from "react-hook-form";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

interface TestFormValues {
  email: string;
  password: string;
}

describe("applyApiError", () => {
  let mockForm: Partial<UseFormReturn<TestFormValues>>;
  const formValues: TestFormValues = {
    email: "",
    password: "",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockForm = {
      getValues: vi.fn().mockReturnValue(formValues),
      setError: vi.fn(),
      getFieldState: vi.fn().mockImplementation((name: string) => {
        if (name in formValues) {
          return {
            invalid: false,
            isDirty: false,
            isTouched: false,
            isValidating: false,
            error: undefined as FieldError | undefined,
          };
        }
        return undefined;
      }),
    };
  });

  it("sets error on matching form field and does NOT trigger toast", () => {
    const error = new ApiError(400, "invalid_email", "Email is invalid", "email");

    applyApiError(mockForm as UseFormReturn<TestFormValues>, error);

    expect(mockForm.setError).toHaveBeenCalledWith("email", {
      type: "server",
      message: "Email is invalid",
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("falls back to toast when field does not exist in form", () => {
    const error = new ApiError(
      400,
      "invalid_role",
      "Role is not permitted",
      "nonExistentField"
    );

    applyApiError(mockForm as UseFormReturn<TestFormValues>, error);

    expect(mockForm.setError).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Role is not permitted");
  });

  it("falls back to toast when ApiError has no field", () => {
    const error = new ApiError(401, "unauthorized", "Invalid credentials");

    applyApiError(mockForm as UseFormReturn<TestFormValues>, error);

    expect(mockForm.setError).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Invalid credentials");
  });

  it("falls back to toast for standard Error instances", () => {
    const error = new Error("Network connection failed");

    applyApiError(mockForm as UseFormReturn<TestFormValues>, error);

    expect(mockForm.setError).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Network connection failed");
  });

  it("falls back to fallbackMessage for non-error throws", () => {
    applyApiError(mockForm as UseFormReturn<TestFormValues>, "string error", "Custom fallback");

    expect(mockForm.setError).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Custom fallback");
  });
});
