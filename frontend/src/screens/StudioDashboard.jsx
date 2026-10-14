import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { studioAPI } from '../api';
import './StudioDashboard.css';

const CHECKPOINTS = [24, 72, 168];

const EMPTY_SNAPSHOT = {
  status: 'unavailable',
  generated_at: null,
  autopilot: {
    state: 'not_connected',
    reason: 'The secure control bridge has not supplied a live factory snapshot.',
  },
  pipeline_lock: { state: 'unknown' },
  products: {},
  queue: {},
  platforms: {},
  learning: {},
};

function readable(value) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value).replaceAll('_', ' ');
}

function titleCase(value) {
  return readable(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isHealthy(value) {
  return value === 'healthy' || value === 'verified' || value === 'ready';
}

function formatTime(value) {
  if (!value) return 'No live timestamp';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function getPlatform(snapshot, name) {
  return snapshot.platforms?.[name] || snapshot[name] || {};
}

function StatusPill({ value }) {
  const normalized = String(value || 'unknown').toLowerCase();
  const kind = isHealthy(normalized)
    ? 'good'
    : ['unavailable', 'unknown', 'not_connected', 'setup_required'].includes(normalized)
      ? 'muted'
      : ['blocked', 'unhealthy', 'rejected', 'paused'].includes(normalized)
        ? 'warn'
        : 'neutral';

  return <span className={`studio-pill studio-pill--${kind}`}>{titleCase(normalized)}</span>;
}

function Metric({ label, value, detail }) {
  return (
    <article className="studio-metric">
      <span>{label}</span>
      <strong>{value ?? '—'}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}

function PlatformCard({ name, platform, note }) {
  const status = platform.health_status || platform.status || 'unknown';
  const identity = platform.channel_name || platform.username || platform.page_name || platform.account_id || platform.page_id;

  return (
    <article className="studio-platform-card">
      <div className="studio-platform-card__top">
        <span>{name}</span>
        <StatusPill value={status} />
      </div>
      <strong>{identity || 'Control identity not supplied'}</strong>
      <small>{platform.last_verified_at ? `Verified ${formatTime(platform.last_verified_at)}` : note}</small>
    </article>
  );
}

function StudioDashboard({ publicPreview = false }) {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await studioAPI.getStatus();
      setSnapshot({ ...EMPTY_SNAPSHOT, ...result });
      setError(null);
    } catch (requestError) {
      setSnapshot(EMPTY_SNAPSHOT);
      setError('Live factory status is unavailable. No production or release state is being inferred.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (publicPreview) {
      setSnapshot({
        ...EMPTY_SNAPSHOT,
        status: 'preview',
        autopilot: {
          state: 'preview_only',
          reason: 'Public design preview. It is not connected to the KAAPAV production factory.',
        },
      });
      setLoading(false);
      return undefined;
    }
    refresh();
    const interval = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(interval);
  }, [publicPreview, refresh]);

  const pipeline = snapshot.pipeline_lock || {};
  const autopilot = snapshot.autopilot || {};
  const products = snapshot.products || {};
  const queue = snapshot.queue || {};
  const facebook = getPlatform(snapshot, 'facebook');
  const instagram = getPlatform(snapshot, 'instagram');
  const youtube = getPlatform(snapshot, 'youtube');
  const nextAction = autopilot.reason || autopilot.qc_failure_reason || 'No live control instruction supplied.';
  const learning = snapshot.learning || {};
  const currentItem = autopilot.current_sku
    ? `${autopilot.current_sku}${autopilot.video_number ? ` · Video ${autopilot.video_number}` : ''}`
    : 'No item in progress';

  const releaseState = useMemo(() => {
    const entries = queue.release_due ?? queue.release ?? snapshot.release_queue?.due;
    return Array.isArray(entries) ? entries.length : entries;
  }, [queue, snapshot.release_queue]);

  return (
    <main className="studio-screen">
      <header className="studio-hero">
        <div>
          <p className="studio-eyebrow">KAAPAV Fashion Jewellery</p>
          <h1>KAAPAV Auto</h1>
          <p className="studio-subtitle">Video factory console</p>
        </div>
        <div className="studio-hero__actions">
          <div className="studio-live-label">
            <span className={`studio-live-dot ${snapshot.status === 'healthy' ? 'studio-live-dot--on' : ''}`} />
            {publicPreview
              ? 'Public design preview — no live factory data'
              : snapshot.generated_at ? `Live snapshot ${formatTime(snapshot.generated_at)}` : 'Control bridge not connected'}
          </div>
          {!publicPreview && <button type="button" className="studio-refresh" onClick={refresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh status'}
          </button>}
        </div>
      </header>

      {(error || publicPreview) && <div className="studio-notice">{error || 'This public page contains no credentials, product details, Flow jobs, analytics, or publishing controls.'}</div>}

      <section className="studio-state-card" aria-label="Autopilot state">
        <div>
          <span className="studio-section-label">Autopilot</span>
          <h2>{titleCase(autopilot.state)}</h2>
          <p>{nextAction}</p>
        </div>
        <div className="studio-state-card__facts">
          <div><span>Current item</span><strong>{currentItem}</strong></div>
          <div><span>Flow attempt</span><strong>{autopilot.flow_attempt ?? '—'} / 3</strong></div>
          <div><span>Pipeline lock</span><StatusPill value={pipeline.state} /></div>
        </div>
      </section>

      <section className="studio-metrics" aria-label="Pipeline metrics">
        <Metric label="Approved products" value={products.valid_count ?? products.approved_count} detail="Exact asset hashes required" />
        <Metric label="Production queue" value={queue.production_due ?? queue.production ?? '—'} detail="One SKU per video" />
        <Metric label="Release queue due" value={releaseState ?? '—'} detail="Audited only" />
        <Metric label="QC rejected" value={queue.qc_rejected ?? '—'} detail="Retries remain same-item only" />
      </section>

      <section className="studio-grid">
        <article className="studio-panel studio-panel--wide">
          <div className="studio-panel__heading">
            <div>
              <span className="studio-section-label">Release gates</span>
              <h2>Platform controls</h2>
            </div>
            <span className="studio-caption">No immediate public publishing</span>
          </div>
          <div className="studio-platforms">
            <PlatformCard name="YouTube" platform={youtube} note="Private or future-scheduled only" />
            <PlatformCard name="Facebook" platform={facebook} note="Due audited releases only" />
            <PlatformCard name="Instagram" platform={instagram} note="Due audited releases only" />
          </div>
        </article>

        <article className="studio-panel">
          <div className="studio-panel__heading">
            <div>
              <span className="studio-section-label">Learning</span>
              <h2>Organic evidence</h2>
            </div>
          </div>
          <p className="studio-panel__copy">Only organic signals are reviewed. Owner tests, bought engagement, and low-view reuploads are excluded.</p>
          <div className="studio-checkpoints">
            {CHECKPOINTS.map((hours) => {
              const value = learning[`${hours}h`] || learning[hours] || {};
              return (
                <div key={hours} className="studio-checkpoint">
                  <strong>{hours}h</strong>
                  <StatusPill value={value.status || (value.complete ? 'ready' : 'unknown')} />
                </div>
              );
            })}
          </div>
        </article>

      </section>
    </main>
  );
}

export default StudioDashboard;
