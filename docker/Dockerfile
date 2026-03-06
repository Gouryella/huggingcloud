# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS frontend-builder
WORKDIR /app/frontend
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build && rm -rf /app/frontend/.next/cache

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    INTERNAL_API_BASE_URL=http://127.0.0.1:8000 \
    NEXT_PUBLIC_API_BASE_URL=

WORKDIR /app

# Install backend runtime dependencies.
COPY backend/requirements.runtime.txt /tmp/requirements.runtime.txt
RUN apt-get update \
    && apt-get install -y --no-install-recommends nodejs ca-certificates \
    && pip install --no-cache-dir -r /tmp/requirements.runtime.txt \
    && rm -f /tmp/requirements.runtime.txt \
    && rm -rf /var/lib/apt/lists/*

# Backend app files.
COPY backend/app /app/app
COPY backend/alembic.ini /app/alembic.ini
COPY backend/alembic /app/alembic

# Frontend runtime artifacts.
COPY --from=frontend-builder /app/frontend/.next/standalone /app/frontend
COPY --from=frontend-builder /app/frontend/.next/static /app/frontend/frontend/.next/static
COPY --from=frontend-builder /app/frontend/public /app/frontend/frontend/public

# Process launcher for both services.
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3000 8000

CMD ["/usr/local/bin/entrypoint.sh"]
