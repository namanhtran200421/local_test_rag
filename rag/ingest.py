#!/usr/bin/env python3
"""Validate, chunk, index, evaluate, and atomically promote the Tan demo corpus."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

import joblib
from pypdf import PdfReader
from scipy.sparse import save_npz
from sklearn.feature_extraction.text import TfidfVectorizer

ROOT = Path(__file__).resolve().parent
DEFAULT_SOURCE = ROOT / "corpus" / "public"
DEFAULT_OUTPUT = ROOT / "data"

EVALUATION_CASES = [
    ("Year 5 First Nations music program in Victoria", {"program-sounds-of-country", "program-living-culture"}),
    ("Stage 3 creative arts music and dance NSW", {"nsw-stage3-creative-arts"}),
    ("Queensland rhythm ensemble movement", {"qld-year5-arts-rhythm"}),
    ("Lunar New Year classroom inquiry", {"program-lunar-new-year"}),
    ("accessible West African drumming workshop", {"program-rhythms-west-africa"}),
    ("Victoria intercultural identity questions", {"vic-intercultural-capability-year5"}),
]


def clean_text(value: str) -> str:
    value = value.replace("\u00ad", "").replace("\xa0", " ")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def chunk_text(text: str, target_words: int = 125, overlap_words: int = 24) -> list[str]:
    """Create bounded chunks even when a PDF extractor collapses paragraph spacing."""
    words = text.split()
    chunks: list[str] = []
    start = 0
    while start < len(words):
        end = min(start + target_words, len(words))
        chunks.append(" ".join(words[start:end]))
        if end == len(words):
            break
        start = max(start + 1, end - overlap_words)
    return chunks


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_inventory(source: Path) -> dict:
    manifest_path = source / "corpus_manifest.json"
    if not manifest_path.exists():
        raise RuntimeError("corpus_manifest.json is missing; generate the corpus first")
    inventory = json.loads(manifest_path.read_text(encoding="utf-8"))
    if inventory.get("documentCount") != len(inventory.get("documents", [])):
        raise RuntimeError("Corpus inventory count is inconsistent")
    return inventory


def evaluate(vectorizer, matrix, chunks: list[dict]) -> dict:
    cases = []
    passed = 0
    for query, expected in EVALUATION_CASES:
        scores = (matrix @ vectorizer.transform([query]).T).toarray().ravel()
        ranked = scores.argsort()[::-1][:5]
        retrieved = [chunks[index]["documentId"] for index in ranked]
        hit = bool(expected.intersection(retrieved[:3]))
        passed += int(hit)
        cases.append({"query": query, "expected": sorted(expected), "retrievedTop3": retrieved[:3], "passed": hit})
    return {"passed": passed, "total": len(cases), "recallAt3": passed / len(cases), "cases": cases}


def ingest(source: Path, output: Path) -> Path:
    inventory = load_inventory(source)
    chunks: list[dict] = []
    documents = []
    errors = []
    by_filename = {item["filename"]: item for item in inventory["documents"]}

    pdfs = sorted(source.glob("*.pdf"))
    if len(pdfs) != inventory["documentCount"]:
        raise RuntimeError(f"Expected {inventory['documentCount']} PDFs but found {len(pdfs)}")

    for pdf in pdfs:
        metadata = by_filename.get(pdf.name)
        if not metadata:
            errors.append({"file": pdf.name, "error": "not present in inventory"})
            continue
        if sha256(pdf) != metadata["sha256"]:
            errors.append({"file": pdf.name, "error": "source hash mismatch"})
            continue
        try:
            reader = PdfReader(str(pdf))
            pages = [clean_text(page.extract_text() or "") for page in reader.pages]
            text = "\n\n".join(page for page in pages if page)
            if len(text) < 300:
                raise ValueError("extracted text below minimum length")
            document_chunks = chunk_text(text)
            for index, content in enumerate(document_chunks):
                chunks.append({
                    "id": f"{metadata['id']}:{index}",
                    "documentId": metadata["id"],
                    "title": metadata["title"],
                    "filename": metadata["filename"],
                    "jurisdiction": metadata["jurisdiction"],
                    "years": metadata["years"],
                    "topics": metadata["topics"],
                    "synthetic": True,
                    "content": content,
                })
            documents.append({**metadata, "pages": len(reader.pages), "characters": len(text), "chunks": len(document_chunks)})
        except Exception as exc:
            errors.append({"file": pdf.name, "error": f"{type(exc).__name__}: {exc}"})

    extraction_rate = len(documents) / len(pdfs) if pdfs else 0
    if extraction_rate < 1 or errors:
        raise RuntimeError(f"Extraction quality threshold failed: {json.dumps(errors)}")
    if len(chunks) < len(documents):
        raise RuntimeError("Chunk count quality threshold failed")

    vectorizer = TfidfVectorizer(lowercase=True, ngram_range=(1, 2), min_df=1, sublinear_tf=True, stop_words="english")
    matrix = vectorizer.fit_transform([chunk["content"] for chunk in chunks])
    evaluation = evaluate(vectorizer, matrix, chunks)
    if evaluation["recallAt3"] < 0.8:
        raise RuntimeError(f"Retrieval evaluation failed: recall@3={evaluation['recallAt3']:.2f}")

    fingerprint = hashlib.sha256("".join(item["sha256"] for item in documents).encode()).hexdigest()[:10]
    version = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + f"-{fingerprint}"
    versions = output / "versions"
    versions.mkdir(parents=True, exist_ok=True)
    staging = versions / f".{version}.staging"
    final = versions / version
    staging.mkdir()

    with (staging / "chunks.jsonl").open("w", encoding="utf-8") as handle:
        for chunk in chunks:
            handle.write(json.dumps(chunk, ensure_ascii=False) + "\n")
    joblib.dump(vectorizer, staging / "vectorizer.joblib")
    save_npz(staging / "tfidf.npz", matrix)
    manifest = {
        "version": version,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "synthetic": True,
        "sourceDocumentCount": len(documents),
        "extractionSuccessRate": extraction_rate,
        "chunkCount": len(chunks),
        "vectorDimensions": [int(matrix.shape[0]), int(matrix.shape[1])],
        "documents": documents,
        "evaluation": evaluation,
        "artifacts": {
            "chunks": "chunks.jsonl",
            "matrix": "tfidf.npz",
            "vectorizer": "vectorizer.joblib",
        },
    }
    (staging / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    staging.rename(final)

    output.mkdir(parents=True, exist_ok=True)
    pointer_tmp = output / ".current.json.tmp"
    pointer_tmp.write_text(json.dumps({"version": version, "path": f"versions/{version}"}, indent=2) + "\n", encoding="utf-8")
    os.replace(pointer_tmp, output / "current.json")
    return final


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    promoted = ingest(args.source.resolve(), args.output.resolve())
    manifest = json.loads((promoted / "manifest.json").read_text(encoding="utf-8"))
    print(json.dumps({
        "promoted": str(promoted),
        "documents": manifest["sourceDocumentCount"],
        "chunks": manifest["chunkCount"],
        "vectorDimensions": manifest["vectorDimensions"],
        "recallAt3": manifest["evaluation"]["recallAt3"],
    }, indent=2))


if __name__ == "__main__":
    main()
