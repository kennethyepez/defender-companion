import { describe, expect, it } from 'vitest';
import { connectionOrigin } from '../src/pairing';

describe('connection QR payload', () => {
  it('contains only a normalized private HTTPS origin', () => {
    expect(connectionOrigin('https://COMPUTER.example.ts.net:18449/')).toBe(
      'https://computer.example.ts.net:18449',
    );
    expect(connectionOrigin('https://computer.example.ts.net:443')).toBe(
      'https://computer.example.ts.net',
    );
  });
  it.each([
    'http://computer.example.ts.net',
    'https://computer.example.ts.net.attacker.invalid',
    'https://computer.example.ts.net/?token=secret',
    'https://computer.example.ts.net/#recovery',
    'https://user:secret@computer.example.ts.net',
    'https://computer.example.ts.net:22',
    'https://computer.example.ts.net/path',
    'https://computer.example.ts.net/../',
    'https://computer.example.ts.net\\@evil.invalid',
    'javascript:alert(1)',
    'https://127.0.0.1',
    'https://example.com',
  ])('rejects unsafe payload %s', (input) => {
    expect(connectionOrigin(input)).toBeUndefined();
  });
});
