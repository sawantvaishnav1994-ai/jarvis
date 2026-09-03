import { createHash } from "node:crypto";
import { AuditRecordV3Schema, type AuditRecordDraft, type AuditRecordV3 } from "./j09-contracts.js";

export function canonicalize(value:unknown):string {
    if(value===null||typeof value==="string"||typeof value==="boolean") return JSON.stringify(value);
    if(typeof value==="number"){if(!Number.isFinite(value))throw new Error("NON_FINITE_CANONICAL_NUMBER");return JSON.stringify(value);}
    if(Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if(typeof value==="object"){
        const obj=value as Record<string,unknown>;
        const keys=Object.keys(obj).filter(k=>obj[k]!==undefined).sort();
        return `{${keys.map(k=>`${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
    }
    throw new Error("UNSUPPORTED_CANONICAL_VALUE");
}
export const sha256=(value:string)=>createHash("sha256").update(value).digest("hex");
export function materializeAuditRecord(draft:AuditRecordDraft,sequence:number,recordedAt:string,previousHash:string|null):AuditRecordV3{
    const base={version:3 as const,...draft,sequence,recordedAt,previousHash};
    const recordHash=sha256(canonicalize(base)+(previousHash??"GENESIS"));
    return AuditRecordV3Schema.parse({...base,recordHash});
}
export type IntegrityResult={ok:boolean;checked:number;headHash:string|null;reason?:string};
export function verifyAuditChain(input:AuditRecordV3[]):IntegrityResult{
    let previous:string|null=null; let expectedSequence=input[0]?.sequence??1;
    for(const raw of input){
        const r=AuditRecordV3Schema.parse(raw);
        if(r.sequence!==expectedSequence)return{ok:false,checked:expectedSequence-(input[0]?.sequence??1),headHash:previous,reason:"SEQUENCE_GAP"};
        if(r.previousHash!==previous)return{ok:false,checked:r.sequence-(input[0]?.sequence??r.sequence),headHash:previous,reason:"PREVIOUS_HASH_MISMATCH"};
        const {recordHash,...base}=r; const expected=sha256(canonicalize(base)+(r.previousHash??"GENESIS"));
        if(recordHash!==expected)return{ok:false,checked:r.sequence-(input[0]?.sequence??r.sequence),headHash:previous,reason:"RECORD_HASH_MISMATCH"};
        previous=recordHash; expectedSequence++;
    }
    return{ok:true,checked:input.length,headHash:previous};
}