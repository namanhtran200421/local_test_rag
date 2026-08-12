import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import type { AgentKey, ConversationState } from "./chat_type.js";

type IndexName = "public" | "manager" | "business";

interface RagPointer { version: string; path: string; agent: IndexName }
interface RagManifest {
  version: string;
  agent: IndexName;
  access: IndexName;
  chunkCount: number;
  embeddingModel: string;
  embeddingDimensions: [number, number];
  artifacts?: { postcodes?: string };
}
export interface RagChunk {
  id: string;
  documentId: string;
  title: string;
  filename: string;
  jurisdiction: string;
  years: string;
  topics: string[];
  synthetic: boolean;
  access: IndexName;
  content: string;
  sourceType?: "program" | "public_document" | "page_directory";
  programId?: string;
}
export interface RetrievalResult {
  version: string;
  index: IndexName;
  method: "hybrid" | "lexical";
  chunks: Array<RagChunk & { score: number }>;
  confidence: {
    queryTerms: number;
    maximumLexicalScore: number;
    maximumDenseScore: number;
  };
}
interface CachedIndex {
  manifest: RagManifest;
  chunks: RagChunk[];
  embeddings: Float32Array;
  termCounts: Map<string, number>[];
  documentLengths: number[];
  averageDocumentLength: number;
  documentFrequency: Map<string, number>;
  postcodeStates: Map<string, string[]>;
}

const caches = new Map<IndexName, CachedIndex>();
const embeddingCache = new Map<string, number[]>();
const MAX_EMBEDDING_CACHE_ENTRIES = 128;
const MAX_CONTEXT_CHARACTERS = 10_000;
const RRF_K = 60;
const embedResponseSchema = z.object({ embeddings: z.array(z.array(z.number())).length(1) });
const stopWords = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "can", "could", "did", "do", "does",
  "for", "from", "had", "has", "have", "how", "i", "if", "in", "into", "is", "it", "its", "me", "my",
  "of", "on", "or", "our", "please", "should", "that", "the", "their", "them", "then", "there", "these",
  "they", "this", "to", "us", "was", "we", "were", "what", "when", "where", "which", "who", "why", "will",
  "with", "would", "you", "your",
]);

export class RagUnavailableError extends Error {}

function indexForAgent(agentKey: AgentKey): IndexName {
  return agentKey === "tan" ? "public" : agentKey;
}

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !/^\d+$/.test(token) && !stopWords.has(token));
}

function countTerms(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

async function loadIndex(indexName: IndexName): Promise<CachedIndex> {
  const root = process.env.RAG_DATA_ROOT ?? resolve(process.cwd(), "../rag/data");
  const pointer = JSON.parse(await readFile(resolve(root, indexName, "current.json"), "utf8")) as RagPointer;
  const cached = caches.get(indexName);
  if (cached?.manifest.version === pointer.version) return cached;
  if (pointer.agent !== indexName) throw new RagUnavailableError("RAG pointer access mismatch");

  const versionRoot = resolve(root, indexName, pointer.path);
  const manifest = JSON.parse(await readFile(resolve(versionRoot, "manifest.json"), "utf8")) as RagManifest;
  if (manifest.agent !== indexName || manifest.access !== indexName) {
    throw new RagUnavailableError("RAG manifest access mismatch");
  }
  const rawChunks = await readFile(resolve(versionRoot, "chunks.jsonl"), "utf8");
  const chunks = rawChunks.trim().split("\n").map((line) => JSON.parse(line) as RagChunk);
  if (chunks.length !== manifest.chunkCount || chunks.some((chunk) => chunk.access !== indexName)) {
    throw new RagUnavailableError("RAG chunk access or count mismatch");
  }
  const embeddingBuffer = await readFile(resolve(versionRoot, "embeddings.f32"));
  const [rows, columns] = manifest.embeddingDimensions;
  if (embeddingBuffer.byteLength !== rows * columns * 4 || rows !== chunks.length) {
    throw new RagUnavailableError("RAG embedding dimensions mismatch");
  }
  const copy = new Uint8Array(embeddingBuffer.byteLength);
  copy.set(embeddingBuffer);
  const embeddings = new Float32Array(copy.buffer);
  const tokenLists = chunks.map((chunk) => tokens(`${chunk.title} ${chunk.topics.join(" ")} ${chunk.content}`));
  const termCounts = tokenLists.map(countTerms);
  const documentLengths = tokenLists.map((list) => list.length);
  const averageDocumentLength = documentLengths.reduce((total, length) => total + length, 0) / Math.max(documentLengths.length, 1);
  const documentFrequency = new Map<string, number>();
  for (const counts of termCounts) {
    for (const token of counts.keys()) documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
  }
  let postcodeStates = new Map<string, string[]>();
  if (indexName === "public" && manifest.artifacts?.postcodes) {
    const rawPostcodes = JSON.parse(await readFile(resolve(versionRoot, manifest.artifacts.postcodes), "utf8")) as Record<string, string[]>;
    postcodeStates = new Map(Object.entries(rawPostcodes));
  }
  const loaded = { manifest, chunks, embeddings, termCounts, documentLengths, averageDocumentLength, documentFrequency, postcodeStates };
  caches.set(indexName, loaded);
  return loaded;
}

function queryWithResolvedPostcodes(query: string, index: CachedIndex): string {
  const resolved = [...new Set(
    [...query.matchAll(/\b\d{4}\b/g)]
      .flatMap((match) => index.postcodeStates.get(match[0]) ?? []),
  )];
  return resolved.length ? `${query}\nAustralian location state: ${resolved.join(", ")}` : query;
}

function normalize(vector: number[]): number[] | null {
  const norm = Math.sqrt(vector.reduce((total, value) => total + value * value, 0));
  if (!Number.isFinite(norm) || norm === 0) return null;
  return vector.map((value) => value / norm);
}

async function embedQuery(query: string, model: string): Promise<number[] | null> {
  const cacheKey = `${model}\u0000${query}`;
  const cached = embeddingCache.get(cacheKey);
  if (cached) {
    embeddingCache.delete(cacheKey);
    embeddingCache.set(cacheKey, cached);
    return cached;
  }

  const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${baseUrl}/api/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, input: query, truncate: true, keep_alive: "10m" }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const parsed = embedResponseSchema.safeParse(await response.json());
    if (!parsed.success) return null;
    const embedding = normalize(parsed.data.embeddings[0]!);
    if (!embedding) return null;
    embeddingCache.set(cacheKey, embedding);
    if (embeddingCache.size > MAX_EMBEDDING_CACHE_ENTRIES) {
      embeddingCache.delete(embeddingCache.keys().next().value!);
    }
    return embedding;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function bm25Score(queryTerms: Map<string, number>, index: CachedIndex, chunkIndex: number): number {
  const k1 = 1.2;
  const b = 0.75;
  let score = 0;
  for (const [term, queryFrequency] of queryTerms) {
    const termFrequency = index.termCounts[chunkIndex]!.get(term) ?? 0;
    if (!termFrequency) continue;
    const frequency = index.documentFrequency.get(term) ?? 0;
    const idf = Math.log(1 + (index.chunks.length - frequency + 0.5) / (frequency + 0.5));
    const lengthNormalization = 1 - b + b * (index.documentLengths[chunkIndex]! / index.averageDocumentLength);
    score += queryFrequency * idf * ((termFrequency * (k1 + 1)) / (termFrequency + k1 * lengthNormalization));
  }
  return score;
}

function rankMap(scores: number[], minimum: number): Map<number, number> {
  const sorted = scores
    .map((score, index) => ({ score, index }))
    .filter(({ score }) => score > minimum)
    .sort((left, right) => right.score - left.score);
  return new Map(sorted.map(({ index }, rank) => [index, rank + 1]));
}

function mergeByDocument(ranked: Array<RagChunk & { score: number }>, limit: number): Array<RagChunk & { score: number }> {
  const groups = new Map<string, Array<RagChunk & { score: number }>>();
  for (const item of ranked) {
    const group = groups.get(item.documentId) ?? [];
    if (group.length < 2) group.push(item);
    groups.set(item.documentId, group);
  }

  const documents = [...groups.values()]
    .map((parts) => ({
      ...parts[0]!,
      content: parts.map((part) => part.content).join("\n\n").slice(0, 4_000),
    }))
    .sort((left, right) => right.score - left.score);

  const selected: Array<RagChunk & { score: number }> = [];
  let characters = 0;
  for (const document of documents) {
    if (selected.length >= limit) break;
    if (selected.length && characters + document.content.length > MAX_CONTEXT_CHARACTERS) continue;
    selected.push(document);
    characters += document.content.length;
  }
  return selected;
}

export async function retrieveContext(
  agentKey: AgentKey,
  query: string,
  state: ConversationState = {},
  limit = 5,
): Promise<RetrievalResult> {
  const indexName = indexForAgent(agentKey);
  let index: CachedIndex;
  try {
    index = await loadIndex(indexName);
  } catch (error) {
    throw error instanceof RagUnavailableError
      ? error
      : new RagUnavailableError("The approved knowledge index is unavailable");
  }

  // Conversation state must never make an unrelated current turn appear
  // relevant. Follow-up rewriting happens before retrieval and is explicitly
  // validated by the scope service.
  void state;
  const retrievalQuery = queryWithResolvedPostcodes(query, index);
  const queryTerms = countTerms(tokens(retrievalQuery));
  const queryEmbedding = await embedQuery(retrievalQuery, index.manifest.embeddingModel);
  const columns = index.manifest.embeddingDimensions[1];
  const denseAvailable = queryEmbedding?.length === columns;

  const lexicalScores = index.chunks.map((_chunk, chunkIndex) => bm25Score(queryTerms, index, chunkIndex));
  const denseScores = index.chunks.map((_chunk, chunkIndex) => {
    if (!denseAvailable) return 0;
    const offset = chunkIndex * columns;
    let similarity = 0;
    for (let column = 0; column < columns; column++) {
      similarity += index.embeddings[offset + column]! * queryEmbedding![column]!;
    }
    return similarity;
  });
  const maximumLexicalScore = lexicalScores.length ? Math.max(...lexicalScores) : 0;

  // A one-token request with no literal corpus overlap (for example a greeting)
  // is too ambiguous to trust semantic similarity alone. Meaningful one-word
  // searches such as "dance" still proceed because they have lexical evidence.
  if (queryTerms.size < 2 && maximumLexicalScore === 0) {
    return {
      version: index.manifest.version,
      index: indexName,
      method: denseAvailable ? "hybrid" : "lexical",
      chunks: [],
      confidence: {
        queryTerms: queryTerms.size,
        maximumLexicalScore,
        maximumDenseScore: denseAvailable && denseScores.length ? Math.max(...denseScores) : 0,
      },
    };
  }
  const lexicalRanks = rankMap(lexicalScores, 0);
  const minimumDenseScore = Number(process.env.RAG_MIN_DENSE_SCORE ?? 0.27);
  const denseRanks = denseAvailable ? rankMap(denseScores, minimumDenseScore) : new Map<number, number>();
  const fused = index.chunks
    .map((chunk, chunkIndex) => {
      const lexicalRank = lexicalRanks.get(chunkIndex);
      const denseRank = denseRanks.get(chunkIndex);
      const score = (denseRank ? 0.7 / (RRF_K + denseRank) : 0)
        + (lexicalRank ? 0.3 / (RRF_K + lexicalRank) : 0);
      return { ...chunk, score };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((left, right) => right.score - left.score);

  return {
    version: index.manifest.version,
    index: indexName,
    method: denseAvailable ? "hybrid" : "lexical",
    chunks: mergeByDocument(fused, limit),
    confidence: {
      queryTerms: queryTerms.size,
      maximumLexicalScore,
      maximumDenseScore: denseAvailable && denseScores.length ? Math.max(...denseScores) : 0,
    },
  };
}

export function clearRagCacheForTests(): void {
  caches.clear();
  embeddingCache.clear();
}

export async function ragIndexStatus(): Promise<"available" | "unavailable"> {
  try {
    await Promise.all((["public", "manager", "business"] as const).map((index) => loadIndex(index)));
    return "available";
  } catch {
    return "unavailable";
  }
}
