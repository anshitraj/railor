FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    RAILOR_ENV=production \
    SNAPSHOT_DIR=/tmp/snapshots \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app
COPY pyproject.toml uv.lock README.md ./
RUN pip install --no-cache-dir uv==0.11.25 \
    && uv sync --frozen --no-install-project --extra crawl --extra discovery --extra gcs --no-dev
COPY railor_worker ./railor_worker
RUN uv sync --frozen --extra crawl --extra discovery --extra gcs --no-dev \
    && useradd --create-home --uid 10001 railor

USER railor
CMD ["python", "-m", "railor_worker.jobs", "--limit", "100"]
