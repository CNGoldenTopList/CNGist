export type AccountRole = "player" | "admin" | "super_admin";

export function isAdminRole(role: unknown): role is "admin" | "super_admin" {
  return role === "admin" || role === "super_admin";
}

export function isSuperAdminRole(role: unknown): role is "super_admin" {
  return role === "super_admin";
}
