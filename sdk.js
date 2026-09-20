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

/** An advertiser API failure. `code` is the problem+json `code` member. */
export class AgentError extends Error {
  constructor(message, status = 0, code = null) {
    super(message);
    this.name = "AgentError";
    this.status = status;
    this.code = code;
  }
}

const CREATIVE_FIELDS = {
  headline: "headline",
  description: "body",
  body: "body",
  targetUrl: "target_url",
  displayUrl: "display_url",
  ctaLabel: "cta_label",
  altText: "alt_text",
};

function creativeBody(patch) {
  const body = {};
  for (const [key, value] of Object.entries(patch)) {
    const field = CREATIVE_FIELDS[key];
    if (!field) throw new TypeError(`Unknown creative field: ${key}`);
    if (value !== undefined) body[field] = value;
  }
  return body;
}

/**
 * Delegated advertiser API (spec 17). Every call carries an OAuth 2.1 bearer
 * token; `refresh` is an optional async function returning a new access token,
 * used once per request when the server answers 401.
 */
export class AdvertiserClient {
  constructor({
    baseUrl = "https://api.nowyourlink.com",
    accessToken,
    refresh,
    fetch: fetcher = globalThis.fetch,
    timeoutMs = 10000,
  } = {}) {
    if (typeof accessToken !== "string" || !accessToken)
      throw new TypeError("accessToken is required.");
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" && url.hostname !== "127.0.0.1")
      throw new TypeError("baseUrl must be an HTTPS origin.");
    if (typeof fetcher !== "function")
      throw new TypeError("fetch must be a function.");
    this.origin = url.origin;
    this.accessToken = accessToken;
    this.refresh = refresh;
    this.fetch = fetcher;
    this.timeoutMs = integer(timeoutMs, "timeoutMs", 1, 60000);
  }

  async #send(method, path, { body, headers = {} } = {}) {
    const request = () =>
      this.fetch(`${this.origin}${path}`, {
        method,
        credentials: "omit",
        redirect: "error",
        headers: {
          accept: "application/json",
          ...headers,
          authorization: `Bearer ${this.accessToken}`,
        },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    let response = await request();
    if (response.status === 401 && this.refresh) {
      this.accessToken = await this.refresh();
      response = await request();
    }
    const payload =
      response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok)
      throw new AgentError(
        payload?.detail ??
          payload?.title ??
          `Advertiser API returned HTTP ${response.status}.`,
        response.status,
        payload?.code ?? null,
      );
    return payload;
  }

  #json(method, path, body, headers) {
    return this.#send(method, path, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", ...headers },
    });
  }

  me() {
    return this.#send("GET", "/v1/agent/me");
  }

  listBids(day) {
    return this.#send(
      "GET",
      `/v1/agent/bids?day=${encodeURIComponent(day ?? "")}`,
    );
  }

  placeBid({ day, adId, amountCents, currency = "EUR", idempotencyKey }) {
    if (!idempotencyKey)
      throw new TypeError("idempotencyKey is required for a bid.");
    return this.#json(
      "POST",
      "/v1/agent/bids",
      { day, ad_id: adId, amount_cents: amountCents, currency },
      { "Idempotency-Key": idempotencyKey },
    );
  }

  increaseBid(
    bidId,
    { day, adId, amountCents, currency = "EUR", idempotencyKey },
  ) {
    if (!idempotencyKey)
      throw new TypeError("idempotencyKey is required for a bid increase.");
    return this.#json(
      "POST",
      `/v1/agent/bids/${encodeURIComponent(bidId)}/increase`,
      { day, ad_id: adId, amount_cents: amountCents, currency },
      { "Idempotency-Key": idempotencyKey },
    );
  }

  listCreatives({ cursor, state } = {}) {
    const query = new URLSearchParams();
    if (cursor) query.set("cursor", cursor);
    if (state) query.set("state", state);
    const search = query.toString();
    return this.#send(
      "GET",
      `/v1/agent/creatives${search ? `?${search}` : ""}`,
    );
  }

  getCreative(id) {
    return this.#send("GET", `/v1/agent/creatives/${encodeURIComponent(id)}`);
  }

  /**
   * Uploads the image, then applies any copy to the draft it created. `file`
   * is a Blob (the CLI reads a path and wraps it); `url` is fetched first.
   */
  async uploadCreative({ file, url, filename = "creative", ...copy }) {
    let blob = file;
    if (!blob && url) {
      const source = await this.fetch(url, { redirect: "error" });
      if (!source.ok)
        throw new AgentError(
          `Creative source returned HTTP ${source.status}.`,
          source.status,
        );
      blob = await source.blob();
    }
    if (!blob) throw new TypeError("Pass file (a Blob) or url.");
    const form = new FormData();
    form.append("file", blob, filename);
    const uploaded = await this.#send("POST", "/v1/agent/creatives/upload", {
      body: form,
    });
    const patch = creativeBody(copy);
    if (Object.keys(patch).length)
      await this.updateCreative(uploaded.ad_id, copy);
    return uploaded;
  }

  updateCreative(id, patch) {
    return this.#json(
      "PATCH",
      `/v1/agent/creatives/${encodeURIComponent(id)}`,
      creativeBody(patch),
    );
  }

  submitCreative(id) {
    return this.#send(
      "POST",
      `/v1/agent/creatives/${encodeURIComponent(id)}/submit`,
    );
  }

  listInvoices() {
    return this.#send("GET", "/v1/agent/invoices");
  }
}
