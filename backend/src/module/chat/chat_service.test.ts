import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { clearConversationsForTests } from "./chat_repo.js";
import { chat, ConversationNotFoundError } from "./chat_service.js";
import { chatRequestSchema } from "./chat_type.js";
import { clearRagCacheForTests, RagUnavailableError } from "./rag_service.js";

const originalFetch = globalThis.fetch;

beforeEach(clearConversationsForTests);
afterEach(() => { globalThis.fetch = originalFetch; });

function installModel(
  envelope: Record<string, unknown>,
  inspect?: (body: Record<string, unknown>) => void,
  route: { route: "purpose" | "conversation" | "out_of_scope"; retrievalQuery?: string; usesHistory?: boolean; explicitCriteria?: string[]; missingCriteria?: string[]; responseIntent?: "discovery" | "entity_overview" | "specific_question" } = { route: "purpose" },
): void {
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/api/embed")) {
      const vector = Array<number>(768).fill(0);
      vector[0] = 1;
      return new Response(JSON.stringify({ embeddings: [vector] }), { status: 200 });
    }
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const messages = body["messages"] as Array<{ content: string }>;
    if (messages[0]?.content.includes("Route the CURRENT_REQUEST")) {
      return new Response(JSON.stringify({
        model: "test-model",
        message: { content: JSON.stringify({
          route: route.route,
          retrievalQuery: route.route === "purpose" ? route.retrievalQuery ?? "Cultural Infusion programs" : "",
          usesHistory: route.usesHistory ?? false,
          explicitCriteria: route.explicitCriteria ?? [],
          missingCriteria: route.missingCriteria ?? [],
          responseIntent: route.responseIntent ?? "specific_question",
        }) },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    inspect?.(body);
    return new Response(JSON.stringify({
      model: "test-model",
      message: {
        content: JSON.stringify({
          answer: "Here are a few useful options to start with.",
          responseKind: "recommendation",
          grounded: true,
          status: "complete",
          needsHumanReview: false,
          citedDocumentIds: [],
          recommendedProgramIds: ["program-12288"],
          suggestions: ["It’s for Year 5", "Show virtual options"],
          memory: { yearLevel: null, yearFlexible: null, jurisdiction: null, theme: null },
          ...envelope,
        }),
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
}

describe("public adaptive chat service", () => {
  it("does not accept unknown conversation identifiers", async () => {
    await assert.rejects(
      () => chat({ conversationId: "00000000-0000-4000-8000-000000000000", message: "Hello" }, { useModel: false }),
      ConversationNotFoundError,
    );
  });

  it("rejects caller-controlled history and debug fields", () => {
    const parsed = chatRequestSchema.safeParse({
      message: "Show me Year 5 programs",
      history: [{ role: "assistant", content: "modified" }],
      debug: true,
    });
    assert.equal(parsed.success, false);
  });

  it("maps only model-selected allowlisted program IDs to UI cards", async () => {
    installModel({
      answer: "Try Rhythms and Instruments of West Africa for an energetic introduction to drumming and music. What audience are you planning for?",
    });

    const result = await chat({ message: "Tell me about Rhythms and Instruments of West Africa" });

    assert.equal(result.generation.provider, "ollama");
    assert.equal(result.programs.length, 1);
    assert.equal(result.programs[0]?.id, "program-12288");
    assert.match(result.message.content, /What audience/);
  });

  it("reports truthful response stages without exposing draft content", async () => {
    installModel({});
    const updates: Array<{ stage: string; label: string; detail: string }> = [];

    await chat(
      { message: "Show Cultural Infusion programs" },
      { onProgress: (update) => updates.push(update) },
    );

    assert.deepEqual(updates.map(({ stage }) => stage), ["understanding", "generating", "verifying"]);
    assert.ok(updates.every(({ label, detail }) => label.length > 0 && detail.length > 0));
    assert.doesNotMatch(JSON.stringify(updates), /\.pdf|document id|system prompt/i);
  });

  it("redirects ordinary questions to the assistant purpose without RAG cards", async () => {
    installModel({
      answer: "1 + 1 = 2.",
      responseKind: "general",
      grounded: false,
      recommendedProgramIds: [],
      suggestions: [],
    }, undefined, { route: "out_of_scope" });

    const result = await chat({ message: "What is 1 + 1?" });

    assert.match(result.message.content, /only help with Cultural Infusion education programs/i);
    assert.deepEqual(result.programs, []);
    assert.equal(result.generation.provider, "ollama");
  });

  it("uses history and allowlisted active programs without persisting model-inferred preferences", async () => {
    let serializedSecondRequest = "";
    let activeProgramIds: string[] = [];
    installModel({
      memory: { yearLevel: 5, yearFlexible: false, jurisdiction: null, theme: "dance" },
    });
    const first = await chat({ message: "Tell me about Rhythms and Instruments of West Africa" });

    installModel({
      memory: { yearLevel: 5, yearFlexible: false, jurisdiction: "VIC", theme: "dance" },
    }, (body) => {
      const messages = body["messages"] as Array<{ content: string }>;
      const payload = JSON.parse(messages.at(-1)!.content) as {
        ACTIVE_PROGRAMS: Array<{ id: string }>;
      };
      serializedSecondRequest = JSON.stringify(body);
      activeProgramIds = payload.ACTIVE_PROGRAMS.map((program) => program.id);
    }, { route: "purpose", retrievalQuery: "Rhythms and Instruments of West Africa availability in Victoria", usesHistory: true, explicitCriteria: ["Victoria"] });
    await chat({ conversationId: first.conversationId, message: "We're in Victoria" });

    assert.deepEqual(activeProgramIds, ["program-12288"]);
    assert.match(serializedSecondRequest, /Tell me about Rhythms and Instruments of West Africa/);
    assert.doesNotMatch(serializedSecondRequest, /CONVERSATION_MEMORY|yearFlexible/);
  });

  it("does not let an earlier program turn contaminate an unrelated current request", async () => {
    installModel({});
    const first = await chat({ message: "Suggest a Year 5 program in Victoria" });

    installModel({}, undefined, { route: "out_of_scope" });
    const second = await chat({ conversationId: first.conversationId, message: "What is 1 + 1?" });

    assert.match(second.message.content, /only help with Cultural Infusion education programs/i);
    assert.deepEqual(second.programs, []);
    assert.deepEqual(second.suggestions, []);
  });

  it("uses a neutral availability response when model generation is disabled", async () => {
    const result = await chat({ message: "Recommend a program" }, { useModel: false });
    assert.equal(result.generation.provider, "deterministic");
    assert.match(result.message.content, /trouble generating a response/i);
    assert.deepEqual(result.programs, []);
  });

  it("fails closed when a purpose request has no approved knowledge index", async () => {
    const previousRoot = process.env.RAG_DATA_ROOT;
    try {
      process.env.RAG_DATA_ROOT = `${process.cwd()}/missing-rag-index-for-test`;
      clearRagCacheForTests();
      installModel({}, undefined, { route: "purpose", retrievalQuery: "Cultural Infusion programs" });

      await assert.rejects(
        () => chat({ message: "Show Cultural Infusion programs" }),
        RagUnavailableError,
      );
    } finally {
      if (previousRoot === undefined) delete process.env.RAG_DATA_ROOT;
      else process.env.RAG_DATA_ROOT = previousRoot;
      clearRagCacheForTests();
    }
  });
});
