import { useEffect, useState } from 'react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { request } from './api';
import { Notice, CheckList, ButtonLink } from './components';

export function Access({
  live,
  onLogin,
  recovery = false,
}: {
  live: boolean;
  onLogin: () => void;
  recovery?: boolean;
}) {
  const [status, setStatus] = useState<{ enrolled: boolean; authenticated: boolean }>();
  const [token, setToken] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  useEffect(() => {
    if (live)
      request<{ enrolled: boolean; authenticated: boolean }>('auth/status')
        .then(setStatus)
        .catch((error: Error) => setError(error.message));
  }, [live]);
  async function perform(action: 'register' | 'login' | 'recover') {
    setError('');
    setBusy(true);
    try {
      if (action === 'recover') {
        await request('auth/recover', { code });
        setCode('');
        setStatus({ enrolled: true, authenticated: true });
        onLogin();
      } else if (action === 'register') {
        const options = await request<PublicKeyCredentialCreationOptionsJSON>(
          'auth/register/options',
          { token },
        );
        const response = await startRegistration({ optionsJSON: options });
        const result = await request<{ recoveryCodes: string[] }>('auth/register/verify', {
          response,
        });
        setToken('');
        setCodes(result.recoveryCodes);
        setStatus({ enrolled: true, authenticated: true });
        onLogin();
      } else {
        const options = await request<PublicKeyCredentialRequestOptionsJSON>(
          'auth/login/options',
          {},
        );
        const response = await startAuthentication({ optionsJSON: options });
        await request('auth/login/verify', { response });
        setStatus({ enrolled: true, authenticated: true });
        onLogin();
      }
    } catch (error) {
      setError(
        error instanceof Error && error.name === 'NotAllowedError'
          ? 'The passkey request was cancelled. You can try again.'
          : error instanceof Error
            ? error.message
            : 'Access could not be completed. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="access-view">
      <div className="hero-icon">
        <KeyRound size={30} />
      </div>
      <h2>
        Your security.
        <br />
        Within reach.
      </h2>
      <p>Review the evidence. Understand the risk. Decide what comes next.</p>
      <CheckList
        items={[
          'Passkeys for private workspace access',
          'Read-only access to Microsoft security data',
          'Endpoint protections stay under your control',
        ]}
      />
      {!live ? (
        <>
          <Notice>
            The public demo contains fictional records. Passkey access is available in the optional
            private server, not on this static demo.
          </Notice>
          <ButtonLink href="home">Explore the demo</ButtonLink>
          <a
            className="text-link"
            href="https://github.com/kennethyepez/defender-companion/blob/main/docs/PRIVATE-DEPLOYMENT.md"
            target="_blank"
            rel="noreferrer"
          >
            Set up a private workspace
          </a>
        </>
      ) : (
        <>
          {error && (
            <div className="notice danger" role="alert">
              {error}
            </div>
          )}
          {recovery ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void perform('recover');
              }}
            >
              <label>
                One-time recovery code
                <input
                  autoComplete="off"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  maxLength={80}
                />
              </label>
              <button className="button" disabled={busy || !status}>
                {busy ? 'Checking recovery code…' : 'Recover access'}
              </button>
              <p className="small">
                A recovery session lets you add a replacement passkey. Existing passkeys and
                workspace data stay intact.
              </p>
            </form>
          ) : (
            <>
              {status?.authenticated ? (
                <>
                  <Notice>
                    <ShieldCheck size={16} /> You have an active private session.
                  </Notice>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => void perform('register')}
                  >
                    {busy ? 'Waiting for your authenticator…' : 'Add another passkey'}
                  </button>
                  <ButtonLink href="home" secondary>
                    Open workspace
                  </ButtonLink>
                </>
              ) : status?.enrolled ? (
                <button className="button" disabled={busy} onClick={() => void perform('login')}>
                  {busy ? 'Waiting for your authenticator…' : 'Sign in with a passkey'}
                </button>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void perform('register');
                  }}
                >
                  <label>
                    Private setup token
                    <input
                      type="password"
                      autoComplete="off"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      required
                      minLength={32}
                    />
                  </label>
                  <button className="button" disabled={busy || !status}>
                    {busy ? 'Waiting for your authenticator…' : 'Register your first passkey'}
                  </button>
                </form>
              )}
            </>
          )}
          {codes.length > 0 && (
            <section className="card recovery-codes">
              <h3>Save your recovery codes</h3>
              <p>Store these privately. Each code works once. They will not be shown again.</p>
              <pre>{codes.join('\n')}</pre>
              <button
                className="button secondary"
                onClick={() => {
                  setCodes([]);
                  location.hash = 'home';
                }}
              >
                I have saved the codes
              </button>
            </section>
          )}
          <a className="text-link" href={recovery ? '#access' : '#recovery'}>
            {recovery ? 'Return to passkey access' : 'Recover access'}
          </a>
        </>
      )}
    </div>
  );
}
