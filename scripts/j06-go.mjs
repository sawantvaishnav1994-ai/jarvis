import { readFile, writeFile, appendFile } from "node:fs/promises";
const root=new URL("../",import.meta.url);
const read=async path=>JSON.parse(await readFile(new URL(path,root),"utf8"));
try{
 const [catalog,unit,integration,j04,j05]=await Promise.all([
  read("tests/acceptance/j06-gates.json"),read(".jarvis/acceptance/unit.json"),read(".jarvis/acceptance/integration.json"),read(".jarvis/acceptance/j04-go.json"),read(".jarvis/acceptance/j05-go.json"),
 ]);
 const letters="ABCDEFGHIJKLMNOPQRST".split("");
 if(catalog.milestone!=="J0.6"||catalog.baseline!=="16910231c5ff79bb0b34a15b86250f48575bedec")throw new Error("GO_BASELINE_INVALID");
 if(Object.keys(catalog.gates??{}).join("")!==letters.join(""))throw new Error("GO_CATALOG_INVALID");
 if(j04.result!=="A-S_PASS")throw new Error("J0_4_REGRESSION_GATE_NOT_PASSING");
 if(j05.result!=="A-T_PASS")throw new Error("J0_5_REGRESSION_GATE_NOT_PASSING");
 const unitAssertions=unit.testResults.flatMap(s=>s.assertionResults),integrationAssertions=integration.testResults.flatMap(s=>s.assertionResults),all=[...unitAssertions,...integrationAssertions];
 const phases=Object.fromEntries(letters.map(letter=>{
  const expected=catalog.gates[letter];
  if(!Array.isArray(expected)||expected.length===0)throw new Error(`GO_EMPTY_PHASE_${letter}`);
  const failures=expected.filter(title=>!all.some(test=>test.title===title&&test.status==="passed"));
  return [letter,{result:failures.length?"FAIL":"PASS",assertions:expected.length,failures,source:"all"}];
 }));
 const suitesPassed=[unit,integration].every(report=>report.success===true&&report.numFailedTests===0&&report.numPendingTests===0);
 const passed=suitesPassed&&Object.values(phases).every(phase=>phase.result==="PASS");
 const result={version:1,milestone:"J0.6",baseline:catalog.baseline,commit:process.env.GITHUB_SHA??null,runId:process.env.GITHUB_RUN_ID??null,typescript:unit.numPassedTests,postgres:integration.numPassedTests,j04Regression:j04.result,j05Regression:j05.result,phases,result:passed?"A-T_PASS":"A-T_FAIL",verdict:"This verifier never merges or grants GO automatically. Exact-commit CI, browser, outage/recovery, shutdown and post-merge main validation remain required."};
 await writeFile(new URL(".jarvis/acceptance/j06-go.json",root),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
 if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,"\n## J0.6 A–T acceptance\n\nCommit: "+result.commit+"\n\n| Phase | Result | Assertions |\n|---|---|---:|\n"+Object.entries(phases).map(([letter,phase])=>`| ${letter} | ${phase.result} | ${phase.assertions} |`).join("\n")+"\n");
 if(!passed)process.exitCode=1;
}catch(error){console.error("J0.6_A-T_FAIL: missing or invalid acceptance evidence",error instanceof Error?error.message:"unknown");process.exitCode=1;}
