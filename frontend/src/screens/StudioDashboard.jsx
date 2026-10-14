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
  schedules: {},
  analytics: {},
  learning: {},
};

const PLATFORM_META = {
  youtube: { label: 'YouTube', audience: 'Subscribers', releaseRule: 'Private or future-scheduled only' },
  facebook: { label: 'Facebook', audience: 'Followers', releaseRule: 'Due audited reels only' },
  instagram: { label: 'Instagram', audience: 'Followers', releaseRule: 'Due audited reels only' },
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

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat().format(number) : String(value);
}

function getItems(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  return [];
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

function ScheduleLane({ platform, schedule }) {
  const meta = PLATFORM_META[platform];
  const entries = getItems(schedule);
  const status = schedule?.status || (entries.length ? 'ready' : 'not_connected');

  return (
    <article className="studio-schedule-lane">
      <div className="studio-schedule-lane__heading">
        <div>
          <span className="studio-section-label">{meta.label}</span>
          <h3>{meta.releaseRule}</h3>
        </div>
        <StatusPill value={status} />
      </div>
      {entries.length ? (
        <ol className="studio-schedule-list">
          {entries.slice(0, 4).map((item, index) => (
            <li key={`${item.sku || item.video_id || item.id || 'release'}-${index}`}>
              <div>
                <strong>{item.title || item.sku || 'Audited release'}</strong>
                <span>{item.sku || item.video_id || item.id || 'Identity not supplied'}</span>
              </div>
              <div className="studio-schedule-list__time">
                <StatusPill value={item.status || 'audited'} />
                <small>{formatTime(item.publish_at || item.scheduled_at || item.due_at)}</small>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="studio-empty-copy">{schedule?.reason || 'No audited release is present in the secure snapshot.'}</p>
      )}
    </article>
  );
}

function AudienceCard({ platform, analytics }) {
  const meta = PLATFORM_META[platform];
  const audience = analytics?.subscribers ?? analytics?.followers ?? analytics?.audience_count;
  const status = analytics?.status || analytics?.source_status || 'not_collected';
  const collectedAt = analytics?.collected_at || analytics?.last_verified_at;

  return (
    <article className="studio-audience-card">
      <span>{meta.label} {meta.audience}</span>
      <strong>{formatNumber(audience)}</strong>
      <StatusPill value={status} />
      <small>{collectedAt ? `Collected ${formatTime(collectedAt)}` : 'Not collected from the platform yet'}</small>
    </article>
  );
}

function VideoTable({ platform, analytics }) {
  const meta = PLATFORM_META[platform];
  const videos = getItems(analytics?.videos || analytics?.reels || analytics?.media);
  const status = analytics?.status || analytics?.source_status || 'not_collected';

  if (!videos.length) {
    return (
      <div className="studio-video-empty">
        <StatusPill value={status} />
        <p>{analytics?.reason || `${meta.label} per-video analytics have not been collected through the secure factory bridge.`}</p>
      </div>
    );
  }

  return (
    <div className="studio-video-table-wrap">
      <table className="studio-video-table">
        <thead>
          <tr><th>Video</th><th>Published</th><th>Views</th><th>Engagement</th></tr>
        </thead>
        <tbody>
          {videos.slice(0, 12).map((video, index) => {
            const engagement = video.engagement ?? video.likes ?? video.reactions;
            return (
              <tr key={`${video.video_id || video.id || video.media_id || 'video'}-${index}`}>
                <td><strong>{video.title || video.caption || video.sku || 'Untitled release'}</strong><small>{video.sku || video.video_id || video.id || video.media_id || 'Identity not supplied'}</small></td>
                <td>{formatTime(video.published_at || video.publish_at || video.created_at)}</td>
                <td>{formatNumber(video.views ?? video.view_count ?? video.plays)}</td>
                <td>{formatNumber(engagement)}{video.comments !== undefined && <small> · {formatNumber(video.comments)} comments</small>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StudioDashboard({ publicPreview = false }) {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activePlatform, setActivePlatform] = useState('youtube');

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
  const schedules = snapshot.schedules || snapshot.release_schedule || {};
  const analytics = snapshot.analytics || {};
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

      <section className="studio-operations" aria-label="Platform scheduler and analytics">
        <article className="studio-panel studio-panel--wide studio-panel--scheduler">
          <div className="studio-panel__heading">
            <div>
              <span className="studio-section-label">Audited scheduler</span>
              <h2>Release lanes by platform</h2>
            </div>
            <span className="studio-caption">Read-only — central autopilot is the sole executor</span>
          </div>
          <div className="studio-schedule-grid">
            {Object.keys(PLATFORM_META).map((platform) => <ScheduleLane key={platform} platform={platform} schedule={schedules[platform]} />)}
          </div>
        </article>

        <article className="studio-panel studio-panel--wide studio-panel--analytics">
          <div className="studio-panel__heading">
            <div>
              <span className="studio-section-label">Platform performance</span>
              <h2>Audience and video evidence</h2>
            </div>
            <span className="studio-caption">Platform API facts only — no estimated values</span>
          </div>
          <div className="studio-audience-grid">
            {Object.keys(PLATFORM_META).map((platform) => <AudienceCard key={platform} platform={platform} analytics={analytics[platform]} />)}
          </div>
          <div className="studio-tabs" role="tablist" aria-label="Per-platform video performance">
            {Object.keys(PLATFORM_META).map((platform) => (
              <button key={platform} type="button" role="tab" aria-selected={activePlatform === platform} className={activePlatform === platform ? 'is-active' : ''} onClick={() => setActivePlatform(platform)}>
                {PLATFORM_META[platform].label} videos
              </button>
            ))}
          </div>
          <VideoTable platform={activePlatform} analytics={analytics[activePlatform]} />
        </article>
      </section>
    </main>
  );
}

export default StudioDashboard;
