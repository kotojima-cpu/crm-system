// Session
export { getSessionUser, requireSessionUser } from "./session";

// Access control
export { requireTenantAccess, requireTenantAdmin } from "./tenant-access";
export { requirePlatformAccess } from "./platform-access";

// Permissions
export { Permission, hasPermission, hasAllPermissions } from "./permissions";

// Guards (API route entry points)
export {
  requireTenantPermission,
  requireTenantAdminPermission,
  requirePlatformPermission,
} from "./guards";
export type { TenantGuardOptions } from "./guards";

// Types
export type { UserRole } from "./types";
export { isTenantRole, isPlatformRole } from "./types";
