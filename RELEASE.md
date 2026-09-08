# Publication checklist

This kit is prepared locally; registry and plugin marketplace publication are pending. Public source repository: https://github.com/ArneFfm/nowyourlink-agent-kit.

- [x] Owner authorized the recommended MIT License; license text and package metadata are included.
- [x] Public source repository created and verified. Export only this kit, not private history or application internals.
- [x] Real public repository URL added to metadata and documentation.
- [ ] Verify npm and PyPI name availability and publisher ownership; npm authentication is available; owner reports PyPI browser login; upload authentication remains to be verified. Keep tokens outside source files and chat.
- [x] JavaScript tests (6) and Python 3.11 tests (4) pass locally; rerun against the exported kit before publishing.
- [x] Built and inspected npm archive, Python wheel and sdist with MIT text included; twine metadata checks pass. Python packaging needs the declared setuptools build dependency, although the SDK runtime uses only the standard library.
- [x] Prepared manual `publish-python.yml` workflow for GitHub OIDC through the `pypi` environment; configure matching PyPI trusted publisher before dispatch.
- [x] Owner authorized npm/PyPI publication; npm is publishable and both packages target release 0.1.0.
- [ ] Submit the public plugin source to the chosen client marketplace or directory and validate its remote MCP connection.
- [ ] Verify anonymous source access, install commands, package pages and tool reads after publication before advertising availability.

## Verified PyPI release — 2026-09-07

Published `nowyourlink-spotlights==0.1.0` using the configured Trusted Publisher. [Workflow run 34119107611](https://github.com/ArneFfm/nowyourlink-agent-kit/actions/runs/34119107611) succeeded. Both wheel and source distribution are public. A fresh virtual environment installed the package from PyPI and successfully called `SpotlightClient().list(limit=1)`. npm is still awaiting publisher authentication.

## npm publication verified — 2026-09-07

Published `nowyourlink-agent-kit@0.1.0` under MIT. Registry metadata, fresh registry installation, and installed `nowyourlink list --limit 1` all passed. Both npm and PyPI packages are now public. OpenAI submission remains deferred.

## npm OIDC releases

`publish-npm.yml` runs tests and validates the package on GitHub-hosted Node 24.
Publishing uses OIDC (`id-token: write`) without an npm token. Published GitHub
releases must use `v<package.json version>` and point to a commit on `main`.
Manual runs are restricted to `main` and default to dry-run; uncheck `dry_run`
only for a new package version that should be published.

Configure the npm Trusted Publisher for `nowyourlink-agent-kit`:
- Organization/user: `ArneFfm`
- Repository: `nowyourlink-agent-kit`
- Workflow filename: `publish-npm.yml`
- Environment: `npm`
- Allowed action: Publish

With an authenticated npm CLI supporting `npm trust`:

```sh
npm trust github nowyourlink-agent-kit --repo ArneFfm/nowyourlink-agent-kit --file publish-npm.yml --env npm --allow-publish --yes
```

The GitHub workflow alone does not create this npm-side trust. A dry-run validates
tests and packaging, but does not prove that npm accepts the OIDC identity.
Existing published versions cannot be republished.
