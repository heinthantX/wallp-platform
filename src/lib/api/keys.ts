export const queryKeys = {
  me: ["auth", "me"] as const,
  setupStatus: ["auth", "setup-status"] as const,
  sessions: ["auth", "sessions"] as const,
  users: (params?: Record<string, unknown>) => ["users", params ?? {}] as const,
  allUsers: ["users"] as const,
  audit: (params?: Record<string, unknown>) => ["audit", params ?? {}] as const,
  allAudit: ["audit"] as const,
};
