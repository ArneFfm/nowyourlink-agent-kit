---
name: create-nowyourlink-video
description: Prepare a NowYourLink advertiser video with a Brag-style storyboard and renderable HyperFrames project, then upload a rendered file through the connected account's video tools. Use for creating, uploading or replacing a video creative.
---

Use `https://nowyourlink.com/mcp/chatgpt`, the account tools' OAuth connection. Video writes require
`creatives:write`; status reads require `creatives:read`. The MCP server controls
upload and transcoding. It does not run HyperFrames, generate footage or render
HTML. Check the host's file, rendering and HTTP-upload capabilities before
promising an MP4 or an automatic upload. If the host lacks them, deliver the
composition project and exact rendering/upload handoff, and explain which step
the user must run. Never claim a storyboard or HTML file is a rendered video.

## Create and verify

Use the user's product, destination and supplied assets. Build a short story
with a concrete hook, a visible product action, its payoff and a clear CTA.
Brag's 15–25 seconds is a useful default when the user gives no duration.
Keep claims tied to evidence and use licensed assets. Make the story work muted;
add narration only on request. Let readable text settle rather than flash past.
Keep essential copy and the CTA inside both the landscape and square crops.

Follow the [HyperFrames composition contract](https://hyperframes.heygen.com/developers):
Set the root `data-composition-id`, width, height and duration. Register one
paused GSAP timeline under the root's ID. Use deterministic seeking and local
assets. The runtime owns clip visibility. Provide `index.html`, its assets and
timing in a self-contained project. Read the current CLI documentation before execution;
use a known project/runtime version rather than silently upgrading dependencies.

With an available Node/FFmpeg/HyperFrames runtime, run `hyperframes check`, show
the final preview and render the user's approved composition. Check the actual
output with `ffprobe`, watch continuous playback and inspect transition frames.
Verify duration, legibility, mute-safe pacing, banner/square crops and the CTA.
Deliver the MP4, poster and composition source. Do not route private assets to a
cloud renderer unless the user chooses that service.

This workflow adapts [Brag](https://github.com/latent-spaces/brag) and
NowYourLink's house-ad quality checks for the user's advertiser account. It
contains no house/admin access or bundled third-party music.

## Upload a rendered file

Accept MP4, MOV or WebM under 5,000,000,000 bytes and at most 600 seconds.
The server validates the actual container and metadata. Read the file's exact
byte length and MIME type, then call `start_video_upload`. Retain its `ad_id`,
`asset_id`, `upload_id`, `key` and `part_size` for this upload.

Split the file using the returned `part_size` (currently 16 MiB). Request
`get_video_upload_urls` in batches of at most 50 part numbers. PUT the actual
bytes to each returned URL within 15 minutes. Retain each actual response ETag
and part number. Never fabricate an ETag or finalize a part whose PUT failed.
Keep signed URLs and upload identifiers private and out of shareable artifacts.

Call `complete_video_upload` with the original identifiers and all successful
parts in ascending order. A queued response only starts transcoding. Poll
`get_video_status` with backoff until ready or failed; stop after a bounded
wait and report the pending status if needed. Do not repeatedly finalize while
transcoding. Retry a completion after an unknown outcome only after checking
status and retaining the same upload identifiers.

Use only existing account entitlements. Do not purchase rendering, storage or
ad placement, or direct the user to a checkout from this workflow.

Once ready, use `update_creative` for headline, description, destination and CTA,
then `submit_creative` when the user requests moderation. Ready does not mean
approved. Moderation approval does not place a bid or publish the ad. Existing
`creative.status_changed` Events may support status follow-up where the host
supports them; they never authorize spending.

For cancellation, use `abort_video_upload` on the user's incomplete upload.
For replacement, first read the existing draft with `get_creative` and establish
that the user authorizes replacing its media. `replace_creative_video` detaches
the current attachment immediately; a failed replacement does not restore it.
Continue with its returned identifiers. Preserve ownership failures and show
actual upload/transcode errors; never switch to another account or bypass gates.
