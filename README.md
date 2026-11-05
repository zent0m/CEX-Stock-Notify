# CeX RTX 3070 Notify

Watches CeX UK for RTX 3070 (and 3070 Ti) graphics cards and sends a phone push via [ntfy](https://ntfy.sh) whenever stock appears.

## How it works

Every few minutes it asks CeX's site search (the Algolia proxy at `search.webuy.io`, using the public search-only key the website itself uses) for every RTX 3070 model in the *PCI-Express Graphics Cards* category, then compares against the previous check:

- **Online stock went up** for a model (e.g. 0 → 1, or 6 → 7 after a trade-in) → push
- **A store that had none now has one** → push
- **A model CeX has never listed before** with stock → push

CeX has one page per *model*, not per physical card, so "a new listing" means stock rising on a model page. If one card sells and another arrives between two checks, the count doesn't change and that one is missed.

Each push shows the price, model, what changed and which stores, and tapping it opens the CeX product page. The first check just saves a baseline and sends a single "monitor started" push.

> The old `wss2.cex.uk.webuy.io/v3/boxes` API (from Dionakra/webuy-api) is now blocked by Cloudflare, which is why this uses the search proxy instead.

## Setup

### 1. ntfy

1. Install the **ntfy** app (Android / iOS).
2. Tap **+** and subscribe to a topic with a long random name, e.g. `cex-3070-k9x2m7q4`. Anyone who knows the name can read it, so don't use something guessable.

### 2. Run locally

```bash
cp .env.example .env     # set NTFY_TOPIC
npm install
npm run build
npm run test:notify      # sends a sample push to your phone
npm run check            # one real check (first run = baseline)
npm start                # server + checks every 5 minutes
```

### 3. Deploy on Render

1. Push this folder to a GitHub repo.
2. In Render: **New → Blueprint**, pick the repo (it reads `render.yaml`), or create a **Web Service** manually with build `npm ci --include=dev && npm run build` and start `npm start`.
3. Set the env vars `NTFY_TOPIC`, `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (see below).

**Keep state across restarts (recommended).** Render's free disk is wiped on every restart and deploy. Create a free database at [upstash.com](https://upstash.com) (Redis → Create database), then copy the **REST URL** and **REST token** into the two `UPSTASH_*` vars. Without them it falls back to a local file and re-baselines after each restart: you'd miss changes during downtime, but you won't get spammed.

**Keep it awake.** Free Render web services sleep after about 15 minutes with no traffic, which stops the timer. Point a cron pinger (e.g. [cron-job.org](https://cron-job.org)) at the URL below. Any interval under 15 minutes keeps the service awake, and while it's awake the built-in 5-minute timer runs the checks. Each ping also triggers a check, unless one ran in the last 60 seconds:

```
https://<your-service>.onrender.com/check?token=<CHECK_TOKEN>
```

`render.yaml` generates `CHECK_TOKEN` for you; copy it from the Render dashboard (Environment tab).

## Endpoints

| Path | What it does |
|---|---|
| `/status` | Health check and the last check's result |
| `/check?token=…` | Run a check now (ignored if one ran in the last 60 s) |
| `/test-notify?token=…` | Send a test push from the server and return any error |

## Settings

All optional except `NTFY_TOPIC`; see `.env.example`.

| Var | Default | Meaning |
|---|---|---|
| `NTFY_TOPIC` | — | Your ntfy topic (required for pushes) |
| `INCLUDE_TI` | `true` | Include 3070 Ti cards |
| `MAX_PRICE` | none | Only watch models at or under this price (£) |
| `WATCH_ONLINE` | `true` | Alert on online stock increases |
| `WATCH_STORES` | `true` | Alert when a store gets stock |
| `STORE_FILTER` | all | Comma list of store-name substrings, e.g. `Birmingham,Nottingham` |
| `CHECK_INTERVAL_MINUTES` | `5` | Internal check interval |
| `CHECK_TOKEN` | none | Required `?token=` for `/check` |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | none | Persistent state; falls back to `STATE_FILE` |
| `NTFY_SERVER` / `NTFY_TOKEN` | `https://ntfy.sh` | Self-hosted or protected ntfy |
