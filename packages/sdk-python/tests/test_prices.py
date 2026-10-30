"""Price-context contract; never contacts a service or uses a real API key."""
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from railor.resources.payments import Prices
from railor import Railor


class RecordingTransport:
    def post(self, path, *, body):
        self.path, self.body = path, body
        return {"object": "price_check"}


class PriceContextTests(unittest.TestCase):
    def test_api_key_only_uses_production_and_explicit_local_url_still_works(self):
        with patch.dict("os.environ", {"RAILOR_API_URL": ""}):
            with Railor(api_key="rail_test_fixture") as client:
                self.assertEqual(str(client._transport._client.base_url), "https://www.railor.xyz")
            with Railor(api_key="rail_test_fixture", base_url="http://localhost:3211") as client:
                self.assertEqual(str(client._transport._client.base_url), "http://localhost:3211")

    def test_preserves_account_holder_and_purpose(self):
        transport = RecordingTransport()
        context = {"profile": "personal", "country": "IN", "direction": "receive", "purpose": "personal"}
        Prices(transport).check(source_currency="USD", destination_currency="INR", amount=1000, context=context)
        self.assertEqual(transport.path, "/v1/prices")
        self.assertEqual(transport.body["context"], context)

    def test_legacy_request_omits_missing_context(self):
        transport = RecordingTransport()
        Prices(transport).check(source_currency="USD", destination_currency="INR", amount=1000)
        self.assertNotIn("context", transport.body)


if __name__ == "__main__":
    unittest.main()
