import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  CloudOff,
  Database,
  Download,
  ExternalLink,
  FileText,
  Fingerprint,
  Folder,
  KeyRound,
  Layers3,
  LockKeyhole,
  Menu,
  Monitor,
  Moon,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Sun,
  SquareTerminal,
  WifiOff,
  X,
} from 'lucide-react';
import { sampleData, records as sampleRecords } from './sample-data';
import { filterAlerts, priorityAlert } from './selectors';
import {
  formatDate,
  safeRead,
  saveLocal,
  summarize,
  type Dataset,
  type Alert,
  type RecordItem,
} from './domain';
import { screens, titles, parents, parseRoute, detailRoutes, type Screen } from './navigation';
import {
  Badge,
  ButtonLink,
  CheckList,
  Empty,
  Facts,
  Modal,
  Notice,
  PageHeader,
  Row,
  Section,
  Steps,
} from './components';
import { Access } from './Access';
import { SecurityControls } from './SecurityControls';
import { Freshness } from './Freshness';
import { ConnectionQr } from './ConnectionQr';
import { PullToRefresh } from './PullToRefresh';
import { useAppearance } from './appearance';
import { ApiError, downloadJson, loadDataset, loadRecords, request } from './api';

const mainNavigation = [
  { id: 'home', label: 'Overview', icon: Shield },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'devices', label: 'Devices', icon: Monitor },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'settings', label: 'More', icon: Layers3 },
] as const;
const workspaceLinks: Screen[] = [
  'incidents',
  'vulnerabilities',
  'recommendations',
  'investigations',
  'actions',
  'software',
  'indicators',
  'entities',
  'reports',
];
const preferenceDefaults = { notifications: false, spoken: false, repeat: false };
type Preferences = typeof preferenceDefaults;
type Review = { note: string; outcome: string; reviewedAt: string };
function resourceIcon(resource: string) {
  const Icon =
    (
      {
        incidents: Bell,
        vulnerabilities: AlertTriangle,
        recommendations: ShieldCheck,
        investigations: Search,
        actions: Activity,
        software: Layers3,
        indicators: SquareTerminal,
        entities: Database,
        reports: FileText,
      } as Record<string, typeof Bell>
    )[resource] ?? Folder;
  return <Icon size={20} />;
}
function readPreferences() {
  return safeRead(
    'dc.preferences',
    preferenceDefaults,
    (value): value is Preferences =>
      !!value &&
      typeof value === 'object' &&
      Object.entries(preferenceDefaults).every(
        ([key]) => typeof (value as Record<string, unknown>)[key] === 'boolean',
      ),
  );
}
function readReviews() {
  return safeRead<Record<string, Review>>(
    'dc.reviews',
    {},
    (value): value is Record<string, Review> =>
      !!value &&
      typeof value === 'object' &&
      Object.values(value).every(
        (item) =>
          !!item &&
          typeof item === 'object' &&
          ['note', 'outcome', 'reviewedAt'].every(
            (key) => typeof (item as Record<string, unknown>)[key] === 'string',
          ),
      ),
  );
}

export function App() {
  const { appearance, chooseAppearance } = useAppearance();
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  const [dataset, setDataset] = useState<Dataset>(() =>
    new URLSearchParams(location.search).get('mode') === 'live'
      ? { alerts: [], devices: [], mode: 'live', fetchedAt: '', warnings: [] }
      : sampleData,
  );
  const live = new URLSearchParams(location.search).get('mode') === 'live';
  const [loadState, setLoadState] = useState<'ready' | 'loading' | 'error' | 'auth'>(
    live ? 'loading' : 'ready',
  );
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [deviceQuery, setDeviceQuery] = useState('');
  const [menu, setMenu] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [preferences, setPreferences] = useState(readPreferences);
  const [reviews, setReviews] = useState(() =>
    live ? ({} as Record<string, Review>) : readReviews(),
  );
  const [reviewNote, setReviewNote] = useState('');
  const [outcome, setOutcome] = useState('Undetermined');
  const [noticeRead, setNoticeRead] = useState(false);
  const [modal, setModal] = useState<{ title: string; body: ReactNode } | null>(null);
  const [toast, setToast] = useState('');
  const [remoteRecords, setRemoteRecords] = useState<Record<string, RecordItem[]>>({});
  const [resourceError, setResourceError] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const firstRoute = useRef(true);
  const loadGeneration = useRef(0);
  const alert = dataset.alerts.find((a) => a.id === route.id) ?? dataset.alerts[0];
  const device =
    dataset.devices.find((d) => d.id === route.id) ??
    dataset.devices.find((d) => d.id === alert?.deviceId) ??
    dataset.devices[0];
  function tell(message: string) {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(''), 5000);
  }
  async function refresh() {
    if (!live) {
      tell('Demo snapshot is up to date.');
      return;
    }
    const generation = ++loadGeneration.current;
    setLoadState('loading');
    try {
      const data = await loadDataset();
      if (generation !== loadGeneration.current) return;
      setDataset(data);
      setLoadState('ready');
      setLoadError('');
    } catch (error) {
      if (generation !== loadGeneration.current) return;
      setLoadState(error instanceof ApiError && error.status === 401 ? 'auth' : 'error');
      setLoadError(error instanceof Error ? error.message : 'The workspace could not be loaded.');
    }
  }
  useEffect(() => {
    if (!live) return;
    const clear = () => {
      loadGeneration.current += 1;
      setDataset({ alerts: [], devices: [], mode: 'live', fetchedAt: '', warnings: [] });
      setRemoteRecords({});
      setReviews({});
      setReviewNote('');
      setNoticeRead(false);
      setModal(null);
      setLoadState('auth');
    };
    addEventListener('dc-session-ended', clear);
    return () => removeEventListener('dc-session-ended', clear);
  }, [live]);
  useEffect(() => {
    if (live) {
      setDataset({ alerts: [], devices: [], mode: 'live', fetchedAt: '', warnings: [] });
      void refresh();
    }
    return () => clearTimeout(toastTimer.current);
  }, []); // Mode is immutable for this page load.
  useEffect(() => {
    const onHash = () => {
      setRoute(parseRoute(location.hash));
      setMenu(false);
    };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    document.title = `${titles[route.screen]} · Defender Companion`;
    if (!firstRoute.current) document.getElementById('page-title')?.focus({ preventScroll: true });
    firstRoute.current = false;
    window.scrollTo({ top: 0 });
  }, [route.screen, route.id]);
  useEffect(() => {
    setReviewNote(alert ? (reviews[alert.id]?.note ?? '') : '');
    setOutcome(alert ? (reviews[alert.id]?.outcome ?? 'Undetermined') : 'Undetermined');
  }, [alert?.id]);
  const listResource = Object.keys(detailRoutes).find(
    (resource) => resource === route.screen || detailRoutes[resource] === route.screen,
  );
  useEffect(() => {
    setResourceError('');
    if (!live || !listResource || loadState !== 'ready') return;
    let cancelled = false;
    loadRecords(listResource)
      .then((items) => {
        if (!cancelled) setRemoteRecords((old) => ({ ...old, [listResource]: items }));
      })
      .catch((error: Error) => {
        if (!cancelled) setResourceError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [live, listResource, loadState]);
  const recordItems = listResource
    ? live
      ? (remoteRecords[listResource] ?? [])
      : (sampleRecords[listResource] ?? [])
    : [];
  const currentRecord = recordItems.find((item) => item.id === route.id) ?? recordItems[0];
  const counts = summarize(dataset.alerts);
  const priority = priorityAlert(dataset.alerts);
  const detailHeading =
    route.screen === 'settings'
      ? 'More'
      : route.screen === 'alert'
        ? alert?.title
        : route.screen === 'device'
          ? device?.name
          : ['process', 'file', 'registry'].includes(route.screen)
            ? alert?.evidence.find((item) => item.type === route.screen)?.name
            : listResource && route.screen !== listResource
              ? currentRecord?.name
              : undefined;
  const alertRoute = (target: string) => `${target}${alert ? `/${alert.id}` : ''}`;
  const deviceRoute = (target: string) => `${target}${device ? `/${device.id}` : ''}`;
  const activeNav =
    route.screen === 'home'
      ? 'home'
      : [
            'alert',
            'alerts',
            'evidence',
            'process',
            'file',
            'registry',
            'review',
            'incidents',
            'incident',
          ].includes(route.screen)
        ? 'alerts'
        : ['device', 'devices', 'antivirus', 'scans'].includes(route.screen)
          ? 'devices'
          : ['activity', 'telemetry'].includes(route.screen)
            ? 'activity'
            : 'settings';
  function deviceRows(limit = dataset.devices.length) {
    return (
      <div className="card list-card">
        {dataset.devices
          .filter((d) =>
            `${d.name} ${d.os} ${d.role}`.toLowerCase().includes(deviceQuery.toLowerCase()),
          )
          .slice(0, limit)
          .map((d) => (
            <Row
              key={d.id}
              title={d.name}
              subtitle={`${d.role} · ${d.isolation === 'isolated' ? 'Isolated' : d.health}`}
              href={`device/${d.id}`}
              icon={<Monitor size={21} />}
              trailing={
                <Badge tone={d.risk}>
                  {d.risk === 'none' ? 'No known risk' : `${d.risk} risk`}
                </Badge>
              }
            />
          ))}
        {!dataset.devices.length && <p className="inset">No device records are available.</p>}
      </div>
    );
  }
  function timeline() {
    return (
      <ol className="timeline">
        {dataset.alerts.map((a) => (
          <li key={a.id}>
            <span className={`timeline-dot ${a.severity}`} />
            <div>
              <span className="small">{formatDate(a.createdAt)}</span>
              <a href={`#alert/${a.id}`}>{a.title}</a>
              <p>
                {dataset.devices.find((d) => d.id === a.deviceId)?.name ?? 'Device not reported'} ·{' '}
                {a.status === 'resolved' ? 'Resolved in source' : 'Review required'}
              </p>
            </div>
          </li>
        ))}
      </ol>
    );
  }
  function alertCard(a: Alert) {
    return (
      <a className="card alert-card" href={`#alert/${a.id}`} key={a.id}>
        <div className="card-top">
          <Badge tone={a.severity}>{a.severity}</Badge>
          <span className="small">{formatDate(a.createdAt)}</span>
        </div>
        <h2>{a.title}</h2>
        <p>{a.description}</p>
        <div className="card-top">
          <span className="meta">
            <Monitor size={15} />
            {dataset.devices.find((d) => d.id === a.deviceId)?.name ?? 'Unreported'}
          </span>
          <Badge>{a.status === 'resolved' ? 'Resolved' : 'Needs review'}</Badge>
        </div>
      </a>
    );
  }
  function saveReview() {
    if (!alert || !reviewNote.trim()) return;
    const next = {
      ...reviews,
      [alert.id]: { note: reviewNote.trim(), outcome, reviewedAt: new Date().toISOString() },
    };
    if (!live && !saveLocal('dc.reviews', next)) {
      tell('Your browser could not save the note. Copy it before leaving.');
      return;
    }
    setReviews(next);
    setModal(null);
    tell(
      live
        ? 'Review held only in this tab until sign-out or reload. Defender is unchanged.'
        : 'Review saved on this browser. The Defender alert is unchanged.',
    );
  }
  function updatePreference(key: keyof Preferences, checked: boolean) {
    const next = { ...preferences, [key]: checked };
    if (!saveLocal('dc.preferences', next)) {
      tell('Your browser could not save this preference.');
      return;
    }
    setPreferences(next);
  }

  function content(): ReactNode {
    if (
      live &&
      loadState !== 'ready' &&
      !['access', 'recovery', 'connections', 'permissions', 'security', 'settings'].includes(
        route.screen,
      )
    ) {
      if (loadState === 'auth')
        return (
          <Empty
            icon={<LockKeyhole />}
            title="Sign in to your private workspace"
            action={<ButtonLink href="access">Sign in with a passkey</ButtonLink>}
          >
            Your Microsoft security data stays behind passkey authentication.
          </Empty>
        );
      if (loadState === 'loading')
        return (
          <div role="status" className="empty">
            <RefreshCw className="spin" />
            <h2>Loading your workspace</h2>
            <p>Fetching the latest read-only snapshot.</p>
          </div>
        );
      return (
        <Empty
          icon={<CloudOff />}
          title="The workspace is unavailable"
          action={
            <button className="button" onClick={() => void refresh()}>
              Try again
            </button>
          }
        >
          {loadError}
        </Empty>
      );
    }
    if (listResource) {
      if (resourceError)
        return (
          <Empty
            icon={<CircleHelp />}
            title="This data is not available"
            action={<ButtonLink href="permissions">Review permissions</ButtonLink>}
          >
            {resourceError}
          </Empty>
        );
      if (live && !remoteRecords[listResource]) return <p role="status">Loading records…</p>;
      if (route.screen === listResource)
        return (
          <>
            <p className="list-summary">
              {recordItems.length} {recordItems.length === 1 ? 'record' : 'records'} in this
              snapshot
            </p>
            <div className="card list-card">
              {recordItems.map((item) => (
                <Row
                  key={item.id}
                  title={item.name}
                  subtitle={item.subtitle}
                  href={`${detailRoutes[listResource]}/${item.id}`}
                  icon={resourceIcon(listResource)}
                  trailing={<Badge tone={item.severity}>{item.status}</Badge>}
                />
              ))}
              {!recordItems.length && <p className="inset">No records returned for this view.</p>}
            </div>
            {live && (
              <Notice>
                Read-only records. Availability depends on your permissions, license and retention.
              </Notice>
            )}
          </>
        );
      if (!currentRecord)
        return (
          <Empty
            icon={<Folder />}
            title="Record not found"
            action={<ButtonLink href={listResource}>Return to the list</ButtonLink>}
          >
            The record may be outside the available snapshot.
          </Empty>
        );
      return (
        <>
          <Badge tone={currentRecord.severity}>{currentRecord.status}</Badge>
          <p>{currentRecord.description}</p>
          <div className="card">
            <Facts items={currentRecord.facts} />
          </div>
          <Section title="Related context">
            <div className="card list-card">
              <Row
                title="Review related alerts"
                subtitle="Trace the evidence before deciding"
                href="alerts"
                icon={<Bell />}
              />
              <Row
                title="Device context"
                subtitle="Health, isolation and inventory"
                href="devices"
                icon={<Monitor />}
              />
            </div>
          </Section>
          <Notice>
            Changes must be made in the source security system. This workspace does not perform
            remediation.
          </Notice>
        </>
      );
    }
    switch (route.screen) {
      case 'home':
        return (
          <>
            <div className="overview-grid">
              <div className={`card priority-card ${counts.open ? 'attention' : ''}`}>
                <div className="card-top">
                  <Badge tone={priority?.severity ?? (live ? '' : 'success')}>
                    {priority
                      ? `${priority.severity} priority`
                      : live
                        ? 'No open alerts in snapshot'
                        : 'No open alerts'}
                  </Badge>
                  <span className="priority-label">
                    {priority ? 'Needs review' : 'Current snapshot'}
                  </span>
                </div>
                <h2>{priority?.title ?? 'No active alerts in this snapshot'}</h2>
                {priority && (
                  <div className="priority-context">
                    <Monitor size={15} />
                    <span>
                      {dataset.devices.find((d) => d.id === priority.deviceId)?.name ??
                        'Unreported device'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={priority.createdAt}>{formatDate(priority.createdAt)}</time>
                  </div>
                )}
                <p className="priority-description">
                  {priority?.description ?? 'Review recent activity and check device health.'}
                </p>
                <ButtonLink href={priority ? `alert/${priority.id}` : 'activity'}>
                  {priority ? 'Review the alert' : 'View activity'}
                </ButtonLink>
              </div>
              <div className="overview-aside">
                <div className="card workspace-summary">
                  <h2>Workspace summary</h2>
                  <div className="summary-metrics">
                    <a href="#devices">
                      <strong>{dataset.devices.length}</strong>
                      <span>Devices</span>
                    </a>
                    <a href="#alerts">
                      <strong>{counts.open}</strong>
                      <span>Open alerts</span>
                    </a>
                    <a href="#activity">
                      <strong>{counts.reviewed}</strong>
                      <span>Resolved</span>
                    </a>
                  </div>
                  <div className="summary-updated">
                    <Clock3 size={14} />
                    <span>
                      {live ? 'Last read' : 'Demo snapshot'} · {formatDate(dataset.fetchedAt)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="two-columns">
              <Section title="Your devices" link="devices">
                {deviceRows(3)}
              </Section>
              <Section title="Recent activity" link="activity">
                {timeline()}
              </Section>
            </div>
          </>
        );
      case 'alerts': {
        const filtered = filterAlerts(dataset.alerts, { query, status, severity });
        return (
          <>
            <div className="filters">
              <label className="search-field">
                <Search size={18} />
                <span className="sr-only">Search alerts</span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search alerts or device IDs"
                />
              </label>
              <label>
                <span className="sr-only">Alert status</span>
                <select
                  aria-label="Alert status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="all">All statuses</option>
                  <option value="new">New</option>
                  <option value="inProgress">In progress</option>
                  <option value="resolved">Resolved</option>
                </select>
              </label>
              <label>
                <span className="sr-only">Severity</span>
                <select
                  aria-label="Severity"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                >
                  <option value="all">All severities</option>
                  {['high', 'medium', 'low', 'informational'].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className="small" role="status">
              {filtered.length} {filtered.length === 1 ? 'alert' : 'alerts'} shown
            </p>
            <div className="alert-grid">{filtered.map(alertCard)}</div>
            {!filtered.length && (
              <Empty
                icon={<Search />}
                title="No matching alerts"
                action={
                  <button
                    className="button secondary"
                    onClick={() => {
                      setQuery('');
                      setStatus('all');
                      setSeverity('all');
                    }}
                  >
                    Clear filters
                  </button>
                }
              >
                Try another search or broaden the filters.
              </Empty>
            )}
          </>
        );
      }
      case 'alert':
        return alert ? (
          <>
            <div className="detail-heading">
              <Badge tone={alert.severity}>{alert.severity}</Badge>
              <Badge>{alert.status === 'resolved' ? 'Resolved in source' : 'Needs review'}</Badge>
            </div>
            {live && alert.sourceUrl && (
              <a className="text-link" href={alert.sourceUrl} target="_blank" rel="noreferrer">
                Open source alert in Defender <ExternalLink size={15} />
              </a>
            )}
            <p className="meta">
              <Monitor size={16} />
              {dataset.devices.find((d) => d.id === alert.deviceId)?.name ?? alert.deviceId} ·{' '}
              {formatDate(alert.createdAt)}
            </p>
            <ButtonLink href={alertRoute('evidence')}>Review evidence</ButtonLink>
            <div className="two-columns">
              <Section title="What we know">
                <div className="card">
                  <p>{alert.description}</p>
                  <Facts
                    items={[
                      ['Category', alert.category],
                      ['Source status', alert.status],
                      ['Origin', 'Not confirmed'],
                    ]}
                  />
                </div>
              </Section>
              <Section title="What to do next">
                <div className="card lavender">
                  <Steps
                    items={[
                      [
                        'Keep the evidence',
                        'A blocked action alone does not establish its origin.',
                      ],
                      [
                        'Trace the process',
                        'Compare the parent process and command with the approved activity.',
                      ],
                      [
                        'Record your finding',
                        'Use a local note. The source alert remains unchanged.',
                      ],
                    ]}
                  />
                </div>
              </Section>
            </div>
            <div className="card list-card">
              <Row
                title="Inspect the device"
                subtitle="Protection and isolation context"
                href={`device/${alert.deviceId}`}
                icon={<Monitor />}
              />
              <Row
                title="Write a review"
                subtitle={
                  reviews[alert.id]
                    ? `Local review saved · ${formatDate(reviews[alert.id].reviewedAt)}`
                    : 'Separate your finding from the source status'
                }
                href={alertRoute('review')}
                icon={<FileText />}
              />
            </div>
          </>
        ) : (
          noAlert()
        );
      case 'evidence':
        return alert ? (
          <>
            <Notice>
              Evidence describes observations. A verdict on one entity does not establish the cause
              of the whole incident.
            </Notice>
            <div className="card list-card">
              {alert.evidence.map((item) => (
                <Row
                  key={item.id}
                  title={item.name}
                  subtitle={`${item.type} · ${item.verdict}`}
                  href={`${['process', 'file', 'registry'].includes(item.type) ? item.type : 'entity'}/${alert.id}`}
                  icon={item.type === 'process' ? <SquareTerminal /> : <FileText />}
                />
              ))}
            </div>
            <ButtonLink href={alertRoute('review')} secondary>
              Record a finding
            </ButtonLink>
          </>
        ) : (
          noAlert()
        );
      case 'process':
      case 'file':
      case 'registry': {
        const evidence = alert?.evidence.find((item) => item.type === route.screen);
        return evidence ? (
          <>
            <Badge>{evidence.verdict}</Badge>
            <div className="card">
              <Facts
                items={[
                  ['Type', evidence.type],
                  ['Observation', evidence.detail],
                  ['Source alert', alert!.id],
                ]}
              />
            </div>
            <Notice>
              Command lines and paths are untrusted evidence. This application never executes them.
            </Notice>
            <button
              className="button secondary"
              onClick={() => {
                navigator.clipboard
                  ?.writeText(evidence.detail)
                  .then(() => tell('Evidence copied.'))
                  .catch(() => tell('Copy is unavailable. Select the text to copy it.'));
              }}
            >
              Copy evidence text
            </button>
            <ButtonLink href={alertRoute('review')} secondary>
              Write a review
            </ButtonLink>
          </>
        ) : (
          <Empty
            icon={<FileText />}
            title="No evidence of this type"
            action={<ButtonLink href={alertRoute('evidence')}>Return to evidence</ButtonLink>}
          >
            The snapshot does not include a {route.screen} entity.
          </Empty>
        );
      }
      case 'devices':
        return (
          <>
            <label className="search-field">
              <Search size={18} />
              <span className="sr-only">Search devices</span>
              <input
                placeholder="Search devices, roles or operating systems"
                value={deviceQuery}
                onChange={(e) => setDeviceQuery(e.target.value)}
              />
            </label>
            {deviceRows()}
            {dataset.devices.length > 0 &&
              !dataset.devices.some((d) =>
                `${d.name} ${d.os} ${d.role}`.toLowerCase().includes(deviceQuery.toLowerCase()),
              ) && (
                <Empty icon={<Search />} title="No matching devices">
                  Try a device name or operating system.
                </Empty>
              )}
          </>
        );
      case 'device':
        return device ? (
          <>
            <div className="device-heading">
              <span className="hero-icon">
                <Monitor size={27} />
              </span>
              <div>
                <p>
                  {device.os} · {device.role}
                </p>
              </div>
              <Badge tone={device.risk}>{device.risk} risk</Badge>
            </div>
            <div className="card">
              <Facts
                items={[
                  ['Sensor health', device.health],
                  ['Isolation', device.isolation],
                  ['Last seen', formatDate(device.lastSeen)],
                  ['IP address', device.ip],
                ]}
              />
            </div>
            <div className="card list-card">
              <Row
                title="Antivirus health"
                subtitle={device.protection}
                href={deviceRoute('antivirus')}
                icon={<ShieldCheck />}
              />
              <Row
                title="Software inventory"
                subtitle="Application and version context"
                href="software"
                icon={<Layers3 />}
              />
              <Row
                title="Response boundaries"
                subtitle="Review the safeguards"
                href={deviceRoute('response')}
                icon={<LockKeyhole />}
              />
            </div>
            <Section title="Related alerts">
              {dataset.alerts.filter((a) => a.deviceId === device.id).map(alertCard)}
            </Section>
          </>
        ) : (
          noDevice()
        );
      case 'antivirus':
        return device ? (
          <>
            <div className="card">
              <div className="card-top">
                <ShieldCheck size={26} />
                <Badge tone={device.protection === 'Active' ? 'success' : ''}>
                  {device.protection}
                </Badge>
              </div>
              <h2>{device.name}</h2>
              <Facts
                items={[
                  ['Protection', device.protection],
                  ['Security intelligence', device.signatures],
                  ['Sensor', device.health],
                ]}
              />
            </div>
            <Notice>
              {live
                ? 'Device API health is not a complete antivirus configuration report. Fields absent from the response remain unreported.'
                : 'This health snapshot uses sample data. No protection settings can be changed here.'}
            </Notice>
            <ButtonLink href={deviceRoute('scans')} secondary>
              View scan history
            </ButtonLink>
          </>
        ) : (
          noDevice()
        );
      case 'scans':
        return (
          <>
            <p className="context-label">{device?.name ?? 'No device selected'}</p>
            <Notice>
              Scan requests and progress are not exposed by this app. No new scan is started.
            </Notice>
            {live ? (
              <Empty icon={<Clock3 />} title="Scan history is not connected">
                Use the device timeline in Microsoft Defender to verify completed scans.
              </Empty>
            ) : device?.name !== 'Nova' ? (
              <Empty icon={<Clock3 />} title="No scan history for this device">
                This demo snapshot has no completed scan for {device?.name ?? 'the selected device'}
                .
              </Empty>
            ) : (
              <div className="card">
                <Badge tone="success">Completed · sample</Badge>
                <h2>Full antivirus scan</h2>
                <Facts
                  items={[
                    ['Device', 'Nova'],
                    ['Started', formatDate('2026-06-17T21:00:00Z')],
                    ['Finished', formatDate('2026-06-17T22:18:00Z')],
                    ['Reported threats', '0 in this example'],
                  ]}
                />
              </div>
            )}
          </>
        );
      case 'response':
        return (
          <>
            <Notice>
              This application is read-only. Response controls are deliberately unavailable.
            </Notice>
            <div className="card">
              <CheckList
                neutral
                items={[
                  'No device isolation or release',
                  'No scan, quarantine or remediation requests',
                  'No alert closure or suppression',
                  'No changes to firewall or protection settings',
                ]}
              />
            </div>
            <ButtonLink href="actions" secondary>
              View past actions
            </ButtonLink>
          </>
        );
      case 'review':
        return alert ? (
          <>
            <div className="card review-context">
              <Badge tone={alert.severity}>{alert.severity}</Badge>
              <h2>{alert.title}</h2>
              <p>
                {dataset.devices.find((d) => d.id === alert.deviceId)?.name ?? alert.deviceId} ·{' '}
                {formatDate(alert.createdAt)}
              </p>
            </div>
            <Notice>
              {live
                ? 'Private notes stay only in this tab’s memory and disappear on sign-out, expiry or reload. They are never included in exports.'
                : 'Demo notes stay in this browser.'}{' '}
              They do not close, classify or suppress alerts in Defender.
            </Notice>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setModal({
                  title: 'Save this local review?',
                  body: (
                    <>
                      <p>
                        {live
                          ? 'Your finding stays only in this tab until sign-out or reload.'
                          : 'Your finding will be saved only on this browser.'}{' '}
                        The source alert stays unchanged.
                      </p>
                      <button className="button" onClick={saveReview}>
                        Save local review
                      </button>
                    </>
                  ),
                });
              }}
            >
              <label>
                Finding
                <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                  <option>Undetermined</option>
                  <option>Authorized activity</option>
                  <option>Threat confirmed</option>
                  <option>More evidence needed</option>
                </select>
              </label>
              <label>
                Evidence and reasoning
                <textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  required
                  maxLength={5000}
                  rows={7}
                  placeholder="Describe what you checked and what remains uncertain."
                />
              </label>
              <button className="button" disabled={!reviewNote.trim()}>
                Save review
              </button>
            </form>
            {reviews[alert.id] && (
              <p className="small">Saved locally: {formatDate(reviews[alert.id].reviewedAt)}</p>
            )}
          </>
        ) : (
          noAlert()
        );
      case 'activity':
        return (
          <>
            <p className="lead">Follow observations in the order they happened.</p>
            {timeline()}
            <ButtonLink href="telemetry" secondary>
              Review data coverage
            </ButtonLink>
          </>
        );
      case 'telemetry':
        return (
          <>
            <div className="card">
              <Facts
                items={[
                  ['Mode', live ? 'Private, read-only' : 'Public sample data'],
                  ['Last snapshot', formatDate(dataset.fetchedAt)],
                  ['Alert source', live ? 'Microsoft Graph Security' : 'Fictional fixtures'],
                  ['Device source', live ? 'Defender for Endpoint' : 'Fictional fixtures'],
                  ['Polling', 'Manual refresh'],
                  ['Event streaming', 'Not connected'],
                ]}
              />
            </div>
            <Notice>
              Missing or stale telemetry does not prove a device is healthy. Review sensor status,
              retention and API permissions.
            </Notice>
            <ButtonLink href="connections" secondary>
              Review connection
            </ButtonLink>
          </>
        );
      case 'reports':
        return (
          <>
            <div className="card">
              <FileText size={26} />
              <h2>Workspace snapshot</h2>
              <p>
                {live
                  ? 'Export counts and collection times only, with confirmation. Evidence, device names, alert identifiers and notes are excluded.'
                  : 'Export the fictional records currently loaded, plus your demo review notes.'}
              </p>
              <Facts
                items={[
                  ['Alerts', String(dataset.alerts.length)],
                  ['Devices', String(dataset.devices.length)],
                  ['Source', live ? 'Live read-only snapshot' : 'Fictional sample data'],
                ]}
              />
              <button
                className="button"
                onClick={() => {
                  if (live) {
                    setModal({
                      title: 'Export a minimal summary?',
                      body: (
                        <>
                          <p>
                            This downloads alert counts, device counts and source freshness. It
                            excludes identifiers, names, evidence and notes. A security event will
                            be recorded.
                          </p>
                          <button
                            className="button"
                            onClick={() => {
                              void request('workspace/export', { confirm: true })
                                .then((value) => {
                                  downloadJson('security-summary.json', value);
                                  setModal(null);
                                  tell('Minimal summary exported.');
                                })
                                .catch((error: Error) => tell(error.message));
                            }}
                          >
                            Export summary
                          </button>
                        </>
                      ),
                    });
                    return;
                  }
                  const exportResult = downloadJson('defender-companion-snapshot.json', {
                    ...dataset,
                    localReviews: reviews,
                    exportedAt: new Date().toISOString(),
                  });
                  tell(
                    exportResult === 'save-dialog'
                      ? 'Choose where to save the demo export.'
                      : 'Snapshot download started.',
                  );
                }}
              >
                <Download size={17} />
                Export JSON snapshot
              </button>
            </div>
          </>
        );
      case 'notifications':
        return (
          <>
            <Notice>
              The inbox shows local reminders derived from the loaded alerts. No push or voice
              service is connected.
            </Notice>
            {alert ? (
              <div className="card list-card">
                <Row
                  title={alert.title}
                  subtitle={`${dataset.devices.find((d) => d.id === alert.deviceId)?.name ?? alert.deviceId} · ${formatDate(alert.createdAt)}`}
                  href="notification"
                  icon={<Bell />}
                  trailing={<Badge>{noticeRead ? 'Read' : 'Unread'}</Badge>}
                />
              </div>
            ) : (
              noAlert()
            )}
            <ButtonLink href="channels" secondary>
              Notification preferences
            </ButtonLink>
          </>
        );
      case 'notification':
        return (
          <>
            <Badge tone={noticeRead ? 'success' : 'high'}>
              {noticeRead ? 'Acknowledged' : 'Review required'}
            </Badge>
            <h2 className="reminder-title">{alert?.title ?? 'No alert is loaded.'}</h2>
            {alert && (
              <p className="meta">
                {dataset.devices.find((d) => d.id === alert.deviceId)?.name ?? alert.deviceId} ·{' '}
                {formatDate(alert.createdAt)}
              </p>
            )}
            <ButtonLink href={alertRoute('alert')}>Review alert</ButtonLink>
            <div className="card lavender">
              <Steps
                items={[
                  ['Open the alert', 'Read what Defender observed and what it blocked.'],
                  ['Establish the origin', 'Compare the process and approved activity.'],
                  [
                    'Record your next step',
                    'Keep uncertainty explicit until the evidence supports a decision.',
                  ],
                ]}
              />
            </div>
            <button
              className="button secondary"
              disabled={noticeRead}
              onClick={() => {
                setNoticeRead(true);
                tell('Reminder acknowledged. No alert was closed.');
              }}
            >
              {noticeRead ? 'Acknowledged' : 'Acknowledge reminder'}
            </button>
          </>
        );
      case 'channels':
        return (
          <>
            <Notice>
              Delivery is not connected. These controls only save your preferred options on this
              device; they cannot send notifications or play audio.
            </Notice>
            <div className="card">
              {(
                [
                  [
                    'notifications',
                    'Prefer phone notifications',
                    'Preference only · Delivery not connected',
                  ],
                  ['spoken', 'Prefer spoken summaries', 'Preference only · Audio not connected'],
                  [
                    'repeat',
                    'Prefer a follow-up reminder',
                    'Preference only · Repeats not connected',
                  ],
                ] as const
              ).map(([key, title, sub]) => (
                <label key={key} className="toggle">
                  <span>
                    <strong>{title}</strong>
                    <small>{sub}</small>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={preferences[key]}
                    onChange={(e) => updatePreference(key, e.target.checked)}
                  />
                </label>
              ))}
            </div>
            <ButtonLink href="notification" secondary>
              Preview reminder content
            </ButtonLink>
          </>
        );
      case 'settings':
        return (
          <>
            <Section title="Appearance">
              <div className="card appearance-card">
                <div className="appearance-options" role="group" aria-label="Color theme">
                  {(
                    [
                      { value: 'system', label: 'System', icon: Monitor },
                      { value: 'light', label: 'Light', icon: Sun },
                      { value: 'dark', label: 'Dark', icon: Moon },
                    ] as const
                  ).map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      aria-pressed={appearance === value}
                      onClick={() => chooseAppearance(value)}
                    >
                      <Icon size={18} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </Section>
            <Section title="Workspaces">
              <div className="card list-card">
                {workspaceLinks.map((id) => (
                  <Row key={id} title={titles[id]} href={id} icon={resourceIcon(id)} />
                ))}
              </div>
            </Section>
            <Section title="Settings">
              <button
                className="button secondary refresh-data"
                disabled={loadState === 'loading'}
                onClick={() => void refresh()}
              >
                <RefreshCw size={18} className={loadState === 'loading' ? 'spin' : ''} />
                {loadState === 'loading' ? 'Refreshing…' : 'Refresh data'}
              </button>
              <div className="card list-card">
                <Row
                  title="Connection"
                  subtitle={live ? 'Private server' : 'Public demo · sample data'}
                  href="connections"
                  icon={<Database />}
                />
                <Row
                  title="API permissions"
                  subtitle="Least-privilege reading access"
                  href="permissions"
                  icon={<KeyRound />}
                />
                <Row
                  title="Security & privacy"
                  subtitle="Authentication, exports and local data"
                  href="security"
                  icon={<ShieldCheck />}
                />
                <Row
                  title="Notification preferences"
                  subtitle="Local delivery preferences"
                  href="channels"
                  icon={<Bell />}
                />
                <Row
                  title="Passkey access"
                  subtitle="Private workspace authentication"
                  href="access"
                  icon={<Fingerprint />}
                />
              </div>
            </Section>
            {!live && (
              <button className="button secondary" onClick={() => setMenu(true)}>
                <Layers3 size={18} />
                Explore all 46 screens
              </button>
            )}
          </>
        );
      case 'connections':
        return (
          <>
            <div className="card">
              <Badge tone={live && loadState === 'ready' ? 'success' : ''}>
                {live ? 'Private server mode' : 'Sample data mode'}
              </Badge>
              <h2>{live ? 'Private connection' : 'No private workspace connected'}</h2>
              <p>
                {live
                  ? 'Passkeys protect the last snapshot from your existing hourly collector. This workspace has no Microsoft credentials and makes no Microsoft API calls.'
                  : 'Explore every screen with fictional records. No tenant credentials or private endpoint data are included.'}
              </p>
              <Facts
                items={[
                  ['Alert provider', live ? 'Existing hourly collector' : 'Fictional fixtures'],
                  ['Device context', live ? 'Alert-associated devices only' : 'Fictional fixtures'],
                  ['Response operations', 'Not implemented'],
                  ['Credentials in browser', 'None'],
                ]}
              />
            </div>
            {dataset.warnings.map((w) => (
              <Notice key={w}>{w}</Notice>
            ))}
            {live && loadState === 'ready' && <ConnectionQr />}
            <ButtonLink href="permissions" secondary>
              View permission scope
            </ButtonLink>
            {!live && (
              <a
                className="text-link"
                href="https://github.com/kennethyepez/defender-companion/blob/main/docs/PRIVATE-DEPLOYMENT.md"
                target="_blank"
                rel="noreferrer"
              >
                Private setup guide <ExternalLink size={15} />
              </a>
            )}
          </>
        );
      case 'permissions':
        return (
          <>
            <Notice>
              The private workspace reads a limited local snapshot. Only the existing collector
              holds Microsoft access; this app receives no tenant credentials.
            </Notice>
            <div className="card">
              <Facts
                items={[
                  ['Collector grant', 'SecurityAlert.Read.All — Graph'],
                  ['Workspace grant', 'None'],
                  ['Device context', 'Included alert evidence only'],
                  ['Other live views', 'Not connected'],
                  ['Full evidence', 'Open the original alert in Defender'],
                ]}
              />
            </div>
            <Notice>
              Write permissions are not required and should not be granted for this application.
            </Notice>
          </>
        );
      case 'security':
        return (
          <>
            {live &&
              (loadState === 'auth' ? (
                <ButtonLink href="access">Sign in to manage access</ButtonLink>
              ) : (
                <SecurityControls />
              ))}
            <div className="card">
              <h2>Private workspace safeguards</h2>
              <p>
                {live
                  ? 'These are the service’s access controls, not a device health report.'
                  : 'Available in the private service. No private session is active in this demo.'}
              </p>
              <CheckList
                neutral
                items={[
                  'Passkeys with verified origin, RP ID and user verification',
                  'Single-use challenges and one-time recovery codes',
                  'HttpOnly, SameSite session cookies in the private server',
                  'Credential-free, bounded snapshot reads with explicit age and failure states',
                  'Fresh passkey verification for access changes; idle and absolute session expiry',
                  'No endpoint or alert mutation routes',
                ]}
              />
            </div>
            <Section title="Local browser data">
              <div className="card">
                <p>
                  {live
                    ? 'New private notes stay in tab memory only. Notes saved by an older version may still exist on this browser; preserve anything you need before explicitly clearing them below.'
                    : 'Demo review notes and delivery preferences stay on this browser. Export anything you need before clearing them.'}
                </p>
                <button
                  className="button secondary"
                  onClick={() =>
                    setModal({
                      title: 'Clear local notes and preferences?',
                      body: (
                        <>
                          <p>
                            This clears only this app’s browser data. Defender records and
                            credentials are unaffected.
                          </p>
                          <button
                            className="button danger-button"
                            onClick={() => {
                              localStorage.removeItem('dc.preferences');
                              localStorage.removeItem('dc.reviews');
                              chooseAppearance('system');
                              setReviews({});
                              setPreferences(preferenceDefaults);
                              setReviewNote('');
                              setModal(null);
                              tell('Local notes and preferences cleared.');
                            }}
                          >
                            Clear local app data
                          </button>
                        </>
                      ),
                    })
                  }
                >
                  Clear local app data
                </button>
              </div>
            </Section>
            {live && (
              <button
                className="button secondary"
                onClick={() => {
                  void request('auth/logout', {})
                    .then(() => {
                      setLoadState('auth');
                      setDataset({
                        alerts: [],
                        devices: [],
                        warnings: [],
                        mode: 'live',
                        fetchedAt: '',
                      });
                      setRemoteRecords({});
                      location.hash = 'access';
                      tell('Private session ended.');
                    })
                    .catch((error: Error) => tell(error.message));
                }}
              >
                Sign out of private workspace
              </button>
            )}
          </>
        );
      case 'access':
      case 'recovery':
        return (
          <Access
            live={live}
            recovery={route.screen === 'recovery'}
            onLogin={() => void refresh()}
          />
        );
      case 'empty':
        return (
          <Empty
            icon={<CheckCircle2 />}
            title="No active alerts in this view"
            action={
              <ButtonLink href="activity" secondary>
                View activity
              </ButtonLink>
            }
          >
            A quiet snapshot is one part of the picture. Keep checking sensor health and data
            coverage.
          </Empty>
        );
      case 'offline':
        return (
          <Empty
            icon={<WifiOff />}
            title="We couldn’t reach the security service"
            action={<ButtonLink href="connections">Review connection</ButtonLink>}
          >
            Keep the last snapshot in context. Check the server connection before making a decision.
          </Empty>
        );
      case 'loading':
        return (
          <div className="empty" role="status">
            <RefreshCw className="spin" />
            <h2>Reading the latest snapshot</h2>
            <p>This screen demonstrates the loading state.</p>
            <ButtonLink href="home" secondary>
              Return to overview
            </ButtonLink>
          </div>
        );
      case 'error':
        return (
          <Empty
            icon={<AlertTriangle />}
            title="This view couldn’t be loaded"
            action={<ButtonLink href="home">Return to overview</ButtonLink>}
          >
            Return to Overview to continue, or review your connection from More. This example does
            not change your saved notes.
          </Empty>
        );
      case 'forbidden':
        return (
          <Empty
            icon={<LockKeyhole />}
            title="This view needs reading access"
            action={<ButtonLink href="permissions">Review permissions</ButtonLink>}
          >
            Ask the administrator to review the required API permissions. No access is expanded from
            this screen.
          </Empty>
        );
      default:
        return null;
    }
  }
  function noAlert() {
    return (
      <Empty
        icon={<Bell />}
        title="No alert is loaded"
        action={<ButtonLink href="alerts">View alerts</ButtonLink>}
      >
        Choose an alert from the current snapshot.
      </Empty>
    );
  }
  function noDevice() {
    return (
      <Empty
        icon={<Monitor />}
        title="No device is loaded"
        action={<ButtonLink href="devices">View devices</ButtonLink>}
      >
        Choose a device from the available snapshot.
      </Empty>
    );
  }
  const back = parents[route.screen];
  const contextualBack =
    back && ['alert', 'evidence'].includes(back)
      ? alertRoute(back)
      : back && ['device', 'antivirus'].includes(back)
        ? deviceRoute(back)
        : back;
  return (
    <>
      <a
        href="#main-content"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to content
      </a>
      <aside className="sidebar">
        <a className="brand" href="#home">
          <span>
            <ShieldCheck size={23} />
          </span>
          <strong>
            Defender
            <br />
            <small>Companion</small>
          </strong>
        </a>
        <nav aria-label="Primary navigation">
          {mainNavigation.map((item) => (
            <a
              key={item.id}
              className={activeNav === item.id ? 'selected' : ''}
              href={`#${item.id}`}
              aria-current={activeNav === item.id ? 'page' : undefined}
            >
              <item.icon size={20} />
              {item.label}
              {item.id === 'alerts' && counts.open > 0 && (
                <span className="nav-count">{counts.open}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-secondary">
          <p>WORKSPACE</p>
          {workspaceLinks.slice(0, 6).map((id) => (
            <a key={id} href={`#${id}`} className={route.screen === id ? 'selected' : ''}>
              {titles[id]}
            </a>
          ))}
        </div>
        <div className="sidebar-foot">
          <Badge tone="violet">{live ? 'Read-only workspace' : 'Public demo'}</Badge>
          <p>
            {live ? 'Your protections stay in place.' : 'Fictional records. Real interactions.'}
          </p>
          <a
            href="https://github.com/kennethyepez/defender-companion"
            target="_blank"
            rel="noreferrer"
          >
            View source <ExternalLink size={13} />
          </a>
        </div>
      </aside>
      <div className="app-frame">
        <header className="topbar">
          <a className="mobile-brand" href="#home">
            <ShieldCheck size={22} />
            <strong>Defender Companion</strong>
          </a>
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={13} />
            <span>{titles[route.screen]}</span>
          </div>
          <div className="top-actions">
            <span className="sample-label">{live ? 'Read-only' : 'Sample data'}</span>
            <a
              className="icon-button notification-button"
              href="#notifications"
              aria-label="Open notification inbox"
            >
              <Bell size={20} />
              {counts.open > 0 && !noticeRead && <i />}
            </a>
            <button
              className="icon-button catalog-button"
              aria-label="Explore all 46 screens"
              onClick={() => setMenu(true)}
            >
              <Menu size={20} />
            </button>
          </div>
        </header>
        <PullToRefresh onRefresh={refresh} disabled={loadState === 'loading' || menu || !!modal} />
        <main
          key={`${route.screen}/${route.id ?? ''}`}
          id="main-content"
          tabIndex={-1}
          className="main"
          data-screen={route.screen}
        >
          <div className="page-meta">
            <span className="workspace-mode">
              <i aria-hidden="true" />
              {live ? 'Private workspace' : 'Demo workspace'}
            </span>
            {!live && <span className="workspace-disclosure">Fictional data</span>}
          </div>
          <PageHeader screen={route.screen} title={detailHeading} back={contextualBack} />
          {live && <Freshness data={dataset} visible={loadState === 'ready'} />}
          {live &&
            route.screen !== 'connections' &&
            dataset.warnings.map((warning) => (
              <Notice key={warning} tone="danger">
                {warning}
              </Notice>
            ))}
          {content()}
          <footer className="page-footer">
            <span>
              {live ? 'Read-only security workspace' : 'Sample data · No tenant connected'}
            </span>
            <a href="#security">
              Security & privacy <ArrowRight size={13} />
            </a>
          </footer>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {mainNavigation.map((item) => (
          <a
            key={item.id}
            className={activeNav === item.id ? 'selected' : ''}
            href={`#${item.id}`}
            aria-current={activeNav === item.id ? 'page' : undefined}
          >
            <span className="nav-icon">
              <item.icon size={22} />
              {item.id === 'alerts' && counts.open > 0 && (
                <span className="mobile-nav-count" aria-label={`${counts.open} open alerts`}>
                  {counts.open > 9 ? '9+' : counts.open}
                </span>
              )}
            </span>
            <span>{item.label}</span>
          </a>
        ))}
      </nav>
      {menu && (
        <Modal title="Explore all 46 screens" close={() => setMenu(false)}>
          <label className="search-field">
            <Search size={17} />
            <span className="sr-only">Find a screen</span>
            <input
              autoFocus
              placeholder="Find a screen"
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
            />
          </label>
          <div className="screen-catalog">
            {screens
              .filter(([, title, group]) =>
                `${title} ${group}`.toLowerCase().includes(catalogQuery.toLowerCase()),
              )
              .map(([id, title, group], index) => (
                <a href={`#${id}`} key={id} onClick={() => setMenu(false)}>
                  <span className="screen-number">{String(index + 1).padStart(2, '0')}</span>
                  <span>
                    <strong>{title}</strong>
                    <small>{group}</small>
                  </span>
                  <ChevronRight size={15} />
                </a>
              ))}
          </div>
        </Modal>
      )}
      {modal && (
        <Modal title={modal.title} close={() => setModal(null)}>
          {modal.body}
        </Modal>
      )}
      <div className={`toast ${toast ? 'visible' : ''}`} role="status" aria-live="polite">
        {toast && (
          <>
            <Check size={17} />
            <span>{toast}</span>
            <button aria-label="Dismiss message" onClick={() => setToast('')}>
              <X size={15} />
            </button>
          </>
        )}
      </div>
    </>
  );
}
