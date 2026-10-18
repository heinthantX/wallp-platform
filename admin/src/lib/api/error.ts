import type { ApiErrorDetail } from "./types";

export class ApiError extends Error {
  status: number;
  code: string;
  field?: string;
  details?: ApiErrorDetail[] | null;

  constructor(
    status: number,
    code: string,
    message: string,
    field?: string,
    details?: ApiErrorDetail[] | null
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.field = field;
    this.details = details;
  }
}
