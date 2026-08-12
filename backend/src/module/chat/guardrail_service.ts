import type { AgentKey } from "./chat_type.js";
import type { RagChunk } from "./rag_service.js";

export class GuardrailError extends Error {
  constructor(public readonly code: "prompt_attack" | "sensitive_data" | "unsafe_output", message: string) { super(message); }
}

const promptAttackPatterns = [
  /ignore\s+(all|any|the|previous|prior).{0,40}(instruction|prompt|rule)/i,
  /(reveal|show|print|repeat).{0,30}(system prompt|developer message|hidden instruction|secret|credential)/i,
  /\b(jailbreak|do anything now|developer mode)\b/i,
  /(bypass|disable|remove).{0,25}(guardrail|security|permission|policy)/i,
  /<\|(?:system|assistant|developer)\|>/i,
];
const sensitivePatterns = [
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._~-]{16,}\b/gi,
  /\b(?:\d[ -]*?){13,19}\b/g,
  /\b(?:password|secret|api[_ -]?key)\s*[:=]\s*\S+/gi,
];
const actionClaimPattern = /\b(?:I have|I've|we have|we've)\s+(?:approved|sent|booked|refunded|cancelled|updated|assigned|published)\b/i;

export interface InputGuardrailResult { safeText: string; redacted: boolean }
export interface OutputGuardrailResult { content: string; grounded: boolean; usedFallback: boolean; groundingScore: number }
interface GroundingProgram {
  title: string;
  summary: string;
  audiences?: string[];
  availability?: string[];
  genres?: string[];
}

export function inspectInput(message: string, agentKey: AgentKey): InputGuardrailResult {
  if (promptAttackPatterns.some((pattern) => pattern.test(message))) {
    throw new GuardrailError("prompt_attack", "I can’t process instructions that attempt to override security or access controls.");
  }
  let safeText = message;
  let redacted = false;
  for (const pattern of sensitivePatterns) {
    safeText = safeText.replace(pattern, () => { redacted = true; return "[REDACTED]"; });
  }
  if (agentKey === "tan" && redacted) {
    throw new GuardrailError("sensitive_data", "Please remove credentials, payment information, or other sensitive data before using the public assistant.");
  }
  return { safeText, redacted };
}

function significantTokens(value: string): string[] {
  const stop = new Set(["about", "after", "again", "also", "before", "being", "could", "from", "have", "into", "more", "should", "that", "their", "there", "these", "they", "this", "through", "with", "would", "your"]);
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((token) => token.length > 3 && !stop.has(token));
}

export function inspectOutput(
  content: string,
  fallback: string,
  agentKey: AgentKey,
  context: RagChunk[],
  programs: GroundingProgram[],
): OutputGuardrailResult {
  if (sensitivePatterns.some((pattern) => { pattern.lastIndex = 0; return pattern.test(content); })) {
    return { content: fallback, grounded: false, usedFallback: true, groundingScore: 0 };
  }
  if (agentKey !== "tan" && actionClaimPattern.test(content)) {
    return { content: `${fallback} No action has been performed.`, grounded: false, usedFallback: true, groundingScore: 0 };
  }
  const reference = significantTokens([
    ...context.map((chunk) => `${chunk.title} ${chunk.content}`),
    ...programs.map((program) => `${program.title} ${program.summary} ${(program.audiences ?? []).join(" ")} ${(program.availability ?? []).join(" ")} ${(program.genres ?? []).join(" ")}`),
  ].join(" "));
  const referenceSet = new Set(reference);
  const outputTokens = significantTokens(content);
  const groundingScore = outputTokens.length ? outputTokens.filter((token) => referenceSet.has(token)).length / outputTokens.length : 0;
  const sanitizedContent = content
    .replaceAll("**", "")
    .replace(/\s*\(?\s*citedDocumentIds\s*:\s*\[\s*\]\s*\)?\s*$/i, "")
    .trim()
    .slice(0, 4_000);
  return { content: sanitizedContent, grounded: context.length > 0 || programs.length > 0, usedFallback: false, groundingScore };
}
