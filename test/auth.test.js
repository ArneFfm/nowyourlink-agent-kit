import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  advertiserClient,
  CLIENT_ID,
  ISSUER,
  LOGIN_TIMEOUT_MS,
  loadTokens,
  login,
  parseCallback,
  pkcePair,
  saveTokens,
  tokenFile,
} from "../auth.js";
import { run } from "../cli.js";
import { AdvertiserClient, AgentError } from "../sdk.js";

const base64url = (buffer) => buffer.toString("base64url");

test("the PKCE challenge is the S256 hash of the verifier", () => {
  const { verifier, challenge } = pkcePair();
  assert.match(verifier, /^[\w-]{43}$/);
  assert.equal(
    challenge,
    base64url(createHash("sha256").update(verifier).digest()),
  );
  assert.notEqual(pkcePair().verifier, verifier);
});

test("parseCallback returns the code and rejects a state mismatch", () => {
  assert.equal(parseCallback("/callback?code=abc&state=s1", "s1"), "abc");
  assert.throws(
    () => parseCallback("/callback?code=abc&state=other", "s1"),
    /state mismatch/i,
  );
  assert.throws(
    () => parseCallback("/callback?error=access_denied&state=s1", "s1"),
    /access_denied/,
  );
  assert.throws(() => parseCallback("/callback?state=s1", "s1"), AgentError);
});

test("the token store is owner-only and round-trips", async () => {
  const file = join(await mkdtemp(join(tmpdir(), "nyl-")), "token.json");
  const tokens = { access_token: "a", refresh_token: "r", issuer: ISSUER };
  await saveTokens(tokens, file);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.deepEqual(await loadTokens(file), tokens);
  assert.equal(await loadTokens(join(file, "missing.json")), null);
});

test("tokenFile honours XDG_CONFIG_HOME", () => {
  const previous = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = "/tmp/xdg";
  assert.equal(tokenFile(), "/tmp/xdg/nowyourlink/token.json");
  if (previous === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = previous;
});

test("placeBid sends the bearer token and the idempotency key", async () => {
  const calls = [];
  const client = new AdvertiserClient({
    accessToken: "token-1",
    fetch: async (url, options) => {
      calls.push({ url, options });
      return Response.json({ day: "2026-10-01", phase: "OPEN", bidCount: 1 });
    },
  });
  await client.placeBid({
    day: "2026-10-01",
    adId: "ad_1",
    amountCents: 2500,
    idempotencyKey: "key-1",
  });
  assert.equal(calls[0].url, "https://api.nowyourlink.com/v1/agent/bids");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.authorization, "Bearer token-1");
  assert.equal(calls[0].options.headers["Idempotency-Key"], "key-1");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    day: "2026-10-01",
    ad_id: "ad_1",
    amount_cents: 2500,
    currency: "EUR",
  });
  assert.throws(
    () => client.placeBid({ day: "2026-10-01", adId: "ad_1", amountCents: 1 }),
    TypeError,
  );
});

test("a 401 refreshes the token once and replays the request", async () => {
  const sent = [];
  let refreshes = 0;
  const client = new AdvertiserClient({
    accessToken: "stale",
    refresh: async () => {
      refreshes += 1;
      return "fresh";
    },
    fetch: async (_url, options) => {
      sent.push(options.headers.authorization);
      return options.headers.authorization === "Bearer fresh"
        ? Response.json({ invoices: [] })
        : Response.json({ error: "invalid_token" }, { status: 401 });
    },
  });
  assert.deepEqual(await client.listInvoices(), { invoices: [] });
  assert.deepEqual(sent, ["Bearer stale", "Bearer fresh"]);
  assert.equal(refreshes, 1);
});

test("a second 401 is not retried and surfaces the problem code", async () => {
  const client = new AdvertiserClient({
    accessToken: "stale",
    refresh: async () => "still-stale",
    fetch: async () =>
      Response.json(
        { code: "agent.scope-missing", detail: "bids:write is missing." },
        { status: 403 },
      ),
  });
  await assert.rejects(client.me(), (error) => {
    assert.ok(error instanceof AgentError);
    assert.equal(error.status, 403);
    assert.equal(error.code, "agent.scope-missing");
    return true;
  });
});

test("login uses PKCE S256 on the CIMD client and a loopback redirect", async () => {
  let authorize;
  const tokens = await login({
    fetch: async (url, options) => {
      if (String(url).includes("/oauth/authorize")) {
        authorize = new URL(url);
        return new Response(null, { status: 302 });
      }
      const body = new URLSearchParams(options.body);
      assert.equal(body.get("grant_type"), "authorization_code");
      assert.equal(body.get("code"), "the-code");
      assert.equal(body.get("client_id"), CLIENT_ID);
      assert.equal(
        base64url(
          createHash("sha256").update(body.get("code_verifier")).digest(),
        ),
        authorize.searchParams.get("code_challenge"),
      );
      assert.equal(
        body.get("redirect_uri"),
        authorize.searchParams.get("redirect_uri"),
      );
      return Response.json({ access_token: "at", refresh_token: "rt" });
    },
    log: () => {},
    open: async (url) => {
      const target = new URL(new URL(url).searchParams.get("redirect_uri"));
      target.searchParams.set("code", "the-code");
      target.searchParams.set("state", new URL(url).searchParams.get("state"));
      await fetch(target);
    },
  });
  assert.equal(authorize.origin, ISSUER);
  assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authorize.searchParams.get("response_type"), "code");
  assert.match(
    authorize.searchParams.get("redirect_uri"),
    /^http:\/\/127\.0\.0\.1:\d+\/callback$/,
  );
  assert.deepEqual(tokens, {
    access_token: "at",
    refresh_token: "rt",
    client_id: CLIENT_ID,
    issuer: ISSUER,
  });
});

test("a rejected loopback redirect falls back to dynamic registration", async () => {
  const clientIds = [];
  const opened = [];
  let registered = 0;
  await login({
    fetch: async (url, options) => {
      if (String(url).includes("/oauth/register")) {
        registered += 1;
        const body = JSON.parse(options.body);
        assert.match(body.redirect_uris[0], /^http:\/\/127\.0\.0\.1:\d+\//);
        assert.equal(body.token_endpoint_auth_method, "none");
        return Response.json({ client_id: "dcr-client" });
      }
      if (String(url).includes("/oauth/authorize")) {
        const clientId = new URL(url).searchParams.get("client_id");
        clientIds.push(clientId);
        return clientId === CLIENT_ID
          ? new Response("Invalid redirect URI", { status: 400 })
          : new Response(null, { status: 302 });
      }
      assert.equal(
        new URLSearchParams(options.body).get("client_id"),
        "dcr-client",
      );
      return Response.json({ access_token: "at" });
    },
    log: () => {},
    open: async (url) => {
      opened.push(new URL(url).searchParams.get("client_id"));
      const target = new URL(new URL(url).searchParams.get("redirect_uri"));
      target.searchParams.set("code", "c");
      target.searchParams.set("state", new URL(url).searchParams.get("state"));
      await fetch(target);
    },
  });
  assert.equal(registered, 1);
  assert.deepEqual(clientIds, [CLIENT_ID]);
  assert.deepEqual(opened, ["dcr-client"]);
});

test("advertiserClient refreshes from the store and rewrites it", async () => {
  const file = join(await mkdtemp(join(tmpdir(), "nyl-")), "token.json");
  await saveTokens(
    { access_token: "old", refresh_token: "rt", issuer: ISSUER },
    file,
  );
  const client = await advertiserClient({
    file,
    fetch: async (url, options) => {
      if (String(url).includes("/oauth/token")) {
        assert.equal(
          new URLSearchParams(options.body).get("refresh_token"),
          "rt",
        );
        return Response.json({ access_token: "new", refresh_token: "rt2" });
      }
      return options.headers.authorization === "Bearer new"
        ? Response.json({ user_id: "u1" })
        : Response.json({ code: "x" }, { status: 401 });
    },
  });
  assert.deepEqual(await client.me(), { user_id: "u1" });
  assert.deepEqual(await loadTokens(file), {
    access_token: "new",
    refresh_token: "rt2",
    issuer: ISSUER,
  });
});

test("login gives up after its deadline and releases the listener", async () => {
  assert.equal(LOGIN_TIMEOUT_MS, 300000);
  let redirectUri;
  await assert.rejects(
    login({
      timeoutMs: 40,
      fetch: async (url) => {
        redirectUri = new URL(url).searchParams.get("redirect_uri");
        return new Response(null, { status: 302 });
      },
      log: () => {},
      open: () => {},
    }),
    /timed out after 0 s/,
  );
  // The port is free again: the listener was closed, not merely abandoned.
  await assert.rejects(fetch(redirectUri), TypeError);
});

test("a callback for another state is ignored and the login keeps waiting", async () => {
  const answers = [];
  let delivered;
  const tokens = await login({
    timeoutMs: 5000,
    fetch: async (url, options) => {
      if (String(url).includes("/oauth/authorize"))
        return new Response(null, { status: 302 });
      assert.equal(new URLSearchParams(options.body).get("code"), "right");
      return Response.json({ access_token: "at" });
    },
    log: () => {},
    open: (url) => {
      const authorize = new URL(url).searchParams;
      const base = new URL(authorize.get("redirect_uri"));
      const hit = async (path, search) => {
        const target = new URL(base);
        target.pathname = path;
        target.search = search;
        answers.push((await fetch(target)).status);
      };
      // A different path, then a stray state, then the real response. Only the
      // last one may end the login.
      delivered = (async () => {
        await hit("/callbackx", "");
        await hit("/callback", "code=wrong&state=someone-else");
        await hit("/callback", `code=right&state=${authorize.get("state")}`);
      })();
    },
  });
  await delivered;
  assert.deepEqual(answers, [404, 204, 200]);
  assert.equal(tokens.access_token, "at");
});

test("a rotated refresh token is the one the next refresh sends", async () => {
  const file = join(await mkdtemp(join(tmpdir(), "nyl-")), "token.json");
  await saveTokens({ access_token: "t0", refresh_token: "r0" }, file);
  const sent = [];
  let issued = 0;
  let reads = 0;
  const client = await advertiserClient({
    file,
    fetch: async (url, options) => {
      if (String(url).includes("/oauth/token")) {
        sent.push(new URLSearchParams(options.body).get("refresh_token"));
        issued += 1;
        return Response.json({
          access_token: `t${issued}`,
          refresh_token: `r${issued}`,
        });
      }
      // Every first attempt is stale, so both calls refresh. The second must
      // not replay the refresh token the first one already spent.
      reads += 1;
      return reads % 2 === 1
        ? Response.json({ code: "expired" }, { status: 401 })
        : Response.json({ token: options.headers.authorization });
    },
  });
  assert.deepEqual(await client.me(), { token: "Bearer t1" });
  assert.deepEqual(await client.listInvoices(), { token: "Bearer t2" });
  assert.deepEqual(sent, ["r0", "r1"]);
  assert.deepEqual(await loadTokens(file), {
    access_token: "t2",
    refresh_token: "r2",
  });
});

test("advertiser CLI flags accept only --name value pairs", async () => {
  const calls = [];
  const agent = async () => ({
    listBids: (day) => {
      calls.push(day);
      return { bids: [] };
    },
    listCreatives: (options) => {
      calls.push(options);
      return { ads: [], cursor: null };
    },
  });
  assert.deepEqual(
    await run(["bids", "--day", "2026-10-01"], undefined, { agent }),
    {
      bids: [],
    },
  );
  assert.deepEqual(calls, ["2026-10-01"]);
  for (const args of [
    ["bids", "day", "2026-10-01"],
    ["bids", "--day"],
    ["bids", "--day", "2026-10-01", "--day", "2026-10-02"],
    ["bids", "--unknown", "x"],
    ["bids", "-d", "2026-10-01"],
    ["bids", "--Day", "2026-10-01"],
    ["bids", "--day", "2026-10-01", "extra"],
    ["creative", "list", "draft"],
  ])
    await assert.rejects(run(args, undefined, { agent }), TypeError);
});
