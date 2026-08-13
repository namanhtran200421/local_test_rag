# Tan frontend

Angular and Tailwind UI for the Cultural Infusion RAG preview. Public users see the Education assistant, Tan. After an authenticated session, staff can also use Bob to search the indexed Cultural Infusion Atlas snapshot. The API independently enforces the internal role.

## Development

Start the API on port `1010`, then run:

```bash
npm install
npm start
```

Open `http://localhost:4200/`. The development proxy forwards `/api` and `/health` to the backend.

## Verification

```bash
npm run build
npm test -- --watch=false
npm audit --omit=dev
```

The tests cover workspace/session isolation, wrong-agent response rejection, pending-state isolation, login behavior and expired staff sessions. The root operations runbook contains the complete release gate.
