import { z } from "zod";

const tagsSchema = z.object({
  models: z.array(z.object({ name: z.string() })),
});

export async function modelStatus(): Promise<"available" | "unavailable" | "disabled"> {
  if (process.env.AI_PROVIDER === "deterministic") return "disabled";
  const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
  const required = new Set([
    process.env.OLLAMA_MODEL ?? "qwen3:14b",
    process.env.OLLAMA_EMBEDDING_MODEL ?? "embeddinggemma",
  ]);
  try {
    const response = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(2_500) });
    if (!response.ok) return "unavailable";
    const parsed = tagsSchema.safeParse(await response.json());
    if (!parsed.success) return "unavailable";
    const installed = new Set(parsed.data.models.map((model) => model.name));
    return [...required].every((model) => installed.has(model) || installed.has(`${model}:latest`))
      ? "available"
      : "unavailable";
  } catch {
    return "unavailable";
  }
}
