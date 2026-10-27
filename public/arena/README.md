# Heavenward

An original Egyptian angel arena game about defending Heaven. A playable 2D canvas prototype with solo bot battles, four-player browser-hosted WebRTC rooms in the static web edition, and server-hosted rooms in the Node edition. No accounts, credentials, or paid APIs are required. Solo gameplay uses local resources. Public browser rooms use the community PeerJS signaling service and WebRTC/STUN connectivity. This is a stylized prototype, not a photorealistic simulation or a recreation of another commercial game.

## Play

Use Node.js 22 or newer. From the repository root:

```sh
npm install --package-lock=false
npm start
```

The default server route opens the game. The game is also available at `/arena/`, while Cloudy remains at `/cloud/`.

For an offline game:

```sh
node scripts/build-arena.mjs
```

Open `dist/Heavenward.html` directly in your browser. It contains the same simulation, renderer, UI, and controls with no network requests. Browser storage policies for local files vary; the game remains playable without saved progress.

The game starts directly in Heaven’s Fields as the invincible **Creator**. Select **Choose arena** to pick a different combat class, mission, realm, and freelance contract, then press **Play solo**. Matches award fictional gold when they finish, including losses. Abandoning a run gives no reward. Gold buys three levels each of health, damage, and energy/cooldown upgrades; purchases apply on the next solo run. Career progress saves in this browser, not to a remote account. This game has no real-money purchases, gold sales, or refunds.

## Free cooperative rooms

In the server edition, select **Choose arena**, enter your player name, and choose **Host free co-op**. Share the six-character room code. Friends open the same hosted game, choose a standard fighter, enter the code, and select **Join room**. The host selects **Start co-op** when everyone is ready. Up to four players share the same enemies, score, waves, relics, and golden gate machinery. The host may play the invincible Creator; guests cannot select that role. Ordinary fighters fall at zero health and watch until the team finishes or the host starts another match.

The GitHub Pages workflow publishes the static web edition. When opened over HTTPS, that edition uses browser-hosted WebRTC rooms: the owner runs the simulation, must keep the game tab open and in the foreground, and closing that tab ends the room. Connection negotiation uses the community PeerJS service at `0.peerjs.com`. Some firewalls/NATs prevent direct peer connections; universal connectivity is not guaranteed. No TURN relay service has been provisioned. Browser-hosted rooms are beta. Signaling-service connections from the cloud's Chromium currently fail with `ERR_CERT_AUTHORITY_INVALID`; certificate verification was kept enabled. Transport was also tested using a local signaling fixture; that does not establish public signaling connectivity.

Alternatively, deploy the Node server to a publicly reachable host that supports Server-Sent Events (SSE), with response buffering disabled, to use server-hosted rooms. A room code does not itself make a private local server reachable. The standalone HTML file opened through `file://` plays solo only; open the hosted HTTPS edition for public browser co-op.

Rooms are ephemeral, live in one server process, and end on server restart. Joining a running match is disabled. Lobby ownership transfers when the host leaves; Creator power is tied to the selected host character, not an authenticated global administrator account. Per-room session tokens authenticate input. Input is bounded, stale movement expires, and the server owns the simulation. Co-op ignores browser-purchased upgrades so clients cannot supply their own stats. Leaving or reconnecting is not an account or persistent identity system. Online matches continue while one player's controls are paused.

## Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move | WASD or arrow keys | Movement pad |
| Aim | Mouse | Automatically targets nearest enemy |
| Attack | Hold left mouse or Space | Hold Attack |
| Dodge dash | Shift | Dash |
| Class special | Q | Special |
| Precision aim | Hold right mouse | Toggle Focus |
| Crouch | Hold C | Toggle Crouch |
| Frontal guard | Hold F | Hold Guard |
| Jump | E | Jump |
| Reload rifle | R | Reload |
| Pull nearby gold lever | V | Lever |
| Pause / resume | P or Esc | Pause / Resume |

Crouching slows movement and reduces incoming projectile damage. Guarding slows movement, drains radiance, and reduces frontal damage while preventing attacks. Jumping briefly evades projectiles. Dash provides brief protection. Rifle focus trades movement speed for precision and damage. Sound is optional and starts only after selecting Sound. Switching tabs pauses local controls; online matches continue.

Xbox-style browser controllers: left stick moves, right stick aims, RT or X attacks, LT focuses, A jumps, B dashes, RB uses the special, LB guards, Y reloads, right-stick click crouches, D-pad up pulls a nearby lever, and Menu pauses. D-pad/left stick and A navigate menus. Controller mapping is tested with standard Gamepad API inputs, but an actual Xbox console has not been tested. Native Xbox distribution requires Microsoft tools and certification.

## Combat and missions

- **Dawn Guardian:** blade arcs, shield, a healing shockwave.
- **Sunbow Ranger:** fast solar arrows and a seven-shot fan.
- **Storm Oracle:** slower magic orbs and an area burst that clears hostile projectiles.
- **Horizon Marksman:** a five-round celestial rifle, focused precision shots, reloads, and a piercing special.
- **Dawn Pugilist:** close hand-to-hand attacks, a three-hit combo, and a shockwave.
- **The Creator:** the invincible host/solo character, unlimited radiance, strong area attacks, and an arena-wide light ability.

Five-wave survival, twelve-relic collection, and a ninety-second score trial have distinct goals. Heaven’s Fields is an open arena with no pillars or hazards. Sky Citadel has safe terrain; Duat and Sands add pulsing hazards. Hunter, survival, and collection contracts add bonus gold. Enemies include melee shades, archers, heavy brutes, and fast wisps.

The liquid-gold look and ripples are inspired by the supplied video. The optional gate engine has two real toggle levers, rotating pulleys and a wheel, and a lock. Approach each gold lever and press V (or Lever on touch). With both engaged, the mechanism charges for four seconds and unlocks the gate for a one-time 250 glory bonus and essence. This is fictional game machinery, not a source of funding.

## Validation

```sh
node --test tests/arena.test.js
node --test tests/arena-rooms.test.js
node --test tests/cloudy-platform.test.js
node scripts/build-arena.mjs
```

The deterministic simulation tests cover movement/collisions, cooldowns, damage, class mechanics, contracts, win/loss conditions, and actual complete five-wave matches for all five classes. Desktop, mobile-touch, and offline browser checks should additionally cover UI input, pause, saved upgrades, and JavaScript errors.

The simulation is in `core.mjs`, the canvas renderer and browser controller in `app.js`, and the interface in `index.html` and `styles.css`. The single-file build is generated; edit source files and rebuild it.
