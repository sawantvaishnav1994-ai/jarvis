import { z } from "zod";
import {
    BoundaryError,
    DataClassSchema,
    ExternalProcessingPolicySchema,
} from "@jarvis/shared";

// Conservative, deterministic common-secret guard. Explicit D5 labels are mandatory;
// heuristic detection cannot recognize every arbitrary credential string.
const secretPatterns = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
    /\b(?:gh[pousr]_[a-zA-Z0-9]{12,}|github_pat_[a-zA-Z0-9_]{12,}|sk-[a-zA-Z0-9_-]{16,})\b/,
    /\b(?:api[_ -]?key|password|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret)\s*[=:]\s*[^\s,;]{6,}/i,
];
export function rejectGenericSecrets(value: unknown): void {
    if (value !== null && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
            if (
                /^(?:api[_ -]?key|password|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|private[_ -]?key)$/i.test(
                    key,
                )
            )
                throw new BoundaryError("SECRET_IN_GENERIC_DATA_DENIED");
            rejectGenericSecrets(child);
        }
    }
    const text = JSON.stringify(value);
    if (secretPatterns.some((p) => p.test(text)))
        throw new BoundaryError("SECRET_IN_GENERIC_DATA_DENIED");
}
export const ContextItemSchema = z.strictObject({
    id: z.string().min(1),
    classification: DataClassSchema,
    policy: ExternalProcessingPolicySchema,
    fields: z.record(z.string(), z.string().max(16000)),
});
/** Additional privacy restriction, never an authorization grant or provider call. */
export function minimizeExternalContext(
    raw: unknown,
    provider: string,
    region: string,
    selectedIds: readonly string[],
    limit = 16000,
) {
    const items = z.array(ContextItemSchema).max(100).parse(raw);
    if (!Number.isInteger(limit) || limit < 0 || limit > 16000)
        throw new BoundaryError("CONTEXT_LIMIT_INVALID");
    const selected = new Set(selectedIds),
        result: { id: string; fields: Record<string, string> }[] = [],
        excluded: string[] = [];
    let remaining = limit;
    for (const item of items) {
        const p = item.policy;
        if (
            !selected.has(item.id) ||
            item.classification === "D5" ||
            item.classification === "D4" ||
            !["APPROVED_EXTERNAL_AI", "SPECIFIC_PROVIDER_ONLY"].includes(
                p.mode,
            ) ||
            !p.providers.includes(provider) ||
            !p.regions.includes(region)
        ) {
            excluded.push(item.id);
            continue;
        }
        const fields: Record<string, string> = {};
        let budget = Math.min(remaining, p.maximumCharacters);
        for (const key of [...p.fields].sort()) {
            const value = item.fields[key];
            if (value === undefined || budget <= 0) continue;
            try {
                rejectGenericSecrets(value);
            } catch {
                continue;
            }
            if (
                /(?:password|secret|token|credential|account.?id|private.?key)/i.test(
                    key,
                )
            )
                continue;
            const safe = value.slice(0, budget);
            fields[key] = safe;
            budget -= safe.length;
            remaining -= safe.length;
        }
        if (Object.keys(fields).length) result.push({ id: item.id, fields });
        else excluded.push(item.id);
    }
    return { version: 1 as const, provider, region, items: result, excluded };
}
