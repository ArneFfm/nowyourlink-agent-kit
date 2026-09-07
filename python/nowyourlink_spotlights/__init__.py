"""Anonymous public reads using only the Python standard library."""

import datetime
import json
import urllib.error
import urllib.parse
import urllib.request


class SpotlightError(Exception):
    """An HTTP failure (status > 0) or transport/JSON failure (status == 0)."""

    def __init__(self, message, status=0):
        super().__init__(message)
        self.status = status


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _integer(value, name, minimum, maximum):
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError(f"{name} must be an integer from {minimum} to {maximum}.")
    return value


class SpotlightClient:
    def __init__(self, base_url="https://nowyourlink.com", timeout_seconds=10):
        url = urllib.parse.urlsplit(base_url)
        if (url.scheme != "https" or not url.hostname or url.username is not None
                or url.password is not None or url.query or url.fragment
                or url.path not in ("", "/")):
            raise ValueError("base_url must be an HTTPS origin without credentials, path, query or fragment.")
        self.origin = urllib.parse.urlunsplit((url.scheme, url.netloc, "", "", ""))
        self.timeout = _integer(timeout_seconds, "timeout_seconds", 1, 60)
        self._opener = urllib.request.build_opener(_NoRedirect())

    def _read(self, path):
        request = urllib.request.Request(
            self.origin + path, headers={"Accept": "application/json", "User-Agent": "nowyourlink-agent-kit/0.1.0 (+https://nowyourlink.com/developers)"}, method="GET"
        )
        try:
            with self._opener.open(request, timeout=self.timeout) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            status = error.code
            error.close()
            raise SpotlightError(f"Public API returned HTTP {status}. See https://nowyourlink.com/developers.md", status) from None
        except (OSError, ValueError):
            raise SpotlightError("Public API request failed or returned invalid JSON. Check connectivity and retry later.") from None

    def current(self):
        return self._read("/api/v1/spotlight")

    def list(self, *, limit=20, offset=0):
        _integer(limit, "limit", 1, 50)
        _integer(offset, "offset", 0, 10000)
        return self._read(f"/api/v1/spotlights?limit={limit}&offset={offset}")

    def day(self, day):
        try:
            if not isinstance(day, str) or len(day) != 10 or datetime.date.fromisoformat(day).isoformat() != day:
                raise ValueError()
        except (TypeError, ValueError):
            raise ValueError("day must be a valid YYYY-MM-DD date.") from None
        return self._read(f"/api/v1/spotlights/{day}")
