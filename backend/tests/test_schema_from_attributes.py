from datetime import UTC, datetime
from types import SimpleNamespace

from app.models import UploadStatus
from app.schemas.files import FileItem
from app.schemas.links import LinkRecord
from app.schemas.uploads import UploadSessionInfo


def test_file_item_accepts_attribute_objects() -> None:
    row = SimpleNamespace(
        path='share/example.txt',
        size=123,
        mime='text/plain',
        etag=None,
        sha256=None,
        last_modified=None,
        indexed_at=datetime.now(UTC),
    )
    item = FileItem.model_validate(row)
    assert item.path == 'share/example.txt'
    assert item.size == 123


def test_link_record_accepts_attribute_objects() -> None:
    now = datetime.now(UTC)
    row = SimpleNamespace(
        id='link-1',
        path='share/example.txt',
        expires_at=now,
        revoked_at=None,
        max_downloads=10,
        download_count=0,
        one_time=False,
        ip_allowlist=None,
        speed_limit_mbps=None,
        created_at=now,
    )
    rec = LinkRecord.model_validate(row)
    assert rec.id == 'link-1'
    assert rec.path == 'share/example.txt'


def test_upload_session_info_accepts_attribute_objects() -> None:
    now = datetime.now(UTC)
    row = SimpleNamespace(
        id='upload-1',
        user_id='user-1',
        path='uploads/sample.bin',
        size=1024,
        chunk_size=512,
        sha256=None,
        status=UploadStatus.pending,
        received_chunks=[0],
        error_message=None,
        created_at=now,
        updated_at=now,
        completed_at=None,
    )
    info = UploadSessionInfo.model_validate(row)
    assert info.id == 'upload-1'
    assert info.path == 'uploads/sample.bin'

