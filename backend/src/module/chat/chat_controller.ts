import type { Request, Response } from "express";
import { chat } from "./chat_service.js";
import { ConversationNotFoundError } from "./chat_service.js";
import { chatRequestSchema } from "./chat_type.js";
import { GuardrailError } from "./guardrail_service.js";
import { RagUnavailableError } from "./rag_service.js";
import {
  acceptsProgressStream,
  startProgressStream,
  writeProgress,
  writeResult,
  writeStreamError,
  type StreamError,
} from "./chat_stream.js";

function publicError(error: unknown): StreamError {
  if (error instanceof GuardrailError) return { status: 400, error: error.code, message: error.message };
  if (error instanceof RagUnavailableError) return { status: 503, error: "knowledge_unavailable", message: "The approved knowledge source is temporarily unavailable." };
  if (error instanceof ConversationNotFoundError) return { status: 404, error: "conversation_not_found", message: "This conversation has expired. Please start a new one." };
  return { status: 500, error: "internal_error", message: "Something went wrong. Please try again." };
}

export async function postChat(req: Request, res: Response): Promise<void> {
  const parsed = chatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "invalid_request",
      message: "Send a message of up to 2,000 characters and a valid conversation ID.",
    });
    return;
  }

  if (acceptsProgressStream(req)) {
    const stopHeartbeat = startProgressStream(res);
    try {
      writeResult(res, await chat(parsed.data, { onProgress: (update) => writeProgress(res, update) }));
    } catch (error) {
      writeStreamError(res, publicError(error));
    } finally {
      stopHeartbeat();
      res.end();
    }
    return;
  }

  try {
    res.status(200).json(await chat(parsed.data));
  } catch (error) {
    if (error instanceof GuardrailError) {
      res.status(400).json({ error: error.code, message: error.message });
      return;
    }
    if (error instanceof RagUnavailableError) {
      res.status(503).json({ error: "knowledge_unavailable", message: "The approved knowledge source is temporarily unavailable." });
      return;
    }
    if (error instanceof ConversationNotFoundError) {
      res.status(404).json({
        error: "conversation_not_found",
        message: "This conversation has expired. Please start a new one.",
      });
      return;
    }
    throw error;
  }
}
