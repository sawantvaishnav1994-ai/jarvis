import { readFile, writeFile } from "node:fs/promises";
const path="tests/integration/private-data-postgres.test.ts";
const before=".toEqual([1,2,3,4,5,6,7,8,9,10,11,12]);";
const after=".toEqual([1,2,3,4,5,6,7,8,9,10,11,12,13]);";
const source=await readFile(path,"utf8");
if(source.includes(after)){console.log("J0.9 legacy migration baseline already current");process.exit(0);}
const matches=source.split(before).length-1;
if(matches!==1)throw new Error(`EXPECTED_ONE_LEGACY_MIGRATION_ASSERTION_FOUND_${matches}`);
await writeFile(path,source.replace(before,after));
console.log("J0.9 legacy migration baseline advanced 12 -> 13");
