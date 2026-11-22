import { useEffect, useState } from 'react';
import { Fingerprint, ShieldCheck } from 'lucide-react';
import { request } from './api';
import { approveAction, type SecurityOverview } from './security-api';
import { Badge, ButtonLink, Modal, Notice, Section } from './components';
import { formatDate } from './domain';

export function SecurityControls() {
  const [data, setData] = useState<SecurityOverview>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const [intent, setIntent] = useState<{
    kind: 'revoke' | 'sessions' | 'recovery';
    target?: string;
    label?: string;
  }>();
  async function refresh() {
    try {
      setData(await request<SecurityOverview>('auth/security'));
      setError('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Security details are unavailable.');
    }
  }
  useEffect(() => {
    let active = true;
    request<SecurityOverview>('auth/security')
      .then((value) => {
        if (active) setData(value);
      })
      .catch((error: Error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function confirm() {
    if (!intent) return;
    setBusy(true);
    setError('');
    try {
      if (intent.kind === 'revoke') {
        const approval = await approveAction('credential.revoke', intent.target);
        const result = await request<{ signedOut: boolean }>('auth/credentials/revoke', {
          target: intent.target,
          approval,
        });
        if (result.signedOut) {
          setData(undefined);
          location.hash = 'access';
        } else await refresh();
      } else if (intent.kind === 'sessions') {
        const approval = await approveAction('sessions.revoke');
        await request('auth/sessions/revoke-all', { approval });
        setData(undefined);
        location.hash = 'access';
      } else {
        const approval = await approveAction('recovery.rotate');
        const result = await request<{ recoveryCodes: string[] }>('auth/recovery/rotate', {
          approval,
        });
        setCodes(result.recoveryCodes);
        await refresh();
      }
      setIntent(undefined);
    } catch (error) {
      setError(
        error instanceof Error && error.name === 'NotAllowedError'
          ? 'Verification was cancelled. Nothing was changed.'
          : error instanceof Error
            ? error.message
            : 'This change could not be verified.',
      );
      setIntent(undefined);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {error && (
        <div role="alert" className="notice danger">
          {error}
        </div>
      )}
      <Notice>
        Access changes require a fresh verification with an existing passkey. Sessions expire after
        15 minutes without server activity and at most 2 hours after sign-in.
      </Notice>
      {!data && !error && <p role="status">Loading access controls…</p>}
      {data && (
        <>
          <Section title="Your passkeys">
            <div className="card">
              {data.credentials.map((key) => (
                <div key={key.id} className="credential-row">
                  <Fingerprint size={20} />
                  <div className="row-copy">
                    <strong>{key.label}</strong>
                    <small>
                      {key.created
                        ? formatDate(new Date(key.created).toISOString())
                        : 'Registered before this update'}
                    </small>
                  </div>
                  <Badge tone={key.revoked ? '' : 'success'}>
                    {key.revoked ? 'Revoked' : key.current ? 'This sign-in' : 'Active'}
                  </Badge>
                  {!key.revoked && (
                    <button
                      className="text-button"
                      disabled={
                        busy || data.credentials.filter((item) => !item.revoked).length <= 1
                      }
                      onClick={() =>
                        setIntent({ kind: 'revoke', target: key.id, label: key.label })
                      }
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
              <ButtonLink href="access" secondary>
                Add a passkey
              </ButtonLink>
              <p className="small">The final active passkey is protected from removal.</p>
            </div>
          </Section>
          <Section title="Sessions">
            <div className="card">
              {data.sessions.map((session) => (
                <div className="info-row" key={session.tag}>
                  <span>
                    {session.current
                      ? 'This session'
                      : session.recovery
                        ? 'Recovery session'
                        : 'Another session'}
                  </span>
                  <small>Last active {formatDate(new Date(session.lastSeen).toISOString())}</small>
                </div>
              ))}
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setIntent({ kind: 'sessions' })}
              >
                Sign out every session
              </button>
            </div>
          </Section>
          <Section title="Recovery">
            <div className="card">
              <ShieldCheck size={22} />
              <h3>{data.recoveryCodesRemaining} unused recovery codes</h3>
              <p>
                Renewing invalidates old codes and signs out other sessions. Store the new codes
                privately.
              </p>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setIntent({ kind: 'recovery' })}
              >
                Renew recovery codes
              </button>
            </div>
          </Section>
          <Section title="Recent security activity">
            <div className="card">
              {data.audit.slice(0, 20).map((event, index) => (
                <div className="info-row" key={index}>
                  <span>
                    {event.kind.replaceAll('-', ' ')} · {event.outcome}
                  </span>
                  <small>{formatDate(new Date(event.time).toISOString())}</small>
                </div>
              ))}
              <p className="small">
                Events contain no tokens, recovery codes, command lines or personal addresses.
                Retention: up to 30 days and 10,000 events.
              </p>
            </div>
          </Section>
        </>
      )}
      {intent && (
        <Modal
          title={
            intent.kind === 'revoke'
              ? `Revoke ${intent.label}?`
              : intent.kind === 'sessions'
                ? 'Sign out every session?'
                : 'Renew recovery codes?'
          }
          close={() => {
            if (!busy) setIntent(undefined);
          }}
        >
          <p>
            {intent.kind === 'revoke'
              ? 'Sign-ins using this passkey will end. If this is your current passkey, you will be signed out. Keep another working passkey.'
              : intent.kind === 'sessions'
                ? 'This includes the current session. You can sign back in with an active passkey.'
                : 'Old recovery codes will stop working. Save the new codes before leaving.'}
          </p>
          <button className="button" disabled={busy} onClick={() => void confirm()}>
            {busy ? 'Verify with your authenticator…' : 'Verify existing passkey'}
          </button>
        </Modal>
      )}
      {codes.length > 0 && (
        <Modal title="Save your new recovery codes" close={() => setCodes([])}>
          <p>
            Each code works once. Keep them outside this device. They will not be displayed again.
          </p>
          <pre className="code-list">{codes.join('\n')}</pre>
          <button className="button" onClick={() => setCodes([])}>
            I have saved the codes
          </button>
        </Modal>
      )}
    </>
  );
}
