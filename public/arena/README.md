# Heavenward — Human PvP Demo

An original, stylized 2D Egyptian angel arena prototype combining human-player shooting, hand-to-hand combat, team objectives, and supernatural abilities. It is a demo, not a finished AAA game or a certified native Xbox title.

## Play and load

Use Node.js 22+ from the repository root:

```sh
npm install --package-lock=false
npm start
```

`/arena/` is the game; `/cloud/` retains Cloudy. The main flow is human-player rooms. Choose **Host human PvP**, share the invite/code, and have another human select **Join room**. At least two players are required for competitive matches; no AI fills online player slots. The host starts the match. The optional **Bot practice** button clearly starts an AI practice session. Up to four human players can join a room.

Build the self-contained edition with `node scripts/build-arena.mjs`. This writes ignored `dist/Heavenward.html` plus byte-count/SHA-256 metadata. The Pages loader streams the actual game file, displays byte progress, checks its checksum, and opens it. Its progress is not an upload timer. Open the downloaded HTML directly for offline practice; human rooms require the hosted edition.

The Pages workflow builds a combined download containing the game, loader, gallery, illustrated cover, and action videos. The 32-second demo commercial records two independently controlled browser clients, an actual flag capture, zone control, and Creator abilities. Early gallery clips are labeled AI practice. No gameplay is fabricated with generated video.

## Modes

- Free for all: first to ten eliminations or the leader at the two-minute limit.
- Capture the flag: carry the opposing flag home while your flag is at base; first to three captures.
- Team war zone: hold the center without opposing players; first to thirty control points.
- Cooperative survival, relic recovery, and score trials remain available.

Competitive players respawn after three seconds; team modes disable friendly fire. Online rosters preserve exactly the admitted humans. Practice modes can include explicitly labeled bots. The Creator is damage-invincible but still has mission objectives.

## Characters, weapons, and forms

The workshop offers six original weapon types (blade, dual blades, rifle, bow, staff, fists), six human outfit styles, and custom primary/accent colors. Weapons affect actual attacks; each character class retains its special. This is an expandable starter catalog, not every character or weapon from existing games.

The host's fictional Creator role has unlimited radiance and damage immunity. T cycles Light, Water, Fire, Liquid Gold, Superhero, Smoke, and Cloud. Materials have distinct movement/combat traits: smoke phases through pillars, cloud heals nearby teammates, fire burns nearby opponents, gold accelerates nearby gate machinery, and the superhero moves/dashes faster.

The Creator lab creates arbitrarily named material/color/scale combinations. They are stylized material bodies, not arbitrary semantic 3D models. One active custom definition replaces the previous one. G imitates a nearby fighter's appearance while actual identity/team stay unchanged on the scoreboard. I toggles invisibility from NPC tracking. H creates invincible echoes; up to twelve are simultaneously active, with a lifetime creation counter. M absorbs nearby owned echoes and increases actual radius, reach, and damage. Scale remains bounded from 0.6 to 1.8. Echoes cannot capture flags, control zones, or enter winner standings.

The liquid-gold gate engine has two levers, pulleys, a turning wheel and a lock. Approach each lever and press V. Both engaged charge the mechanism for four seconds, opening it for a one-time 250 glory bonus and essence. Gold is fictional. There are no purchases, sales, AI funding loops, or refunds.

## Controls

| Action | Keyboard / mouse | Xbox-standard browser controller |
| --- | --- | --- |
| Move / aim | WASD or arrows / mouse | Left / right stick |
| Attack / focus | Click or Space / right mouse | RT or X / LT |
| Dash / jump | Shift / E | B / A |
| Special / guard | Q / F | RB / LB |
| Reload / crouch | R / C | Y / right-stick click |
| Lever / morph | V / T | D-pad up / right |
| Echo / merge | H / M | D-pad left / down |
| Invisible / disguise | I / G | View / on-screen button |
| Pause | P or Esc | Menu |

Labeled touch controls and Creator-lab buttons provide the same actions. D-pad/left stick and A navigate menus. Actual Xbox hardware has not been tested; native console publication needs Microsoft tools and certification. Online worlds continue while a player's controls are paused.

## Networking and limits

The Node edition uses authenticated authoritative rooms and SSE at `/api/arena`. Rooms are ephemeral, bounded to four humans, use validated controls with expiring stale input, and end on server restart. Guest clients cannot select Creator or inject stats. Browser career upgrades apply to solo practice, not authoritative room stats.

The HTTPS static edition uses vendored PeerJS 1.5.5 and browser-hosted WebRTC. The host must keep the room tab open/in the foreground; leaving ends that peer room. PeerJS community signaling and default STUN/TURN connectivity depend on external service/network availability. Public co-op/PvP is beta, not a promise of universal connectivity. Binary chunking supports large snapshots. The vendored npm tarball's SHA-512 was verified and its license retained.

Public signaling from the cloud Chromium fails with `ERR_CERT_AUTHORITY_INVALID`; managed `WebRtcIPHandling: disable_non_proxied_udp` also prevented local ICE candidates. Automatic review rejected adding a proxy CA; no trust or privacy policy changes were made. Real Node-based two-browser play and mocked peer protocol were validated separately. Public WebRTC connectivity is not verified from this machine.

## Validation and publication

```sh
node --test tests/*.test.js
node scripts/build-arena.mjs
node scripts/build-preview.mjs
git diff --check
```

70 automated tests cover the simulation, all modes, actual AI practice matches, input mapping, Node room transport, Creator-lab packets, and Cloudy. Browser checks cover human-only two-client rosters, actual combat, forms, invisibility, echoes/merging, disguises, touch practice, loading-byte/checksum flow, and media metadata. A managed-browser network restriction is not counted as a passing public WebRTC test.

The user requested a 9:05 AM New York release on October 27, 2026. `.github/scripts/wait-for-publish.py` gates deployment until `2026-10-27T13:05:00Z` after the artifact is uploaded. Workflow inputs can override the UTC target within four hours. No fake three-hour transfer is shown. Future pushes after the target deploy immediately. GitHub/CDN propagation may finish shortly after the target.
