# Tan user-testing release

Tan is a three-agent cultural education assistant with isolated retrieval, local model inference, server-owned state and deterministic security boundaries.

## Agents

| Agent | Access | Knowledge index | Model |
|---|---|---|---|
| Public Tan | Unauthenticated, rate limited | Real education catalog, curriculum brochures and public education information from `csv/` | `qwen3:14b` |
| Manager Agent | Authenticated manager session | Manager-only policy and reporting corpus | `qwen3:14b` |
| Business Agent | Authenticated business-user session | Business operations corpus | `qwen3:14b` |

Internal agents are hidden until staff sign in. The MVP login creates an eight-hour, HTTP-only, SameSite session cookie and the API independently enforces the session role on every internal request. External JWT validation through a configured JWKS remains available for a production identity provider.

Local demo accounts:

| Role | Email | Password |
|---|---|---|
| Manager | `manager@demo.local` | `manager-demo` |
| Business staff | `business@demo.local` | `business-demo` |

Override these outside local development with `MVP_MANAGER_EMAIL`, `MVP_MANAGER_PASSWORD`, `MVP_BUSINESS_EMAIL`, and `MVP_BUSINESS_PASSWORD`. Production has no default demo credentials.

## Request path

```text
Runtime validation → authentication/RBAC → input guardrails
→ current-turn semantic retrieval + structured scope routing
   ├─ greeting / help / thanks → small actionable reply
   ├─ out of scope → agent-specific purpose boundary
   └─ purpose-specific question → mandatory agent-bound hybrid retrieval
      → citation + program allowlists → grounded Qwen generation
→ leak/action checks
→ PostgreSQL state + audit event → safe response
```

The assistants are intentionally not general-purpose chatbots. They keep greetings and uncertain-help turns natural and actionable, but redirect unrelated requests to the current agent's purpose. Purpose-specific answers require approved evidence; a missing index returns `503 knowledge_unavailable` instead of an ungrounded answer. Routing combines a structured small-model decision with current-turn semantic evidence, so terse requests such as “show programs” work without phrase-by-phrase hard-coding and old conversation state cannot turn an unrelated question into a recommendation.

Retrieval combines `embeddinggemma` cosine similarity with lexical relevance. The public, manager and business indexes are physically separated and independently versioned. Source names and retrieved text stay server-side. The model never chooses a role or index, and its citation/program IDs are checked against server-owned allowlists before the response reaches the UI.

## Local setup

Start Ollama and ensure both models exist:

```bash
ollama pull qwen3:14b
ollama pull embeddinggemma
```

Qwen3 14B handles both structured scope routing and grounded answer generation, while `embeddinggemma` produces retrieval embeddings. Sharing one language model keeps routing and answer quality aligned and avoids swapping a second model into unified memory. The official Ollama Qwen3 14B build is a 9.3 GB Q4_K_M quantization; measured grounded responses on the reference 24 GB M4 Pro take roughly 31–38 seconds when warm.

Build the three indexes:

```bash
cd rag
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python generate_internal_corpus.py
python ingest_production.py --agent manager
python ingest_production.py --agent business
python ingest_education.py
python -m unittest test_production_index.py
```

Start the API and frontend in separate terminals:

```bash
cd backend
npm install
npm run db:migrate
npm run dev
```

```bash
cd frontend/chatbot
npm install
npm start
```

Open `http://localhost:4200`. The local API runs on port `1010`.

## Verification

```bash
cd backend && npm run check && npm audit --omit=dev
cd backend && npm run eval:live
cd frontend/chatbot && npm run build && npm test -- --watch=false && npm audit --omit=dev
cd rag && .venv/bin/python -m unittest test_production_index.py
```

`npm run eval:live` expects the API, PostgreSQL, Ollama and promoted indexes to be running. It exercises greetings, uncertain requests, broad and criteria-based discovery, ambiguous “program” wording, stale-context isolation, arithmetic boundaries and prompt attacks against the real local model.

## Production deployment gates

This build is suitable for supervised MVP user testing. Public education answers use the supplied real-data export in `csv/`; manager and business data and local demo identities remain synthetic. Before a public launch:

- place the public data export under an owner-approved publication and refresh process;
- replace the synthetic manager and business corpora with authorised internal sources;
- configure company SSO/Cognito, WAF/API Gateway, secrets management and distributed quotas;
- deploy PostgreSQL with backups, encryption, retention and deletion policies;
- select a private managed or self-hosted inference deployment with capacity and failover;
- complete privacy, cultural-authority, legal, accessibility, adversarial and load reviews;
- configure alerts, incident response, restore drills and controlled index rollback.

See [production architecture](documentation/architecture/production-rag.md), [threat model](documentation/security/threat-model.md), and [operations runbook](documentation/operations/runbook.md).
