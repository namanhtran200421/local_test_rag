import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { clearConversationsForTests } from "../chat/chat_repo.js";
import { ConversationNotFoundError } from "../chat/chat_service.js";
import { ForbiddenAgentError, internalChat } from "./internal_service.js";

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
        retrievalQuery: route === "purpose" ? "authorised manager information" : "",
        usesHistory: false,
        explicitCriteria: [],
      }) },
    }), { status: 200 });
  };
}

describe("internal agents", () => {
  it("allows a manager to use only the manager agent", async () => {
    const response = await internalChat(
      { agentKey: "manager", message: "Show pending approvals" },
      { id: "manager-1", role: "manager" },
      { useModel: false },
    );
    assert.equal(response.agentKey, "manager");
    assert.match(response.message.content, /trouble generating a response/i);
    await assert.rejects(
      () => internalChat(
        { agentKey: "business", message: "Show bookings" },
        { id: "manager-1", role: "manager" },
        { useModel: false },
      ),
      ForbiddenAgentError,
    );
  });

  it("keeps greetings actionable without opening the RAG pipeline", async () => {
    installScopeRoute("conversation");
    const response = await internalChat(
      { agentKey: "manager", message: "hi" },
      { id: "manager-1", role: "manager" },
    );

    assert.match(response.message.content, /help with management performance/i);
    assert.equal(response.generation.provider, "ollama");
    assert.ok(response.suggestions.length > 0);
    assert.equal("sources" in response, false);
  });

  it("keeps conversations isolated by agent and user", async () => {
    const response = await internalChat(
      { agentKey: "business", message: "Show bookings" },
      { id: "staff-1", role: "business_user" },
      { useModel: false },
    );
    await assert.rejects(
      () => internalChat(
        { agentKey: "manager", conversationId: response.conversationId, message: "Summary" },
        { id: "manager-1", role: "manager" },
        { useModel: false },
      ),
      ConversationNotFoundError,
    );
    await assert.rejects(
      () => internalChat(
        { agentKey: "business", conversationId: response.conversationId, message: "Summary" },
        { id: "staff-2", role: "business_user" },
        { useModel: false },
      ),
      ConversationNotFoundError,
    );
  });
});
