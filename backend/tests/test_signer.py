from app.services.signer import constraints_hash, is_expired, sign_payload, verify_signature


def test_signature_roundtrip() -> None:
    secret = 'test-secret'
    payload = {
        'max_downloads': 3,
        'one_time': False,
        'ip_allowlist': ['127.0.0.1/32'],
        'speed_limit_mbps': 10,
    }
    ch = constraints_hash(payload)
    sig = sign_payload(
        secret,
        method='GET',
        path='share/file.bin',
        sid='sid-1',
        exp=1_800_000_000,
        nonce='nonce',
        ch=ch,
    )
    assert verify_signature(
        secret,
        method='GET',
        path='share/file.bin',
        sid='sid-1',
        exp=1_800_000_000,
        nonce='nonce',
        ch=ch,
        sig=sig,
    )


def test_signature_detects_tamper() -> None:
    secret = 'test-secret'
    ch = constraints_hash({'one_time': True})
    sig = sign_payload(secret, method='GET', path='a', sid='1', exp=123, nonce='x', ch=ch)
    assert not verify_signature(secret, method='GET', path='b', sid='1', exp=123, nonce='x', ch=ch, sig=sig)


def test_is_expired_treats_zero_as_never() -> None:
    assert not is_expired(0)
