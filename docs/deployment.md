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

**Upload everything in `dist/`, preserving structure.** Do not work from a list:
a build emits seventeen files and the five obvious ones are not the whole set.
Missing `assets/tg-core-<hash>.wasm` alone produces an app that loads, looks
entirely normal, and cannot measure anything — and on a server that already has
a previous deploy on it, the omission is invisible, because the old file is
still there answering.

```sh
cd web/dist
for FILE in $(find . -type f | sed 's|^\./||'); do
  DEST="tools/timegrapher/${FILE}"
  SIZE=$(stat -f%z "$FILE")   # stat -c%s on Linux
  curl -sf -X POST "{url}/${DEST}?override=true" \
    -H "X-Auth: {auth_key}" -H "X-Auth-Rest: {rest_auth_key}" \
    -H "Tus-Resumable: 1.0.0" -H "Upload-Length: ${SIZE}" -H "Upload-Offset: 0" \
  && curl -sf -X PATCH "{url}/${DEST}?override=true" \
    -H "X-Auth: {auth_key}" -H "X-Auth-Rest: {rest_auth_key}" \
    -H "Tus-Resumable: 1.0.0" \
    -H "Content-Type: application/offset+octet-stream" \
    -H "Upload-Offset: 0" --data-binary "@${FILE}" \
  && echo "  ok   ${FILE}" || echo "  FAIL ${FILE}"
done
```

Two files have to land where they are, and the loop above already does:

- **`capture-worklet.js` stays at the top level**, not under `assets/`. It is
  fetched at runtime by `AudioWorklet.addModule` from
  `${BASE_URL}capture-worklet.js`, so a bundler-hashed name would break it.
- **`.htaccess`** is why the WebAssembly module instantiates at all. The host
  serves `.wasm` as `text/plain`, and because the site sends
  `X-Content-Type-Options: nosniff` the browser then refuses it —
  `WebAssembly.instantiateStreaming` requires `application/wasm` exactly. That
  file is scoped to this directory and adds only the MIME type; the site root's
  `.htaccess`, which owns the HTTPS redirect and security headers, is
  deliberately left alone. `find` picks up dotfiles, so it goes with the rest.

The `.js.map` files are deliberately shipped: for GPL-licensed code delivered to
a browser, source maps make the corresponding source directly available to
anyone running it.

### Old builds do not remove themselves

Asset filenames carry a content hash, so a deploy adds files rather than
replacing them and nothing prunes what it leaves. By 2026-09-06 that had reached
**235 files and about 121 MB in `assets/`, against 2.4 MB actually in use** —
roughly thirty-eight builds of litter, most of it source maps.

It harms nothing served, and it is not urgent: a stale cached `index.html` still
finds its own assets because they are all still there. Sweep it when it grows.

**The upload credentials cannot delete.** `hosting_generateUploadURLV1` returns a
token scoped to the TUS endpoint; the file-browser `resources` API answers 403 to
it under every auth shape, and the account's own JWT carries `execute: false`.
So this is a job for hPanel's File Manager or SFTP, not for the deploy script.

**Work out what to keep by following the chain, not by reading `index.html`.**
The document names only the bundle and the stylesheet. The bundle names the
worker. *The worker names the WebAssembly module* — so a sweep that trusts
`index.html` alone deletes the measurement engine and leaves an app that loads,
looks entirely normal and cannot measure anything.

```sh
BASE=https://macwatches.com/tools/timegrapher
JS=$(curl -s $BASE/ | grep -o 'assets/index-[^"]*\.js')
WK=$(curl -s $BASE/$JS | grep -oE 'tg-worker-[A-Za-z0-9_-]+\.js')
WASM=$(curl -s $BASE/assets/$WK | grep -oE 'tg-core-[A-Za-z0-9_-]+\.wasm')
curl -s $BASE/ | grep -o 'assets/index-[^"]*\.css'
echo "$JS"; echo "$JS.map"; echo "assets/$WK"; echo "assets/$WK.map"; echo "assets/$WASM"
```

Those six survive; everything else under `assets/` goes. Confirm each one still
returns 200 before deleting anything, and confirm the page still measures
afterwards.

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

## Testing on a phone before deploying

`npm run dev:lan` serves the dev build to anything on the same network:

```sh
cd web && npm run dev:lan
# ➜ Network: https://192.168.1.138:5180/tools/timegrapher/
```

**It has to be HTTPS, and that is not a preference.** `getUserMedia` is gated on
a secure context, and `http://192.168.x.x` is not one. Over plain HTTP the app
loads, looks entirely normal, and refuses the microphone — with a permission
error that reads like a device fault rather than a scheme problem. `localhost`
is the one insecure origin browsers make an exception for, which is why this
never comes up at the desk.

The certificate is self-signed and lives in `web/.certs/`, which the repo's
leading `.*` ignore rule already excludes. Both phones warn once:

- **iOS Safari** — Show Details → visit this website → Visit Website.
- **Android Chrome** — Advanced → Proceed to … (unsafe).

Accepting the warning still yields a secure context, so the microphone works.

### Regenerating the certificate

The machine's address must be in the certificate's `subjectAltName`, or iOS will
not offer to continue at all. Redo this whenever the address changes:

```sh
cd web && ipconfig getifaddr en0
```

Put that address in `IP.2` below, then:

```sh
cd web && mkdir -p .certs && openssl req -x509 -newkey rsa:2048 -nodes -days 365 -keyout .certs/dev-key.pem -out .certs/dev-cert.pem -config .certs/openssl.cnf
```

`.certs/openssl.cnf` holds the names; its `[alt]` section is the part to edit.

### Over Tailscale instead, when the phones are on it

Better than the LAN address in every way that matters, and worth preferring:

```sh
tailscale serve --bg "https+insecure://localhost:5180"
```

Tailscale terminates TLS with a **real, trusted certificate** for the machine's
`*.ts.net` name, so there is no warning to click through on either phone, and —
because the origin has no certificate error — **service workers register**, which
means offline behaviour and the install prompt can be tested here too. It also
works away from the bench Wi-Fi, since the phones reach it over the tailnet.

Confirm the scope before handing the link out:

```sh
tailscale serve status
```

It must say **tailnet only**. That is `serve`. Its sibling `funnel` publishes to
the open internet and has no business anywhere near a dev server.

Turn it off when finished:

```sh
tailscale serve --https=443 off
```

The one thing that does not survive the trip is Vite's hot-reload socket, which
still points at port 5180 rather than at 443. Reload the page by hand after an
edit.

### What this cannot test

**Service workers do not register on an origin with a certificate error.** Chrome
and Safari both refuse. So over the *self-signed LAN address* offline behaviour,
the install prompt and anything else PWA-shaped will not work, and their absence
there means nothing. The Tailscale route above has a trusted certificate and does
not have this problem; failing that, verify on the deployed site as `CLAUDE.md`
says.

Vite's hot-reload socket may also fail to connect through the warning. That
shows up as console noise, not as a broken app; reload by hand after an edit if
the page stops updating.
