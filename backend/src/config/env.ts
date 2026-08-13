import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(1010),
  ALLOWED_ORIGINS: z.string().default("http://localhost:4200"),
  DATABASE_URL: z.string().url().optional(),
  AI_PROVIDER: z.enum(["ollama", "deterministic"]).default("ollama"),
  OLLAMA_BASE_URL: z.string().url().default("http://127.0.0.1:11434"),
  OLLAMA_MODEL: z.string().min(1).default("qwen3:14b"),
  OLLAMA_EMBEDDING_MODEL: z.string().min(1).default("embeddinggemma"),
  AUTH_JWKS_URL: z.string().url().optional(),
  AUTH_ISSUER: z.string().url().optional(),
  AUTH_AUDIENCE: z.string().min(1).optional(),
  MVP_MANAGER_EMAIL: z.string().email().optional(),
  MVP_MANAGER_PASSWORD: z.string().min(12).optional(),
  RAG_DATA_ROOT: z.string().optional(),
  RAG_CORPUS_ROOT: z.string().optional(),
  RAG_MIN_DENSE_SCORE: z.coerce.number().min(0).max(1).default(0.27),
  MODEL_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(180_000).default(90_000),
  MODEL_REPAIR_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(180_000).default(90_000),
  ROUTER_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(180_000).default(60_000),
  MODEL_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(3).default(2),
  SERVER_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(300_000).default(210_000),
  MAX_RECOMMENDED_PROGRAMS: z.coerce.number().int().min(1).max(12).default(5),
  RAG_SCOPE_MIN_FUSED_SCORE: z.coerce.number().min(0).max(1).default(0.0105),
  RAG_SCOPE_MIN_LEXICAL_SCORE: z.coerce.number().min(0).default(1),
  RAG_SCOPE_MIN_DENSE_SCORE: z.coerce.number().min(0).max(1).default(0.3),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
}).passthrough();

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const parsed = environmentSchema.parse(source);
  if (parsed.NODE_ENV === "production") {
    const missing = ["DATABASE_URL", "AUTH_JWKS_URL", "AUTH_ISSUER", "AUTH_AUDIENCE"].filter((key) => !parsed[key as keyof Environment]);
    if (missing.length) throw new Error(`Production configuration missing: ${missing.join(", ")}`);
    if (parsed.ALLOWED_ORIGINS.includes("*")) throw new Error("Wildcard CORS is forbidden in production");
    if (parsed.AI_PROVIDER === "deterministic") throw new Error("A production model provider is required");
  }
  return parsed;
}
