import { pool } from "../config/db.js";
import { log } from "./logger.js";
import type { AgentKey } from "../module/chat/chat_type.js";

interface AuditEvent {
  requestId: string;
  actorId?: string;
  actorRole?: string;
  agentKey: AgentKey;
  eventType: string;
  outcome: string;
  metadata?: Record<string, string | number | boolean>;
}

export async function recordAudit(event: AuditEvent): Promise<void> {
  log("info", "audit_event", { ...event });
  if (!pool) return;
  await pool.query(
    `insert into tan.audit_events (request_id, actor_id, actor_role, agent_key, event_type, outcome, metadata)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [event.requestId, event.actorId ?? null, event.actorRole ?? null, event.agentKey, event.eventType, event.outcome, event.metadata ?? {}],
  );
}
