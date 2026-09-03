import { createHash,createHmac,timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type pg from "pg";
import { canonical } from "@jarvis/identity";
import { BoundaryError } from "@jarvis/shared";
import { GovernanceStateSchema,RecordCipher } from "@jarvis/security";
import type { RecoverySnapshot } from "./recovery.js";

const Id=z.string().min(1).max(128),Hash=z.string().regex(/^[a-f0-9]{64}$/);
const SignedPayloadSchema=z.strictObject({version:z.literal(1),ownerId:Id,backupId:z.uuid(),manifestDigest:Hash,baseDigest:Hash,supplementDigest:Hash,obligationDigest:Hash});
export type RecoveryAuthenticityPayload=z.infer<typeof SignedPayloadSchema>;
export const RecoveryAuthenticitySchema=z.strictObject({version:z.literal(1),algorithm:z.literal("hmac-sha256"),keyReference:Id,payload:SignedPayloadSchema,mac:Hash});
export type RecoveryAuthenticity=z.infer<typeof RecoveryAuthenticitySchema>;

export class HmacRecoveryAuthenticator{
 private readonly key:Buffer;
 constructor(key:Uint8Array,readonly keyReference:string){this.key=Buffer.from(key);if(this.key.length!==32||!Id.safeParse(keyReference).success)throw new BoundaryError("RECOVERY_AUTHENTICATOR_INVALID");}
 private mac(payload:RecoveryAuthenticityPayload){return createHmac("sha256",this.key).update(canonical(payload)).digest("hex");}
 seal(input:RecoveryAuthenticityPayload):RecoveryAuthenticity{const payload=SignedPayloadSchema.parse(input);return RecoveryAuthenticitySchema.parse({version:1,algorithm:"hmac-sha256",keyReference:this.keyReference,payload,mac:this.mac(payload)});}
 verify(raw:unknown,ownerId:string){const value=RecoveryAuthenticitySchema.parse(raw);if(value.payload.ownerId!==ownerId)throw new BoundaryError("RECOVERY_OWNER_MISMATCH");const actual=Buffer.from(this.mac(value.payload),"hex"),expected=Buffer.from(value.mac,"hex");if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new BoundaryError("RECOVERY_AUTHENTICITY_FAILED");return value;}
 destroy(){this.key.fill(0);}
}

const ObligationsSchema=z.strictObject({version:z.literal(1),ownerId:Id,generation:z.number().int().nonnegative(),createdAt:z.number().int().nonnegative(),revokedDeviceIds:z.array(Id).max(1000),revokedSubjectIds:z.array(Id).max(1000),deletedRecordIds:z.array(z.uuid()).max(10000),removedDelegationIds:z.array(Id).max(10000)});
export type RecoveryObligations=z.infer<typeof ObligationsSchema>;
export const SignedRecoveryObligationsSchema=z.strictObject({version:z.literal(1),payload:ObligationsSchema,digest:Hash,mac:Hash,keyReference:Id});
export type SignedRecoveryObligations=z.infer<typeof SignedRecoveryObligationsSchema>;
export const recoveryObligationDigest=(value:RecoveryObligations)=>createHash("sha256").update(canonical(ObligationsSchema.parse(value))).digest("hex");

export class RecoveryObligationSigner{
 private readonly key:Buffer;
 constructor(key:Uint8Array,readonly keyReference:string){this.key=Buffer.from(key);if(this.key.length!==32||!Id.safeParse(keyReference).success)throw new BoundaryError("RECOVERY_OBLIGATION_SIGNER_INVALID");}
 sign(input:RecoveryObligations):SignedRecoveryObligations{const payload=ObligationsSchema.parse(input),d=recoveryObligationDigest(payload),mac=createHmac("sha256",this.key).update(canonical({payload,digest:d})).digest("hex");return SignedRecoveryObligationsSchema.parse({version:1,payload,digest:d,mac,keyReference:this.keyReference});}
 verify(raw:unknown,ownerId:string){const value=SignedRecoveryObligationsSchema.parse(raw);if(value.payload.ownerId!==ownerId||recoveryObligationDigest(value.payload)!==value.digest)throw new BoundaryError("RECOVERY_OBLIGATION_INTEGRITY_FAILED");const mac=createHmac("sha256",this.key).update(canonical({payload:value.payload,digest:value.digest})).digest("hex"),a=Buffer.from(mac,"hex"),b=Buffer.from(value.mac,"hex");if(a.length!==b.length||!timingSafeEqual(a,b))throw new BoundaryError("RECOVERY_OBLIGATION_AUTHENTICITY_FAILED");return value;}
 destroy(){this.key.fill(0);}
}

export function sanitizeRecoveredGovernancePayload(raw:string,cipher:RecordCipher,ownerId:string){const state=GovernanceStateSchema.parse(cipher.decrypt(raw,"security:development:governance:v1"));if(state.ownerId!==ownerId)throw new BoundaryError("RECOVERY_SECURITY_OWNER_MISMATCH");const recovered=GovernanceStateSchema.parse({...state,controls:{...state.controls,epoch:state.controls.epoch+1},budgets:{},approvals:{},authorizations:{},requests:{}});return cipher.encrypt(recovered,"security:development:governance:v1");}

export class PostgresRecoverySecurityReconciler{
 constructor(private readonly cipher:RecordCipher,private readonly obligationSigner:RecoveryObligationSigner){}
 verifyObligations(ownerId:string,signed:SignedRecoveryObligations){return this.obligationSigner.verify(signed,ownerId);}
 async reconcile(ownerId:string,snapshot:RecoverySnapshot,targetId:string,target:pg.Pool,signedObligations:SignedRecoveryObligations){if(!/^jarvis_restore_test_[a-f0-9]{16}$/.test(targetId))throw new BoundaryError("RESTORE_TARGET_NOT_ISOLATED");const obligations=this.verifyObligations(ownerId,signedObligations).payload,savedTombstones=new Set((snapshot.tables["storage.deletion_tombstones"]??[]).map(row=>String((row as {record_id?:unknown}).record_id??"")));if(obligations.deletedRecordIds.some(id=>!savedTombstones.has(id)))throw new BoundaryError("BACKUP_PREDATES_AUTHORITATIVE_DELETION");const client=await target.connect();try{await client.query("BEGIN");if((await client.query("SELECT current_database() name")).rows[0]?.name!==targetId)throw new BoundaryError("RESTORE_TARGET_MISMATCH");const governance=snapshot.tables["security.governance_state"]??[];if(governance.length!==1)throw new BoundaryError("RECOVERY_SECURITY_STATE_MISSING");const g=governance[0] as {singleton?:boolean;payload?:string};if(g.singleton!==true||typeof g.payload!=="string")throw new BoundaryError("RECOVERY_SECURITY_STATE_INVALID");await client.query("INSERT INTO security.governance_state(singleton,payload) VALUES(true,$1)",[sanitizeRecoveredGovernancePayload(g.payload,this.cipher,ownerId)]);
 for(const id of obligations.revokedDeviceIds){const row=await client.query<{payload:string}>("SELECT payload FROM identity.devices WHERE id=$1",[id]);if(!row.rowCount)continue;const device=this.cipher.decrypt(row.rows[0]!.payload,"identity:development:devices:"+id) as Record<string,unknown>;device.trust="revoked";device.revokedAt=Math.max(Number(device.revokedAt??0),obligations.createdAt);await client.query("UPDATE identity.devices SET payload=$2 WHERE id=$1",[id,this.cipher.encrypt(device,"identity:development:devices:"+id)]);}
 for(const id of obligations.revokedSubjectIds){const row=await client.query<{payload:string}>("SELECT payload FROM identity.subjects WHERE id=$1",[id]);if(!row.rowCount)continue;const subject=this.cipher.decrypt(row.rows[0]!.payload,"identity:development:subjects:"+id) as Record<string,unknown>;subject.revoked=true;await client.query("UPDATE identity.subjects SET payload=$2 WHERE id=$1",[id,this.cipher.encrypt(subject,"identity:development:subjects:"+id)]);}
 const active=await client.query("SELECT count(*)::int n FROM identity.sessions");if(Number(active.rows[0]?.n??0)!==0)throw new BoundaryError("RECOVERY_SESSION_RESURRECTION");const delegations=await client.query("SELECT count(*)::int n FROM identity.delegations");if(Number(delegations.rows[0]?.n??0)!==0)throw new BoundaryError("RECOVERY_DELEGATION_RESURRECTION");await client.query("COMMIT");return{securityPolicyPreserved:true,authorityCleared:true,revokedDevices:obligations.revokedDeviceIds.length,revokedSubjects:obligations.revokedSubjectIds.length,deletionGeneration:obligations.generation};}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}}
}
