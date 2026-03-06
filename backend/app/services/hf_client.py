from __future__ import annotations

import asyncio
import logging
import random
import tempfile
from urllib.parse import urljoin, urlparse

import httpx
from huggingface_hub import HfApi, hf_hub_download

from app.services.system_settings import HFRuntimeConfig, get_effective_hf_config

logger = logging.getLogger(__name__)


class HFRepoNotConfiguredError(RuntimeError):
    pass


class HFClient:
    def __init__(self) -> None:
        self._http: httpx.AsyncClient | None = None

    async def http(self) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=None, follow_redirects=True)
        return self._http

    @staticmethod
    def _resolve_repo_base(config: HFRuntimeConfig) -> str:
        base = config.base_url.rstrip('/')
        if config.repo_type == 'dataset':
            return f'{base}/datasets/{config.repo_id}'
        if config.repo_type == 'space':
            return f'{base}/spaces/{config.repo_id}'
        return f'{base}/{config.repo_id}'

    @staticmethod
    def _resolve_url(config: HFRuntimeConfig, path: str) -> str:
        return f'{HFClient._resolve_repo_base(config)}/resolve/{config.revision}/{path}'

    @staticmethod
    def _assert_repo_configured(config: HFRuntimeConfig) -> None:
        if not config.repo_id:
            raise HFRepoNotConfiguredError(
                'Hugging Face repository is not configured. Configure it in Settings or set HF_REPO_ID.',
            )

    async def list_repo_file_entries(self) -> list[dict[str, int | str | None]]:
        config = await get_effective_hf_config()
        self._assert_repo_configured(config)
        api = HfApi(endpoint=config.base_url, token=config.token or None)

        def _list_tree() -> list[dict[str, int | str | None]]:
            entries: list[dict[str, int | str | None]] = []
            for node in api.list_repo_tree(
                repo_id=config.repo_id,
                repo_type=config.repo_type,
                revision=config.revision,
                token=config.token or None,
                recursive=True,
                expand=False,
            ):
                path = getattr(node, 'path', None)
                size = getattr(node, 'size', None)
                if not path or size is None:
                    # Skip folders and malformed entries.
                    continue
                entries.append(
                    {
                        'path': str(path),
                        'size': int(size),
                        'blob_id': getattr(node, 'blob_id', None),
                    },
                )
            return entries

        try:
            return await asyncio.to_thread(_list_tree)
        except Exception as exc:
            # Fall back to path-only listing to keep the system usable.
            logger.warning('list_repo_tree failed, fallback to list_repo_files: %s', exc)
            paths = await asyncio.to_thread(
                api.list_repo_files,
                repo_id=config.repo_id,
                repo_type=config.repo_type,
                revision=config.revision,
                token=config.token or None,
            )
            return [{'path': p, 'size': None, 'blob_id': None} for p in paths]

    async def list_repo_files(self) -> list[str]:
        entries = await self.list_repo_file_entries()
        return [str(item['path']) for item in entries]

    async def stream_file(
        self,
        *,
        path: str,
        method: str = 'GET',
        range_header: str | None = None,
    ) -> httpx.Response:
        config = await get_effective_hf_config()
        self._assert_repo_configured(config)
        client = await self.http()
        headers: dict[str, str] = {}
        if config.token:
            headers['Authorization'] = f'Bearer {config.token}'
        if range_header:
            headers['Range'] = range_header
        max_attempts = 4
        for attempt in range(max_attempts):
            request = client.build_request(method=method, url=self._resolve_url(config, path), headers=headers)
            response = await client.send(request, stream=True, follow_redirects=True)
            retryable = response.status_code == 429 or response.status_code >= 500
            if not retryable or attempt == max_attempts - 1:
                return response

            await response.aclose()
            backoff = (2**attempt) * 0.25 + random.uniform(0, 0.2)
            await asyncio.sleep(backoff)

        # Unreachable due return inside loop, kept for type completeness.
        return await client.send(request, stream=True, follow_redirects=True)

    async def resolve_redirect_url(self, *, path: str, range_header: str | None = None) -> str | None:
        """Resolve an externally reachable redirect target for a repo file.

        Returns a non-HF-host URL when available, otherwise None.
        """

        config = await get_effective_hf_config()
        self._assert_repo_configured(config)
        client = await self.http()

        headers: dict[str, str] = {}
        if config.token:
            headers['Authorization'] = f'Bearer {config.token}'
        if range_header:
            headers['Range'] = range_header

        base_host = urlparse(config.base_url).netloc
        current_url = self._resolve_url(config, path)
        max_hops = 4

        for _ in range(max_hops):
            request = client.build_request(method='HEAD', url=current_url, headers=headers)
            response = await client.send(request, follow_redirects=False)
            try:
                location = response.headers.get('location')
                if response.status_code < 300 or response.status_code >= 400 or not location:
                    return None

                next_url = urljoin(str(current_url), location)
                next_host = urlparse(next_url).netloc
                if next_host and next_host != base_host:
                    return next_url
                current_url = next_url
            finally:
                await response.aclose()

        return None

    async def upload_file(self, *, local_path: str, path_in_repo: str, commit_message: str) -> str | None:
        config = await get_effective_hf_config()
        self._assert_repo_configured(config)
        api = HfApi(endpoint=config.base_url, token=config.token or None)
        result = await asyncio.to_thread(
            api.upload_file,
            path_or_fileobj=local_path,
            path_in_repo=path_in_repo,
            repo_id=config.repo_id,
            repo_type=config.repo_type,
            revision=config.revision,
            commit_message=commit_message,
            token=config.token or None,
        )
        if isinstance(result, str):
            return result
        return getattr(result, 'oid', None)

    async def delete_file(self, *, path_in_repo: str, commit_message: str) -> None:
        config = await get_effective_hf_config()
        self._assert_repo_configured(config)
        api = HfApi(endpoint=config.base_url, token=config.token or None)
        await asyncio.to_thread(
            api.delete_file,
            path_in_repo=path_in_repo,
            repo_id=config.repo_id,
            repo_type=config.repo_type,
            revision=config.revision,
            commit_message=commit_message,
            token=config.token or None,
        )

    async def move_file(self, *, source_path: str, destination_path: str, commit_message: str) -> None:
        config = await get_effective_hf_config()
        self._assert_repo_configured(config)
        with tempfile.TemporaryDirectory() as td:
            downloaded = await asyncio.to_thread(
                hf_hub_download,
                repo_id=config.repo_id,
                repo_type=config.repo_type,
                filename=source_path,
                revision=config.revision,
                token=config.token or None,
                endpoint=config.base_url,
                local_dir=td,
            )
            await self.upload_file(
                local_path=downloaded,
                path_in_repo=destination_path,
                commit_message=f'{commit_message} (upload destination)',
            )
            await self.delete_file(
                path_in_repo=source_path,
                commit_message=f'{commit_message} (delete source)',
            )

    async def close(self) -> None:
        if self._http is not None:
            await self._http.aclose()
            self._http = None


hf_client = HFClient()
