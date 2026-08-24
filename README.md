# TikTok Caption Generator

A free Stack Influence tool. Enter a video description and pick a tone, get 5 ready-to-post TikTok captions plus a matching hashtag set. Each caption and the hashtag set have their own copy button.

**Type B tool** - uses the Anthropic API, so it needs a serverless function and an API key. The key lives only in Netlify environment variables and never reaches the browser.

## Files

```
tiktok-caption-generator/
  index.html                  <- the tool UI (what the iframe displays)
  netlify.toml                <- Netlify config (publish dir + functions)
  README.md                   <- this file
  netlify/
    functions/
      generate.js             <- serverless function; holds API key, calls Claude
```

Two Webflow-side files are kept OUT of this repo:
- `webflow-embed-snippet.html` - iframe code for the Webflow Embed element
- `webflow-cms-copy.md` - copy for every CMS field

## Deploy

1. Push this folder to a GitHub repo. Push only `index.html`, `netlify.toml`, `README.md`, and `netlify/functions/`. Keep the two Webflow files out.
2. Netlify -> Add new site -> Import an existing project -> pick the repo. Build command empty; publish dir `.` (already set in netlify.toml).
3. Netlify -> Site settings -> Environment variables -> add `ANTHROPIC_API_KEY` = the real key.
4. Deploy. Note the URL.
5. Test the live URL - confirm captions generate. This is the one piece the build sandbox cannot test.
6. Open `webflow-embed-snippet.html`, replace BOTH instances of `YOUR-SITE-NAME.netlify.app` with the real Netlify URL.
7. Paste the snippet into the Webflow Embed element (the "Tool embed" CMS field).
8. Fill the rest of the CMS fields from `webflow-cms-copy.md`.
9. Publish the Webflow page.

## Notes

- **postMessage key:** this tool uses `siTTCapHeight` for iframe auto-resize. It is unique so it will not collide with other tools on the same page (Bio = `siBioHeight`, TikTok Engagement = `siTTEngHeight`). The tool's `postMessage` and the embed snippet's origin check both use this key.
- **Model:** `claude-sonnet-4-6`, `max_tokens` 1000.
- **No baked-in data.** This tool is pure generation, so there are no benchmarks or figures to verify or update.
- Source files are 100% ASCII.
