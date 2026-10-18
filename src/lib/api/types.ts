import type { components, paths } from "./schema";

export type { paths, components };

export type AdminUserView = components["schemas"]["AdminUserView"];
export type AdminSession = components["schemas"]["AdminSession"];
export type SessionView = components["schemas"]["SessionView"];
export type SessionsOutputBody = components["schemas"]["SessionsOutputBody"];
export type AuditView = components["schemas"]["AuditView"];
export type PageAdminUserView = components["schemas"]["PageAdminUserView"];
export type PageAuditView = components["schemas"]["PageAuditView"];
export type Role = components["schemas"]["AdminUserView"]["role"];
export type SetupStatusBody = components["schemas"]["SetupStatusBody"];
export type TOTPSetupOutputBody = components["schemas"]["TOTPSetupOutputBody"];
export type CreateUserInputBody = components["schemas"]["CreateUserInputBody"];
export type UpdateUserInputBody = components["schemas"]["UpdateUserInputBody"];
export type UpdateMeInputBody = components["schemas"]["UpdateMeInputBody"];
export type LoginInputBody = components["schemas"]["LoginInputBody"];
export type LoginOutputBody = components["schemas"]["LoginOutputBody"];
export type MFAInputBody = components["schemas"]["MFAInputBody"];
export type SetupInputBody = components["schemas"]["SetupInputBody"];
export type CodeInputBody = components["schemas"]["CodeInputBody"];
export type PasswordInputBody = components["schemas"]["PasswordInputBody"];
export type RefreshInputBody = components["schemas"]["RefreshInputBody"];
export type ApiErrorResponse = components["schemas"]["Error"];
export type ApiErrorBody = components["schemas"]["ErrorBody"];
export type ApiErrorDetail = components["schemas"]["Detail"];
export type HealthOutputBody = components["schemas"]["HealthOutputBody"];
