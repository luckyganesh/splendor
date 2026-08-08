# Splendor

[![Build](https://github.com/luckyganesh/splendor/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/luckyganesh/splendor/actions/workflows/ci-cd.yml)

A self-hosted, multiplayer, no-accounts digital implementation of the
[Splendor](https://en.wikipedia.org/wiki/Splendor_(game)) board game. One
Node.js process, no database, real-time play over WebSockets — built to run
on a home server for a small group of friends.

🎮 Live: [splendor.luckyganesh.in](https://splendor.luckyganesh.in)

## Features

- Create a room, share a 5-letter code, join with just a display name — no sign-up
- Full ruleset: take tokens, reserve, purchase, nobles, discard-down, tiebreak, win condition
- Live updates for every player via WebSockets, with an in-place confirm/cancel step before every committing move
- Reconnect by name from a new browser/device if you lose your connection mid-game
- Animated token/card movement, an in-app rule book, and a 📖 reference popup for new players
- Game state persists to disk (JSON snapshots) — survives a container restart; abandoned rooms auto-expire after 8h of inactivity
- `/healthz` endpoint + graceful shutdown, ready for a Docker `HEALTHCHECK`

## Tech stack

Node.js + TypeScript, the `ws` package for WebSockets, vanilla TypeScript/HTML/CSS on the client (no framework), esbuild for bundling, Vitest for tests.

## Running locally

Requires Node.js 22+.

```bash
npm install
npm run dev        # tsx watch, serves on http://localhost:3000
```

Or build and run the compiled output the same way production does:

```bash
npm run build
npm start
```

Run the test suite:

```bash
npm test
```

## Running with Docker

```bash
docker compose up -d --build
```

This builds the image, mounts `./data` to `/data` inside the container (one JSON file per room), and serves on `http://localhost:8001` (see `docker-compose.yml` to change the port). Key environment variables:

| Variable   | Default | Purpose                          |
| ---------- | ------- | --------------------------------- |
| `PORT`     | `3000`  | Port the server listens on        |
| `DATA_DIR` | `/data` | Where room snapshots are persisted |

## CI/CD

Every push to `main` runs typecheck + tests, then builds a multi-arch
(`amd64`/`arm64`) image and pushes it to Docker Hub as
[`luckyganesh/splendor`](https://hub.docker.com/r/luckyganesh/splendor)
(see `.github/workflows/ci-cd.yml`). Pushing requires the `DOCKERHUB_USERNAME`
and `DOCKERHUB_TOKEN` repository secrets to be set.

## Contributing / architecture

See [`ONBOARDING.md`](./ONBOARDING.md) for a tour of the codebase — directory
map, the load-bearing patterns (full-state re-render, the pending-action
confirm/cancel convention, the conservative animation diffing), and where new
features should go.
