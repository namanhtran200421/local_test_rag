#!/usr/bin/env python3
"""Production-oriented hybrid ingestion with isolated indexes and Ollama embeddings."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from pypdf import PdfReader
from scipy.sparse import save_npz
from sklearn.feature_extraction.text import TfidfVectorizer

from ingest import clean_text, chunk_text, load_inventory, sha256

ROOT = Path(__file__).resolve().parent
SOURCE_BY_AGENT = {
    "public": ROOT / "corpus" / "public",
    "manager": ROOT / "corpus" / "manager",
    "business": ROOT / "corpus" / "business",
}

EVALUATIONS = {
    "public": [
        ("Year 5 First Nations music Victoria", {"program-sounds-of-country", "program-living-culture"}),
        ("NSW Stage 3 creative arts dance", {"nsw-stage3-creative-arts"}),
        ("accessible West African drumming", {"program-rhythms-west-africa"}),
    ],
    "manager": [
        ("pending publication approvals", {"manager-approval-policy"}),
        ("weekly booking performance and facilitator allocation", {"manager-weekly-performance-brief"}),
        ("can the assistant approve a refund", {"manager-financial-boundaries"}),
    ],
    "business": [
        ("booking awaiting school confirmation", {"business-booking-operations"}),
        ("facilitator availability is not confirmation", {"business-facilitator-coordination"}),
        ("draft email about accessibility details", {"business-email-response-standard", "business-accessibility-checklist"}),
    ],
}


def ollama_embed(texts: list[str], model: str, base_url: str) -> np.ndarray:
    vectors = []
    for start in range(0, len(texts), 16):
        body = json.dumps({"model": model, "input": texts[start:start + 16], "truncate": False}).encode()
        request = urllib.request.Request(f"{base_url}/api/embed", data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=120) as response:
            payload = json.load(response)
        vectors.extend(payload["embeddings"])
    matrix = np.asarray(vectors, dtype="<f4")
    if matrix.ndim != 2 or matrix.shape[0] != len(texts) or matrix.shape[1] < 128:
        raise RuntimeError(f"Invalid embedding matrix shape: {matrix.shape}")
    if not np.isfinite(matrix).all():
        raise RuntimeError("Embedding provider returned non-finite values")
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    if np.any(norms == 0):
        raise RuntimeError("Embedding provider returned a zero vector")
    normalized = matrix / norms
    if not np.isfinite(normalized).all():
        raise RuntimeError("Embedding normalisation produced non-finite values")
    return normalized


def extract(source: Path, agent: str) -> tuple[list[dict], list[dict]]:
    inventory = load_inventory(source)
    if inventory.get("access", agent) != agent:
        if agent != "public":
            raise RuntimeError(f"Corpus access label does not match {agent}")
    by_filename = {item["filename"]: item for item in inventory["documents"]}
    pdfs = sorted(source.glob("*.pdf"))
    if len(pdfs) != inventory["documentCount"]:
        raise RuntimeError("Source inventory count mismatch")
    chunks, documents = [], []
    for pdf in pdfs:
        metadata = by_filename[pdf.name]
        if sha256(pdf) != metadata["sha256"]:
            raise RuntimeError(f"Hash mismatch: {pdf.name}")
        reader = PdfReader(str(pdf))
        text = clean_text("\n\n".join((page.extract_text() or "") for page in reader.pages))
        if len(text) < 300:
            raise RuntimeError(f"Extraction below threshold: {pdf.name}")
        pieces = chunk_text(text)
        for index, content in enumerate(pieces):
            chunks.append({
                "id": f"{metadata['id']}:{index}", "documentId": metadata["id"],
                "title": metadata["title"], "filename": metadata["filename"],
                "jurisdiction": metadata["jurisdiction"], "years": metadata["years"],
                "topics": metadata["topics"], "synthetic": True, "access": agent,
                "content": content,
            })
        documents.append({**metadata, "pages": len(reader.pages), "characters": len(text), "chunks": len(pieces)})
    return chunks, documents


def evaluate(agent: str, chunks: list[dict], vectorizer, lexical, dense: np.ndarray, model: str, base_url: str) -> dict:
    results, passed = [], 0
    for query, expected in EVALUATIONS[agent]:
        query_dense = ollama_embed([query], model, base_url)[0]
        # Explicit element-wise cosine avoids platform BLAS warning noise for small matrices.
        dense_scores = np.sum(dense.astype(np.float64) * query_dense.astype(np.float64)[None, :], axis=1)
        lexical_scores = (lexical @ vectorizer.transform([query]).T).toarray().ravel()
        combined = dense_scores * .75 + lexical_scores * .25
        ranked = combined.argsort()[::-1][:3]
        retrieved = [chunks[index]["documentId"] for index in ranked]
        hit = bool(expected.intersection(retrieved))
        passed += int(hit)
        results.append({"query": query, "expected": sorted(expected), "retrievedTop3": retrieved, "passed": hit})
    return {"passed": passed, "total": len(results), "recallAt3": passed / len(results), "cases": results}


def ingest(agent: str, source: Path, output_root: Path, model: str, base_url: str) -> Path:
    chunks, documents = extract(source, agent)
    texts = [f"{chunk['title']}\nTopics: {', '.join(chunk['topics'])}\n{chunk['content']}" for chunk in chunks]
    vectorizer = TfidfVectorizer(lowercase=True, ngram_range=(1, 2), sublinear_tf=True, stop_words="english")
    lexical = vectorizer.fit_transform(texts)
    dense = ollama_embed(texts, model, base_url)
    evaluation = evaluate(agent, chunks, vectorizer, lexical, dense, model, base_url)
    if evaluation["recallAt3"] < 1:
        raise RuntimeError(f"{agent} retrieval evaluation failed: {evaluation['recallAt3']}")

    fingerprint = hashlib.sha256((agent + model + "".join(item["sha256"] for item in documents)).encode()).hexdigest()[:12]
    version = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + f"-{fingerprint}"
    data_root = output_root / agent
    staging = data_root / "versions" / f".{version}.staging"
    final = data_root / "versions" / version
    staging.mkdir(parents=True)
    with (staging / "chunks.jsonl").open("w", encoding="utf-8") as handle:
        for chunk in chunks:
            handle.write(json.dumps(chunk, ensure_ascii=False) + "\n")
    dense.astype("<f4").tofile(staging / "embeddings.f32")
    save_npz(staging / "tfidf.npz", lexical)
    joblib.dump(vectorizer, staging / "vectorizer.joblib")
    manifest = {
        "version": version, "agent": agent, "access": agent, "createdAt": datetime.now(timezone.utc).isoformat(),
        "synthetic": True, "sourceDocumentCount": len(documents), "extractionSuccessRate": 1,
        "chunkCount": len(chunks), "embeddingModel": model,
        "embeddingDimensions": [int(dense.shape[0]), int(dense.shape[1])],
        "lexicalDimensions": [int(lexical.shape[0]), int(lexical.shape[1])],
        "documents": documents, "evaluation": evaluation,
        "artifacts": {"chunks": "chunks.jsonl", "embeddings": "embeddings.f32", "matrix": "tfidf.npz", "vectorizer": "vectorizer.joblib"},
    }
    (staging / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    staging.rename(final)
    pointer = data_root / ".current.json.tmp"
    pointer.write_text(json.dumps({"version": version, "path": f"versions/{version}", "agent": agent}, indent=2) + "\n", encoding="utf-8")
    os.replace(pointer, data_root / "current.json")
    return final


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--agent", choices=["public", "manager", "business", "all"], default="all")
    parser.add_argument("--embedding-model", default=os.getenv("OLLAMA_EMBEDDING_MODEL", "embeddinggemma"))
    parser.add_argument("--ollama-url", default=os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434"))
    parser.add_argument("--output", type=Path, default=ROOT / "data")
    args = parser.parse_args()
    agents = list(SOURCE_BY_AGENT) if args.agent == "all" else [args.agent]
    for agent in agents:
        final = ingest(agent, SOURCE_BY_AGENT[agent], args.output, args.embedding_model, args.ollama_url)
        manifest = json.loads((final / "manifest.json").read_text())
        print(json.dumps({"agent": agent, "version": manifest["version"], "documents": manifest["sourceDocumentCount"], "chunks": manifest["chunkCount"], "embeddingDimensions": manifest["embeddingDimensions"], "recallAt3": manifest["evaluation"]["recallAt3"]}))


if __name__ == "__main__":
    main()
