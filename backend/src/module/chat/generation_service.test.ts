import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { generateAnswer } from "./generation_service.js";

const originalFetch = globalThis.fetch;
const originalMaximumAttempts = process.env.MODEL_MAX_ATTEMPTS;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalMaximumAttempts === undefined) delete process.env.MODEL_MAX_ATTEMPTS;
  else process.env.MODEL_MAX_ATTEMPTS = originalMaximumAttempts;
});

function modelResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    model: "test-model",
    message: {
      content: JSON.stringify({
        answer: "A helpful response.",
        responseKind: "general",
        grounded: false,
        status: "complete",
        needsHumanReview: false,
        citedDocumentIds: [],
        recommendedProgramIds: [],
        suggestions: [],
        memory: { yearLevel: null, yearFlexible: null, jurisdiction: null, theme: null },
        ...overrides,
      }),
    },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

const program = {
  id: "program-12288",
  sourceId: "12288",
  title: "Rhythms of West Africa",
  summary: "Students explore West African rhythms, songs and instruments.",
  audiences: ["Community", "Pre Primary", "Schools"],
  availability: ["ACT", "NSW", "QLD", "SA", "VIC", "WA"],
  genres: ["Music"],
  regions: ["Africa"],
  searchTerms: ["music", "dance", "drumming"],
  bookingUrl: "https://education.culturalinfusion.com/school-programs/",
  imageTone: "gold" as const,
};

const additionalPrograms = ["One", "Two", "Three"].map((suffix, index) => ({
  ...program,
  id: `program-${index + 1}`,
  sourceId: String(index + 1),
  title: `Program ${suffix}`,
}));

describe("adaptive answer generation", () => {
  it("answers general knowledge naturally without citations or program cards", async () => {
    let requestBody: Record<string, unknown> | undefined;
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return modelResponse({ answer: "Paris is the capital of France." });
    };

    const result = await generateAnswer({
      agentKey: "tan",
      userMessage: "What is the capital of France?",
      fallback: "Model unavailable.",
      context: [],
      programs: [program],
    });

    assert.equal(result.content, "Paris is the capital of France.");
    assert.equal(result.provider, "ollama");
    assert.equal(result.grounded, false);
    assert.deepEqual(result.recommendedProgramIds, []);
    assert.match(JSON.stringify(requestBody), /request has already passed scope routing/i);
  });

  it("can help with an underspecified recommendation instead of refusing", async () => {
    globalThis.fetch = async () => modelResponse({
      answer: "A lively place to start is Rhythms of West Africa, which combines drumming and dance. What age group are you planning for?",
      responseKind: "recommendation",
      grounded: true,
      recommendedProgramIds: [program.id],
      suggestions: ["It’s for Year 5", "Show me virtual options"],
    });

    const result = await generateAnswer({
      agentKey: "tan",
      userMessage: "I need recommendations but don't know where to start",
      fallback: "Model unavailable.",
      context: [],
      programs: [program],
    });

    assert.equal(result.grounded, true);
    assert.deepEqual(result.recommendedProgramIds, [program.id]);
    assert.match(result.content, /What age group/);
  });

  it("repairs generic preference claims when the user supplied no criteria", async () => {
    let calls = 0;
    globalThis.fetch = async (_input, init) => {
      calls += 1;
      if (calls === 1) {
        return modelResponse({
          answer: "Based on your preferences, here are a few program options.",
          responseKind: "recommendation",
          grounded: true,
          recommendedProgramIds: [program.id],
        });
      }
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      assert.match(body.messages[0]!.content, /Generic personalization framing is unsupported/);
      return modelResponse({
        answer: "Here are a few program options to get you started.",
        responseKind: "recommendation",
        grounded: true,
        recommendedProgramIds: [program.id],
      });
    };

    const result = await generateAnswer({
      agentKey: "tan",
      userMessage: "Can you suggest some programs?",
      fallback: "Model unavailable.",
      context: [],
      programs: [program],
    });

    assert.equal(calls, 2);
    assert.equal(result.content, "Here are a few program options to get you started.");
    assert.doesNotMatch(result.content, /preferences/i);
  });

  it("passes named catalog entities to a direct program-detail answer", async () => {
    let calls = 0;
    globalThis.fetch = async (_input, init) => {
      calls += 1;
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const payload = JSON.parse(body.messages.at(-1)!.content) as {
        REQUESTED_PROGRAMS: Array<{ id: string }>;
      };
      assert.deepEqual(payload.REQUESTED_PROGRAMS.map(({ id }) => id), [program.id]);

      return modelResponse({
        answer: "Rhythms of West Africa is a 50-minute at-school program where students explore drumming, movement and ensemble participation. It is designed for Foundation to Year 9.",
        responseKind: "grounded_answer",
        grounded: true,
        recommendedProgramIds: [program.id],
      });
    };

    const result = await generateAnswer({
      agentKey: "tan",
      userMessage: "I want to know more about Rhythms of West Africa",
      fallback: "Model unavailable.",
      context: [],
      programs: [program, ...additionalPrograms],
    });

    assert.equal(calls, 1);
    assert.equal(result.provider, "ollama");
    assert.match(result.content, /^Rhythms of West Africa is/);
    assert.deepEqual(result.recommendedProgramIds, [program.id]);
    assert.deepEqual(result.suggestions, [
      "Show its curriculum connections",
      "Who is it suitable for?",
      "Where is it available?",
    ]);
  });

  it("uses allowlisted catalog details when named-program model repair is exhausted", async () => {
    process.env.MODEL_MAX_ATTEMPTS = "1";
    globalThis.fetch = async () => modelResponse({
      answer: "Here are a few program options for you: Rhythms of West Africa.",
      responseKind: "recommendation",
      grounded: true,
      recommendedProgramIds: [program.id],
    });

    const result = await generateAnswer({
      agentKey: "tan",
      userMessage: "Tell me more about Rhythms of West Africa",
      fallback: "Model unavailable.",
      context: [],
      programs: [program],
    });

    assert.equal(result.provider, "deterministic");
    assert.equal(result.grounded, true);
    assert.match(result.content, /^Rhythms of West Africa:/);
    assert.match(result.content, /Community, Pre Primary, Schools/);
    assert.match(result.content, /ACT, NSW, QLD, SA, VIC, WA/);
    assert.deepEqual(result.recommendedProgramIds, [program.id]);
  });

  it("asks for a missing comparison value instead of showing a model-error fallback", async () => {
    globalThis.fetch = async () => modelResponse({
      answer: "Based on your preferences, I can compare these options.",
      responseKind: "clarification",
      grounded: false,
      status: "needs_clarification",
    });

    const result = await generateAnswer({
      agentKey: "tan",
      userMessage: "Which suits my year level?",
      fallback: "Model unavailable.",
      context: [],
      programs: [program],
      memory: { recommendedProgramIds: [program.id] },
      explicitCriteria: [],
      missingCriteria: ["year level"],
      responseIntent: "specific_question",
    });

    assert.equal(result.provider, "deterministic");
    assert.equal(result.status, "needs_clarification");
    assert.equal(result.content, "What year level should I use to compare those programs?");
    assert.equal(result.guardrails.usedFallback, false);
  });

  it("explains insufficient comparison evidence instead of showing a model-error fallback", async () => {
    globalThis.fetch = async () => modelResponse({
      answer: "Based on your needs, this is the best option.",
      responseKind: "recommendation",
      grounded: true,
      recommendedProgramIds: [program.id],
    });

    const result = await generateAnswer({
      agentKey: "tan",
      userMessage: "Year 7",
      fallback: "Model unavailable.",
      context: [],
      programs: [program],
      memory: { recommendedProgramIds: [] },
      explicitCriteria: [],
      responseIntent: "specific_question",
    });

    assert.equal(result.provider, "deterministic");
    assert.match(result.content, /doesn't provide enough detail to verify/i);
    assert.match(result.content, /Year 7/);
    assert.equal(result.guardrails.usedFallback, false);
  });

  it("removes internal program identifiers from otherwise valid visible prose", async () => {
    globalThis.fetch = async () => modelResponse({
      answer: "Rhythms of West Africa (program-12288) explores West African music.",
      responseKind: "recommendation",
      grounded: true,
      recommendedProgramIds: [program.id],
    });

    const result = await generateAnswer({
      agentKey: "tan",
      userMessage: "Show a West African music program",
      fallback: "Model unavailable.",
      context: [],
      programs: [program],
      explicitCriteria: ["West African music"],
      responseIntent: "discovery",
    });

    assert.doesNotMatch(result.content, /program-12288/i);
    assert.match(result.content, /Rhythms of West Africa/);
  });

  it("repairs a malformed first response instead of showing the fallback", async () => {
    let calls = 0;
    globalThis.fetch = async (_input, init) => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({
          model: "test-model",
          message: { content: "not valid JSON" },
        }), { status: 200 });
      }
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      assert.match(body.messages[0]!.content, /RESPONSE REPAIR/);
      return modelResponse({ answer: "Here are a few useful options.", responseKind: "general" });
    };

    const result = await generateAnswer({
      agentKey: "tan",
      userMessage: "I don't know which programs to choose",
      fallback: "Model unavailable.",
      context: [],
    });

    assert.equal(calls, 2);
    assert.equal(result.provider, "ollama");
    assert.equal(result.attempts, 2);
    assert.equal(result.content, "Here are a few useful options.");
  });

  it("repairs empty recommendation shells that would leave the UI without options", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return calls === 1
        ? modelResponse({
            answer: "Here are a few programs you might want to explore.",
            responseKind: "recommendation",
            grounded: true,
            citedDocumentIds: ["program-rhythms"],
            recommendedProgramIds: [],
          })
        : modelResponse({
            answer: "Rhythms of West Africa is one varied place to start.",
            responseKind: "recommendation",
            grounded: true,
            citedDocumentIds: ["program-rhythms"],
            recommendedProgramIds: [program.id],
          });
    };

    const result = await generateAnswer({
      agentKey: "tan",
      userMessage: "I don't know which programs to choose",
      fallback: "Model unavailable.",
      context: [{
        id: "program-rhythms:0",
        documentId: "program-rhythms",
        title: "Program guide",
        filename: "program.pdf",
        jurisdiction: "AU",
        years: "Foundation–Year 9",
        topics: ["dance"],
        synthetic: true,
        access: "public",
        content: "Rhythms of West Africa is a drumming and dance program.",
      }],
      programs: [program],
    });

    assert.equal(result.provider, "ollama");
    assert.equal(result.attempts, 2);
    assert.deepEqual(result.recommendedProgramIds, [program.id]);
  });

  it("does not ask the model to create persistent user preferences", async () => {
    let serializedRequest = "";
    globalThis.fetch = async (_input, init) => {
      serializedRequest = String(init?.body);
      return modelResponse({
        memory: { yearFlexible: true, theme: "national programs" },
      });
    };

    const result = await generateAnswer({
      agentKey: "tan",
      userMessage: "I don't know which programs to choose",
      fallback: "Model unavailable.",
      context: [],
    });

    assert.equal(result.provider, "ollama");
    assert.doesNotMatch(serializedRequest, /CONVERSATION_MEMORY|yearFlexible|national programs/);
    assert.equal("memory" in result, false);
  });

  it("sanitizes non-critical suggestion metadata without discarding the answer", async () => {
    globalThis.fetch = async () => modelResponse({
      answer: "A useful answer.",
      suggestions: ["x".repeat(180)],
    });

    const result = await generateAnswer({
      agentKey: "tan",
      userMessage: "Help me choose",
      fallback: "Model unavailable.",
      context: [],
    });

    assert.equal(result.provider, "ollama");
    assert.equal(result.attempts, 1);
    assert.equal(result.suggestions[0]?.length, 72);
  });

  it("keeps prose and cards consistent when the model names several valid programs", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return calls === 1
        ? modelResponse({
            answer: "Rhythms of West Africa, Program One, Program Two and Program Three are options.",
            responseKind: "recommendation",
            grounded: true,
            recommendedProgramIds: [program.id, ...additionalPrograms.map((item) => item.id)],
          })
        : modelResponse({
            answer: "Rhythms of West Africa, Program One and Program Two are varied starting points.",
            responseKind: "recommendation",
            grounded: true,
            recommendedProgramIds: [program.id, additionalPrograms[0]!.id, additionalPrograms[1]!.id],
          });
    };

    const result = await generateAnswer({
      agentKey: "tan",
      userMessage: "I don't know which programs to choose",
      fallback: "Model unavailable.",
      context: [],
      programs: [program, ...additionalPrograms],
    });

    assert.equal(result.provider, "ollama");
    assert.equal(result.attempts, 1);
    assert.equal(result.recommendedProgramIds.length, 4);
    assert.match(result.content, /Program Three/);
  });

  it("reconciles approved program names when a small model omits structured IDs", async () => {
    globalThis.fetch = async () => modelResponse({
      answer: "Rhythms of West Africa is a lively introduction to drumming and dance.",
      responseKind: "recommendation",
      grounded: false,
      recommendedProgramIds: [],
    });

    const result = await generateAnswer({
      agentKey: "tan",
      userMessage: "Where should I start?",
      fallback: "Model unavailable.",
      context: [],
      programs: [program],
    });

    assert.equal(result.grounded, true);
    assert.deepEqual(result.recommendedProgramIds, [program.id]);
  });

  it("drops stray invalid metadata when the answer still has valid catalog support", async () => {
    globalThis.fetch = async () => modelResponse({
      answer: "Rhythms of West Africa is a varied place to start.",
      responseKind: "recommendation",
      grounded: true,
      recommendedProgramIds: [program.id, "not-a-catalog-id"],
    });

    const result = await generateAnswer({
      agentKey: "tan",
      userMessage: "Show me a program",
      fallback: "Model unavailable.",
      context: [],
      programs: [program],
    });

    assert.equal(result.provider, "ollama");
    assert.equal(result.attempts, 1);
    assert.deepEqual(result.recommendedProgramIds, [program.id]);
  });

  it("fails closed if the model invents a program identifier", async () => {
    process.env.MODEL_MAX_ATTEMPTS = "2";
    let calls = 0;
    globalThis.fetch = async () => modelResponse({
      answer: "Try the invented program.",
      responseKind: "recommendation",
      grounded: true,
      recommendedProgramIds: ["invented-program"],
    });

    const result = await generateAnswer({
      agentKey: "tan",
      userMessage: "Recommend a program",
      fallback: "Model unavailable.",
      context: [],
      programs: [program],
    });

    assert.equal(result.provider, "deterministic");
    assert.equal(result.content, "Model unavailable.");
    assert.deepEqual(result.recommendedProgramIds, []);
    assert.equal(result.attempts, 2);
  });

  it("rejects organisation claims that have no allowlisted support", async () => {
    globalThis.fetch = async () => modelResponse({
      answer: "The organisation guarantees next-day delivery.",
      responseKind: "grounded_answer",
      grounded: true,
    });

    const result = await generateAnswer({
      agentKey: "tan",
      userMessage: "Do you guarantee next-day delivery?",
      fallback: "Model unavailable.",
      context: [],
      programs: [program],
    });

    assert.equal(result.provider, "deterministic");
    assert.equal(result.guardrails.usedFallback, true);
  });
});
