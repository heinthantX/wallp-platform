import type { AdminUserView, Role } from "@/lib/api/types";

export type Permission =
  | "users:manage"
  | "audit:read"
  | "drafts:edit"
  | "themes:edit"
  | "themes:create"
  | "themes:review"
  | "publish:schedule"
  | "publish:approve"
  | "publish:manage"
  | "releases:rollback"
  | "statistics:read"
  | "read"
  // Item workflow permissions (B3 / dashboard §4.3)
  | "items:save_draft"
  | "items:duplicate"
  | "items:request_review"
  | "items:approve"
  | "items:reject"
  | "items:schedule"
  | "items:archive"
  | "items:restore"
  | "items:export"
  | "catalog:import"
  | "recipes:delete"
  | "recipes:edit";

/**
 * Role-based permission check mapping to dashboard doc §3 and phase02 §B3:
 * - Admin: Everything, including users, publishing, archiving and rollback
 * - Designer+: Create, update, duplicate, request review, read
 * - Reviewer+: Approve, reject, schedule, audit log, read
 * - Viewer: Read only, see statistics, export
 */
export function can(
  user: AdminUserView | { role?: Role } | null | undefined,
  permission: Permission
): boolean {
  if (!user || !user.role) return false;

  const role = user.role;

  // Admin can do everything
  if (role === "admin") return true;

  switch (permission) {
    case "users:manage":
    case "publish:manage":
    case "releases:rollback":
    case "items:archive":
    case "items:restore":
    case "catalog:import":
    case "recipes:delete":
      return false; // Admin only

    case "audit:read":
    case "themes:review":
    case "publish:schedule":
    case "publish:approve":
    case "items:approve":
    case "items:reject":
    case "items:schedule":
      return role === "reviewer";

    case "drafts:edit":
    case "themes:edit":
    case "themes:create":
      return role === "designer";

    case "items:save_draft":
    case "items:duplicate":
    case "items:request_review":
    case "recipes:edit":
      // designer+
      return role === "designer" || role === "reviewer";

    case "read":
    case "statistics:read":
    case "items:export":
      return role === "designer" || role === "reviewer" || role === "viewer";

    default:
      return false;
  }
}
