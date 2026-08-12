import {
  appendMessage,
  createConversation,
  findConversation,
  updateConversationState,
} from "./chat_repo.js";
import { loadPublicCatalog } from "./catalog_service.js";
import type { ProgramRecord } from "./catalog_service.js";
import { generateAnswer } from "./generation_service.js";
import { inspectInput } from "./guardrail_service.js";
import {
  conversationalPrompts,
  conversationalReply,
  purposeBoundary,
  resolvePurpose,
} from "./purpose_scope.js";
import type { ChatOptions, ChatRequest, ChatResponse, ProgramMatch } from "./chat_type.js";

export class ConversationNotFoundError extends Error {}

const modelUnavailableMessage = "I’m having trouble generating a response right now. Please try again in a moment.";

function toProgramMatch(program: ProgramRecord): ProgramMatch {
  return {
    id: program.id,
    title: program.title,
    summary: program.summary,
    audience: program.audiences.join(", "),
    availability: program.availability.join(", "),
    theme: program.genres.slice(0, 2).join(" & "),
    bookingUrl: program.bookingUrl,
    imageTone: program.imageTone,
  };
}

function normalized(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Public chat is deliberately scoped. Semantic retrieval and a bounded router
 * distinguish grounded purpose questions from lightweight conversation and
 * out-of-scope requests before generation receives any catalogue data.
 */
export async function chat(request: ChatRequest, options?: ChatOptions): Promise<ChatResponse> {
  const guardedInput = inspectInput(request.message, "tan");
  const conversation = request.conversationId
    ? await findConversation(request.conversationId, "tan")
    : await createConversation("tan");

  if (!conversation || conversation.agentKey !== "tan") {
    throw new ConversationNotFoundError("Conversation not found");
  }

  const priorMessages = conversation.messages.slice();
  await appendMessage(conversation, "user", guardedInput.safeText);

  const modelEnabled = options?.useModel ?? process.env.AI_PROVIDER !== "deterministic";
  options?.onProgress?.({
    stage: "understanding",
    label: "Understanding your request",
    detail: modelEnabled
      ? "Checking the request against approved knowledge"
      : "Preparing the available response",
  });
  const scope = modelEnabled
    ? await resolvePurpose("tan", guardedInput.safeText, priorMessages)
    : undefined;
  if (scope && scope.route !== "purpose") {
    const isConversation = scope.route === "conversation";
    const content = isConversation ? conversationalReply("tan") : purposeBoundary("tan");
    await updateConversationState(conversation, {
      recommendedProgramIds: [],
      lastAnswerMode: "general",
    });
    const assistantMessage = await appendMessage(conversation, "assistant", content);
    return {
      conversationId: conversation.id,
      agentKey: "tan",
      message: assistantMessage,
      programs: [],
      suggestions: isConversation ? conversationalPrompts("tan") : [],
      status: "complete",
      generation: {
        provider: scope.provider,
        ...(scope.model ? { model: scope.model } : {}),
        needsHumanReview: false,
      },
      safety: { grounded: false, fallbackUsed: false },
    };
  }

  let programs: ProgramRecord[] = [];
  let contextualProgramIds: string[] = [];
  const retrieval = scope?.retrieval;
  if (modelEnabled) {
    const catalog = await loadPublicCatalog().catch(() => undefined);
    if (catalog && retrieval?.chunks.length) {
      const rankedIds = retrieval.chunks.flatMap((chunk) => chunk.programId ? [chunk.programId] : []);
      const activeIds = scope?.usesHistory ? conversation.state.recommendedProgramIds ?? [] : [];
      const recentAssistantText = scope?.usesHistory
        ? ` ${normalized(priorMessages.filter((message) => message.role === "assistant").slice(-4).map((message) => message.content).join(" "))} `
        : "";
      const recoveredIds = scope?.usesHistory
        ? catalog.programs
          .filter((program) => recentAssistantText.includes(` ${normalized(program.title)} `))
          .map((program) => program.id)
        : [];
      contextualProgramIds = [...new Set([...activeIds, ...recoveredIds])];
      const currentRequest = ` ${normalized(guardedInput.safeText)} `;
      const exactIds = catalog.programs
        .filter((program) => currentRequest.includes(` ${normalized(program.title)} `))
        .map((program) => program.id);
      const order = [...new Set([...exactIds, ...contextualProgramIds, ...rankedIds])].slice(0, 12);
      const byId = new Map(catalog.programs.map((program) => [program.id, program]));
      programs = order.flatMap((id) => {
        const program = byId.get(id);
        return program ? [program] : [];
      });
    }
  }
  const context = retrieval?.chunks ?? [];

  options?.onProgress?.({
    stage: "generating",
    label: retrieval?.chunks.length ? "Preparing a grounded answer" : "Preparing your answer",
    detail: retrieval?.chunks.length
      ? "Using relevant Cultural Infusion information"
      : "Keeping the response focused and useful",
  });
  const generation = await generateAnswer({
    agentKey: "tan",
    userMessage: guardedInput.safeText,
    fallback: modelUnavailableMessage,
    context,
    programs,
    memory: scope?.usesHistory
      ? { ...conversation.state, recommendedProgramIds: contextualProgramIds }
      : { ...conversation.state, recommendedProgramIds: [] },
    history: scope?.usesHistory ? priorMessages : [],
    explicitCriteria: scope?.explicitCriteria ?? [],
    missingCriteria: scope?.missingCriteria ?? [],
    responseIntent: scope?.responseIntent,
    useModel: options?.useModel,
  });

  options?.onProgress?.({
    stage: "verifying",
    label: "Checking the answer",
    detail: "Verifying scope, safety and program details",
  });

  await updateConversationState(conversation, {
    yearLevel: undefined,
    yearFlexible: undefined,
    jurisdiction: undefined,
    theme: undefined,
    recommendedProgramIds: generation.recommendedProgramIds.length
      ? generation.recommendedProgramIds
      : generation.status === "needs_clarification" || scope?.usesHistory
        ? contextualProgramIds
        : [],
    lastAnswerMode: generation.grounded ? "grounded" : "general",
  });
  const assistantMessage = await appendMessage(conversation, "assistant", generation.content);
  const programById = new Map(programs.map((program) => [program.id, program]));
  const matches = generation.recommendedProgramIds.flatMap((id) => {
    const program = programById.get(id);
    return program ? [toProgramMatch(program)] : [];
  });

  console.info(JSON.stringify({
    level: "info",
    event: "public_agent_invoked",
    agentKey: "tan",
    conversationId: conversation.id,
    interactionType: generation.grounded ? "grounded" : "general",
    retrievalVersion: retrieval?.version,
    retrievalMethod: retrieval?.method ?? "unavailable",
    retrievedChunks: context.length,
    scopeEvidenceOverride: scope?.evidenceOverride ?? false,
    modelProvider: generation.provider,
    modelAttempts: generation.attempts,
    inputRedacted: guardedInput.redacted,
    fallbackUsed: generation.guardrails.usedFallback,
  }));

  return {
    conversationId: conversation.id,
    agentKey: "tan",
    message: assistantMessage,
    programs: matches,
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
