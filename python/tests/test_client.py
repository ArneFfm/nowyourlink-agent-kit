import io
import unittest
import urllib.error
from unittest.mock import Mock

from nowyourlink_spotlights import SpotlightClient, SpotlightError, _NoRedirect


class ClientTest(unittest.TestCase):
    def test_routes_and_anonymous_get(self):
        client = SpotlightClient()
        client._opener = Mock()
        client._opener.open.side_effect = lambda *a, **kw: io.BytesIO(b'{"data": [], "nextOffset": null}')
        self.assertEqual(client.current(), {"data": [], "nextOffset": None})
        client.list()
        client.list(limit=50, offset=10000)
        client.day("2024-02-29")
        requests = client._opener.open.call_args_list
        self.assertEqual([call.args[0].full_url for call in requests], [
            "https://nowyourlink.com/api/v1/spotlight",
            "https://nowyourlink.com/api/v1/spotlights?limit=20&offset=0",
            "https://nowyourlink.com/api/v1/spotlights?limit=50&offset=10000",
            "https://nowyourlink.com/api/v1/spotlights/2024-02-29",
        ])
        for call in requests:
            self.assertEqual(call.kwargs["timeout"], 10)
            self.assertEqual(call.args[0].get_method(), "GET")
            self.assertEqual(call.args[0].headers, {"Accept": "application/json", "User-agent": "nowyourlink-agent-kit/0.1.0 (+https://nowyourlink.com/developers)"})

    def test_invalid_inputs_do_not_request(self):
        client = SpotlightClient()
        client._opener = Mock()
        for options in [{"limit": 0}, {"limit": 51}, {"limit": True}, {"offset": -1}, {"offset": 10001}, {"limit": "5"}]:
            with self.assertRaises(ValueError):
                client.list(**options)
        for day in ["2023-02-29", "2024-02-30", "20240901", "../account", None]:
            with self.assertRaises(ValueError):
                client.day(day)
        client._opener.open.assert_not_called()
        for origin in ["http://example.com", "https://x:y@example.com", "https://example.com/path", "https://example.com?token=x", "https://example.com#x"]:
            with self.assertRaises(ValueError):
                SpotlightClient(base_url=origin)
        for timeout in [0, 61, True, 1.5]:
            with self.assertRaises(ValueError):
                SpotlightClient(timeout_seconds=timeout)

    def test_errors_are_safe_and_not_retried(self):
        for status in [404, 429, 503]:
            client = SpotlightClient()
            client._opener = Mock()
            client._opener.open.side_effect = urllib.error.HTTPError("private", status, "private", {}, io.BytesIO(b"private"))
            with self.assertRaises(SpotlightError) as caught:
                client.current()
            self.assertEqual(caught.exception.status, status)
            self.assertNotIn("private", str(caught.exception))
            client._opener.open.assert_called_once()
        for failure in [OSError("private"), ValueError("private")]:
            client._opener.open.reset_mock()
            client._opener.open.side_effect = failure
            with self.assertRaises(SpotlightError) as caught:
                client.current()
            self.assertEqual(caught.exception.status, 0)
            self.assertNotIn("private", str(caught.exception))
            client._opener.open.assert_called_once()

    def test_invalid_json_and_redirect_refusal(self):
        client = SpotlightClient()
        client._opener = Mock()
        client._opener.open.return_value = io.BytesIO(b"not json")
        with self.assertRaises(SpotlightError):
            client.current()
        self.assertIsNone(_NoRedirect().redirect_request(None, None, 302, "", {}, "https://other.example"))


if __name__ == "__main__":
    unittest.main()
