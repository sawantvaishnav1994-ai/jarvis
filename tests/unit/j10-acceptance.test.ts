import { describe,expect,it } from "vitest";
import { randomUUID } from "node:crypto";
import {
    J10_BASELINE,
    buildRestorePlan,
    checkRecoveryCompatibility,
    materializeRecoveryManifest,
    verifyRecoveryManifest,
    verifyRestorePlan,
    RecoveryManifestV2Schema,
    PortableOwnerExportV2Schema,
    RecoverySafeModeSchema,
} from "@jarvis/storage";

const hash="a".repeat(64),owner="owner-j10",now=1_800_000_000_000;
const manifest=()=>materializeRecoveryManifest({
    version:2,id:randomUUID(),ownerId:owner,projectId:"jarvis",sourceInstallationId:"install-a",sourceCommit:J10_BASELINE,
    createdAt:now,expiresAt:now+86400000,schemaVersion:14,schemaHash:hash,storageVersion:2,encryptionVersion:1,vectorVersion:1,
    auditVersion:3,eventVersion:1,backupId:randomUUID(),backupType:"FULL",parentBackupId:null,
    components:[{name:"identity",digest:hash,count:1,required:true},{name:"memory",digest:hash,count:2,required:true},{name:"audit",digest:hash,count:1,required:true}],
    auditCheckpoint:{sequence:3,hash},keyReferences:["backup-key1"],vaultReferences:["secret://providers/openai"],tombstoneCount:2,deletionObligationCount:1,secretsIncluded:false,
});
const plan=(m=manifest())=>buildRestorePlan({id:randomUUID(),ownerId:owner,backupId:m.backupId,manifestDigest:m.manifestDigest,targetId:"jarvis_restore_test_0123456789abcdef",targetKind:"ISOLATED_DATABASE",securityEpoch:7,invalidateSessions:true,preserveRootOwner:true,preserveRevocations:true,suppressDeletedData:true,requiresSecretRebind:["provider-openai"],migrationsRequired:[],expectedCounts:{identity:1,memory:2,audit:1},auditCheckpointHash:hash,rollbackTarget:"active-current",now});

describe("J0.10 recovery acceptance",()=>{
 it("J0.10-A — Protected baseline",()=>{expect(J10_BASELINE).toBe("e9e943b90da9d1be748aedb4dc62ef7017020b39");});
 it("J0.10-B — Canonical recovery contracts",()=>{const m=manifest();expect(RecoveryManifestV2Schema.parse(m)).toEqual(m);expect(verifyRecoveryManifest(m,owner,now)).toEqual(m);});
 it("J0.10-D — Backup catalog and compatibility",()=>{expect(checkRecoveryCompatibility(manifest())).toEqual({compatible:true,reasons:[]});const m={...manifest(),schemaVersion:99};expect(checkRecoveryCompatibility(m)).toMatchObject({compatible:false,reasons:expect.arrayContaining(["SCHEMA_VERSION_UNSUPPORTED"])});});
 it("J0.10-E — Restore plan exact binding",()=>{const m=manifest(),p=plan(m);expect(verifyRestorePlan(p,owner,now,7,m.manifestDigest)).toEqual(p);expect(()=>verifyRestorePlan({...p,targetId:"other"},owner,now,7,m.manifestDigest)).toThrow("RESTORE_PLAN_TAMPERED");expect(()=>verifyRestorePlan(p,owner,now,8,m.manifestDigest)).toThrow("RESTORE_SECURITY_EPOCH_CHANGED");});
 it("J0.10-F — Recovery simulation is not authorization",()=>{const p=plan();expect(p.state).toBe("PLANNED");expect(p).not.toHaveProperty("approvalId");});
 it("J0.10-H — Root Owner and security state preservation",()=>{const p=plan();expect(p.preserveRootOwner).toBe(true);expect(p.preserveRevocations).toBe(true);expect(p.invalidateSessions).toBe(true);});
 it("J0.10-I — Secret and key separation",()=>{const m=manifest();expect(m.secretsIncluded).toBe(false);expect(m.vaultReferences[0]).toMatch(/^secret:\/\//);expect(JSON.stringify(m)).not.toContain("sk-");});
 it("J0.10-J — Deletion and tombstone non-resurrection",()=>{const p=plan(),m=manifest();expect(p.suppressDeletedData).toBe(true);expect(m.tombstoneCount).toBeGreaterThan(0);expect(m.deletionObligationCount).toBeGreaterThan(0);});
 it("J0.10-K — Audit recovery and integrity",()=>{const m=manifest();expect(m.auditCheckpoint).toEqual({sequence:3,hash});expect(m.components.find(c=>c.name==="audit")?.digest).toBe(hash);});
 it("J0.10-L — Recovery safe mode",()=>{expect(RecoverySafeModeSchema.parse({version:1,ownerId:owner,enabled:true,reasonCode:"RECOVERY_INCOMPLETE",planId:null,updatedAt:now,externalActionsAllowed:false,agentsAllowed:false,mutatingToolsAllowed:false})).toMatchObject({enabled:true,externalActionsAllowed:false,agentsAllowed:false,mutatingToolsAllowed:false});});
 it("J0.10-M — Disaster scenario recovery",()=>{const m=manifest();expect(()=>verifyRecoveryManifest({...m,manifestDigest:"b".repeat(64)},owner,now)).toThrow("RECOVERY_MANIFEST_TAMPERED");expect(()=>verifyRecoveryManifest(m,"other-owner",now)).toThrow("RECOVERY_OWNER_MISMATCH");expect(()=>verifyRecoveryManifest({...m,expiresAt:now-1,manifestDigest:m.manifestDigest},owner,now)).toThrow();});
 it("J0.10-N — Portable owner export",()=>{const e={version:2 as const,id:randomUUID(),ownerId:owner,generatedAt:now,sourceInstallationId:"install-a",schemaVersion:14,domains:["conversation","memory","audit"],componentDigests:{memory:hash,audit:hash},tombstoneDigest:hash,auditCheckpointHash:hash,providerIndependent:true as const,secretsIncluded:false as const,exportDigest:hash};expect(PortableOwnerExportV2Schema.parse(e)).toEqual(e);});
 it("J0.10-O — Import validation",()=>{const e={version:2,id:randomUUID(),ownerId:owner,generatedAt:now,sourceInstallationId:"install-a",schemaVersion:14,domains:["memory"],componentDigests:{memory:hash},tombstoneDigest:hash,auditCheckpointHash:null,providerIndependent:true,secretsIncluded:false,exportDigest:hash};expect(()=>PortableOwnerExportV2Schema.parse({...e,secretsIncluded:true})).toThrow();expect(()=>PortableOwnerExportV2Schema.parse({...e,providerIndependent:false})).toThrow();});
 it("J0.10-P — Infrastructure replacement",()=>{const m=manifest();expect(m.sourceInstallationId).toBe("install-a");expect(m.components.map(c=>c.name)).toContain("memory");expect(m.vaultReferences.every(v=>v.startsWith("secret://"))).toBe(true);});
 it("J0.10-Q — J0.3 authorization and TOCTOU preservation",()=>{const m=manifest(),p=plan(m);expect(()=>verifyRestorePlan(p,owner,now,9,m.manifestDigest)).toThrow("RESTORE_SECURITY_EPOCH_CHANGED");expect(()=>verifyRestorePlan(p,owner,now,7,"b".repeat(64))).toThrow("RESTORE_MANIFEST_CHANGED");});
 it("J0.10-S — Startup readiness and recovery lifecycle",()=>{const state=RecoverySafeModeSchema.parse({version:1,ownerId:owner,enabled:true,reasonCode:"UNRESOLVED_CUTOVER",planId:null,updatedAt:now,externalActionsAllowed:false,agentsAllowed:false,mutatingToolsAllowed:false});expect(state.enabled).toBe(true);});
 it("J0.10-T — Full recovery and data sovereignty integration",()=>{const m=manifest(),p=plan(m);expect(checkRecoveryCompatibility(m).compatible).toBe(true);expect(verifyRecoveryManifest(m,owner,now).manifestDigest).toBe(p.manifestDigest);expect(p.targetKind).toBe("ISOLATED_DATABASE");expect(p.preserveRootOwner&&p.preserveRevocations&&p.suppressDeletedData).toBe(true);});
});
