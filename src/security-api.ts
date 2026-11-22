import { startAuthentication } from '@simplewebauthn/browser';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { request } from './api';
export type SecurityOperation =
  'credential.add' | 'credential.revoke' | 'sessions.revoke' | 'recovery.rotate';
export async function approveAction(operation: SecurityOperation, target = '') {
  const options = await request<PublicKeyCredentialRequestOptionsJSON>('auth/step-up/options', {
    operation,
    target,
  });
  const response = await startAuthentication({ optionsJSON: options });
  const result = await request<{ approval: string }>('auth/step-up/verify', { response });
  return result.approval;
}
export type SecurityOverview = {
  credentials: {
    id: string;
    label: string;
    created: number;
    revoked: number | null;
    current: boolean;
  }[];
  sessions: {
    tag: string;
    created: number;
    lastSeen: number;
    expires: number;
    current: boolean;
    recovery: boolean;
  }[];
  recoveryCodesRemaining: number;
  audit: { time: number; kind: string; outcome: string; actor: string; source: string }[];
  sessionPolicy: { idleMs: number; absoluteMs: number };
};
