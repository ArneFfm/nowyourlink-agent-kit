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
