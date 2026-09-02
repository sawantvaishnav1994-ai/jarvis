import { z } from "zod";
import { DataPolicySchema, type DataPolicy } from "@jarvis/shared";
const DestinationSchema = z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("local") }),
    z.strictObject({
        kind: z.literal("cloud"),
        provider: z.string().min(1).max(128),
        region: z.string().min(1).max(128),
    }),
]);
export type ModelDataDestination = z.infer<typeof DestinationSchema>;
const ApprovedDestinationsSchema = z.strictObject({
    providers: z.array(z.string().min(1).max(128)).max(100),
    regions: z.array(z.string().min(1).max(128)).max(100),
});
/** Privacy veto only. Authentication, retention, retrieval and network authorization are separate. */
export function permitsModelDisclosure(
    policy: DataPolicy,
    destination: ModelDataDestination,
    approved: { providers: readonly string[]; regions: readonly string[] },
): boolean {
    const p = DataPolicySchema.parse(policy),
        d = DestinationSchema.parse(destination),
        allow = ApprovedDestinationsSchema.parse(approved);
    if (p.classification === "D5") return false;
    if (d.kind === "local") return true;
    return (
        p.privacy === "ai-allow" &&
        p.consent.externalAI &&
        ["D0", "D1", "D2"].includes(p.classification) &&
        allow.providers.includes(d.provider) &&
        allow.regions.includes(d.region)
    );
}
