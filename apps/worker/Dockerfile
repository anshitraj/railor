FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    RAILOR_ENV=production \
    SNAPSHOT_DIR=/data/snapshots

WORKDIR /app
COPY pyproject.toml README.md ./
COPY railor_worker ./railor_worker
RUN pip install --no-cache-dir '.[crawl,discovery]'

CMD ["python", "-m", "railor_worker.cli", "crawl"]
