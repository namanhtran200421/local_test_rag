import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

const programSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  audiences: z.array(z.string().min(1)).min(1),
  availability: z.array(z.string().min(1)).min(1),
  genres: z.array(z.string().min(1)).min(1),
  regions: z.array(z.string().min(1)).min(1),
  searchTerms: z.array(z.string().min(1)).min(1),
  bookingUrl: z.url(),
  imageTone: z.enum(["coral", "gold", "teal", "violet"]),
}).strict();

const publicCatalogSchema = z.object({
  programs: z.array(programSchema),
}).strict();

export type ProgramRecord = z.infer<typeof programSchema>;
type PublicCatalog = z.infer<typeof publicCatalogSchema>;

let cachedCatalog: { version: string; data: PublicCatalog } | undefined;

export async function loadPublicCatalog(): Promise<PublicCatalog> {
  const dataRoot = process.env.RAG_DATA_ROOT ?? resolve(process.cwd(), "../rag/data");
  const pointer = z.object({ version: z.string(), path: z.string(), agent: z.literal("public") })
    .parse(JSON.parse(await readFile(resolve(dataRoot, "public", "current.json"), "utf8")));
  if (cachedCatalog?.version === pointer.version) return cachedCatalog.data;
  const rawCatalog = await readFile(resolve(dataRoot, "public", pointer.path, "catalog.json"), "utf8");
  const data = publicCatalogSchema.parse(JSON.parse(rawCatalog));
  cachedCatalog = { version: pointer.version, data };
  return data;
}

export function clearCatalogCacheForTests(): void {
  cachedCatalog = undefined;
}
