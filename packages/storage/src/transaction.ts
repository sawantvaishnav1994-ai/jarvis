import { AsyncLocalStorage } from "node:async_hooks";
import type pg from "pg";
import { BoundaryError } from "@jarvis/shared";

/** Trusted composition boundary: data and identity/authorization share one commit. */
export const identityDataTransaction = new AsyncLocalStorage<{
    client: pg.PoolClient;
}>();
export function currentDataTransaction(): pg.PoolClient {
    const scope = identityDataTransaction.getStore();
    if (!scope) throw new BoundaryError("AUTHENTICATED_TRANSACTION_REQUIRED");
    return scope.client;
}
