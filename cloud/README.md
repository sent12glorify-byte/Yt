# Cloudy

Cloudy combines a morphing cloud canvas, a prompt-driven app workspace, and exportable hosting configuration. It is the default page of the Node/Express server. The existing cosmic explorer remains at `/index.html`, and its APIs are preserved.

## Run

From the repository root, run:

```sh
npm install --package-lock=false
npm start
```

Open `/cloud/` on the running server. No external scripts, fonts, or graphics are needed. The canvas supports Earth, cloud, heart, planet, galaxy, mountain, castle, tree, and dragon sculptures, three atmospheres, wind, motion controls, and PNG export. Reduced-motion preferences are respected. Earth is a blue-and-green illustrated globe, distinct from the ringed planet sculpture.

Ask for `Earth`, select **Earth globe** in cloud controls, or open `/cloud/?shape=earth`. **Explore Earth** opens the original iOS 1 space explorer in an Earth-focused view, with orbit and zoom controls. The explorer remains available directly at `/universal-explorer.html?view=earth`. Both Earth views are illustrations/simulations, not live satellite imagery.

The local creation engine creates interactive task boards, dashboards, portfolios/landing pages, sample stores, and weather apps. Arbitrary prompts use a starter template unless the optional AI engine is connected. Weather requests need access to `api.open-meteo.com`; failures are shown inside the generated app.

Projects are stored outside the checkout at `/workspace/.cloudy-state`. Override this using `CLOUDY_STATE_DIR` for other machines. Generated app previews run in a sandboxed iframe. Preview task data lasts for the current session; exported apps save browser data where supported.

Cloudy's content rules prohibit pornography, fabricated harmful accusations, and targeted harassment campaigns. The local guard checks prompts and generated content; the AI instruction applies the same rules. This is a baseline filter, not a complete moderation service. A public multi-user deployment needs stronger moderation and reporting alongside authentication.

## A browser-openable preview

```sh
node scripts/build-preview.mjs
```

Open `dist/Cloudy-preview.html` in a browser. This single file includes the renderer, UI, and local creation engine. It keeps projects in browser storage rather than on the server. No AI credentials or server files are embedded. Both editions export a `.tar` archive containing a working app, Dockerfile, Node server, and deployment instructions.

The original explorer is embedded in the single-file edition, so **Explore Earth** works without an additional download or network request. To create an edition that starts on Earth, run `node scripts/build-preview.mjs dist/Cloudy-Earth.html earth`.

The checked-in root `index.html` is this browser edition, so the existing GitHub Pages workflow publishes a functional Cloudy homepage. Refresh it with `node scripts/build-preview.mjs index.html`. The original iOS 1 static explorer is preserved as `universal-explorer.html`. Pages provides the browser edition; use Node hosting for server-side AI and project persistence.

## Optional AI

Set `CLOUDY_AI_API_KEY` securely on the server to enable OpenAI-compatible generation at `https://api.openai.com/v1/chat/completions`. `CLOUDY_AI_MODEL` optionally overrides the default model. Never place a key in a browser file or commit it. The engine uses validated JSON responses and falls back to the local engine when the connection fails. AI status switches to connected only after a successful generation. This path needs provider credentials and permitted network access; it is optional and is not configured by default.

## Hosting

The Infrastructure tab exports self-contained generated apps. Extract the archive and follow its README. The app uses Node 22+, listens on the injected `PORT`, includes `/health`, and has no package dependencies. Docker configuration is included. Exporting does not provision a remote server.

Cloudy itself requires the Node server for project persistence and AI generation. GitHub Pages can host the single-file browser preview, but cannot run the Express backend. Before exposing the server edition publicly, add authentication and per-user project isolation; the current workspace is intended for one local user.

## Validate

```sh
node --test tests/cloudy-platform.test.js
```

The integration tests cover API validation, real generated previews, persistence, isolated AI fallback, and running exported hosting bundles. Browser checks additionally exercise sculpture controls, task creation, project reopening, mobile layout, and archive downloads.
