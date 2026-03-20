// Types
export type {
  AuditAction,
  AuditResourceType,
  AuditResult,
  WriteAuditLogInput,
  ResolvedAuditLogInput,
} from "./types";

// Writer
export { writeAuditLog, buildAuditLogInput } from "./writer";

// Helpers
export {
  resolveEffectiveTenantId,
  resolveTargetTenantId,
  sanitizeAuditMetadata,
  safeJsonStringify,
} from "./helpers";

// Action constants
export {
  AUDIT_CUSTOMER_CREATED,
  AUDIT_CUSTOMER_UPDATED,
  AUDIT_CUSTOMER_DELETED,
  AUDIT_CONTRACT_CREATED,
  AUDIT_CONTRACT_UPDATED,
  AUDIT_CONTRACT_DELETED,
  AUDIT_INVOICE_CREATED,
  AUDIT_INVOICE_CONFIRMED,
  AUDIT_INVOICE_CANCELLED,
  AUDIT_USER_CREATED,
  AUDIT_USER_UPDATED,
  AUDIT_USER_INVITED,
  AUDIT_TENANT_CREATED,
  AUDIT_TENANT_SUSPENDED,
  AUDIT_TENANT_RESUMED,
  AUDIT_AUTH_LOGIN,
  AUDIT_AUTH_LOGOUT,
} from "./actions";
export type { AuditEventDef } from "./actions";
