# Fashion Video Studio dashboard

The React dashboard is available at `/studio` after a normal authenticated KAAPAV login. It is deliberately read-only: the browser cannot create Flow jobs, bypass fidelity QC, or publish a release.

## Live control contract

The dashboard requests `GET /api/studio/status`. A control bridge must provide this endpoint only from the central KAAPAV Fashion Jewellery factory. It must return a fresh, sanitized snapshot with no credentials, OAuth data, supplier secrets, local paths, or raw media URLs.

Suggested response shape:

```json
{
  "status": "healthy",
  "generated_at": "2026-10-14T17:24:01+05:30",
  "autopilot": {"state": "awaiting_approved_product", "reason": "..."},
  "pipeline_lock": {"state": "verified"},
  "products": {"valid_count": 0},
  "queue": {"production_due": 0, "release_due": 0, "qc_rejected": 0},
  "platforms": {
    "youtube": {"health_status": "healthy", "channel_name": "..."},
    "facebook": {"health_status": "healthy", "page_name": "Kaapav"},
    "instagram": {"health_status": "healthy", "username": "kaapavfashionjewellery"}
  },
  "schedules": {
    "youtube": {"status": "ready", "items": [{"sku": "KJ-104", "title": "...", "publish_at": "...", "status": "scheduled"}]},
    "facebook": {"status": "ready", "items": []},
    "instagram": {"status": "ready", "items": []}
  },
  "analytics": {
    "youtube": {"status": "collected", "subscribers": 0, "collected_at": "...", "videos": [{"video_id": "...", "sku": "KJ-104", "title": "...", "published_at": "...", "views": 0, "likes": 0, "comments": 0}]},
    "facebook": {"status": "not_collected", "followers": null, "reason": "...", "videos": []},
    "instagram": {"status": "not_collected", "followers": null, "reason": "...", "reels": []}
  },
  "learning": {"24h": {"status": "unknown"}, "72h": {"status": "unknown"}, "168h": {"status": "unknown"}}
}
```

`0` is valid only when returned by an authenticated platform API. Missing or
uncollected metrics must be `null` or omitted with `status: "not_collected"`;
the dashboard renders an unavailable state instead of inventing a number.

## Secure snapshot bridge

The Worker exposes two deliberately narrow routes:

- `GET /api/studio/status`: normal authenticated KAAPAV dashboard read.
- `POST /api/studio/ingest`: factory-only write using the `X-Studio-Bridge-Token`
  header. It stores one short-lived sanitized snapshot in KV.

Set the Worker secret outside source control:

```powershell
npx wrangler secret put STUDIO_BRIDGE_TOKEN
```

The factory uses the same value only from its local environment. It must never
be added to JSON, GitHub, the browser, a product contract, or a scheduled task
argument. The bridge rejects token/secret/credential fields and snapshots expire
after seven minutes. The sole central autopilot remains the release executor;
this bridge is read-only from the application side.

## Scheduler and analytics rules

The dashboard has separate YouTube, Facebook, and Instagram release lanes. It
only displays entries that exist in `product_release_queue.json` after their
byte-bound audit. It never creates, edits, retries, or publishes releases.

Per-video metrics are platform facts, not estimates. Store the external release
ID, SKU, timestamp, views, engagement, and collection time after an authenticated
platform request. Keep each platform's data separate. YouTube subscribers are
rounded by YouTube; Facebook/Instagram follower and reel metrics require the
approved account and permissions. An unavailable scope, health check, or API
request must remain visible as `not_collected`.

If the endpoint is missing, stale, or invalid, the UI shows **Control bridge not connected**. It must never substitute a static success state.

## Public KAAPAV Auto preview

The GitHub Pages workflow builds a separate static preview branded **KAAPAV Auto**. It contains no live factory status, product data, credentials, analytics, release controls, or publishing capability. The authenticated `/studio` application view remains the only dashboard that may request a live status snapshot.
