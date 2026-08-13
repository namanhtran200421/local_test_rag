# Operations runbook

## Required production gates

- Replace demo tokens with Cognito/company SSO and verify issuer, audience, signature and groups.
- Store database and provider credentials in Secrets Manager or equivalent.
- Run `npm run db:migrate` as a controlled deployment job.
- Tan owns only the dedicated PostgreSQL `tan` schema; never point migrations at unrelated application tables.
- Publish real documents only after legal, curriculum, cultural-authority and data-owner approval.
- Configure WAF/API Gateway distributed quotas; do not rely solely on Express limits.
- Define transcript retention, deletion, DLP and access-review policies.
- Run prompt-injection, cross-index, load, rollback and disaster-recovery exercises.
- Run the live behavior evaluation against the exact model and index versions being promoted.

## Index promotion

```bash
cd rag
source .venv/bin/activate
python generate_internal_corpus.py
python ingest_production.py --agent all
python -m unittest test_production_index.py
```

Retain the prior immutable version. Roll back by atomically replacing an agent's `data/<agent>/current.json` with a validated prior pointer.

## Health and alerts

- `/health/live`: process liveness
- `/health/ready`: database, required Ollama models and both promoted indexes; returns `503` when a dependency is unavailable
- Alert on 5xx rate, latency, model fallbacks, guardrail blocks, retrieval failures, auth failures and ingestion evaluation regressions.
- Logs must never contain raw messages, embeddings, tokens, passwords or retrieved chunks.

## Release verification

With PostgreSQL, Ollama and the API running:

```bash
cd backend
npm run check
npm run eval:live
npm audit --omit=dev

cd ../frontend/chatbot
npm run build
npm test -- --watch=false
npm audit --omit=dev

cd ../../rag
.venv/bin/python -m unittest test_production_index.py
```

Do not promote if `/health/ready` is non-200 or any live behavior case fails. Treat synthetic corpus content and demo staff identities as a preview-only configuration.

The M4 Pro reference configuration uses `qwen3:14b` for both scope routing and generation, with a 60-second router timeout and 90-second per-attempt generation timeouts within a 210-second request timeout. `embeddinggemma` remains the only other required model. Re-run the live suite after changing a quantization, model tag or timeout; model presence alone is not a release gate.
