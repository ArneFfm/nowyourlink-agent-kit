# NowYourLink for ChatGPT

Package `nowyourlink-account`, version 2.0.1, uses one MCP connection at
`https://nowyourlink.com/mcp/chatgpt`. Read documentation without an account.
Connect through OAuth to inspect your own reports, auction status, bid history,
invoices and affiliate records. Manage owned creatives, videos and eligible
account preferences through the same application guards as the website.

This connection excludes paid bidding, purchases, payout requests, payment-method
management, security credential changes, agent grant changes and public advertising
feeds. It does not redirect users to complete those transactions. Creative
moderation does not buy placement or publish an advertisement.

This folder is the portable package root. Its manifest declares one server and
three skills for documentation, account workflows and video creation.
Video rendering requires a separate runtime. The skill reports missing rendering
or HTTP-upload capabilities before promising a rendered or uploaded file.

Upload a ZIP with the manifest, MCP declaration, icon, README and skills at its
root. Exclude application code, credentials and the parent kit's SDKs.
The publisher is Arne Kellmann. Keep the published Developer Docs plugin
available during review of this new listing.

The ChatGPT endpoint reuses existing application handlers with an explicit
allowlist. This package cannot unlock excluded account operations.

Verify production discovery, OAuth challenges and authenticated user flows before
scanning tools. Record a fresh demonstration of this catalog with sample data.
A ZIP upload does not prove deployment, native execution, approval or publication.

References: [packaging](https://developers.openai.com/plugins/build/plugins),
[submission](https://developers.openai.com/plugins/deploy/submission),
[plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines),
[developer terms](https://openai.com/policies/developer-apps-terms/).
