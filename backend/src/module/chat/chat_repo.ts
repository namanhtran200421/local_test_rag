import { randomUUID } from "node:crypto";
import { pool } from "../../config/db.js";
import type { AgentKey, Conversation, ConversationState, MessageRole, StoredMessage } from "./chat_type.js";

const MAX_MESSAGES_PER_CONVERSATION = 30;
const conversations = new Map<string, Conversation>();

function mapConversation(row: Record<string, unknown>, messages: StoredMessage[] = []): Conversation {
  return {
    id: String(row["id"]), agentKey: row["agent_key"] as AgentKey,
    ...(row["owner_user_id"] ? { ownerUserId: String(row["owner_user_id"]) } : {}),
    state: (row["state"] ?? {}) as ConversationState, messages,
    createdAt: new Date(row["created_at"] as string | Date).toISOString(),
    updatedAt: new Date(row["updated_at"] as string | Date).toISOString(),
  };
}

export async function createConversation(agentKey: AgentKey = "tan", ownerUserId?: string): Promise<Conversation> {
  if (pool) {
    const result = await pool.query(
      `insert into tan.conversations (agent_key, channel, owner_user_id)
       values ($1, $2, $3) returning id, agent_key, owner_user_id, state, created_at, updated_at`,
      [agentKey, agentKey === "tan" ? "public" : "internal", ownerUserId ?? null],
    );
    return mapConversation(result.rows[0]);
  }
  const now = new Date().toISOString();
  const conversation: Conversation = { id: randomUUID(), agentKey, ...(ownerUserId ? { ownerUserId } : {}), state: {}, messages: [], createdAt: now, updatedAt: now };
  conversations.set(conversation.id, conversation);
  return conversation;
}

export async function findConversation(id: string, agentKey: AgentKey, ownerUserId?: string): Promise<Conversation | undefined> {
  if (pool) {
    const result = await pool.query(
      `select id, agent_key, owner_user_id, state, created_at, updated_at from tan.conversations
       where id = $1 and agent_key = $2 and expires_at > now()
       and ($3::text is null or owner_user_id = $3)`,
      [id, agentKey, ownerUserId ?? null],
    );
    if (!result.rowCount) return undefined;
    const messages = await pool.query(
      `select id, role, content, created_at from tan.messages where conversation_id = $1
       order by created_at desc limit $2`, [id, MAX_MESSAGES_PER_CONVERSATION],
    );
    return mapConversation(result.rows[0], messages.rows.reverse().map((row) => ({
      id: row.id, role: row.role, content: row.content, createdAt: new Date(row.created_at).toISOString(),
    })));
  }
  const conversation = conversations.get(id);
  if (!conversation || conversation.agentKey !== agentKey || (ownerUserId && conversation.ownerUserId !== ownerUserId)) return undefined;
  return conversation;
}

export async function updateConversationState(conversation: Conversation, patch: Partial<ConversationState>): Promise<void> {
  conversation.state = { ...conversation.state, ...patch };
  conversation.updatedAt = new Date().toISOString();
  if (pool) await pool.query("update tan.conversations set state = $2, updated_at = now() where id = $1", [conversation.id, conversation.state]);
}

export async function appendMessage(conversation: Conversation, role: MessageRole, content: string): Promise<StoredMessage> {
  let message: StoredMessage;
  if (pool) {
    const result = await pool.query(
      `insert into tan.messages (conversation_id, role, content) values ($1, $2, $3)
       returning id, role, content, created_at`, [conversation.id, role, content],
    );
    const row = result.rows[0];
    message = { id: row.id, role: row.role, content: row.content, createdAt: new Date(row.created_at).toISOString() };
    await pool.query("update tan.conversations set updated_at = now() where id = $1", [conversation.id]);
  } else {
    message = { id: randomUUID(), role, content, createdAt: new Date().toISOString() };
  }
  conversation.messages.push(message);
  if (conversation.messages.length > MAX_MESSAGES_PER_CONVERSATION) conversation.messages.splice(0, conversation.messages.length - MAX_MESSAGES_PER_CONVERSATION);
  conversation.updatedAt = message.createdAt;
  return message;
}

export function clearConversationsForTests(): void { conversations.clear(); }
