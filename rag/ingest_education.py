#!/usr/bin/env python3
"""Build and atomically promote the public education index from the real CSV folder."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import urllib.request
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree

import joblib
import numpy as np
from pypdf import PdfReader
from scipy.sparse import save_npz
from sklearn.feature_extraction.text import TfidfVectorizer

from ingest import chunk_text, clean_text

ROOT = Path(__file__).resolve().parent
DEFAULT_SOURCE = ROOT.parent / "csv"
DEFAULT_OUTPUT = ROOT / "data"
PROGRAM_HEADERS = [
    "ProgramId", "Program_Name", "Program_link", "Tailored_To",
    "Available_In", "Genre", "Region", "Description",
]
POSTCODE_HEADERS = ["Postcode", "Suburb", "State", "Lat", "Lon", "Category"]
IMAGE_TONES = ("coral", "gold", "teal", "violet")
SOURCE_METADATA = {
    "About us_CI.pdf": ("About Cultural Infusion Education", "AU", ["about", "education", "intercultural learning"]),
    "Example_questions.pdf": ("Cultural Infusion Education Questions and Answers", "AU", ["education", "curriculum", "pricing", "booking"]),
    "FAQ_CI.pdf": ("Cultural Infusion Education Frequently Asked Questions", "AU", ["faq", "booking", "pricing", "delivery", "safety"]),
    "ISO Compliance_CI.pdf": ("Cultural Infusion ISO Compliance", "AU", ["iso", "information security", "compliance"]),
    "Packages_CI.pdf": ("Cultural Infusion School Packages", "AU", ["packages", "professional development", "learning resources"]),
    "Privacy Policy - Education and Experiences.pdf": ("Education and Experiences Privacy Policy", "AU", ["privacy", "policy", "personal information"]),
    "elc2025.pdf": ("2025 Early Learning Education Brochure", "AU", ["early learning", "programs", "curriculum", "2025"]),
    "nsw2025.pdf": ("2025 New South Wales Education Brochure", "NSW", ["NSW", "programs", "curriculum", "2025"]),
    "qld2025.pdf": ("2025 Queensland Education Brochure", "QLD", ["QLD", "programs", "curriculum", "2025"]),
    "sa2025.pdf": ("2025 South Australia Education Brochure", "SA", ["SA", "programs", "curriculum", "2025"]),
    "vic2025.pdf": ("2025 Victoria Education Brochure", "VIC", ["VIC", "programs", "curriculum", "2025"]),
    "wa2025.pdf": ("2025 Western Australia Education Brochure", "WA", ["WA", "programs", "curriculum", "2025"]),
}
EVALUATIONS = [
    ("West African drumming program available in Victoria", {"program-12288"}),
    ("Bollywood dance program in Western Australia", {"program-157"}),
    ("Cultural Infusion booking cancellation policy", {"faq-ci"}),
    ("school packages professional development and learning resources", {"packages-ci"}),
    ("NSW curriculum intercultural understanding learning areas", {"nsw2025"}),
]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def values(value: str) -> list[str]:
    return [part.strip() for part in value.split(",") if part.strip()]


def excerpt(value: str, maximum: int = 320) -> str:
    compact = re.sub(r"\s+", " ", value).strip()
    if len(compact) <= maximum:
        return compact
    shortened = compact[:maximum].rsplit(" ", 1)[0].rstrip(" ,;:-")
    return f"{shortened}…"


def clean_pdf_text(value: str) -> str:
    # Some exported brochure pages contain the InDesign footer twice with no
    # separator. Repeating this cleanup removes both concatenated copies.
    for _ in range(3):
        value = re.sub(r"[a-z]+2025workingfile\.indd\s+\d+", " ", value, flags=re.IGNORECASE)
        value = re.sub(r"\d{1,2}/\d{1,2}/\d{4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)", " ", value, flags=re.IGNORECASE)
    value = re.sub(r"We're offline\s+Leave a message", " ", value, flags=re.IGNORECASE)
    return clean_text(value)


def read_programs(source: Path) -> tuple[list[dict], list[dict]]:
    path = source / "Programs.csv"
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != PROGRAM_HEADERS:
            raise RuntimeError(f"Unexpected Programs.csv schema: {reader.fieldnames}")
        rows = list(reader)
    if not rows or len({row["ProgramId"] for row in rows}) != len(rows):
        raise RuntimeError("Programs.csv must contain unique program IDs")
    if any(not all(row[field].strip() for field in PROGRAM_HEADERS) for row in rows):
        raise RuntimeError("Programs.csv contains an incomplete record")

    chunks: list[dict] = []
    catalog: list[dict] = []
    for row in rows:
        program_id = f"program-{row['ProgramId'].strip()}"
        audiences = values(row["Tailored_To"])
        availability = values(row["Available_In"])
        genres = values(row["Genre"])
        regions = values(row["Region"])
        description = clean_text(row["Description"])
        title = clean_text(row["Program_Name"])
        catalog.append({
            "id": program_id,
            "sourceId": row["ProgramId"].strip(),
            "title": title,
            "summary": excerpt(description),
            "audiences": audiences,
            "availability": availability,
            "genres": genres,
            "regions": regions,
            "searchTerms": list(dict.fromkeys([*genres, *regions, *audiences, *availability])),
            "bookingUrl": row["Program_link"].strip(),
            "imageTone": IMAGE_TONES[int(row["ProgramId"]) % len(IMAGE_TONES)],
        })
        header = (
            f"Program: {title}\n"
            f"Audience: {', '.join(audiences)}\n"
            f"Available in: {', '.join(availability)}\n"
            f"Genres: {', '.join(genres)}\n"
            f"Cultural region: {', '.join(regions)}\n"
            f"Official page: {row['Program_link'].strip()}\n"
        )
        pieces = chunk_text(description)
        for index, piece in enumerate(pieces):
            chunks.append({
                "id": f"{program_id}:{index}",
                "documentId": program_id,
                "programId": program_id,
                "sourceType": "program",
                "title": title,
                "filename": "Programs.csv",
                "jurisdiction": ", ".join(item for item in availability if item != "Virtual") or "AU",
                "years": ", ".join(audiences),
                "topics": list(dict.fromkeys([*genres, *regions, *audiences, *availability])),
                "synthetic": False,
                "access": "public",
                "content": f"{header}Description: {piece}",
            })
    return chunks, catalog


def read_postcodes(source: Path) -> dict[str, list[str]]:
    path = source / "australian-postcodes.csv"
    states: dict[str, set[str]] = defaultdict(set)
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != POSTCODE_HEADERS:
            raise RuntimeError(f"Unexpected postcode schema: {reader.fieldnames}")
        for row in reader:
            postcode = row["Postcode"].strip().zfill(4)
            state = row["State"].strip().upper()
            if re.fullmatch(r"\d{4}", postcode) and re.fullmatch(r"[A-Z]{2,3}", state):
                states[postcode].add(state)
    if len(states) < 2_000:
        raise RuntimeError("Postcode lookup extraction is unexpectedly small")
    return {postcode: sorted(found) for postcode, found in sorted(states.items())}


def read_url_workbook(source: Path) -> tuple[list[dict], list[dict]]:
    path = source / "ED_EX_all_url.xlsx"
    namespace = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(path) as workbook:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            root = ElementTree.fromstring(workbook.read("xl/sharedStrings.xml"))
            shared = [
                "".join(node.text or "" for node in item.iter(f"{{{namespace['m']}}}t"))
                for item in root.findall("m:si", namespace)
            ]
        sheet = ElementTree.fromstring(workbook.read("xl/worksheets/sheet1.xml"))
        rows: list[list[str]] = []
        for row in sheet.findall(".//m:sheetData/m:row", namespace):
            result: list[str] = []
            for cell in row.findall("m:c", namespace):
                raw = cell.find("m:v", namespace)
                value = "" if raw is None else (raw.text or "")
                if cell.attrib.get("t") == "s" and value:
                    value = shared[int(value)]
                result.append(value.strip())
            rows.append(result)
    if not rows or rows[0] != ["Pages", "URL"]:
        raise RuntimeError("Unexpected ED_EX_all_url.xlsx schema")
    directory = [
        {"page": row[0], "url": row[1]}
        for row in rows[1:]
        if len(row) >= 2 and row[0] and re.match(r"^https://", row[1])
    ]
    if len(directory) < 100:
        raise RuntimeError("Education URL directory extraction is unexpectedly small")
    text = "\n".join(f"Page: {item['page']}\nOfficial URL: {item['url']}" for item in directory)
    chunks = [{
        "id": f"education-page-directory:{index}",
        "documentId": "education-page-directory",
        "sourceType": "page_directory",
        "title": "Cultural Infusion Education Page Directory",
        "filename": path.name,
        "jurisdiction": "AU",
        "years": "",
        "topics": ["official pages", "program links", "education website"],
        "synthetic": False,
        "access": "public",
        "content": piece,
    } for index, piece in enumerate(chunk_text(text))]
    return chunks, directory


def read_pdfs(source: Path) -> tuple[list[dict], list[dict]]:
    found = {path.name for path in source.glob("*.pdf")}
    if found != set(SOURCE_METADATA):
        raise RuntimeError(f"PDF inventory mismatch: expected {sorted(SOURCE_METADATA)}, found {sorted(found)}")
    chunks: list[dict] = []
    documents: list[dict] = []
    for filename, (title, jurisdiction, topics) in SOURCE_METADATA.items():
        path = source / filename
        reader = PdfReader(str(path))
        character_count = 0
        chunk_count = 0
        document_id = slug(path.stem)
        for page_number, page in enumerate(reader.pages, start=1):
            text = clean_pdf_text(page.extract_text() or "")
            character_count += len(text)
            if len(text) < 40:
                continue
            for page_chunk, piece in enumerate(chunk_text(text)):
                chunks.append({
                    "id": f"{document_id}:p{page_number}:{page_chunk}",
                    "documentId": document_id,
                    "sourceType": "public_document",
                    "title": title,
                    "filename": filename,
                    "jurisdiction": jurisdiction,
                    "years": "",
                    "topics": topics,
                    "synthetic": False,
                    "access": "public",
                    "content": f"Page {page_number}. {piece}",
                })
                chunk_count += 1
        if character_count < 300 or chunk_count == 0:
            raise RuntimeError(f"PDF extraction below threshold: {filename}")
        documents.append({
            "id": document_id,
            "title": title,
            "filename": filename,
            "jurisdiction": jurisdiction,
            "sha256": sha256(path),
            "pages": len(reader.pages),
            "characters": character_count,
            "chunks": chunk_count,
        })
    return chunks, documents


def ollama_embed(texts: list[str], model: str, base_url: str) -> np.ndarray:
    vectors = []
    for start in range(0, len(texts), 16):
        body = json.dumps({"model": model, "input": texts[start:start + 16], "truncate": False}).encode()
        request = urllib.request.Request(f"{base_url}/api/embed", data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=120) as response:
            vectors.extend(json.load(response)["embeddings"])
    matrix = np.asarray(vectors, dtype="<f4")
    if matrix.ndim != 2 or matrix.shape[0] != len(texts) or matrix.shape[1] < 128:
        raise RuntimeError(f"Invalid embedding matrix shape: {matrix.shape}")
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    if not np.isfinite(matrix).all() or np.any(norms == 0):
        raise RuntimeError("Embedding provider returned invalid vectors")
    return matrix / norms


def evaluate(chunks: list[dict], vectorizer, lexical, dense: np.ndarray, model: str, base_url: str) -> dict:
    results, passed = [], 0
    for query, expected in EVALUATIONS:
        query_dense = ollama_embed([query], model, base_url)[0]
        dense_scores = np.sum(dense.astype(np.float64) * query_dense.astype(np.float64)[None, :], axis=1)
        lexical_scores = (lexical @ vectorizer.transform([query]).T).toarray().ravel()
        combined = dense_scores * .75 + lexical_scores * .25
        ranked = combined.argsort()[::-1][:5]
        retrieved = [chunks[index]["documentId"] for index in ranked]
        hit = bool(expected.intersection(retrieved))
        passed += int(hit)
        results.append({"query": query, "expected": sorted(expected), "retrievedTop5": retrieved, "passed": hit})
    return {"passed": passed, "total": len(results), "recallAt5": passed / len(results), "cases": results}


def ingest(source: Path, output_root: Path, model: str, base_url: str) -> Path:
    expected_files = {"Programs.csv", "australian-postcodes.csv", "ED_EX_all_url.xlsx", *SOURCE_METADATA}
    actual_files = {path.name for path in source.iterdir() if path.is_file() and not path.name.startswith(".")}
    if actual_files != expected_files:
        raise RuntimeError(f"Education source inventory mismatch: {sorted(actual_files ^ expected_files)}")

    program_chunks, catalog = read_programs(source)
    pdf_chunks, documents = read_pdfs(source)
    directory_chunks, page_directory = read_url_workbook(source)
    postcodes = read_postcodes(source)
    chunks = [*program_chunks, *pdf_chunks, *directory_chunks]
    texts = [f"{chunk['title']}\nTopics: {', '.join(chunk['topics'])}\n{chunk['content']}" for chunk in chunks]
    vectorizer = TfidfVectorizer(lowercase=True, ngram_range=(1, 2), sublinear_tf=True, stop_words="english")
    lexical = vectorizer.fit_transform(texts)
    dense = ollama_embed(texts, model, base_url)
    evaluation = evaluate(chunks, vectorizer, lexical, dense, model, base_url)
    if evaluation["recallAt5"] < 1:
        raise RuntimeError(f"Public education retrieval evaluation failed: {json.dumps(evaluation)}")

    source_files = [{"filename": name, "sha256": sha256(source / name)} for name in sorted(expected_files)]
    fingerprint_input = "public-real-education" + model + "".join(item["sha256"] for item in source_files)
    fingerprint = hashlib.sha256(fingerprint_input.encode()).hexdigest()[:12]
    version = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + f"-{fingerprint}"
    data_root = output_root / "public"
    staging = data_root / "versions" / f".{version}.staging"
    final = data_root / "versions" / version
    staging.mkdir(parents=True)
    with (staging / "chunks.jsonl").open("w", encoding="utf-8") as handle:
        for chunk in chunks:
            handle.write(json.dumps(chunk, ensure_ascii=False) + "\n")
    dense.astype("<f4").tofile(staging / "embeddings.f32")
    save_npz(staging / "tfidf.npz", lexical)
    joblib.dump(vectorizer, staging / "vectorizer.joblib")
    (staging / "catalog.json").write_text(json.dumps({"programs": catalog}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (staging / "postcodes.json").write_text(json.dumps(postcodes, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    (staging / "page_directory.json").write_text(json.dumps(page_directory, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest = {
        "version": version,
        "agent": "public",
        "access": "public",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "synthetic": False,
        "realData": True,
        "sourceRoot": "csv",
        "sourceDocumentCount": len(documents) + 3,
        "sourceFiles": source_files,
        "programCount": len(catalog),
        "postcodeCount": len(postcodes),
        "pageDirectoryCount": len(page_directory),
        "chunkCount": len(chunks),
        "embeddingModel": model,
        "embeddingDimensions": [int(dense.shape[0]), int(dense.shape[1])],
        "lexicalDimensions": [int(lexical.shape[0]), int(lexical.shape[1])],
        "documents": documents,
        "evaluation": evaluation,
        "artifacts": {
            "chunks": "chunks.jsonl",
            "embeddings": "embeddings.f32",
            "matrix": "tfidf.npz",
            "vectorizer": "vectorizer.joblib",
            "catalog": "catalog.json",
            "postcodes": "postcodes.json",
            "pageDirectory": "page_directory.json",
        },
    }
    (staging / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    staging.rename(final)
    pointer = data_root / ".current.json.tmp"
    pointer.write_text(json.dumps({"version": version, "path": f"versions/{version}", "agent": "public"}, indent=2) + "\n", encoding="utf-8")
    os.replace(pointer, data_root / "current.json")
    return final


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--embedding-model", default=os.getenv("OLLAMA_EMBEDDING_MODEL", "embeddinggemma"))
    parser.add_argument("--ollama-url", default=os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434"))
    args = parser.parse_args()
    final = ingest(args.source.resolve(), args.output.resolve(), args.embedding_model, args.ollama_url)
    manifest = json.loads((final / "manifest.json").read_text())
    print(json.dumps({
        "promoted": str(final),
        "programs": manifest["programCount"],
        "chunks": manifest["chunkCount"],
        "postcodes": manifest["postcodeCount"],
        "pages": manifest["pageDirectoryCount"],
        "embeddingDimensions": manifest["embeddingDimensions"],
        "recallAt5": manifest["evaluation"]["recallAt5"],
    }, indent=2))


if __name__ == "__main__":
    main()
