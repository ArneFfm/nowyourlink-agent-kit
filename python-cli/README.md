# nowyourlink CLI

Official command-line client for the public nowyourlink Spotlight API. It installs the `nowyourlink` command and depends on the `nowyourlink-spotlights` SDK; both are MIT-licensed and read only public, settled advertising data without credentials.

## Documentation

- [nowyourlink API documentation](https://nowyourlink.com/developers) — endpoints, limits, examples
- [nowyourlink OpenAPI specification](https://nowyourlink.com/openapi.json)
- [nowyourlink agent guide](https://nowyourlink.com/agents) — MCP tools, usage rules
- [nowyourlink authentication](https://nowyourlink.com/auth) — anonymous public access
- [nowyourlink MCP server](https://nowyourlink.com/mcp) (Streamable HTTP) and [docs MCP server](https://nowyourlink.com/mcp/docs)
- [nowyourlink pricing](https://nowyourlink.com/pricing) and [API versioning policy](https://nowyourlink.com/versioning)

```bash
python -m pip install nowyourlink
nowyourlink current
nowyourlink list --limit 5
nowyourlink day 2026-09-01
```

Results are JSON on stdout. Usage errors exit with code 2. See https://nowyourlink.com/developers for the API contract and https://github.com/ArneFfm/nowyourlink-agent-kit for source.
