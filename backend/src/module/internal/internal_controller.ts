import type { Request, Response } from "express";
import { ConversationNotFoundError } from "../chat/chat_service.js";
import { internalChatRequestSchema } from "../chat/chat_type.js";
import { ForbiddenAgentError, internalChat } from "./internal_service.js";
import { GuardrailError } from "../chat/guardrail_service.js";
import { RagUnavailableError } from "../chat/rag_service.js";
import { recordAudit } from "../../observability/audit_repo.js";
import {
  acceptsProgressStream,
  startProgressStream,
  writeProgress,
  writeResult,
  writeStreamError,
  type StreamError,
} from "../chat/chat_stream.js";

function internalError(error: unknown): StreamError {
  if (error instanceof GuardrailError) return { status: 400, error: error.code, message: error.message };
  if (error instanceof RagUnavailableError) return { status: 503, error: "knowledge_unavailable", message: "The authorised knowledge source is temporarily unavailable." };
  if (error instanceof ForbiddenAgentError) return { status: 403, error: "forbidden", message: "Your role cannot access this agent." };
  if (error instanceof ConversationNotFoundError) return { status: 404, error: "conversation_not_found", message: "Start a new conversation." };
  return { status: 500, error: "internal_error", message: "Something went wrong. Please try again." };
}

export async function postInternalChat(req: Request, res: Response): Promise<void> {
  const parsed = internalChatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: "The internal chat request is invalid." });
    return;
  }


  if (acceptsProgressStream(req)) {
    const stopHeartbeat = startProgressStream(res);
    try {
      const response = await internalChat(parsed.data, req.authenticatedUser!, {
        onProgress: (update) => writeProgress(res, update),
      });
      await recordAudit({
        requestId: req.requestId ?? "unknown", actorId: req.authenticatedUser!.id,
        actorRole: req.authenticatedUser!.role, agentKey: parsed.data.agentKey,
        eventType: "agent_response", outcome: response.generation.provider,
        metadata: { conversationId: response.conversationId, grounded: response.safety?.grounded ?? false },
      });
      writeResult(res, response);
    } catch (error) {
      writeStreamError(res, internalError(error));
    } finally {
      stopHeartbeat();
      res.end();
    }
    return;
  }

  try {
    const response = await internalChat(parsed.data, req.authenticatedUser!);
    await recordAudit({
      requestId: req.requestId ?? "unknown", actorId: req.authenticatedUser!.id,
      actorRole: req.authenticatedUser!.role, agentKey: parsed.data.agentKey,
      eventType: "agent_response", outcome: response.generation.provider,
      metadata: { conversationId: response.conversationId, grounded: response.safety?.grounded ?? false },
    });
    res.status(200).json(response);
  } catch (error) {
    if (error instanceof GuardrailError) {
      res.status(400).json({ error: error.code, message: error.message });
      return;
    }
    if (error instanceof RagUnavailableError) {
      res.status(503).json({ error: "knowledge_unavailable", message: "The authorised knowledge source is temporarily unavailable." });
      return;
    }
    if (error instanceof ForbiddenAgentError) {
      res.status(403).json({ error: "forbidden", message: "Your role cannot access this agent." });
      return;
    }
    if (error instanceof ConversationNotFoundError) {
      res.status(404).json({ error: "conversation_not_found", message: "Start a new conversation." });
      return;
    }
    throw error;
  }
}
