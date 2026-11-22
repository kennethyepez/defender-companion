import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Store, digest, equalSecret, SESSION_IDLE_MS, SESSION_ABSOLUTE_MS } from '../server/store';
let store: Store;
beforeEach(() => {
  store = new Store(':memory:');
  store.addCredential({ id: 'test-key', publicKey: new Uint8Array([1, 2]), counter: 0 });
});
afterEach(() => store.close());
describe('authentication state', () => {
  it('enforces idle expiry, fixed absolute expiry and hashed session storage', () => {
    const token = store.createSession(false, 1000, 'test-key');
    expect(store.session(token, 1001)).toMatchObject({ recovery: false });
    expect((store.db.prepare('SELECT id FROM sessions').get() as { id: string }).id).toBe(
      digest(token),
    );
    expect(store.session(token, 1001 + SESSION_IDLE_MS)).toBeUndefined();
    const second = store.createSession(false, 1000, 'test-key');
    for (let time = 1000; time < 1000 + SESSION_ABSOLUTE_MS; time += SESSION_IDLE_MS / 2)
      expect(store.session(second, time)).toBeDefined();
    expect(store.session(second, 1000 + SESSION_ABSOLUTE_MS)).toBeUndefined();
  });
  it('consumes challenges once and checks purpose/expiry', () => {
    const id = store.createChallenge('challenge', 'login', 1000);
    expect(store.takeChallenge(id, 'login', 1001)).toBe('challenge');
    expect(store.takeChallenge(id, 'login', 1002)).toBeUndefined();
    expect(
      store.takeChallenge(store.createChallenge('value', 'register', 1000), 'login', 1001),
    ).toBeUndefined();
    expect(
      store.takeChallenge(store.createChallenge('value', 'login', 1000), 'login', 121001),
    ).toBeUndefined();
  });
  it('keeps recovery one-use without deleting registered keys', () => {
    const codes = store.issueRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(store.issueRecoveryCodes()).toEqual([]);
    expect(store.consumeRecoveryCode('wrong')).toBe(false);
    expect(store.consumeRecoveryCode(codes[0])).toBe(true);
    expect(store.consumeRecoveryCode(codes[0])).toBe(false);
    expect(store.credentials()).toHaveLength(1);
    const token = store.createSession(true, 1000);
    expect(store.session(token, 1001)).toMatchObject({ recovery: true });
    expect(store.session(token, 601001)).toBeUndefined();
  });
  it('binds one-use approval to session, operation, target and time', () => {
    const first = store.createSession(false, 1000, 'test-key');
    const second = store.createSession(false, 1000, 'test-key');
    const grant = () =>
      store.createApproval(first, 'credential.revoke', 'target-key', 'test-key', 1000);
    expect(
      store.consumeApproval(grant(), second, 'credential.revoke', 'target-key', 1001),
    ).toBeUndefined();
    expect(
      store.consumeApproval(grant(), first, 'credential.add', 'target-key', 1001),
    ).toBeUndefined();
    expect(
      store.consumeApproval(grant(), first, 'credential.revoke', 'other-key', 1001),
    ).toBeUndefined();
    expect(
      store.consumeApproval(grant(), first, 'credential.revoke', 'target-key', 61001),
    ).toBeUndefined();
    const valid = grant();
    expect(store.consumeApproval(valid, first, 'credential.revoke', 'target-key', 1001)).toBe(
      'test-key',
    );
    expect(
      store.consumeApproval(valid, first, 'credential.revoke', 'target-key', 1002),
    ).toBeUndefined();
  });
  it('preserves the last credential and invalidates sessions bound to revoked keys', () => {
    expect(store.revokeCredential('test-key')).toBe(false);
    store.addCredential({ id: 'replacement', publicKey: new Uint8Array([3]), counter: 0 });
    const token = store.createSession(false, Date.now(), 'test-key');
    expect(store.revokeCredential('test-key')).toBe(true);
    expect(store.session(token)).toBeUndefined();
    expect(store.credentials().map((key) => key.id)).toEqual(['replacement']);
  });
  it('does not let concurrent assertions downgrade a counter', () => {
    store.updateCounter('test-key', 2);
    expect(() => store.updateCounter('test-key', 1)).toThrow();
    expect(store.credential('test-key')?.counter).toBe(2);
  });
  it('records only bounded pseudonymous audit fields', () => {
    store.audit('login', 'denied', 'SECRET-token', 'SECRET-source');
    const text = JSON.stringify(store.auditEntries());
    expect(text).not.toContain('SECRET');
    expect(text).toContain('login');
  });
  it('compares setup secrets safely', () => {
    expect(equalSecret('same', 'same')).toBe(true);
    expect(equalSecret('same', 'different')).toBe(false);
  });
});
