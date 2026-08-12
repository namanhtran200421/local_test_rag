import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRetrievalQuery } from "./retrieval_query.js";

describe("retrieval query construction", () => {
  it("uses recent conversation context without intent keyword routing", () => {
    const query = buildRetrievalQuery("Where is it delivered?", [{
      id: "1",
      role: "user",
      content: "Tell me about Rhythms of West Africa",
      createdAt: new Date(0).toISOString(),
    }]);

    assert.match(query, /Rhythms of West Africa/);
    assert.match(query, /Where is it delivered/);
  });

  it("returns the current message unchanged without history", () => {
    assert.equal(buildRetrievalQuery("What is the capital of France?", []), "What is the capital of France?");
  });
});
