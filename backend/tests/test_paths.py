import pytest

from app.utils.paths import PathValidationError, is_allowed_prefix, is_blocked_prefix, normalize_repo_path


def test_normalize_path_ok() -> None:
    assert normalize_repo_path('/share/abc.txt') == 'share/abc.txt'


def test_normalize_path_rejects_traversal() -> None:
    with pytest.raises(PathValidationError):
        normalize_repo_path('../etc/passwd')


def test_normalize_path_rejects_control_characters() -> None:
    with pytest.raises(PathValidationError):
        normalize_repo_path('share/demo%0Aname.txt')


def test_normalize_path_rejects_quote_characters() -> None:
    with pytest.raises(PathValidationError):
        normalize_repo_path('share/demo"name.txt')
    with pytest.raises(PathValidationError):
        normalize_repo_path("share/demo'name.txt")


def test_prefix_allowlist() -> None:
    assert is_allowed_prefix('share/a.txt', ['share/', 'uploads/'])
    assert not is_allowed_prefix('private/a.txt', ['share/', 'uploads/'])


def test_prefix_allowlist_supports_root_wildcard() -> None:
    assert is_allowed_prefix('clean_codex.py', ['/'])
    assert is_allowed_prefix('models/checkpoints/model.bin', ['/', 'uploads/'])
    assert is_allowed_prefix('models/checkpoints/model.bin', ['*'])


def test_prefix_blocklist() -> None:
    assert is_blocked_prefix('.git/config', ['.git/', '.github/'])
    assert is_blocked_prefix('.github/workflows/ci.yml', ['.git/', '.github/'])
    assert not is_blocked_prefix('uploads/file.bin', ['.git/', '.github/'])


def test_prefix_blocklist_supports_wildcard() -> None:
    assert is_blocked_prefix('uploads/file.bin', ['*'])
