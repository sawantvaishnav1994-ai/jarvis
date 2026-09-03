import { randomUUID } from "node:crypto";
import { z } from "zod";
import { canonical } from "@jarvis/identity";
import { BoundaryError } from "@jarvis/shared";
import type { AuthorizationV3 } from "@jarvis/security";
import { PortableExportSchema,PortableExports,reconstructPortableExport,verifyPortableExport } from "./exports.js";
import { PortableOwnerExportV2Schema } from "./j10-contracts.js";
import { storageHash } from "./objects.js";

export const J10PortablePackageSchema=z.strictObject({version:z.literal(1),manifest:PortableOwnerExportV2Schema,portable:PortableExportSchema});
export type J10PortablePackage=z.infer<typeof J10PortablePackageSchema>;
function digestPackageFields(input:{ownerId:string;sourceInstallationId:string;portableId:string;componentDigests:Record<string,string>;tombstoneDigest:string;auditCheckpointHash:string|null}){return storageHash(canonical(input));}
export class J10PortabilityService{
 constructor(private readonly legacy:PortableExports,private readonly clock:()=>number=Date.now){}
 async exportOwnerData(auth:AuthorizationV3,input:{sourceInstallationId:string;tombstoneDigest:string;auditCheckpointHash:string|null}){if(auth.capability!=="data.export"||auth.assurance!=="A3"||!auth.approvalId)throw new BoundaryError("EXPORT_OWNER_APPROVAL_REQUIRED");const portable=await this.legacy.create(auth),componentDigests=Object.fromEntries(portable.manifest.items.map(item=>[item.path,item.sha256])),fields={ownerId:auth.ownerId,sourceInstallationId:input.sourceInstallationId,portableId:portable.manifest.id,componentDigests,tombstoneDigest:input.tombstoneDigest,auditCheckpointHash:input.auditCheckpointHash},manifest=PortableOwnerExportV2Schema.parse({version:2,id:randomUUID(),ownerId:auth.ownerId,generatedAt:this.clock(),sourceInstallationId:input.sourceInstallationId,schemaVersion:14,domains:portable.manifest.domains,componentDigests,tombstoneDigest:input.tombstoneDigest,auditCheckpointHash:input.auditCheckpointHash,providerIndependent:true,secretsIncluded:false,exportDigest:digestPackageFields(fields)});return J10PortablePackageSchema.parse({version:1,manifest,portable});}
 verifyExport(raw:unknown,ownerId:string){const pkg=J10PortablePackageSchema.parse(raw);if(pkg.manifest.ownerId!==ownerId||pkg.portable.manifest.ownerId!==ownerId)throw new BoundaryError("EXPORT_OWNER_MISMATCH");verifyPortableExport(pkg.portable);const fields={ownerId,sourceInstallationId:pkg.manifest.sourceInstallationId,portableId:pkg.portable.manifest.id,componentDigests:pkg.manifest.componentDigests,tombstoneDigest:pkg.manifest.tombstoneDigest,auditCheckpointHash:pkg.manifest.auditCheckpointHash};if(digestPackageFields(fields)!==pkg.manifest.exportDigest)throw new BoundaryError("EXPORT_INTEGRITY_FAILED");for(const item of pkg.portable.manifest.items)if(pkg.manifest.componentDigests[item.path]!==item.sha256)throw new BoundaryError("EXPORT_COMPONENT_SUBSTITUTION");if(Object.keys(pkg.manifest.componentDigests).length!==pkg.portable.manifest.items.length)throw new BoundaryError("EXPORT_COMPONENT_MISMATCH");return pkg;}
 importOwnerData(raw:unknown,ownerId:string){const pkg=this.verifyExport(raw,ownerId),reconstructed=reconstructPortableExport(pkg.portable);if(reconstructed.ownerId!==ownerId)throw new BoundaryError("EXPORT_OWNER_MISMATCH");return{version:1 as const,ownerId,sourceInstallationId:pkg.manifest.sourceInstallationId,records:reconstructed.records,objects:reconstructed.objects,deleted:reconstructed.deleted,authorityRestored:false as const,providerIndependent:true as const};}
}
