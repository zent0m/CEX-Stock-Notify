# CeX RTX 3070 Notify

Watches CeX UK for RTX 3070 (and 3070 Ti) graphics cards and emails you, via [Resend](https://resend.com), whenever stock appears.

## How it works

Every few minutes it asks CeX's site search (the Algolia proxy at `search.webuy.io`, using the public search-only key the website itself uses) for every RTX 3070 model in the *PCI-Express Graphics Cards* category, then compares against the previous check:

- **Online stock went up** for a model (e.g. 0 → 1, or 6 → 7 after a trade-in)
- **A store that had none now has one**
- **A model CeX has never listed before** with stock

CeX has one page per *model*, not per physical card, so "a new listing" means stock rising on a model page. If one card sells and another arrives between two checks, the count doesn't change and that one is missed.

Each check that finds changes sends **one email** with a card per affected model, cheapest first: product photo, price, badges (NEW MODEL / ONLINE / IN STORE), what changed, which stores, and a "View on CeX" button. The first check saves a baseline and sends a "monitor started" email with the **full watchlist**: every model, its price and current stock. The same list is live at `/watchlist`.

A brand-new model with stock is alerted like a restock, with a NEW MODEL badge. A new model with no stock yet is recorded silently, and alerts normally once stock arrives. If sending fails, the previous state is kept, so the alert is retried on the next check.

> The old `wss2.cex.uk.webuy.io/v3/boxes` API (from Dionakra/webuy-api) is now blocked by Cloudflare, which is why this uses the search proxy instead. ntfy.sh was tried for push alerts but timed out from Render's shared IPs.

## Setup

### 1. Resend

You need a Resend API key (resend.com → API Keys). The sender address must be on a domain you've verified in Resend. Without one, leave `EMAIL_FROM` unset: it then uses `onboarding@resend.dev`, which only delivers to your Resend account's own email.

### 2. Run locally

```bash
cp .env.example .env     # set RESEND_API_KEY and EMAIL_TO
npm install
npm run build
npm run test:notify      # sample stock-alert email using live data
npm run test:notify -- startup   # the "monitor started" email with the full watchlist
npm run check            # one real check (first run = baseline)
npm start                # server + checks every 5 minutes
```

### 3. Deploy on Render

1. Push this folder to a GitHub repo.
2. In Render: **New → Blueprint**, pick the repo (it reads `render.yaml`), or create a **Web Service** manually with build `npm ci --include=dev && npm run build` and start `npm start`.
3. Set `RESEND_API_KEY`, `EMAIL_TO` and (optionally) `EMAIL_FROM` in the Environment tab.

**State.** With no `UPSTASH_*` vars set it saves to a local file, like the old NHS app's SQLite file. Render's free disk is wiped on deploys and restarts; when that happens the app takes a fresh baseline (no flood of alerts, but changes during the downtime are missed). For state that survives restarts, create a free Redis database at [upstash.com](https://upstash.com) and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

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
| `/watchlist` | Every watched model with price, photo and current stock |
| `/test-notify?token=…` | Send a sample alert email (live data) and return any error |

## Settings

See `.env.example`.

| Var | Default | Meaning |
|---|---|---|
| `RESEND_API_KEY` | — | Resend API key (required) |
| `EMAIL_TO` | — | Comma-separated recipients (required) |
| `EMAIL_FROM` | `onboarding@resend.dev` | Sender; must be on a Resend-verified domain |
| `INCLUDE_TI` | `true` | Include 3070 Ti cards |
| `MAX_PRICE` | none | Only watch models at or under this price (£) |
| `WATCH_ONLINE` | `true` | Alert on online stock increases |
| `WATCH_STORES` | `true` | Alert when a store gets stock |
| `STORE_FILTER` | all | Comma list of store-name substrings, e.g. `Birmingham,Nottingham` |
| `CHECK_INTERVAL_MINUTES` | `5` | Internal check interval |
| `CHECK_TOKEN` | none | Required `?token=` for `/check` and `/test-notify` |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | none | Persistent state; falls back to `STATE_FILE` |
