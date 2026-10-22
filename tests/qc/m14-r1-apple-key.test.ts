// QC M14 round 1 + 2 - how APPLE_PRIVATE_KEY may arrive as a Supabase secret (README / handoff U23 tell the owner to put the .p8
// contents in an env file with the line breaks written as \n; the Dashboard secret field takes a multi-line paste).
import { describe, expect, it } from 'vitest';
import { createClientSecret } from '../../supabase/functions/delete-account/apple';

const NL = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const BS = String.fromCharCode(92); // backslash

async function newPair() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  let bin = '';
  for (const b of der) bin += String.fromCharCode(b);
  const body = (btoa(bin).match(/.{1,64}/g) ?? []).join(NL);
  // Armour assembled at run time: no tracked source contains it verbatim (NFR-22 scan).
  const real = `-----BEGIN ${'PRIVATE'} KEY-----${NL}${body}${NL}-----END ${'PRIVATE'} KEY-----`;
  return { pair, real, escaped: real.split(NL).join(`${BS}n`) }; // escaped: literal backslash + n instead of a line break
}
const pem = async () => {
  const { real, escaped } = await newPair();
  return { real, escaped };
};

const cfg = { teamId: 'TEAM123456', keyId: 'KEY1234567', clientId: 'io.example.app' };
const jws = /^[\w-]+\.[\w-]+\.[\w-]+$/;

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

describe('QC M14: Apple private key formats', () => {
  it('a PEM with real line breaks produces a client secret', async () => {
    const { real } = await pem();
    await expect(createClientSecret({ ...cfg, privateKeyPem: real })).resolves.toMatch(jws);
  });

  // M14-D7: fixed in 6e6a175.
  it('a PEM whose line breaks are the two characters backslash-n (an env file value that was not unescaped) still produces a client secret', async () => {
    const { escaped } = await pem();
    await expect(createClientSecret({ ...cfg, privateKeyPem: escaped })).resolves.toMatch(jws);
  });

  it('every pasting variant produces a secret whose ES256 signature verifies with the key it came from', async () => {
    const { pair, real, escaped } = await newPair();
    const variants: Record<string, string> = {
      'double quotes': `"${real}"`,
      'single quotes': `'${real}'`,
      CRLF: real.split(NL).join(CR + NL),
      'escaped CRLF': real.split(NL).join(`${BS}r${BS}n`),
      'escaped + double quotes': `"${escaped}"`,
      'escaped + single quotes + padding': `  '${escaped}'${NL}`,
      'one line (no breaks at all)': real.split(NL).join(''),
      'trailing newline': `${real}${NL}`,
      'trailing escaped newline': `${escaped}${BS}n`,
    };
    for (const [name, privateKeyPem] of Object.entries(variants)) {
      const secret = await createClientSecret({ ...cfg, privateKeyPem });
      expect(secret, name).toMatch(jws);
      const [h, p, sig] = secret.split('.');
      const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, b64urlToBytes(sig), new TextEncoder().encode(`${h}.${p}`));
      expect(ok, name).toBe(true);
    }
  });

  it('garbage still fails loudly (rejects) instead of producing a secret', async () => {
    await expect(createClientSecret({ ...cfg, privateKeyPem: 'not a key at all !!!' })).rejects.toBeDefined();
    await expect(createClientSecret({ ...cfg, privateKeyPem: '' })).rejects.toBeDefined();
  });
});
