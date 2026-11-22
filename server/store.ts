import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { WebAuthnCredential } from '@simplewebauthn/server';

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const opaqueToken = () => randomBytes(32).toString('base64url');
export function equalSecret(left: string, right: string) {
  return timingSafeEqual(Buffer.from(digest(left)), Buffer.from(digest(right)));
}
type CredentialRow = { id: string; key: string; counter: number; transports: string };
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS credentials(id TEXT PRIMARY KEY, key TEXT NOT NULL, counter INTEGER NOT NULL, transports TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, expires INTEGER NOT NULL, recovery INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY, value TEXT NOT NULL, purpose TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS recovery_codes(hash TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
  }
  enrolled() {
    return !!this.db.prepare('SELECT id FROM credentials LIMIT 1').get();
  }
  userId(): string {
    const row = this.db.prepare("SELECT value FROM metadata WHERE key='user-id'").get() as
      { value: string } | undefined;
    if (row) return row.value;
    const id = opaqueToken();
    this.db.prepare("INSERT INTO metadata VALUES('user-id',?)").run(id);
    return id;
  }
  credentials(): WebAuthnCredential[] {
    return (this.db.prepare('SELECT * FROM credentials').all() as CredentialRow[]).map((row) => ({
      id: row.id,
      publicKey: new Uint8Array(Buffer.from(row.key, 'base64url')),
      counter: row.counter,
      transports: JSON.parse(row.transports) as WebAuthnCredential['transports'],
    }));
  }
  addCredential(credential: WebAuthnCredential) {
    this.db
      .prepare('INSERT INTO credentials VALUES(?,?,?,?)')
      .run(
        credential.id,
        Buffer.from(credential.publicKey).toString('base64url'),
        credential.counter,
        JSON.stringify(credential.transports ?? []),
      );
  }
  updateCounter(id: string, counter: number) {
    this.db.prepare('UPDATE credentials SET counter=? WHERE id=?').run(counter, id);
  }
  createSession(recovery = false, now = Date.now()) {
    this.cleanup(now);
    const token = opaqueToken();
    this.db
      .prepare('INSERT INTO sessions VALUES(?,?,?)')
      .run(digest(token), now + (recovery ? 10 * 60000 : 8 * 3600000), Number(recovery));
    return token;
  }
  session(token: string | undefined, now = Date.now()): { recovery: boolean } | undefined {
    if (!token) return;
    const row = this.db
      .prepare('SELECT recovery FROM sessions WHERE id=? AND expires>?')
      .get(digest(token), now) as { recovery: number } | undefined;
    return row ? { recovery: !!row.recovery } : undefined;
  }
  revoke(token?: string) {
    if (token) this.db.prepare('DELETE FROM sessions WHERE id=?').run(digest(token));
  }
  createChallenge(value: string, purpose: 'register' | 'login', now = Date.now()) {
    this.cleanup(now);
    const id = opaqueToken();
    this.db
      .prepare('INSERT INTO challenges VALUES(?,?,?,?)')
      .run(digest(id), value, purpose, now + 120000);
    return id;
  }
  takeChallenge(
    id: string | undefined,
    purpose: 'register' | 'login',
    now = Date.now(),
  ): string | undefined {
    if (!id) return;
    const row = this.db.prepare('DELETE FROM challenges WHERE id=? RETURNING *').get(digest(id)) as
      { value: string; purpose: string; expires: number } | undefined;
    return row && row.purpose === purpose && row.expires > now ? row.value : undefined;
  }
  issueRecoveryCodes() {
    if (this.db.prepare('SELECT hash FROM recovery_codes LIMIT 1').get()) return [];
    const codes = Array.from({ length: 10 }, () =>
      randomBytes(16)
        .toString('hex')
        .match(/.{1,8}/g)!
        .join('-'),
    );
    const insert = this.db.prepare('INSERT INTO recovery_codes VALUES(?)');
    for (const code of codes) insert.run(digest(code));
    return codes;
  }
  consumeRecoveryCode(code: string): boolean {
    return !!this.db
      .prepare('DELETE FROM recovery_codes WHERE hash=? RETURNING hash')
      .get(digest(code.trim()));
  }
  cleanup(now = Date.now()) {
    this.db.prepare('DELETE FROM sessions WHERE expires<=?').run(now);
    this.db.prepare('DELETE FROM challenges WHERE expires<=?').run(now);
  }
  close() {
    this.db.close();
  }
}
