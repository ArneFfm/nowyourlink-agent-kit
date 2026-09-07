export class SpotlightError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "SpotlightError";
    this.status = status;
  }
}

function integer(value, name, min, max) {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new TypeError(`${name} must be an integer from ${min} to ${max}.`);
  return value;
}

/** Public, anonymous reads only. Node.js 22+ or a browser with native fetch. */
export class SpotlightClient {
  constructor({
    baseUrl = "https://nowyourlink.com",
    fetch: fetcher = globalThis.fetch,
    timeoutMs = 10000,
  } = {}) {
    const url = new URL(baseUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new TypeError(
        "baseUrl must be an HTTPS origin without credentials, path, query or fragment.",
      );
    if (typeof fetcher !== "function")
      throw new TypeError("fetch must be a function.");
    this.origin = url.origin;
    this.fetch = fetcher;
    this.timeoutMs = integer(timeoutMs, "timeoutMs", 1, 60000);
  }

  async #read(path) {
    if (
      !/^\/api\/v1\/(spotlight|spotlights\?limit=\d+&offset=\d+|spotlights\/\d{4}-\d{2}-\d{2})$/.test(
        path,
      )
    )
      throw new TypeError("Unsupported public read route.");
    try {
      const response = await this.fetch(`${this.origin}${path}`, {
        method: "GET",
        credentials: "omit",
        redirect: "error",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok)
        throw new SpotlightError(
          `Public API returned HTTP ${response.status}. See https://nowyourlink.com/developers.md`,
          response.status,
        );
      return await response.json();
    } catch (error) {
      if (error instanceof SpotlightError) throw error;
      throw new SpotlightError(
        "Public API request failed or returned invalid JSON. Check connectivity and retry later.",
      );
    }
  }

  current() {
    return this.#read("/api/v1/spotlight");
  }

  list({ limit = 20, offset = 0, ...extra } = {}) {
    if (Object.keys(extra).length)
      throw new TypeError("Unknown pagination option.");
    integer(limit, "limit", 1, 50);
    integer(offset, "offset", 0, 10000);
    return this.#read(`/api/v1/spotlights?limit=${limit}&offset=${offset}`);
  }

  day(day) {
    if (
      typeof day !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      !Number.isFinite(Date.parse(`${day}T00:00:00Z`)) ||
      new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day
    )
      throw new TypeError("day must be a valid YYYY-MM-DD date.");
    return this.#read(`/api/v1/spotlights/${day}`);
  }
}
