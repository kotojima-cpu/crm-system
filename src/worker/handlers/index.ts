/**
 * Worker Handler 統合登録
 *
 * handler map にすべての handler を登録する。
 */

import { createWorkerHandlerMap, registerWorkerHandler } from "../handlers";
import type { WorkerHandlerMap } from "../types";
import { handleInvoiceCreated } from "./invoice-created";
import { handleInvoiceConfirmed } from "./invoice-confirmed";
import { handleTenantUserInviteRequested } from "./tenant-user-invite-requested";
import { handleTenantSuspended } from "./tenant-suspended";

/**
 * 全ての worker handler を登録した handler map を返す。
 */
export function createRegisteredHandlerMap(): WorkerHandlerMap {
  const map = createWorkerHandlerMap();

  registerWorkerHandler(map, "invoice.created", handleInvoiceCreated);
  registerWorkerHandler(map, "invoice.confirmed", handleInvoiceConfirmed);
  registerWorkerHandler(map, "tenant-user.invite.requested", handleTenantUserInviteRequested);
  registerWorkerHandler(map, "tenant.suspended", handleTenantSuspended);

  return map;
}

export { handleInvoiceCreated } from "./invoice-created";
export { handleInvoiceConfirmed } from "./invoice-confirmed";
export { handleTenantUserInviteRequested } from "./tenant-user-invite-requested";
export { handleTenantSuspended } from "./tenant-suspended";
