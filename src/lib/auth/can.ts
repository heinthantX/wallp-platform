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
  | "read";

/**
 * Role-based permission check mapping to dashboard doc §3:
 * - Admin: Everything, including users, publishing and rollback
 * - Designer: Create and edit drafts, generate themes, upload files, request review, read
 * - Reviewer: Approve or reject drafts, schedule publishing, audit log, read
 * - Viewer: Read only, see statistics
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
      return false; // Admin only

    case "audit:read":
    case "themes:review":
    case "publish:schedule":
    case "publish:approve":
      return role === "reviewer";

    case "drafts:edit":
    case "themes:edit":
    case "themes:create":
      return role === "designer";

    case "read":
    case "statistics:read":
      return role === "designer" || role === "reviewer" || role === "viewer";

    default:
      return false;
  }
}
