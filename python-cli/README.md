# nowyourlink CLI

Official command-line client for the public nowyourlink Spotlight API. It installs the `nowyourlink` command and depends on the `nowyourlink-spotlights` SDK; both are MIT-licensed and read only public, settled advertising data without credentials.

```bash
python -m pip install nowyourlink
nowyourlink current
nowyourlink list --limit 5
nowyourlink day 2026-09-01
```

Results are JSON on stdout. Usage errors exit with code 2. See https://nowyourlink.com/developers for the API contract and https://github.com/ArneFfm/nowyourlink-agent-kit for source.
