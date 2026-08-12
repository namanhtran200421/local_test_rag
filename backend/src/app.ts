import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { databaseStatus } from "./config/db.js";
import { modelStatus } from "./config/model.js";
import { log } from "./observability/logger.js";
import { chatRouter } from "./module/chat/chat_route.js";
import { ragIndexStatus } from "./module/chat/rag_service.js";
import { authRouter } from "./module/internal/auth_route.js";
import { internalRouter } from "./module/internal/internal_route.js";

const app = express();
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS ?? "http://localhost:4200").split(",").map((origin) => origin.trim()));
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) callback(null, true);
    else callback(new Error("Origin is not allowed"));
  },
  methods: ["GET", "POST"], allowedHeaders: ["content-type", "authorization", "x-request-id"],
  exposedHeaders: ["x-request-id"], credentials: true, maxAge: 600,
}));
app.use(express.json({ limit: "8kb", strict: true, type: "application/json" }));
app.use((req, res, next) => {
  const supplied = req.header("x-request-id");
  req.requestId = supplied && /^[a-zA-Z0-9_-]{8,80}$/.test(supplied) ? supplied : randomUUID();
  res.setHeader("x-request-id", req.requestId);
  const started = performance.now();
  res.on("finish", () => log("info", "http_request", {
    requestId: req.requestId, method: req.method, route: req.route?.path ?? req.path,
    status: res.statusCode, durationMs: Math.round(performance.now() - started),
  }));
  next();
});

const publicLimiter = rateLimit({
  windowMs: 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: "rate_limited", message: "Please wait before trying again." }),
});
const internalLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });

app.get("/health/live", (_req, res) => res.status(200).json({ status: "ok" }));
app.get("/health/ready", async (_req, res) => {
  const [database, model, knowledge] = await Promise.all([databaseStatus(), modelStatus(), ragIndexStatus()]);
  const databaseReady = process.env.NODE_ENV !== "production" || database === "connected";
  const modelReady = model === "available" || model === "disabled";
  const ready = databaseReady && modelReady && knowledge === "available";
  res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready", database, model, knowledge });
});
app.get("/health", async (_req, res) => res.status(200).json({ status: "ok", database: await databaseStatus() }));
app.use("/api/public", publicLimiter, chatRouter);
app.use("/api/auth", authLimiter, authRouter);
app.use("/api/internal", internalLimiter, internalRouter);

app.use((_req, res) => res.status(404).json({ error: "not_found", message: "The requested resource was not found." }));
app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  log("error", "request_failed", { requestId: req.requestId, reason: error instanceof Error ? error.name : "UnknownError" });
  if (!res.headersSent) res.status(500).json({ error: "internal_error", message: "Something went wrong. Please try again." });
});

export default app;
