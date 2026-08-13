import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { clearConversationsForTests } from "../chat/chat_repo.js";
import { ConversationNotFoundError } from "../chat/chat_service.js";
import { internalChat } from "./internal_service.js";

const originalFetch = globalThis.fetch;

beforeEach(clearConversationsForTests);
afterEach(() => { globalThis.fetch = originalFetch; });

function installScopeRoute(route: "purpose" | "conversation" | "out_of_scope"): void {
  globalThis.fetch = async (input) => {
    if (String(input).endsWith("/api/embed")) {
      const vector = Array<number>(768).fill(0);
      vector[0] = 1;
      return new Response(JSON.stringify({ embeddings: [vector] }), { status: 200 });
    }
    return new Response(JSON.stringify({
      model: "test-model",
      message: { content: JSON.stringify({
        route,
        retrievalQuery: route === "purpose" ? "Cultural Infusion Atlas information" : "",
        usesHistory: false,
        explicitCriteria: [],
        missingCriteria: [],
        responseIntent: "specific_question",
      }) },
    }), { status: 200 });
  };
}

describe("internal agents", () => {
  it("allows an authorised user to use Bob's stable internal agent key", async () => {
    const response = await internalChat(
      { agentKey: "manager", message: "Summarise the Atlas methodology" },
      { id: "manager-1", role: "manager" },
      { useModel: false },
    );
    assert.equal(response.agentKey, "manager");
    assert.match(response.message.content, /trouble generating a response/i);
  });

  it("keeps greetings actionable without opening the RAG pipeline", async () => {
    installScopeRoute("conversation");
    const response = await internalChat(
      { agentKey: "manager", message: "hi" },
      { id: "manager-1", role: "manager" },
    );

    assert.match(response.message.content, /Bob/i);
    assert.match(response.message.content, /Atlas website/i);
    assert.equal(response.generation.provider, "ollama");
    assert.ok(response.suggestions.length > 0);
    assert.equal("sources" in response, false);
  });

  it("keeps Bob conversations isolated by user", async () => {
    const response = await internalChat(
      { agentKey: "manager", message: "Explain an Atlas map" },
      { id: "staff-1", role: "manager" },
      { useModel: false },
    );
    await assert.rejects(
      () => internalChat(
        { agentKey: "manager", conversationId: response.conversationId, message: "Summary" },
        { id: "staff-2", role: "manager" },
        { useModel: false },
      ),
      ConversationNotFoundError,
    );
  });
});
