from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import audit, auth, download, files, health, links, settings, setup, uploads

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(files.router)
api_router.include_router(links.router)
api_router.include_router(uploads.router)
api_router.include_router(setup.router)
api_router.include_router(audit.router)
api_router.include_router(settings.router)
api_router.include_router(download.router)
