import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clearRagCacheForTests, retrieveContext } from "./rag_service.js";

describe("promoted RAG index", () => {
  it("retrieves relevant real education sources from the active version", async () => {
    clearRagCacheForTests();
    const result = await retrieveContext(
      "tan",
      "West African drumming program in Victoria",
      { jurisdiction: "VIC", theme: "music" },
    );
    assert.ok(result);
    assert.ok(result.chunks.length > 0);
    assert.ok(result.chunks.some((chunk) => chunk.documentId === "program-12288"));
    assert.ok(result.chunks.every((chunk) => chunk.synthetic === false));
    assert.equal("sources" in result, false);
  });

  it("does not inject unrelated corpus content into ordinary conversation", async () => {
    clearRagCacheForTests();
    const greeting = await retrieveContext("tan", "hi");
    const arithmetic = await retrieveContext("tan", "What is 1 + 1?");

    assert.deepEqual(greeting.chunks, []);
    assert.deepEqual(arithmetic.chunks, []);
  });
});
