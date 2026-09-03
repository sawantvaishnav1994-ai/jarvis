import { DataClassSchema } from "@jarvis/shared";
const secretKey=/(password|secret|token|cookie|authorization|api[_-]?key|private[_-]?key|credential|session[_-]?secret|encryption[_-]?key)/i;
const control=/[\u0000-\u001f\u007f]/g;
export function safeText(value:string,max=256){return value.replace(control," ").slice(0,max);}
export function sanitizeMetadata(input:Record<string,unknown>,classification:string){
    if(DataClassSchema.parse(classification)==="D5")throw new Error("D5_AUDIT_CONTENT_DENIED");
    const output:Record<string,string|number|boolean|null>={}; const redactions:string[]=[];
    for(const [rawKey,raw] of Object.entries(input).slice(0,32)){
        const key=safeText(rawKey,64);
        if(secretKey.test(key)){redactions.push(key);continue;}
        if(raw===null||typeof raw==="boolean"||(typeof raw==="number"&&Number.isFinite(raw)))output[key]=raw;
        else if(typeof raw==="string")output[key]=safeText(raw);
        else redactions.push(key);
    }
    return{metadata:output,redactions};
}
export function assertNoSecretLikeMaterial(value:unknown){
    const text=JSON.stringify(value);
    if(/Bearer\s+[A-Za-z0-9._-]+|-----BEGIN .*PRIVATE KEY-----|"(?:password|secret|token|cookie|apiKey|api_key)"\s*:\s*"(?!\[REDACTED\])/i.test(text))throw new Error("SECRET_MATERIAL_DENIED");
}