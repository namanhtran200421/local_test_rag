import { z } from "zod";

export const chatRequestSchema = z
  .object({
    conversationId: z.uuid().optional(),
    message: z.string().trim().min(1).max(2_000),
  })
  .strict();

// Keep the stable `manager` storage key so existing conversations and the
// isolated index continue to work; the user-facing identity is Bob.
export const internalAgentSchema = z.enum(["manager"]);
export const internalChatRequestSchema = chatRequestSchema.extend({
  agentKey: internalAgentSchema,
}).strict();

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type InternalChatRequest = z.infer<typeof internalChatRequestSchema>;
export type AgentKey = "tan" | z.infer<typeof internalAgentSchema>;
export type MessageRole = "user" | "assistant";
export type ChatProgressStage = "understanding" | "generating" | "verifying";

export interface ChatProgressUpdate {
  stage: ChatProgressStage;
  label: string;
  detail: string;
}

export interface ChatOptions {
  useModel?: boolean;
  onProgress?: (update: ChatProgressUpdate) => void;
}

export interface ConversationState {
  yearLevel?: number;
  yearFlexible?: boolean;
  jurisdiction?: string;
  theme?: string;
  recommendedProgramIds?: string[];
  lastAnswerMode?: "general" | "grounded";
}

export interface StoredMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  agentKey: AgentKey;
  ownerUserId?: string;
  state: ConversationState;
  messages: StoredMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ProgramMatch {
  id: string;
  title: string;
  summary: string;
  audience: string;
  availability: string;
  theme: string;
  bookingUrl: string;
  imageTone: "coral" | "gold" | "teal" | "violet";
}

export interface ChatResponse {
  conversationId: string;
  agentKey: AgentKey;
  message: StoredMessage;
  programs: ProgramMatch[];
  suggestions: string[];
  status: "complete" | "needs_clarification";
  generation: {
    provider: "ollama" | "deterministic";
    model?: string;
    needsHumanReview?: boolean;
  };
  safety?: {
    grounded: boolean;
    fallbackUsed: boolean;
  };
}
