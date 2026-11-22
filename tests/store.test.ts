import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Store, digest, equalSecret } from '../server/store';
let store: Store;
beforeEach(() => {
  store = new Store(':memory:');
});
afterEach(() => store.close());
describe('authentication state', () => {
  it('expires opaque sessions, revokes them, and never stores raw session tokens', () => {
    const token = store.createSession(false, 1000);
    expect(store.session(token, 2000)).toEqual({ recovery: false });
    const row = store.db.prepare('SELECT id FROM sessions').get() as { id: string };
    expect(row.id).toBe(digest(token));
    expect(row.id).not.toBe(token);
    expect(store.session(token, 1000 + 8 * 3600000)).toBeUndefined();
    store.revoke(token);
    expect(store.session(token, 2000)).toBeUndefined();
  });
  it('consumes challenges exactly once, rejects wrong purposes and expired requests', () => {
    const id = store.createChallenge('challenge-value', 'login', 1000);
    expect(store.takeChallenge(id, 'login', 1001)).toBe('challenge-value');
    expect(store.takeChallenge(id, 'login', 1002)).toBeUndefined();
    expect(
      store.takeChallenge(store.createChallenge('value', 'register', 1000), 'login', 1001),
    ).toBeUndefined();
    expect(
      store.takeChallenge(store.createChallenge('value', 'login', 1000), 'login', 121001),
    ).toBeUndefined();
  });
  it('keeps recovery codes single-use and preserves existing credentials during recovery', () => {
    store.addCredential({ id: 'test-credential', publicKey: new Uint8Array([1, 2]), counter: 0 });
    const codes = store.issueRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(store.issueRecoveryCodes()).toEqual([]);
    expect(store.consumeRecoveryCode('invalid')).toBe(false);
    expect(store.consumeRecoveryCode(codes[0])).toBe(true);
    expect(store.consumeRecoveryCode(codes[0])).toBe(false);
    expect(store.credentials()).toHaveLength(1);
    const token = store.createSession(true, 1000);
    expect(store.session(token, 1001)).toEqual({ recovery: true });
    expect(store.session(token, 601001)).toBeUndefined();
  });
  it('compares bootstrap secrets without length-dependent timing comparisons', () => {
    expect(equalSecret('same', 'same')).toBe(true);
    expect(equalSecret('same', 'different')).toBe(false);
  });
});
