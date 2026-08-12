# RAG threat model

| Threat | Control | Verification |
|---|---|---|
| Direct prompt injection | Deterministic pre-retrieval patterns; model cannot alter policy | Guardrail unit tests |
| Indirect injection in PDFs | Retrieved text labelled untrusted; no tool calls; structured output | Corpus red-team tests |
| Cross-agent data exposure | Physical indexes, access labels, role-bound routes and conversations | Isolation tests |
| Hallucinated sources | Model citation IDs checked against retrieved allowlist | Generation validation |
| Ungrounded organisation-specific answers | Purpose routing, lexical grounding score and deterministic fallback; optional Bedrock grounding | Routing tests, output tests and RAG evals |
| Unrelated/general-purpose requests | Schema-constrained scope router plus semantic review; agent-specific boundary without corpus access | Live route evaluation and stale-context tests |
| False preference claims | Only criteria verified against user-role text reach generation; neutral recommendation framing required when none exist | Generation contract and live evaluation |
| Secret/PII leakage | Input redaction, public blocking, output secret patterns, no raw prompt logs | Guardrail tests and log review |
| Unauthorised action claims | Internal prompts plus deterministic action-claim rejection | Guardrail tests |
| Session tampering | Server-issued IDs and PostgreSQL-owned state; internal owner binding | Conversation tests |
| Cost/availability abuse | WAF/API throttling, body limits, timeouts, bounded context and model tokens | Load/security tests |
| Poisoned publication | Hash inventory, access checks, immutable staging, regression gate, atomic pointer | Pipeline tests |

## Residual risks

Pattern checks do not eliminate prompt injection. Grounding overlap is not proof of factual correctness, and semantic scope routing can still misclassify unusual language. This is why unrelated requests do not enter general-purpose generation and why the live route suite is a release gate. Before handling real personal or commercial data, add organisation-approved data classification, retention, DLP, incident response, human-review thresholds, adversarial evaluation and managed model guardrails.
