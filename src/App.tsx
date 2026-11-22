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
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  SquareTerminal,
  WifiOff,
  X,
} from 'lucide-react';
import { sampleData, records as sampleRecords } from './sample-data';
import { filterAlerts } from './selectors';
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
const preferenceDefaults = { notifications: true, spoken: false, repeat: false };
type Preferences = typeof preferenceDefaults;
type Review = { note: string; outcome: string; reviewedAt: string };
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
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  const [dataset, setDataset] = useState<Dataset>(sampleData);
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
  const [reviews, setReviews] = useState(readReviews);
  const [reviewNote, setReviewNote] = useState('');
  const [outcome, setOutcome] = useState('Undetermined');
  const [noticeRead, setNoticeRead] = useState(false);
  const [modal, setModal] = useState<{ title: string; body: ReactNode } | null>(null);
  const [toast, setToast] = useState('');
  const [remoteRecords, setRemoteRecords] = useState<Record<string, RecordItem[]>>({});
  const [resourceError, setResourceError] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const firstRoute = useRef(true);
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
      tell('Sample data refreshed. No Microsoft services were contacted.');
      return;
    }
    setLoadState('loading');
    try {
      const data = await loadDataset();
      setDataset(data);
      setLoadState('ready');
      setLoadError('');
    } catch (error) {
      setLoadState(error instanceof ApiError && error.status === 401 ? 'auth' : 'error');
      setLoadError(error instanceof Error ? error.message : 'The workspace could not be loaded.');
    }
  }
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
              trailing={<span className={`risk-dot ${d.risk}`} aria-label={`Risk: ${d.risk}`} />}
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
    if (!saveLocal('dc.reviews', next)) {
      tell('Your browser could not save the note. Copy it before leaving.');
      return;
    }
    setReviews(next);
    setModal(null);
    tell('Review saved on this browser. The Defender alert is unchanged.');
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
            <p className="lead">
              {listResource === 'actions'
                ? 'Past actions and their recorded outcomes.'
                : 'Start with the record that needs your attention.'}
            </p>
            <div className="card list-card">
              {recordItems.map((item) => (
                <Row
                  key={item.id}
                  title={item.name}
                  subtitle={item.subtitle}
                  href={`${detailRoutes[listResource]}/${item.id}`}
                  icon={<Folder size={20} />}
                  trailing={<Badge tone={item.severity}>{item.status}</Badge>}
                />
              ))}
              {!recordItems.length && <p className="inset">No records returned for this view.</p>}
            </div>
            <Notice>
              {live
                ? 'Read-only records. Availability depends on your permissions, license and retention.'
                : 'Fictional records for the public demo. No tenant is connected.'}
            </Notice>
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
          <h2 className="detail-title">{currentRecord.name}</h2>
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
            <p className="lead">The important things, before you get on with your day.</p>
            <div className="overview-grid">
              <div className={`card priority-card ${counts.open ? 'attention' : ''}`}>
                <div className="card-top">
                  <Badge tone={counts.open ? 'high' : 'success'}>
                    {counts.open ? 'Needs your review' : 'Up to date'}
                  </Badge>
                  <ShieldCheck size={23} />
                </div>
                <h2>
                  {counts.open
                    ? `${counts.open === 1 ? 'One alert needs' : `${counts.open} alerts need`} your attention`
                    : 'No active alerts in this snapshot'}
                </h2>
                <p>
                  {dataset.alerts.find((a) => a.status !== 'resolved')?.description ??
                    'Check the activity history and keep your next review in view.'}
                </p>
                <ButtonLink
                  href={
                    counts.open
                      ? `alert/${dataset.alerts.find((a) => a.status !== 'resolved')!.id}`
                      : 'activity'
                  }
                >
                  {counts.open ? 'Review the alert' : 'View activity'}
                </ButtonLink>
                <div className="meta">
                  <Clock3 size={14} />
                  {live ? 'Last read' : 'Sample snapshot'} · {formatDate(dataset.fetchedAt)}
                </div>
              </div>
              <div className="overview-aside">
                <div className="stats">
                  <div>
                    <strong>{dataset.devices.length}</strong>
                    <span>Devices in view</span>
                  </div>
                  <div>
                    <strong>{counts.open}</strong>
                    <span>Alerts to review</span>
                  </div>
                </div>
                <div className="card lavender">
                  <h3>Your next step</h3>
                  <h2>Establish the origin</h2>
                  <p>
                    Compare the process, its evidence and the authorized change before classifying
                    an alert.
                  </p>
                  <a className="text-link" href={`#${alertRoute('evidence')}`}>
                    Examine the evidence <ArrowRight size={16} />
                  </a>
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
            <h2 className="detail-title">{alert.title}</h2>
            <p className="meta">
              <Monitor size={16} />
              {dataset.devices.find((d) => d.id === alert.deviceId)?.name ?? alert.deviceId} ·{' '}
              {formatDate(alert.createdAt)}
            </p>
            <div className="two-columns">
              <Section title="What we know">
                <div className="card">
                  <p>{alert.description}</p>
                  <Facts
                    items={[
                      ['Category', alert.category],
                      ['Source status', alert.status],
                      ['Origin confirmed', 'Review the evidence'],
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
                title="Review evidence"
                subtitle={`${alert.evidence.length} evidence items`}
                href={alertRoute('evidence')}
                icon={<Folder />}
              />
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
            <h2 className="detail-title break-word">{evidence.name}</h2>
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
                <h2>{device.name}</h2>
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
            <Notice>
              Scan requests and progress are not exposed by this app. No new scan is started.
            </Notice>
            {live ? (
              <Empty icon={<Clock3 />} title="Scan history is not connected">
                Use the device timeline in Microsoft Defender to verify completed scans.
              </Empty>
            ) : (
              <div className="card">
                <Badge tone="success">Completed · sample</Badge>
                <h2>Full antivirus scan</h2>
                <Facts
                  items={[
                    ['Device', 'Nova'],
                    ['Started', 'Jun 17, 21:00 UTC'],
                    ['Finished', 'Jun 17, 22:18 UTC'],
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
            <Notice>
              Review notes stay in this browser. They do not close, classify or suppress alerts in
              Defender. Avoid storing sensitive evidence on shared devices.
            </Notice>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setModal({
                  title: 'Save this local review?',
                  body: (
                    <>
                      <p>
                        Your finding will be saved only on this browser. The source alert stays
                        unchanged.
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
                Export the records currently loaded, plus local review notes. Treat a live export as
                sensitive security data.
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
                  downloadJson('defender-companion-snapshot.json', {
                    ...dataset,
                    localReviews: reviews,
                    exportedAt: new Date().toISOString(),
                  });
                  tell('Snapshot exported.');
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
                  title={noticeRead ? 'Reminder acknowledged' : 'An alert needs review'}
                  subtitle={alert.title}
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
            <h2 className="detail-title">Review the evidence before responding</h2>
            <p>{alert?.title ?? 'No alert is loaded.'}</p>
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
            <ButtonLink href={alertRoute('alert')}>Open alert</ButtonLink>
          </>
        );
      case 'channels':
        return (
          <>
            <Notice>
              These are local preferences for a future notification integration. They do not enable
              push, audio, Alexa or other external services.
            </Notice>
            <div className="card">
              {(
                [
                  ['notifications', 'Phone notifications', 'Preferred delivery channel'],
                  ['spoken', 'Spoken summary', 'A short explanation and recommended next step'],
                  [
                    'repeat',
                    'Repeat unacknowledged reminders',
                    'One follow-up for a high-priority alert',
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
            <Section title="Explore the workspace">
              <div className="card list-card">
                {workspaceLinks.map((id) => (
                  <Row key={id} title={titles[id]} href={id} icon={<Folder size={18} />} />
                ))}
              </div>
            </Section>
          </>
        );
      case 'connections':
        return (
          <>
            <div className="card">
              <Badge tone={live && loadState === 'ready' ? 'success' : ''}>
                {live ? 'Private server mode' : 'Sample data mode'}
              </Badge>
              <h2>{live ? 'A server-side connection' : 'A safe public demonstration'}</h2>
              <p>
                {live
                  ? 'Passkey-authenticated requests reach fixed Microsoft API endpoints. Tenant credentials stay on the server.'
                  : 'Explore every screen with fictional records. No tenant credentials or private endpoint data are included.'}
              </p>
              <Facts
                items={[
                  ['Alert provider', 'Microsoft Graph Security'],
                  ['Device provider', 'Defender for Endpoint'],
                  ['Response operations', 'Not implemented'],
                  ['Credentials in browser', 'None'],
                ]}
              />
            </div>
            {dataset.warnings.map((w) => (
              <Notice key={w}>{w}</Notice>
            ))}
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
              Grant only the reading permissions required by the views you use. Availability depends
              on license, onboarding and admin consent.
            </Notice>
            <div className="card">
              <Facts
                items={[
                  ['Alerts', 'SecurityAlert.Read.All — Graph'],
                  ['Incidents', 'SecurityIncident.Read.All — Graph'],
                  ['Devices', 'Machine.Read.All — MDE'],
                  ['Software', 'Software.Read.All — MDE'],
                  ['Vulnerabilities', 'Vulnerability.Read.All — MDE'],
                  ['Recommendations', 'SecurityRecommendation.Read.All — MDE'],
                  ['Investigations', 'Not connected — broader permission required'],
                  ['Action history', 'Not connected — broader permission required'],
                  ['Indicators', 'Not connected — broader permission required'],
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
            <div className="card">
              <CheckList
                items={[
                  'Passkeys with verified origin, RP ID and user verification',
                  'Single-use challenges and one-time recovery codes',
                  'HttpOnly, SameSite session cookies in the private server',
                  'Fixed upstream API paths and bounded pagination',
                  'No endpoint or alert mutation routes',
                ]}
              />
            </div>
            <Section title="Local browser data">
              <div className="card">
                <p>
                  Review notes and delivery preferences stay on this browser. Export anything you
                  need before clearing them.
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
            Your notes remain saved. Check the connection and try loading the view again.
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
            <button
              className="icon-button"
              aria-label="Refresh snapshot"
              disabled={loadState === 'loading'}
              onClick={() => void refresh()}
            >
              <RefreshCw size={19} />
            </button>
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
        <main id="main-content" tabIndex={-1} className="main">
          <div className="page-meta">
            <span>{live ? 'PRIVATE WORKSPACE' : 'PUBLIC DEMO · FICTIONAL RECORDS'}</span>
            <button className="text-button" onClick={() => setMenu(true)}>
              Explore all 46 screens <Layers3 size={14} />
            </button>
          </div>
          <PageHeader
            screen={route.screen}
            back={contextualBack}
            subtitle={
              route.screen === 'home' ? 'A clearer view of what needs your attention.' : undefined
            }
          />
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
            <item.icon size={22} />
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
