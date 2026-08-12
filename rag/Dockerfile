FROM python:3.12-slim
WORKDIR /app/rag
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENTRYPOINT ["python", "ingest_education.py"]
