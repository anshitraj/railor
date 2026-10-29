import socket

import httpx
import pytest

from railor_worker import netguard


def address(ip):
    return (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (ip, 443))


def test_fetch_pins_validated_ip_and_preserves_host_and_tls_identity(monkeypatch):
    lookups = []

    def resolve(*args, **kwargs):
        lookups.append(args[0])
        # A vulnerable HTTP client would perform the second lookup after validation.
        return [address("93.184.216.34" if len(lookups) == 1 else "169.254.169.254")]

    monkeypatch.setattr(netguard.socket, "getaddrinfo", resolve)
    requests = []

    def handle(request):
        requests.append(request)
        return httpx.Response(200, content=b"source")

    real_client = httpx.Client
    monkeypatch.setattr(netguard.httpx, "Client", lambda **kwargs: real_client(transport=httpx.MockTransport(handle), **kwargs))
    result = netguard.guarded_get("https://docs.example:8443/page")
    assert lookups == ["docs.example"]
    assert requests[0].url.host == "93.184.216.34"
    assert requests[0].headers["host"] == "docs.example:8443"
    assert requests[0].extensions["sni_hostname"] == "docs.example"
    assert result.url == "https://docs.example:8443/page"
    assert result.text == "source"


def test_mixed_public_and_private_dns_answers_are_rejected(monkeypatch):
    monkeypatch.setattr(netguard.socket, "getaddrinfo", lambda *a, **k: [address("93.184.216.34"), address("169.254.169.254")])
    with pytest.raises(netguard.BlockedURL):
        netguard.guarded_get("https://docs.example/source")


def test_each_redirect_is_resolved_and_checked_before_connecting(monkeypatch):
    monkeypatch.setattr(netguard.socket, "getaddrinfo", lambda host, *a, **k: [address("93.184.216.34" if host == "docs.example" else "10.0.0.1")])
    seen = []

    def handle(request):
        seen.append(str(request.url))
        return httpx.Response(302, headers={"location": "https://private.example/secret"})

    real_client = httpx.Client
    monkeypatch.setattr(netguard.httpx, "Client", lambda **kwargs: real_client(transport=httpx.MockTransport(handle), **kwargs))
    with pytest.raises(netguard.BlockedURL):
        netguard.guarded_get("https://docs.example/source")
    assert len(seen) == 1
