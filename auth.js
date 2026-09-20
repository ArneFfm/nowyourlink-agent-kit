/**
 * Delegated advertiser authorization: OAuth 2.1 authorization code with PKCE
 * and an RFC 8252 loopback redirect. Node.js only; `sdk.js` stays free of
 * `node:` imports so it keeps working in a browser.
 */
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { AdvertiserClient, AgentError } from "./sdk.js";

/** Authorization server and resource server for advertiser scopes. */
export const ISSUER = "https://api.nowyourlink.com";
/** CIMD client document served from the apex (RFC 8252 §7.3 loopback). */
export const CLIENT_ID =
  "https://nowyourlink.com/.well-known/nowyourlink-cli-client.json";
export const SCOPES = [
  "account:read",
  "bids:read",
  "bids:write",
  "creatives:read",
  "creatives:write",
  "invoices:read",
];

const base64url = (buffer) => buffer.toString("base64url");

/** RFC 7636 S256 pair. The challenge is the SHA-256 of the verifier. */
export function pkcePair() {
  const verifier = base64url(randomBytes(32));
  return {
    verifier,
    challenge: base64url(createHash("sha256").update(verifier).digest()),
  };
}

/**
 * Reads the authorization response. The state check runs first: a mismatched
 * state means the response belongs to another request and its code is never
 * exchanged.
 */
export function parseCallback(url, expectedState) {
  const query = new URL(url, "http://127.0.0.1").searchParams;
  if (query.get("state") !== expectedState)
    throw new AgentError("OAuth state mismatch. The response was discarded.");
  const failure = query.get("error");
  if (failure)
    throw new AgentError(
      `Authorization failed: ${failure}${
        query.get("error_description")
          ? ` (${query.get("error_description")})`
          : ""
      }`,
    );
  const code = query.get("code");
  if (!code) throw new AgentError("Authorization response carried no code.");
  return code;
}

/** `~/.config/nowyourlink/token.json`, or under `XDG_CONFIG_HOME`. */
export function tokenFile() {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "nowyourlink", "token.json");
}

/**
 * Owner-only: the file holds a bearer token and a refresh token. `mkdir` and
 * `writeFile` mask their mode with the umask, and neither narrows a path that
 * already exists, so both are chmod-ed after the fact.
 */
export async function saveTokens(tokens, file = tokenFile()) {
  const directory = join(file, "..");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  await writeFile(file, `${JSON.stringify(tokens, null, 2)}\n`, {
    mode: 0o600,
  });
  await chmod(file, 0o600);
  return file;
}

export async function loadTokens(file = tokenFile()) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

export async function clearTokens(file = tokenFile()) {
  await rm(file, { force: true });
}

function authorizeUrl({ issuer, clientId, redirectUri, scopes, state, pkce }) {
  const url = new URL("/oauth/authorize", issuer);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(" "),
    state,
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

async function postForm(url, body, fetcher) {
  const response = await fetcher(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams(body).toString(),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new AgentError(
      `Token endpoint returned HTTP ${response.status}: ${
        payload?.error_description ?? payload?.error ?? "no detail"
      }`,
      response.status,
      payload?.error,
    );
  return payload;
}

/**
 * RFC 7591 dynamic client registration with the loopback port this run
 * actually listens on. Only used when the CIMD client is rejected.
 */
async function registerClient(issuer, redirectUri, fetcher) {
  const response = await fetcher(new URL("/oauth/register", issuer), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_name: "nowyourlink CLI",
      client_uri: "https://nowyourlink.com/developers",
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.client_id)
    throw new AgentError(
      `Dynamic client registration failed with HTTP ${response.status}.`,
      response.status,
    );
  return payload.client_id;
}

/**
 * Returns false when the authorization server refuses this redirect URI for
 * this client. The server answers a bad redirect locally with 400 rather than
 * redirecting to it, so the CLI can read the refusal before it opens a browser.
 */
async function redirectAccepted(url, fetcher) {
  const response = await fetcher(url, { redirect: "manual" });
  if (response.status !== 400) return true;
  return !/invalid redirect uri/i.test(await response.text().catch(() => ""));
}

function openBrowser(url) {
  // `start` is a cmd.exe builtin, not a program. Its first quoted argument is
  // the window title, so the empty string keeps the URL as the target; verbatim
  // arguments stop Node re-quoting the `&` in a query string.
  const [command, args, options] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url], { windowsVerbatimArguments: true }]
      : [process.platform === "darwin" ? "open" : "xdg-open", [url], {}];
  try {
    spawn(command, args, {
      stdio: "ignore",
      detached: true,
      ...options,
    }).unref();
  } catch {
    // The printed URL is the fallback; a missing opener is not a failure.
  }
}

function startLoopback(state) {
  const server = createServer();
  const code = new Promise((resolve, reject) => {
    server.on("error", reject);
    server.on("request", (request, response) => {
      const target = new URL(request.url, "http://127.0.0.1");
      if (target.pathname !== "/callback") {
        response.writeHead(404).end();
        return;
      }
      // A response for another state belongs to another authorization request.
      // Answering 204 and staying open means a stray or forged hit cannot end
      // the login the user is waiting on.
      if (target.searchParams.get("state") !== state) {
        response.writeHead(204).end();
        return;
      }
      const plain = { "content-type": "text/plain; charset=utf-8" };
      // The browser has delivered the only request this listener exists for.
      // Keep-alive sockets would otherwise hold `server.close()` open.
      const finish = () => server.closeAllConnections();
      try {
        const value = parseCallback(request.url, state);
        response
          .writeHead(200, plain)
          .end("nowyourlink: authorized. You can close this tab.", finish);
        resolve(value);
      } catch (error) {
        response.writeHead(400, plain).end(error.message, finish);
        reject(error);
      }
    });
  });
  const listening = new Promise((resolve) =>
    server.listen(0, "127.0.0.1", resolve),
  );
  return { server, code, listening };
}

/** An unfinished browser flow must not hold the process open for ever. */
export const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

function deadline(ms) {
  let timer;
  const promise = new Promise((_resolve, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new AgentError(
            `Authorization timed out after ${Math.round(ms / 1000)} s.`,
          ),
        ),
      ms,
    );
  });
  return { promise, clear: () => clearTimeout(timer) };
}

/**
 * Runs the full browser flow and returns the token set. `mandateHint` is not a
 * protocol parameter: the spend mandate is chosen by the human on the consent
 * page, so the hint is only printed as guidance.
 */
export async function login({
  clientId = CLIENT_ID,
  scopes = SCOPES,
  mandateHint,
  issuer = ISSUER,
  fetch: fetcher = globalThis.fetch,
  open = openBrowser,
  log = (line) => process.stderr.write(`${line}\n`),
  timeoutMs = LOGIN_TIMEOUT_MS,
} = {}) {
  const pkce = pkcePair();
  const state = base64url(randomBytes(16));
  const { server, code, listening } = startLoopback(state);
  // The race leaves the loser pending. A handler on each side keeps Node from
  // reporting the abandoned rejection as unhandled.
  code.catch(() => {});
  const timeout = deadline(timeoutMs);
  timeout.promise.catch(() => {});
  try {
    await listening;
    const redirectUri = `http://127.0.0.1:${server.address().port}/callback`;
    let url = authorizeUrl({
      issuer,
      clientId,
      redirectUri,
      scopes,
      state,
      pkce,
    });
    let client = clientId;
    if (!(await redirectAccepted(url, fetcher))) {
      client = await registerClient(issuer, redirectUri, fetcher);
      url = authorizeUrl({
        issuer,
        clientId: client,
        redirectUri,
        scopes,
        state,
        pkce,
      });
    }
    if (mandateHint)
      log(`Requested mandate (set it on the consent page): ${mandateHint}`);
    log(`Open this URL to authorize nowyourlink:\n${url}`);
    open(url);
    const tokens = await postForm(
      new URL("/oauth/token", issuer),
      {
        grant_type: "authorization_code",
        code: await Promise.race([code, timeout.promise]),
        redirect_uri: redirectUri,
        client_id: client,
        code_verifier: pkce.verifier,
      },
      fetcher,
    );
    return { ...tokens, client_id: client, issuer };
  } finally {
    timeout.clear();
    server.close();
    server.closeAllConnections();
  }
}

export function refreshTokens({
  refreshToken,
  clientId = CLIENT_ID,
  issuer = ISSUER,
  fetch: fetcher = globalThis.fetch,
}) {
  if (!refreshToken) throw new AgentError("No refresh token stored.");
  return postForm(
    new URL("/oauth/token", issuer),
    {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
    },
    fetcher,
  );
}

/**
 * Builds a client from the stored token set. A 401 refreshes once and the new
 * token set replaces the file.
 */
export async function advertiserClient(options = {}) {
  const file = options.file ?? tokenFile();
  let stored = await loadTokens(file);
  if (!stored?.access_token)
    throw new AgentError("Not logged in. Run `nowyourlink login` first.");
  return new AdvertiserClient({
    baseUrl: stored.issuer ?? ISSUER,
    accessToken: stored.access_token,
    ...options,
    refresh: async () => {
      const next = await refreshTokens({
        refreshToken: stored.refresh_token,
        clientId: stored.client_id ?? CLIENT_ID,
        issuer: stored.issuer ?? ISSUER,
        fetch: options.fetch ?? globalThis.fetch,
      });
      // Reassign: an authorization server that rotates refresh tokens
      // invalidates the old one, so a second refresh must use the new value.
      stored = { ...stored, ...next };
      await saveTokens(stored, file);
      return stored.access_token;
    },
  });
}

/** A fresh idempotency key for one bid attempt. Reuse it to retry safely. */
export const newIdempotencyKey = () => randomUUID();
