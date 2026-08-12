import { z } from "zod";
import type { AgentKey, StoredMessage } from "./chat_type.js";
import { retrieveContext, type RetrievalResult } from "./rag_service.js";

export type PurposeRoute = "purpose" | "conversation" | "out_of_scope";
export type PurposeResponseIntent = "discovery" | "entity_overview" | "specific_question";

export interface PurposeDecision {
  route: PurposeRoute;
  retrievalQuery: string;
  usesHistory: boolean;
  explicitCriteria: string[];
  missingCriteria: string[];
  responseIntent: PurposeResponseIntent;
  provider: "ollama" | "deterministic";
  model?: string;
}

export interface PurposeResolution extends PurposeDecision {
  retrieval?: RetrievalResult;
  evidenceOverride: boolean;
}

const purposes: Record<AgentKey, string> = {
  tan: "Cultural Infusion education programs, curriculum connections, packages, booking information, and public education policies",
  manager: "authorised management performance, approvals, financial boundaries, and operational risks",
  business: "authorised booking, delivery, and business operations information",
};

const conversationalReplies: Record<AgentKey, string> = {
  tan: "Hi! I can help you explore Cultural Infusion programs and curriculum connections. Tell me a location, audience, or theme—or say you’re unsure and I’ll suggest a few starting points.",
  manager: "Hi! I can help with management performance, approvals, financial boundaries, and operational risks. What would you like to review?",
  business: "Hi! I can help with booking, delivery, and business operations information. What would you like to work through?",
};

const conversationalSuggestions: Record<AgentKey, string[]> = {
  tan: ["Suggest a few programs", "Help me choose by location", "Show curriculum connections"],
  manager: ["Summarise performance", "Show pending approvals", "Explain operational risks"],
  business: ["Show booking information", "Explain delivery operations", "Help with a business query"],
};

const scopeEnvelopeSchema = z.object({
  route: z.enum(["purpose", "conversation", "out_of_scope"]),
  retrievalQuery: z.string().trim().max(500).default(""),
  usesHistory: z.boolean(),
  explicitCriteria: z.array(z.string().trim().min(1).max(100)).max(8),
  missingCriteria: z.array(z.string().trim().min(1).max(100)).max(4).default([]),
  responseIntent: z.enum(["discovery", "entity_overview", "specific_question"]).default("specific_question"),
});

const ollamaResponseSchema = z.object({
  model: z.string(),
  message: z.object({ content: z.string().trim().min(1) }),
});

function jsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      route: { type: "string", enum: ["purpose", "conversation", "out_of_scope"] },
      retrievalQuery: { type: "string" },
      usesHistory: { type: "boolean" },
      explicitCriteria: { type: "array", items: { type: "string" } },
      missingCriteria: { type: "array", items: { type: "string" } },
      responseIntent: { type: "string", enum: ["discovery", "entity_overview", "specific_question"] },
    },
    required: ["route", "retrievalQuery", "usesHistory", "explicitCriteria", "missingCriteria", "responseIntent"],
  };
}

export function purposeBoundary(agentKey: AgentKey): string {
  return `Sorry, I can only help with ${purposes[agentKey]}.`;
}

export function conversationalReply(agentKey: AgentKey): string {
  return conversationalReplies[agentKey];
}

export function conversationalPrompts(agentKey: AgentKey): string[] {
  return [...conversationalSuggestions[agentKey]];
}

function criterionTokens(value: string): string[] {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token && !["a", "an", "and", "at", "for", "in", "of", "or", "the", "to", "with"].includes(token));
}

function verifiedCriteria(criteria: string[], currentRequest: string, history: StoredMessage[], usesHistory: boolean): string[] {
  const userEvidence = [
    ...(usesHistory ? history.filter((message) => message.role === "user").map((message) => message.content) : []),
    currentRequest,
  ].join(" ").toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ");
  const evidenceTokens = new Set(userEvidence.split(/\s+/).filter(Boolean));
  return [...new Set(criteria.filter((criterion) => {
    const tokens = criterionTokens(criterion);
    return tokens.length > 0 && tokens.every((token) => evidenceTokens.has(token));
  }))];
}

function hasStrongPurposeEvidence(retrieval: RetrievalResult): boolean {
  const topScore = retrieval.chunks[0]?.score ?? 0;
  const minimumFusedScore = Number(process.env.RAG_SCOPE_MIN_FUSED_SCORE ?? 0.0105);
  const minimumLexicalScore = Number(process.env.RAG_SCOPE_MIN_LEXICAL_SCORE ?? 1);
  const minimumDenseScore = Number(process.env.RAG_SCOPE_MIN_DENSE_SCORE ?? 0.3);
  return retrieval.confidence.queryTerms > 0
    && topScore >= minimumFusedScore
    && (retrieval.confidence.maximumLexicalScore >= minimumLexicalScore
      || retrieval.confidence.maximumDenseScore >= minimumDenseScore);
}

export async function classifyPurpose(
  agentKey: AgentKey,
  currentRequest: string,
  history: StoredMessage[],
  reviewContext?: string,
): Promise<PurposeDecision> {
  // Scope routing and grounded generation intentionally share one capable
  // model. This keeps routing quality aligned with answer quality and avoids
  // loading or swapping a second, smaller language model.
  const model = process.env.OLLAMA_MODEL ?? "qwen3:14b";
  const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.ROUTER_TIMEOUT_MS ?? 60_000));

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        keep_alive: "10m",
        format: jsonSchema(),
        messages: [{
          role: "system",
          content: `Route the CURRENT_REQUEST for an assistant whose sole purpose is: ${purposes[agentKey]}.

Choose purpose when the current request directly concerns that purpose, asks for options or recommendations within it, asks for help choosing within it, or is a contextual follow-up to an earlier purpose-specific turn. A broad request to suggest, show, list, explore, or recommend programs is purpose even when the user supplies no criteria.
Choose conversation only for a greeting, thanks, farewell, or a general request for help that does not yet ask for purpose-specific information or options.
Choose out_of_scope for every other request, including general knowledge, arithmetic, writing, coding, or unrelated advice.

The current request always has priority over conversation history. History is context only and must never pull a clearly unrelated current request back into purpose. The word "program" is ambiguous: software/code requests are out_of_scope, while Cultural Infusion or education-program discovery is purpose. Set usesHistory=true only when the current request cannot be understood correctly without earlier turns. Extract explicitCriteria as short phrases containing only selection criteria whose VALUE the user actually supplied, such as "Year 5", "Victoria", or "virtual". If the user asks to compare by a criterion but has not supplied its value—for example "which suits my year level?" without naming a year—put the criterion name in missingCriteria and do not put it in explicitCriteria. A broad request for suggestions, uncertainty, or a request for help contributes no criterion. For purpose, provide a concise standalone semantic retrievalQuery that preserves only relevant context.

Set responseIntent=discovery when the user wants program options or recommendations. Set responseIntent=entity_overview when the user asks for a general introduction or to know more about one or more specifically named offerings but does not ask for a particular attribute. Set responseIntent=specific_question for comparisons or questions about curriculum, suitability, audience, duration, delivery, location, price, policy, or another particular fact. For non-purpose routes use specific_question. For other routes, use an empty retrievalQuery, usesHistory=false, and an empty explicitCriteria array. Return JSON only.${reviewContext ? `\n\nROUTE REVIEW: ${reviewContext}` : ""}`,
        }, {
          role: "user",
          content: JSON.stringify({
            CURRENT_REQUEST: currentRequest,
            RECENT_HISTORY: history.slice(-6).map(({ role, content }) => ({ role, content: content.slice(0, 1_000) })),
          }),
        }],
        options: { temperature: 0, top_p: 0.8, num_predict: 100 },
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
    const parsed = ollamaResponseSchema.parse(await response.json());
    const envelope = scopeEnvelopeSchema.parse(JSON.parse(parsed.message.content));
    if (envelope.route === "purpose" && !envelope.retrievalQuery) {
      throw new Error("Purpose route omitted its retrieval query");
    }
    return {
      route: envelope.route,
      retrievalQuery: envelope.retrievalQuery,
      usesHistory: envelope.usesHistory,
      explicitCriteria: envelope.explicitCriteria,
      missingCriteria: envelope.missingCriteria,
      responseIntent: envelope.responseIntent,
      provider: "ollama",
      model: parsed.model,
    };
  } catch {
    // Closed-by-default routing keeps model or schema failures from leaking into
    // an unrelated general-purpose answer.
    return { route: "out_of_scope", retrievalQuery: "", usesHistory: false, explicitCriteria: [], missingCriteria: [], responseIntent: "specific_question", provider: "deterministic" };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Combines semantic corpus relevance with the model's dialogue/scope decision.
 * Strong current-turn evidence wins over a flaky small-model route, while weak
 * follow-ups use the model's standalone rewrite. Old conversation state is
 * never appended directly to an unrelated retrieval query.
 */
export async function resolvePurpose(
  agentKey: AgentKey,
  currentRequest: string,
  history: StoredMessage[],
): Promise<PurposeResolution> {
  const [decision, currentRetrieval] = await Promise.all([
    classifyPurpose(agentKey, currentRequest, history),
    retrieveContext(agentKey, currentRequest, {}, 6).catch(() => undefined),
  ]);

  if (currentRetrieval && hasStrongPurposeEvidence(currentRetrieval)) {
    const reviewedDecision = decision.route === "out_of_scope"
      ? await classifyPurpose(
        agentKey,
        currentRequest,
        history,
        `Semantic retrieval found possible purpose evidence in: ${currentRetrieval.chunks.slice(0, 4).map((chunk) => chunk.title).join(", ")}. Re-evaluate the current request carefully; retrieval may be a false positive caused by ambiguous words.`,
      )
      : decision;
    if (reviewedDecision.route === "out_of_scope") {
      return {
        ...reviewedDecision,
        explicitCriteria: [],
        missingCriteria: [],
        retrieval: currentRetrieval,
        evidenceOverride: false,
      };
    }
    if (reviewedDecision.usesHistory) {
      const contextualRetrieval = reviewedDecision.retrievalQuery === currentRequest
        ? currentRetrieval
        : await retrieveContext(agentKey, reviewedDecision.retrievalQuery, {}, 6);
      return {
        ...reviewedDecision,
        route: "purpose",
        explicitCriteria: verifiedCriteria(reviewedDecision.explicitCriteria, currentRequest, history, true),
        missingCriteria: verifiedCriteria(reviewedDecision.missingCriteria, currentRequest, history, true),
        retrieval: contextualRetrieval,
        evidenceOverride: decision.route !== "purpose",
      };
    }
    return {
      ...reviewedDecision,
      route: "purpose",
      retrievalQuery: currentRequest,
      usesHistory: false,
      explicitCriteria: verifiedCriteria(reviewedDecision.explicitCriteria, currentRequest, history, false),
      missingCriteria: verifiedCriteria(reviewedDecision.missingCriteria, currentRequest, history, false),
      retrieval: currentRetrieval,
      evidenceOverride: decision.route !== "purpose",
    };
  }

  if (decision.route !== "purpose") {
    return {
      ...decision,
      explicitCriteria: [],
      missingCriteria: [],
      retrieval: currentRetrieval,
      evidenceOverride: false,
    };
  }

  // Once the scope router has classified a request as purpose-specific, the
  // evidence layer is mandatory. Do not silently turn a broken index or
  // embedding service into an ungrounded model request.
  const retrieval = decision.retrievalQuery === currentRequest
    ? currentRetrieval ?? await retrieveContext(agentKey, currentRequest, {}, 6)
    : await retrieveContext(agentKey, decision.retrievalQuery, {}, 6);
  return {
    ...decision,
    explicitCriteria: verifiedCriteria(decision.explicitCriteria, currentRequest, history, decision.usesHistory),
    missingCriteria: verifiedCriteria(decision.missingCriteria, currentRequest, history, decision.usesHistory),
    ...(retrieval ? { retrieval } : {}),
    evidenceOverride: false,
  };
}
