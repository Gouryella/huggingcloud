from app.schemas.links import CreateLinkRequest


def test_create_link_request_supports_never_expire() -> None:
    payload = CreateLinkRequest(path='uploads/a.bin', expires_in_sec=0)
    assert payload.expires_in_sec == 0
