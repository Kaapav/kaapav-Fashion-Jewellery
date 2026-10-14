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
  "learning": {"24h": {"status": "unknown"}, "72h": {"status": "unknown"}, "168h": {"status": "unknown"}}
}
```

If the endpoint is missing, stale, or invalid, the UI shows **Control bridge not connected**. It must never substitute a static success state.
