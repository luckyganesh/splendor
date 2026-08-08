# Splendor — onboarding guide for collaborators (human or AI)

Self-hosted, multiplayer, no-account digital implementation of the Splendor
board game. Single Node.js/TypeScript process, no database, no frontend
framework. Runs on the owner's home server via Docker and is played by a
small trusted friend group who join with a room code + display name.

Read this before making changes — it tells you where things live, which
patterns are load-bearing (breaking them causes subtle bugs), and how to
verify a change safely before it reaches a server real people are actively
playing on.

## Mental model

```
Browser (vanilla TS, no framework)
   │  WebSocket (JSON, discriminated-union protocol)
   ▼
One Node process
   ├── node:http   → serves the static client bundle (src/server/httpServer.ts)
   ├── ws          → upgrades to WebSocket, dispatches gameplay messages (src/server/wsServer.ts)
   ├── RoomManager → in-memory Map<roomCode, Room> (src/server/roomManager.ts)
   │     └── Room  → wraps a pure GameEngine + connected sockets, derives a
   │                 personalized GameStateView per player (src/server/room.ts)
   └── snapshot.ts → after every mutating action, atomically writes
                     /data/games/<roomCode>.json; scans + rehydrates on boot
```

**The engine (`src/engine/**`) is pure — no I/O, no `ws`, no `fs`.** Given
state + an action it returns new state or a typed error. This is what makes
it fast to unit test (`npx vitest run`) and safe to reason about in
isolation. If you're changing a game rule, it almost certainly belongs here,
not in `room.ts` or the client.

**`Room` (server-only) holds the information a `GameEngine` doesn't care
about**: which socket belongs to which player, and hides other players'
reserved-card identities from a given viewer's `GameStateView`. When adding
a new piece of state, decide: is this a rule (engine) or a
connection/visibility concern (Room)?

## Directory map

```
src/
  shared/
    types.ts       Color/Card/Noble/PlayerView/GameStateView — the shapes
                    that cross the wire. GameStateView is the ONE object the
                    client ever needs to fully redraw the board.
    protocol.ts     ClientMessage / ServerMessage discriminated unions.
    constants.ts    WINNING_POINTS (15), token/noble counts by player count.
  engine/           Pure game logic. No imports from ws/http/fs.
    setup.ts        createGame() — shuffles cards/nobles, deals bank tokens.
                    Also repairNobleConsistency() — a one-time migration
                    that runs on every snapshot load (see "Gotchas" below).
    cards.data.ts   The 90 cards + 10 nobles, transcribed from the real game.
    actions.ts      One function per player action (takeTokens, reserveCard,
                    purchaseCard, discardTokens, chooseNoble, pass) — each
                    returns ActionResult (ok+state | error code+message).
    nobles.ts       eligibleNobles() — noble-visit eligibility check.
    validation.ts   Pure affordability/legality checks used by actions.ts.
    engine.ts       GameEngine class: applyAction() + currentView(playerId)
                    (the per-viewer personalization boundary).
    *.test.ts       Vitest suites — one per action + end-to-end scenarios.
  server/
    index.ts        Entrypoint: boots http server + wss, loads snapshots.
    httpServer.ts    Static file serving. Sends cache-control:no-store on the
                     client bundle — WITHOUT this, players get stuck on a
                     stale JS bundle after every deploy even with hard-refresh.
    wsServer.ts     Per-socket message dispatch (the `switch` over ClientMessage).
    roomManager.ts  create/join/rejoin, room-code generation.
    room.ts         Room class: broadcast(), chat log, toSnapshot/fromSnapshot.
    persistence/
      snapshot.ts   Atomic write (tmp+rename), startup recovery scan.
  client/           Vanilla TS/HTML/CSS, esbuild-bundled, no framework.
    index.html      Persistent DOM shell: #app (fully re-rendered) plus
                     #opponents-dock / #my-panel-dock / #chat-panel, which
                     are NOT part of #app (see "Full re-render" below).
    main.ts         App state, the click-delegation switch (data-action=...),
                     and the socket message handler.
    render.ts       renderGame() — pure function, GameStateView -> HTML string.
    transitions.ts  Diffs consecutive GameStateViews to animate token/card
                     movement (see "Animations" below).
    components/     board.ts, nobles.ts, playerPanel.ts, interactions.ts —
                     one render function per UI region, all pure string
                     builders (state in, HTML string out).
    gems.ts         Per-color SVG icon shapes — see "Gotchas", do not unify.
    lobby.ts, chat.ts, socket.ts, colors.ts, pendingCardAction.ts
```

## Load-bearing patterns (don't refactor away without re-reading this)

**Full state re-render on every server message.** `main.ts`'s `state`
handler does `root.innerHTML = renderGame(...) + renderPendingModal(...)`
on every single broadcast — there is no client-side diffing of the DOM.
This keeps the client dead simple (one render function, no framework), but
it means:
- Chat (`#chat-panel`) is deliberately kept *outside* `#app` as its own
  persistent subtree — if it were re-rendered on every game-state broadcast,
  typing a message would get wiped mid-keystroke by someone else's turn.
- `#opponents-dock` / `#my-panel-dock` are separate persistent containers
  too (only their `innerHTML` is replaced, not the elements themselves) —
  this matters for `transitions.ts`, which anchors animations to them
  because their *position* is stable across renders even though their
  *contents* aren't.

**Pending-action confirm/cancel.** Every committing action (take-3,
take-2-same, reserve, buy, discard) goes through a local "pending" client
state (`app.tokenSelection` / `app.pendingCardAction` / `app.pendingTakeTwo`
/ `app.discardSelection` in `main.ts`) before a WebSocket message is sent.
The UI shows Confirm/Cancel in place; nothing mutates server state until
Confirm. If you add a new committing action, follow this pattern rather
than sending on first click.

**The animation diffing (`transitions.ts`) is deliberately conservative.**
It compares the previous and next `GameStateView` to infer "a card left
slot X for player Y" / "N tokens of color Z moved to/from player Y" purely
from data, since there's no persistent DOM to key off of. A turn is exactly
one action, so if a diff looks ambiguous (e.g. a reconnect skipped several
broadcasts and multiple things changed at once), it **skips the animation
rather than guessing** — preserve that bail-out if you extend it; a wrong
animation is worse than no animation.

**Snapshots are the full internal engine state, not a summary.** Persisted
JSON includes the actual ordered remaining-deck arrays, not just counts —
this is what makes refills after a container restart faithful to the
original shuffle. Don't be tempted to "clean up" the snapshot shape to only
store derived/summary data.

## Gotchas learned the hard way

- **Gem icons must stay 5 visually distinct shapes** (diamond/kite,
  sapphire/oval, emerald/octagon, ruby/circle, onyx/hexagon, gold/coin) —
  matches the real physical game. It's tempting to unify them into one
  "gem-cut" shape for consistency; that was tried and reverted, don't redo it.
- **Onyx (near-black) token numbers need white text + a dark outline**, not
  a per-color foreground color — a fixed dark `.gem-count` color was
  invisible on the darkest token. The universal-contrast approach (white +
  text-shadow) is intentional, not a shortcut.
- **Old snapshots can have claimed nobles missing from the board entirely.**
  Nobles used to be spliced out of `state.nobles` when claimed; now they
  stay on the board with `claimedBy` set (so the UI can show them grayed out
  with a "claimed by X" tooltip). `repairNobleConsistency()` in
  `engine/setup.ts` runs on every `Room.fromSnapshot()` to heal any
  pre-existing snapshot where a claimed noble is missing from the board —
  keep this migration in place; it's cheap and idempotent.
- **Fixed-width "action slot" elements** (e.g. `.bank-actions`,
  `.mini-placeholder` for the gold pile's "take 2" button) exist so
  Confirm/Cancel/Pass appearing or a missing button doesn't shift
  surrounding layout. If you remove one of these placeholders, check for
  layout jump.

## Dev workflow

```
npm run dev          # tsx watch, for local iteration against src/server/index.ts
npx tsc -p tsconfig.client.json --noEmit   # client typecheck
npx tsc -p tsconfig.server.json --noEmit   # server typecheck
npx vitest run        # engine + transitions unit tests (fast, no I/O)
npm run build          # tsc (server) + esbuild (client) -> dist/
```

There is no browser-automation devDependency in this repo on purpose (kept
minimal for a home-server project). Verification during development has
used a throwaway Playwright script driven via `NODE_PATH` pointing at an
npx-cached Playwright install, rather than adding it to `package.json`.

## Deploying — this is a real server real people play on

```
docker compose down && docker compose up -d --build
```

**Always ask before running this.** It's the owner's actual home server;
restarting briefly disconnects anyone currently in a game (they just need
to refresh and rejoin — identity is stored in `localStorage` and rejoin is
automatic — but it's still a real interruption, not a no-op). Don't treat a
rebuild as routine just because it's fast.

The `./data` volume holds one JSON file per room (`data/games/<code>.json`)
across restarts — treat it as real user data, not scratch state. Point
verification scripts at it read-only unless you're specifically testing
persistence/migration logic.

## Where new things go

- **New game rule or action** → `src/engine/actions.ts` (+ a test in
  `engine.test.ts`), then a new `ClientMessage`/dispatch case in
  `protocol.ts` + `wsServer.ts`, then a `data-action` + click-handler case in
  `main.ts`.
- **New UI region** → a new `render...()` function in `src/client/components/`
  (pure: state in, HTML string out), wired into `render.ts` or `main.ts`
  depending on whether it belongs inside the full-rerender `#app` tree or
  needs to be a persistent subtree like chat.
- **New persisted field** → add it to `InternalGameState`/`InternalPlayerState`
  in `engine/setup.ts`; it's captured automatically since snapshots serialize
  the whole engine state. If old snapshots would be missing it, add a small
  repair step alongside `repairNobleConsistency()` rather than assuming
  every persisted room already has the new shape.
