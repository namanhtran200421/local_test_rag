# Tan frontend

Angular and Tailwind UI for the Cultural Infusion RAG preview. Public users see only Tan. Manager and business workspaces appear after an authenticated session, and the API independently enforces the matching role.

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
