from app.models import UserRole
from app.services.acl import DEFAULT_ROLE_PERMISSIONS


def test_member_share_allowed() -> None:
    perms = DEFAULT_ROLE_PERMISSIONS[UserRole.member]
    assert 'share' in perms
    assert 'upload' in perms
