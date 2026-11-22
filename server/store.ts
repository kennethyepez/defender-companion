import { DatabaseSync } from 'node:sqlite';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { WebAuthnCredential } from '@simplewebauthn/server';

export const SESSION_ABSOLUTE_MS = 2 * 60 * 60_000;
export const SESSION_IDLE_MS = 15 * 60_000;
export const RECOVERY_ABSOLUTE_MS = 10 * 60_000;
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const opaqueToken = () => randomBytes(32).toString('base64url');
export function equalSecret(left: string, right: string) {
  return timingSafeEqual(Buffer.from(digest(left)), Buffer.from(digest(right)));
}
export const operations = [
  'credential.add',
  'credential.revoke',
  'sessions.revoke',
  'recovery.rotate',
] as const;
export type Operation = (typeof operations)[number];
export type ChallengeContext = {
  sessionHash?: string;
  operation?: Operation;
  target?: string;
  authorization?: 'bootstrap' | 'recovery' | 'step-up';
  authorizingCredential?: string;
};
export type Session = {
  recovery: boolean;
  credentialId: string | null;
  created: number;
  expires: number;
  lastSeen: number;
  tag: string;
};
export type AuditKind =
  | 'login'
  | 'registration'
  | 'step-up'
  | 'recovery'
  | 'recovery-rotation'
  | 'credential-revocation'
  | 'session-expiry'
  | 'logout'
  | 'session-revocation'
  | 'access-boundary'
  | 'workspace-read'
  | 'workspace-export'
  | 'data-access'
  | 'request-rejected';
type CredentialRow = { id: string; key: string; counter: number; transports: string };

export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS credentials(id TEXT PRIMARY KEY,key TEXT NOT NULL,counter INTEGER NOT NULL,transports TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,expires INTEGER NOT NULL,recovery INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY,value TEXT NOT NULL,purpose TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS recovery_codes(hash TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS approvals(id TEXT PRIMARY KEY,session_hash TEXT NOT NULL,operation TEXT NOT NULL,target TEXT NOT NULL,credential_id TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,time INTEGER NOT NULL,kind TEXT NOT NULL,outcome TEXT NOT NULL,actor TEXT NOT NULL,source TEXT NOT NULL);`);
    // Additive migration keeps keys/recovery material; legacy unbound sessions expire.
    this.addColumn('credentials', 'created', 'INTEGER NOT NULL DEFAULT 0');
    this.addColumn('credentials', 'revoked', 'INTEGER');
    this.addColumn('credentials', 'label', "TEXT NOT NULL DEFAULT 'Passkey'");
    this.addColumn('sessions', 'created', 'INTEGER NOT NULL DEFAULT 0');
    this.addColumn('sessions', 'last_seen', 'INTEGER NOT NULL DEFAULT 0');
    this.addColumn('sessions', 'credential_id', 'TEXT');
    this.addColumn('challenges', 'context', "TEXT NOT NULL DEFAULT '{}'");
    if (this.enrolled())
      this.db.prepare("INSERT OR IGNORE INTO metadata VALUES('recovery-initialized','yes')").run();
    this.db.prepare('DELETE FROM sessions WHERE created=0 OR last_seen=0').run();
    this.db.prepare("INSERT OR IGNORE INTO metadata VALUES('audit-salt',?)").run(opaqueToken());
  }
  private addColumn(
    table: 'credentials' | 'sessions' | 'challenges',
    name: string,
    definition: string,
  ) {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some((column) => column.name === name))
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
  transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = action();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  enrolled() {
    return !!this.db.prepare('SELECT id FROM credentials WHERE revoked IS NULL LIMIT 1').get();
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
    return (
      this.db.prepare('SELECT * FROM credentials WHERE revoked IS NULL').all() as CredentialRow[]
    ).map((row) => ({
      id: row.id,
      publicKey: new Uint8Array(Buffer.from(row.key, 'base64url')),
      counter: row.counter,
      transports: JSON.parse(row.transports) as WebAuthnCredential['transports'],
    }));
  }
  credential(id: string) {
    return this.credentials().find((credential) => credential.id === id);
  }
  credentialList(currentId?: string | null) {
    return (
      this.db
        .prepare('SELECT id,label,created,revoked FROM credentials ORDER BY created,id')
        .all() as { id: string; label: string; created: number; revoked: number | null }[]
    ).map((row) => ({ ...row, current: row.id === currentId }));
  }
  addCredential(credential: WebAuthnCredential, label = 'Passkey', now = Date.now()) {
    this.db
      .prepare(
        'INSERT INTO credentials(id,key,counter,transports,created,label) VALUES(?,?,?,?,?,?)',
      )
      .run(
        credential.id,
        Buffer.from(credential.publicKey).toString('base64url'),
        credential.counter,
        JSON.stringify(credential.transports ?? []),
        now,
        label,
      );
  }
  revokeCredential(id: string, now = Date.now()) {
    if (!this.credential(id) || this.credentials().length <= 1) return false;
    this.db.prepare('UPDATE credentials SET revoked=? WHERE id=?').run(now, id);
    this.db.prepare('DELETE FROM sessions WHERE credential_id=?').run(id);
    this.db.prepare('DELETE FROM approvals WHERE credential_id=?').run(id);
    return true;
  }
  updateCounter(id: string, counter: number) {
    const current = this.credential(id);
    if (!current || ((current.counter !== 0 || counter !== 0) && counter <= current.counter))
      throw new Error('Credential state changed during verification.');
    this.db
      .prepare('UPDATE credentials SET counter=? WHERE id=? AND revoked IS NULL')
      .run(counter, id);
  }
  createSession(recovery = false, now = Date.now(), credentialId?: string) {
    if (!recovery && (!credentialId || !this.credential(credentialId)))
      throw new Error('A full session needs an active credential.');
    this.cleanup(now);
    const token = opaqueToken();
    this.db
      .prepare(
        'INSERT INTO sessions(id,expires,recovery,created,last_seen,credential_id) VALUES(?,?,?,?,?,?)',
      )
      .run(
        digest(token),
        now + (recovery ? RECOVERY_ABSOLUTE_MS : SESSION_ABSOLUTE_MS),
        Number(recovery),
        now,
        now,
        credentialId ?? null,
      );
    return token;
  }
  session(token: string | undefined, now = Date.now(), touch = true): Session | undefined {
    if (!token) return;
    const id = digest(token);
    const row = this.db.prepare('SELECT * FROM sessions WHERE id=?').get(id) as
      | {
          recovery: number;
          created: number;
          expires: number;
          last_seen: number;
          credential_id: string | null;
        }
      | undefined;
    if (!row) return;
    if (
      row.expires <= now ||
      row.last_seen + SESSION_IDLE_MS <= now ||
      row.created > now ||
      (!row.recovery && (!row.credential_id || !this.credential(row.credential_id)))
    ) {
      this.revoke(token);
      this.audit('session-expiry', 'expired', id);
      return;
    }
    if (touch) this.db.prepare('UPDATE sessions SET last_seen=? WHERE id=?').run(now, id);
    return {
      recovery: !!row.recovery,
      credentialId: row.credential_id,
      created: row.created,
      expires: row.expires,
      lastSeen: touch ? now : row.last_seen,
      tag: id.slice(0, 16),
    };
  }
  revoke(token?: string) {
    if (!token) return;
    const id = digest(token);
    this.db.prepare('DELETE FROM sessions WHERE id=?').run(id);
    this.db.prepare('DELETE FROM approvals WHERE session_hash=?').run(id);
  }
  revokeAll() {
    this.db.exec('DELETE FROM sessions; DELETE FROM approvals; DELETE FROM challenges;');
  }
  listSessions(token?: string, now = Date.now()) {
    this.cleanup(now);
    return (
      this.db
        .prepare('SELECT id,created,last_seen,expires,recovery FROM sessions ORDER BY created DESC')
        .all() as {
        id: string;
        created: number;
        last_seen: number;
        expires: number;
        recovery: number;
      }[]
    ).map((row) => ({
      tag: row.id.slice(0, 16),
      created: row.created,
      lastSeen: row.last_seen,
      expires: row.expires,
      recovery: !!row.recovery,
      current: !!token && row.id === digest(token),
    }));
  }
  createChallenge(
    value: string,
    purpose: 'register' | 'login' | 'step-up',
    now = Date.now(),
    context: ChallengeContext = {},
  ) {
    this.cleanup(now);
    const id = opaqueToken();
    this.db
      .prepare('INSERT INTO challenges(id,value,purpose,expires,context) VALUES(?,?,?,?,?)')
      .run(digest(id), value, purpose, now + 120_000, JSON.stringify(context));
    return id;
  }
  takeChallengeRecord(
    id: string | undefined,
    purpose: 'register' | 'login' | 'step-up',
    now = Date.now(),
  ): { value: string; context: ChallengeContext } | undefined {
    if (!id) return;
    const row = this.db.prepare('DELETE FROM challenges WHERE id=? RETURNING *').get(digest(id)) as
      { value: string; purpose: string; expires: number; context: string } | undefined;
    return row && row.purpose === purpose && row.expires > now
      ? { value: row.value, context: JSON.parse(row.context) as ChallengeContext }
      : undefined;
  }
  takeChallenge(id: string | undefined, purpose: 'register' | 'login', now = Date.now()) {
    return this.takeChallengeRecord(id, purpose, now)?.value;
  }
  createApproval(
    token: string,
    operation: Operation,
    target: string,
    credentialId: string,
    now = Date.now(),
  ) {
    const approval = opaqueToken();
    this.db
      .prepare('INSERT INTO approvals VALUES(?,?,?,?,?,?)')
      .run(digest(approval), digest(token), operation, target, credentialId, now + 60_000);
    return approval;
  }
  consumeApproval(
    approval: string | undefined,
    token: string | undefined,
    operation: Operation,
    target = '',
    now = Date.now(),
  ): string | undefined {
    if (!approval || !token) return;
    const row = this.db
      .prepare('DELETE FROM approvals WHERE id=? RETURNING *')
      .get(digest(approval)) as
      | {
          session_hash: string;
          operation: string;
          target: string;
          expires: number;
          credential_id: string;
        }
      | undefined;
    return row &&
      row.session_hash === digest(token) &&
      row.operation === operation &&
      row.target === target &&
      row.expires > now &&
      this.session(token, now) &&
      this.credential(row.credential_id)
      ? row.credential_id
      : undefined;
  }
  issueRecoveryCodes(rotate = false) {
    if (
      !rotate &&
      this.db.prepare("SELECT value FROM metadata WHERE key='recovery-initialized'").get()
    )
      return [];
    this.db.exec('DELETE FROM recovery_codes');
    this.db.prepare("INSERT OR REPLACE INTO metadata VALUES('recovery-initialized','yes')").run();
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
  recoveryCount() {
    return (
      this.db.prepare('SELECT COUNT(*) AS count FROM recovery_codes').get() as { count: number }
    ).count;
  }
  consumeRecoveryCode(code: string): boolean {
    return !!this.db
      .prepare('DELETE FROM recovery_codes WHERE hash=? RETURNING hash')
      .get(digest(code.trim()));
  }
  audit(
    kind: AuditKind,
    outcome: 'success' | 'denied' | 'expired' | 'stale' | 'unavailable',
    actor = '',
    source = '',
    now = Date.now(),
  ) {
    const salt = (
      this.db.prepare("SELECT value FROM metadata WHERE key='audit-salt'").get() as {
        value: string;
      }
    ).value;
    const tag = (value: string) =>
      value ? createHmac('sha256', salt).update(value).digest('hex').slice(0, 16) : '';
    this.db
      .prepare('INSERT INTO audit(time,kind,outcome,actor,source) VALUES(?,?,?,?,?)')
      .run(now, kind, outcome, tag(actor), tag(source));
    this.db.prepare('DELETE FROM audit WHERE time<?').run(now - 30 * 24 * 3600_000);
    this.db.exec(
      'DELETE FROM audit WHERE id NOT IN (SELECT id FROM audit ORDER BY id DESC LIMIT 10000)',
    );
  }
  auditEntries(limit = 100) {
    return this.db
      .prepare('SELECT time,kind,outcome,actor,source FROM audit ORDER BY id DESC LIMIT ?')
      .all(Math.min(Math.max(limit, 1), 100));
  }
  cleanup(now = Date.now()) {
    this.db
      .prepare('DELETE FROM sessions WHERE expires<=? OR last_seen<=?')
      .run(now, now - SESSION_IDLE_MS);
    this.db.prepare('DELETE FROM approvals WHERE expires<=?').run(now);
    this.db.prepare('DELETE FROM challenges WHERE expires<=?').run(now);
  }
  close() {
    this.db.close();
  }
}
