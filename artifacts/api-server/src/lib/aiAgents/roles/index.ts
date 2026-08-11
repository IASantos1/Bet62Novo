import type { AgentAnalysisResult, AgentRole } from "../types.js";
import { runRiskAgent } from "./risk.js";
import { runOddsAgent } from "./odds.js";
import { runSettlementAgent } from "./settlement.js";
import { runFraudAgent } from "./fraud.js";
import { runPaymentsAgent } from "./payments.js";
import { runComplianceAgent } from "./compliance.js";
import { runSupportAgent } from "./support.js";
import { runLiveMatchAgent } from "./liveMatch.js";
import { runPreMatchAgent } from "./preMatch.js";
import { runTicketSettlementAgent } from "./ticketSettlement.js";

// The orchestrator is registered separately (orchestrator.ts) since it
// calls back into this registry to run every other role in sequence —
// importing it here would create a cycle.
export const AGENT_REGISTRY: Record<Exclude<AgentRole, "orchestrator">, () => Promise<AgentAnalysisResult | null>> = {
  risk: runRiskAgent,
  odds: runOddsAgent,
  settlement: runSettlementAgent,
  fraud: runFraudAgent,
  payments: runPaymentsAgent,
  compliance: runComplianceAgent,
  support: runSupportAgent,
  livematch: runLiveMatchAgent,
  prematch: runPreMatchAgent,
  ticketsettlement: runTicketSettlementAgent,
};
