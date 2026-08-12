# Tan local RAG pipeline

The public education agent is built exclusively from the supplied real-data export in the repository-level `csv/` folder. The scraper is not part of this ingestion path and is not required at runtime.

The source mapping is:

- `Programs.csv`: validated structured program catalog and one or more retrievable chunks per program.
- `*.pdf`: page-aware education, curriculum, package, FAQ, privacy and compliance chunks.
- `ED_EX_all_url.xlsx`: retrievable page directory plus a structured URL sidecar.
- `australian-postcodes.csv`: postcode-to-state sidecar used to enrich location queries without embedding thousands of repetitive rows.

The manager and business agents remain physically isolated under `corpus/manager/` and `corpus/business/`; their synthetic MVP indexes are built separately. `corpus/public/` is legacy demo input and is not read by `ingest_education.py`.

`data/` contains immutable generated indexes. Each agent has a separate pointer, so promoting public education data cannot alter either internal index.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python ingest_education.py
python -m unittest test_production_index.py
```

Public ingestion validates the exact source inventory and CSV schemas, hashes every source, extracts the spreadsheets and PDFs, builds BM25/TF-IDF and `embeddinggemma` artifacts, runs retrieval regression cases, writes an immutable version, and only then atomically updates `data/public/current.json`.

The promoted version also contains `catalog.json`, `postcodes.json` and `page_directory.json`. The TypeScript API reads the catalog and retrieval artifacts from that same version, preventing a response/card version mismatch. Ollama receives only selected chunks and relevant allowlisted program records; source filenames and document text are not returned by the public API.
