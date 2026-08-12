import type { StoredMessage } from "./chat_type.js";

const MAX_RETRIEVAL_HISTORY_CHARACTERS = 2_400;

/**
 * Creates a self-contained semantic search query from recent conversation turns.
 * This deliberately contains no intent keywords or domain-specific cases: the
 * embedding retriever and response model decide what is relevant.
 */
export function buildRetrievalQuery(message: string, history: StoredMessage[]): string {
  const turns = history
    .slice(-6)
    .map((item) => `${item.role}: ${item.content}`)
    .join("\n")
    .slice(-MAX_RETRIEVAL_HISTORY_CHARACTERS);
  return turns ? `${turns}\nuser: ${message}` : message;
}
