import assert from "node:assert/strict";
import { test } from "node:test";
import { run } from "../cli.js";
import { SpotlightClient, SpotlightError } from "../sdk.js";

test("public requests have exact routes, omit credentials, and return envelopes", async () => {
  const paths = [];
  const client = new SpotlightClient({
    fetch: async (url, options) => {
      paths.push(url);
      assert.equal(options.method, "GET");
      assert.equal(options.credentials, "omit");
      assert.equal(options.redirect, "error");
      assert.ok(options.signal instanceof AbortSignal);
      return Response.json({ data: [], nextOffset: null });
    },
  });
  assert.deepEqual(await client.current(), { data: [], nextOffset: null });
  await client.list();
  await client.list({ limit: 50, offset: 10000 });
  await client.day("2024-02-29");
  assert.deepEqual(paths, [
    "https://nowyourlink.com/api/v1/spotlight",
    "https://nowyourlink.com/api/v1/spotlights?limit=20&offset=0",
    "https://nowyourlink.com/api/v1/spotlights?limit=50&offset=10000",
    "https://nowyourlink.com/api/v1/spotlights/2024-02-29",
  ]);
});

test("invalid arguments fail before fetch", () => {
  const client = new SpotlightClient({
    fetch: () => assert.fail("network called"),
  });
  for (const day of [
    "2023-02-29",
    "2024-13-01",
    "../account",
    "",
    1,
    "2024-02-30",
  ])
    assert.throws(() => client.day(day), TypeError);
  for (const options of [
    { limit: 0 },
    { limit: 51 },
    { limit: 1.5 },
    { limit: "1" },
    { offset: -1 },
    { offset: 10001 },
    { token: "secret" },
  ])
    assert.throws(() => client.list(options), TypeError);
  for (const baseUrl of [
    "http://example.com",
    "https://user:pass@example.com",
    "https://example.com/path",
    "https://example.com#hash",
    "https://example.com?token=x",
  ])
    assert.throws(() => new SpotlightClient({ baseUrl }), TypeError);
  for (const timeoutMs of [0, 60001, NaN])
    assert.throws(() => new SpotlightClient({ timeoutMs }), TypeError);
  assert.throws(() => new SpotlightClient({ fetch: null }), TypeError);
});

test("HTTP errors retain status without echoing upstream content", async () => {
  for (const status of [404, 429, 503]) {
    const client = new SpotlightClient({
      fetch: async () => new Response("sensitive upstream content", { status }),
    });
    await assert.rejects(
      client.current(),
      (error) =>
        error instanceof SpotlightError &&
        error.status === status &&
        !error.message.includes("sensitive"),
    );
  }
});

test("network and invalid JSON failures are safe and never retried", async () => {
  for (const fetch of [
    async () => {
      throw new Error("private proxy address");
    },
    async () => new Response("not json"),
  ]) {
    let calls = 0;
    const client = new SpotlightClient({
      fetch: (...args) => {
        calls++;
        return fetch(...args);
      },
    });
    await assert.rejects(
      client.current(),
      (error) =>
        error instanceof SpotlightError &&
        error.status === 0 &&
        !error.message.includes("private"),
    );
    assert.equal(calls, 1);
  }
});

test("CLI parses bounded operations and rejects surplus or ambiguous arguments", async () => {
  const client = new SpotlightClient({
    fetch: async (url) => Response.json({ url }),
  });
  assert.match((await run(["current"], client)).url, /spotlight$/);
  assert.match((await run(["day", "2024-02-29"], client)).url, /2024-02-29$/);
  assert.match(
    (await run(["list", "--offset", "2", "--limit", "3"], client)).url,
    /limit=3&offset=2$/,
  );
  assert.match(await run(["--help"], client), /Usage:/);
  for (const args of [
    [],
    ["current", "extra"],
    ["day"],
    ["list", "--limit"],
    ["list", "--limit", "2", "--limit", "3"],
    ["list", "--limit", "1e1"],
    ["list", "--wat", "1"],
    ["list", "--limit", "51"],
  ])
    await assert.rejects(run(args, client), TypeError);
});

test("installed CLI entrypoint runs through an npm-style symlink", async () => {
  const { mkdtemp, symlink, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const { execFileSync } = await import("node:child_process");
  const directory = await mkdtemp(join(tmpdir(), "nyl-cli-test-"));
  try {
    const executable = join(directory, "nowyourlink");
    await symlink(fileURLToPath(new URL("../cli.js", import.meta.url)), executable);
    const output = execFileSync(process.execPath, [executable, "--help"], {
      encoding: "utf8",
    });
    assert.match(output, /^Usage: nowyourlink current/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
