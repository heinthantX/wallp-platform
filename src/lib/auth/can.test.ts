import { describe, it, expect } from "vitest";
import { can, type Permission } from "./can";
import type { Role } from "@/lib/api/types";

describe("can() role matrix", () => {
  const createUser = (role: Role) => ({
    id: "u-1",
    email: `${role}@example.com`,
    name: `${role} user`,
    role,
    disabled: false,
    totpEnabled: false,
    createdAt: new Date().toISOString(),
  });

  const admin = createUser("admin");
  const designer = createUser("designer");
  const reviewer = createUser("reviewer");
  const viewer = createUser("viewer");

  it("admin can do everything", () => {
    const permissions: Permission[] = [
      "users:manage",
      "audit:read",
      "drafts:edit",
      "themes:edit",
      "themes:create",
      "themes:review",
      "publish:schedule",
      "publish:approve",
      "publish:manage",
      "releases:rollback",
      "statistics:read",
      "read",
    ];

    for (const p of permissions) {
      expect(can(admin, p)).toBe(true);
    }
  });

  it("designer permissions", () => {
    expect(can(designer, "drafts:edit")).toBe(true);
    expect(can(designer, "themes:edit")).toBe(true);
    expect(can(designer, "themes:create")).toBe(true);
    expect(can(designer, "read")).toBe(true);

    // Designer cannot manage users, audit, or approve/publish
    expect(can(designer, "users:manage")).toBe(false);
    expect(can(designer, "audit:read")).toBe(false);
    expect(can(designer, "themes:review")).toBe(false);
    expect(can(designer, "publish:schedule")).toBe(false);
    expect(can(designer, "publish:approve")).toBe(false);
    expect(can(designer, "publish:manage")).toBe(false);
    expect(can(designer, "releases:rollback")).toBe(false);
  });

  it("reviewer permissions", () => {
    expect(can(reviewer, "audit:read")).toBe(true);
    expect(can(reviewer, "themes:review")).toBe(true);
    expect(can(reviewer, "publish:schedule")).toBe(true);
    expect(can(reviewer, "publish:approve")).toBe(true);
    expect(can(reviewer, "read")).toBe(true);

    // Reviewer cannot edit drafts, manage users, or full publish/rollback
    expect(can(reviewer, "users:manage")).toBe(false);
    expect(can(reviewer, "drafts:edit")).toBe(false);
    expect(can(reviewer, "themes:edit")).toBe(false);
    expect(can(reviewer, "publish:manage")).toBe(false);
    expect(can(reviewer, "releases:rollback")).toBe(false);
  });

  it("viewer permissions", () => {
    expect(can(viewer, "read")).toBe(true);
    expect(can(viewer, "statistics:read")).toBe(true);

    // Viewer cannot do anything modifying
    expect(can(viewer, "users:manage")).toBe(false);
    expect(can(viewer, "audit:read")).toBe(false);
    expect(can(viewer, "drafts:edit")).toBe(false);
    expect(can(viewer, "themes:edit")).toBe(false);
    expect(can(viewer, "themes:review")).toBe(false);
    expect(can(viewer, "publish:schedule")).toBe(false);
    expect(can(viewer, "publish:manage")).toBe(false);
  });

  it("handles null and undefined gracefully", () => {
    expect(can(null, "read")).toBe(false);
    expect(can(undefined, "users:manage")).toBe(false);
    expect(can({ role: undefined as unknown as Role }, "read")).toBe(false);
  });
});
