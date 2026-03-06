# Hugging Cloud

Turn a private Hugging Face repo into a self-hosted cloud storage service with a web UI, signed links, resumable uploads, and RBAC.

## Features

- Web file browser
- Signed download links
- Resumable uploads
- Role-based access control
- FastAPI backend + Next.js frontend
- SQLite by default, with optional Postgres and Redis

## Getting Started

The container image is published automatically to GitHub Container Registry on pushes to `main` and version tags (`v*`).
Both compose files default to `ghcr.io/gouryella/huggingcloud:latest`, and you can override it with `HUGGINGCLOUD_IMAGE` if needed.

Simple setup:

```bash
mkdir -p data
docker compose pull
docker compose up -d
docker compose logs huggingcloud
```

Open [http://localhost:3000/login](http://localhost:3000/login).

On first startup, the bootstrap account is printed in the logs:

- username: `admin`
- email: `admin@local.invalid`
- password: generated once and printed in `docker compose logs huggingcloud`

Then sign in, complete the root admin setup, and configure your Hugging Face repository in `Settings`.

## Full Setup

Postgres + Redis:

```bash
docker compose -f docker-compose.full.yml pull
docker compose -f docker-compose.full.yml up -d
docker compose -f docker-compose.full.yml logs huggingcloud
```

## Development

```bash
cd backend
uv sync --group dev
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

```bash
cd frontend
pnpm install
cat > .env.local <<'EOF2'
INTERNAL_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
EOF2
pnpm dev
```

## License

MIT
