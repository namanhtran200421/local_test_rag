#!/usr/bin/env python3
"""Inspect the currently promoted Tan retrieval index."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
from scipy.sparse import load_npz

ROOT = Path(__file__).resolve().parent


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("query")
    parser.add_argument("--limit", type=int, default=5)
    args = parser.parse_args()
    data = ROOT / "data"
    pointer = json.loads((data / "current.json").read_text(encoding="utf-8"))
    version = data / pointer["path"]
    vectorizer = joblib.load(version / "vectorizer.joblib")
    matrix = load_npz(version / "tfidf.npz")
    chunks = [json.loads(line) for line in (version / "chunks.jsonl").read_text(encoding="utf-8").splitlines()]
    scores = (matrix @ vectorizer.transform([args.query]).T).toarray().ravel()
    ranked = scores.argsort()[::-1][: args.limit]
    for rank, index in enumerate(ranked, 1):
        chunk = chunks[index]
        print(f"{rank}. {chunk['title']} [{chunk['id']}] score={scores[index]:.3f}")
        print(f"   {chunk['content'][:220].replace(chr(10), ' ')}…")


if __name__ == "__main__":
    main()
