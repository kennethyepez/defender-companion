// An in-process authenticator for protocol tests only. Never used by the application.
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest();
export class TestAuthenticator {
  private keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  private credentialId = randomBytes(32);
  id = this.credentialId.toString('base64url');
  registration(challenge: string, origin: string, rpId: string) {
    const key = this.keys.publicKey.export({ format: 'jwk' });
    const cose = new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, new Uint8Array(Buffer.from(key.x!, 'base64url'))],
      [-3, new Uint8Array(Buffer.from(key.y!, 'base64url'))],
    ]);
    const length = Buffer.alloc(2);
    length.writeUInt16BE(this.credentialId.length);
    const authenticatorData = Buffer.concat([
      hash(rpId),
      Buffer.from([0x45]),
      Buffer.alloc(4),
      Buffer.alloc(16),
      length,
      this.credentialId,
      isoCBOR.encode(cose),
    ]);
    const attestation = new Map<string, string | Map<string, string> | Uint8Array>([
      ['fmt', 'none'],
      ['attStmt', new Map()],
      ['authData', new Uint8Array(authenticatorData)],
    ]);
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: { credProps: { rk: true } },
      response: {
        clientDataJSON: Buffer.from(
          JSON.stringify({ type: 'webauthn.create', challenge, origin, crossOrigin: false }),
        ).toString('base64url'),
        attestationObject: Buffer.from(isoCBOR.encode(attestation)).toString('base64url'),
        transports: ['internal'],
      },
    };
  }
  authentication(
    challenge: string,
    origin: string,
    rpId: string,
    counter: number,
    userHandle: string,
    verified = true,
  ) {
    const count = Buffer.alloc(4);
    count.writeUInt32BE(counter);
    const authenticatorData = Buffer.concat([
      hash(rpId),
      Buffer.from([verified ? 0x05 : 0x01]),
      count,
    ]);
    const clientData = Buffer.from(
      JSON.stringify({ type: 'webauthn.get', challenge, origin, crossOrigin: false }),
    );
    const signature = sign(
      'sha256',
      Buffer.concat([authenticatorData, hash(clientData)]),
      this.keys.privateKey,
    );
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        authenticatorData: authenticatorData.toString('base64url'),
        clientDataJSON: clientData.toString('base64url'),
        signature: signature.toString('base64url'),
        userHandle,
      },
    };
  }
}
