# Production RAG architecture

## Trust boundaries

Education and Bob are separate security principals. Each request is deterministically mapped to exactly one agent and exactly one immutable index. The model never chooses an index or role.

```text
Public request ─────────────────────→ public index ────→ Tan prompt
Internal session/JWT + role=manager → manager index ───→ Bob prompt
```

Documents, index pointers, chunks, embedding matrices, prompts, conversations, and audit events preserve this boundary. Corpus documents and source metadata are never returned by the chat API.

## Online request path

1. Edge rate limits and payload limits.
2. Runtime schema validation rejects unknown fields.
3. HTTP-only staff-session or signed JWT validation and deterministic RBAC for internal requests.
4. Input guardrails reject prompt attacks and redact sensitive values.
5. Server-owned conversation state is loaded from PostgreSQL.
6. Current-turn retrieval and a schema-constrained Qwen scope decision run concurrently. Strong lexical/semantic evidence can recover terse purpose requests; the classifier reviews ambiguous evidence such as “program” before it is accepted.
7. Greetings, thanks and uncertain-help turns receive concise actionable conversation responses. Unrelated requests receive the current agent's purpose boundary. Neither path receives corpus data or program cards.
8. Purpose requests use a standalone semantic query. Conversation history is included only when the classifier explicitly marks the current request as a contextual follow-up; old recommendations are never appended to an unrelated current query.
9. The authorised immutable index is searched using a normalised query embedding and BM25 lexical scores combined with reciprocal-rank fusion. A purpose route requires this evidence layer; retrieval failure returns a service error rather than invoking ungrounded generation.
10. Results are grouped by document, bounded by a context budget, and limited to the caller's fixed access partition.
11. One adaptive Qwen pass receives only verified user-stated criteria, bounded relevant history, bounded evidence and approved structured records. The model does not write persistent user preferences.
12. Citation IDs and program IDs are schema-validated and allowlisted. Catalog names are reconciled back to IDs to tolerate safe small-model formatting omissions, and prose/card consistency is validated from the catalog.
13. Secrets, action claims, prompt attacks, output formatting, and evidence-presence guardrails run independently of answer intent.
14. Invalid structured output receives one bounded, temperature-zero repair attempt with the validation reason and ID allowlists. Non-critical metadata is sanitized rather than failing the answer. Only repeated, unsupported, or unsafe failures reach the neutral availability response; no domain answer is synthesized in application code.
15. Retrieval versions, methods, counts, scope overrides, provider outcomes, request IDs and fallback events are logged without raw prompts.

The normal grounded path performs scope classification and one cached embedding request concurrently, followed by one generation request. Query embeddings use a bounded LRU cache, dense vectors are cosine-normalised, irrelevant retrieval is discarded before generation, and prompt context is capped to avoid wasting inference tokens. A second generation request occurs only when the first response fails the contract.

## Ingestion path

`ingest_education.py` builds only the public index from the repository-level `csv/` export. It validates the exact inventory and CSV schemas, hashes every source, extracts page-aware PDF text and the URL workbook, creates a versioned program catalog and postcode lookup, verifies finite embeddings, and requires all public retrieval regression cases to pass before atomic promotion.

`ingest_production.py` builds Bob's physically separated Atlas snapshot under the compatibility key `manager`. Ingestion writes an immutable staging directory and changes only Bob's agent pointer after validation.

## Production adapters

The repository runs Ollama locally. A managed deployment should place inference behind a private endpoint or implement a Bedrock provider using the same generation contract. PostgreSQL is mandatory in production. WAF/API Gateway or an equivalent distributed edge layer remains mandatory because process-local rate limiting cannot coordinate across replicas.

The local reference deployment uses Qwen3 14B for both the schema-constrained scope decision and grounded answer generation, while `embeddinggemma` powers hybrid retrieval. Sharing the language model avoids a lower-capability routing bottleneck and eliminates local model swapping between routing and generation.
