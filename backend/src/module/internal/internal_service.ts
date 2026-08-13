import { appendMessage, createConversation, findConversation, updateConversationState } from "../chat/chat_repo.js";
import { ConversationNotFoundError } from "../chat/chat_service.js";
import { generateAnswer } from "../chat/generation_service.js";
import { inspectInput } from "../chat/guardrail_service.js";
import {
  conversationalPrompts,
  conversationalReply,
  purposeBoundary,
  resolvePurpose,
} from "../chat/purpose_scope.js";
import type { ChatOptions, ChatResponse, InternalChatRequest } from "../chat/chat_type.js";
import type { AuthenticatedUser } from "./internal_type.js";

export class ForbiddenAgentError extends Error {}

function enforceRole(user: AuthenticatedUser, agentKey: InternalChatRequest["agentKey"]): void {
  const permitted = agentKey === "manager" && user.role === "manager";
  if (!permitted) throw new ForbiddenAgentError("Role does not permit this agent");
}

export async function internalChat(
  request: InternalChatRequest,
  user: AuthenticatedUser,
  options?: ChatOptions,
): Promise<ChatResponse> {
  enforceRole(user, request.agentKey);
  const guardedInput = inspectInput(request.message, request.agentKey);
  const conversation = request.conversationId
    ? await findConversation(request.conversationId, request.agentKey, user.id)
    : await createConversation(request.agentKey, user.id);
  if (!conversation || conversation.agentKey !== request.agentKey) {
    throw new ConversationNotFoundError("Conversation not found");
  }

  const priorMessages = conversation.messages.slice();
  await appendMessage(conversation, "user", guardedInput.safeText);
  const modelEnabled = options?.useModel ?? process.env.AI_PROVIDER !== "deterministic";
  options?.onProgress?.({
    stage: "understanding",
    label: "Understanding your request",
    detail: "Checking your authorised workspace knowledge",
  });
  const scope = modelEnabled
    ? await resolvePurpose(request.agentKey, guardedInput.safeText, priorMessages)
    : undefined;
  if (scope && scope.route !== "purpose") {
    const isConversation = scope.route === "conversation";
    const content = isConversation
      ? conversationalReply(request.agentKey)
      : purposeBoundary(request.agentKey);
    await updateConversationState(conversation, {
      recommendedProgramIds: [],
      lastAnswerMode: "general",
    });
    const assistantMessage = await appendMessage(conversation, "assistant", content);
    return {
      conversationId: conversation.id,
      agentKey: request.agentKey,
      message: assistantMessage,
      programs: [],
      suggestions: isConversation ? conversationalPrompts(request.agentKey) : [],
      status: "complete",
      generation: {
        provider: scope.provider,
        ...(scope.model ? { model: scope.model } : {}),
        needsHumanReview: false,
      },
      safety: { grounded: false, fallbackUsed: false },
    };
  }

  const retrieval = scope?.retrieval;
  options?.onProgress?.({
    stage: "generating",
    label: retrieval?.chunks.length ? "Preparing a grounded answer" : "Preparing your answer",
    detail: "Using only information authorised for this workspace",
  });
  const generation = await generateAnswer({
    agentKey: request.agentKey,
    userMessage: guardedInput.safeText,
    fallback: "I’m having trouble generating a response right now. Please try again in a moment.",
    context: retrieval?.chunks ?? [],
    memory: scope?.usesHistory ? conversation.state : { ...conversation.state, recommendedProgramIds: [] },
    history: scope?.usesHistory ? priorMessages : [],
    explicitCriteria: scope?.explicitCriteria ?? [],
    responseIntent: scope?.responseIntent,
    useModel: options?.useModel,
  });
  options?.onProgress?.({
    stage: "verifying",
    label: "Checking the answer",
    detail: "Verifying scope, safety and access boundaries",
  });

  await updateConversationState(conversation, {
    yearLevel: undefined,
    yearFlexible: undefined,
    jurisdiction: undefined,
    theme: undefined,
    lastAnswerMode: generation.grounded ? "grounded" : "general",
  });
  const assistantMessage = await appendMessage(conversation, "assistant", generation.content);

  console.info(JSON.stringify({
    level: "info",
    event: "internal_agent_invoked",
    userId: user.id,
    role: user.role,
    agentKey: request.agentKey,
    conversationId: conversation.id,
    interactionType: generation.grounded ? "grounded" : "general",
    retrievalVersion: retrieval?.version,
    retrievalMethod: retrieval?.method ?? "unavailable",
    retrievedChunks: retrieval?.chunks.length ?? 0,
    scopeEvidenceOverride: scope?.evidenceOverride ?? false,
    modelProvider: generation.provider,
    modelAttempts: generation.attempts,
    inputRedacted: guardedInput.redacted,
    fallbackUsed: generation.guardrails.usedFallback,
  }));

  return {
    conversationId: conversation.id,
    agentKey: request.agentKey,
    message: assistantMessage,
    programs: [],
    suggestions: generation.suggestions,
    status: generation.status,
    generation: {
      provider: generation.provider,
      ...(generation.model ? { model: generation.model } : {}),
      needsHumanReview: generation.needsHumanReview,
    },
    safety: {
      grounded: generation.guardrails.grounded,
      fallbackUsed: generation.guardrails.usedFallback,
    },
  };
}
