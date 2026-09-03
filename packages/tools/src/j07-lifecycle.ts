import { BoundaryError } from "@jarvis/shared";
import type { ToolStateSchema } from "./j07-contracts.js";
import type { z } from "zod";
type State=z.infer<typeof ToolStateSchema>;
const allowed:Record<State,readonly State[]>={
 REQUESTED:["VALIDATED","FAILED"], VALIDATED:["AUTHORIZED","FAILED"], AUTHORIZED:["SIMULATED","DISPATCHING","VERIFYING","RECONCILING","FAILED"], SIMULATED:[], APPROVAL_REQUIRED:["APPROVED","FAILED"], APPROVED:["DISPATCHING","FAILED"], DISPATCHING:["RUNNING","FAILED"], RUNNING:["SUCCEEDED","FAILED","CANCEL_REQUESTED","TIMED_OUT","UNKNOWN_OUTCOME","ROLLED_BACK"], SUCCEEDED:["VERIFYING"], FAILED:[], CANCEL_REQUESTED:["CANCELLED","UNKNOWN_OUTCOME"], CANCELLED:[], TIMED_OUT:["UNKNOWN_OUTCOME","FAILED"], UNKNOWN_OUTCOME:["RECONCILING"], VERIFYING:["VERIFIED","FAILED"], VERIFIED:[], RECONCILING:["RECONCILED","FAILED"], RECONCILED:[], ROLLED_BACK:[]
};
export class ToolLifecycle { private current:State="REQUESTED"; get state(){return this.current;} transition(next:State):State{if(!allowed[this.current].includes(next))throw new BoundaryError("ILLEGAL_TOOL_STATE_TRANSITION");this.current=next;return next;} }
