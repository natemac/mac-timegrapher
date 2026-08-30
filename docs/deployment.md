# Deployment

The app is served from a subdirectory of an existing site, alongside a separate
PHP application that owns the document root. That single fact drives everything
below.

- **Target:** `https://macwatches.com/tools/timegrapher/`
- **Webroot:** `/home/u701487933/domains/macwatches.com/public_html`
- **Deploy path:** `public_html/tools/timegrapher/`
- **Host:** Hostinger (CloudLinux, addon vhost)

## Do not use the archive-deploy endpoints

Two Hostinger endpoints look like the obvious way to deploy and are both wrong
for this site:

| Endpoint | Why not |
|---|---|
| `hosting_deployStaticSiteArchiveV1` | Its own documentation says it "overwrites the website's existing contents and cannot be undone" |
| `hosting_deployStaticWebsite` | Wraps the same upload-then-extract flow, with no subdirectory target |

Both extract into the **document root**. Running either would destroy the PHP
application that lives there. Neither accepts a target subdirectory.

Deploy by uploading individual files instead. It is additive: it creates
`tools/timegrapher/` and touches nothing else.

## Build

```sh
cd web
npm run build
```

Output lands in `web/dist/`. Vite's `base` is `/tools/timegrapher/`, so the
emitted asset paths are absolute and already correct for the deploy path. It is
overridable for forks via `VITE_BASE`.

Before uploading, confirm the GPLv2 source link survived bundling:

```sh
grep -c 'github.com/natemac/mac-timegrapher' dist/assets/*.js
```

Expected: at least `1`. **If this returns `0`, do not deploy.** Serving the
compiled bundle without an accompanying offer of source would not satisfy
GPLv2 §3.

## Upload

Get one-time credentials:

```
hosting_generateUploadURLV1(username: u701487933, domain: macwatches.com)
```

It returns `url`, `auth_key` and `rest_auth_key`. Then upload each file with
TUS, where the path after `{url}/` is the destination **relative to
`public_html`** — so every file is prefixed `tools/timegrapher/`:

```sh
FILE=dist/index.html
DEST=tools/timegrapher/index.html
SIZE=$(stat -f%z "$FILE")

curl -i -X POST "{url}/${DEST}?override=true" \
  -H "X-Auth: {auth_key}" -H "X-Auth-Rest: {rest_auth_key}" \
  -H "Tus-Resumable: 1.0.0" -H "Upload-Length: ${SIZE}" -H "Upload-Offset: 0"
# -> 201 Created

curl -i -X PATCH "{url}/${DEST}?override=true" \
  -H "X-Auth: {auth_key}" -H "X-Auth-Rest: {rest_auth_key}" \
  -H "Tus-Resumable: 1.0.0" \
  -H "Content-Type: application/offset+octet-stream" \
  -H "Upload-Offset: 0" --data-binary "@${FILE}"
# -> 204 No Content, with Upload-Offset equal to SIZE
```

Files to upload, preserving structure:

```
dist/index.html                  -> tools/timegrapher/index.html
dist/capture-worklet.js          -> tools/timegrapher/capture-worklet.js
dist/assets/index-<hash>.css     -> tools/timegrapher/assets/index-<hash>.css
dist/assets/index-<hash>.js      -> tools/timegrapher/assets/index-<hash>.js
dist/assets/index-<hash>.js.map  -> tools/timegrapher/assets/index-<hash>.js.map
```

Asset hashes change on every build, so read the real filenames from `dist/`
rather than copying the ones above. The `.js.map` is deliberately shipped: for
GPL-licensed code delivered to a browser, source maps make the corresponding
source directly available to anyone running it.

`capture-worklet.js` must stay at the top level of the deploy path, not under
`assets/`. It is fetched at runtime by `AudioWorklet.addModule` from
`${BASE_URL}capture-worklet.js`, so a bundler-hashed name would break it.

`dist/.htaccess` must be uploaded too. The host serves `.wasm` as `text/plain`,
and because the site sends `X-Content-Type-Options: nosniff` the browser then
refuses to instantiate it — `WebAssembly.instantiateStreaming` requires
`application/wasm` exactly. That file is scoped to this directory and adds only
the MIME type; the site root's `.htaccess`, which owns the HTTPS redirect and
security headers, is deliberately left alone.

Finally, clear the CDN cache (`hosting_clearWebsiteCacheV1`).

## Verify

```sh
curl -sI https://macwatches.com/tools/timegrapher/ | head -3
curl -s https://macwatches.com/tools/timegrapher/ | grep -o '/tools/timegrapher/assets/[^"]*'
curl -sI https://macwatches.com/tools/timegrapher/capture-worklet.js | head -1
curl -sI https://macwatches.com/tools/timegrapher/assets/tg-core-*.wasm | grep -i content-type
```

Expect `HTTP/2 200`, asset paths under `/tools/timegrapher/assets/`, a 200 for
the worklet, and **`content-type: application/wasm`** — `text/plain` there means
the `.htaccess` did not upload and the measurement engine will not start. Then open the page and confirm the microphone permission
prompt appears — if it does not, the secure-context check failed.

## Why this needs no server configuration

Checked against the live site's `.htaccess`:

- No rewrite rule touches `/tools/`.
- HTTPS is already forced site-wide, which `getUserMedia` requires.
- `DirectoryIndex` already includes `index.html`.
- `Options -Indexes` is set, so the directory must contain `index.html` — Vite
  emits one.
- `X-Frame-Options: SAMEORIGIN` is global and does not affect same-origin use.

## Build output is never committed

`web/dist/` is git-ignored here and must not be committed to the private site
repository either. Compiled output of GPL-derived source is itself GPL-covered,
so committing it there would reintroduce exactly the entanglement this split
exists to avoid. The host is updated over the API, not from git.

## After the first successful deploy

Add the page to the private site repository's `public_html/sitemap.xml`:

```xml
<url><loc>https://macwatches.com/tools/timegrapher/</loc></url>
```

Do **not** add it to `robots.txt`. Unlike the workshop pages, this tool is
public and should be indexed.
