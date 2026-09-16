// Minimal Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) implementation built on
// the Web Crypto API, so it runs in the edge/worker runtime where the Node-only
// `web-push` package cannot.

export type PushSubscriptionRecord = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

const enc = new TextEncoder();

function b64urlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    "=",
  );
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, data as BufferSource));
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm);
  const okm = await hmac(prk, concat(info, new Uint8Array([1])));
  return okm.slice(0, length);
}

/** Build the VAPID `Authorization` header value for one push endpoint. */
async function vapidHeader(audience: string, subject: string, privateKeyD: string, publicKey: string) {
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToB64url(
    enc.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: subject,
      }),
    ),
  );
  const unsigned = `${header}.${payload}`;

  const raw = b64urlToBytes(publicKey);
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: bytesToB64url(raw.slice(1, 33)),
    y: bytesToB64url(raw.slice(33, 65)),
    d: privateKeyD,
    ext: true,
  };
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned)),
  );

  return `vapid t=${unsigned}.${bytesToB64url(signature)}, k=${publicKey}`;
}

async function encryptPayload(
  subscription: PushSubscriptionRecord,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const clientPublic = b64urlToBytes(subscription.p256dh);
  const authSecret = b64urlToBytes(subscription.auth);

  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const localPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));

  const clientKey = await crypto.subtle.importKey(
    "raw",
    clientPublic as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: clientKey }, local.privateKey, 256),
  );

  const keyInfo = concat(
    enc.encode("WebPush: info\0"),
    clientPublic,
    localPublic,
  );
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, [
    "encrypt",
  ]);
  const body = concat(plaintext, new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce as BufferSource },
      aesKey,
      body as BufferSource,
    ),
  );

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);

  return concat(salt, recordSize, new Uint8Array([localPublic.length]), localPublic, ciphertext);
}

export type PushResult = { ok: true } | { ok: false; gone: boolean; status: number };

/** Send one push message. Never throws — callers keep going on failure. */
export async function sendPush(
  subscription: PushSubscriptionRecord,
  payload: unknown,
  options: { ttlSeconds?: number } = {},
): Promise<PushResult> {
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  if (!privateKey || !publicKey) {
    console.error("[push] VAPID keys are not configured");
    return { ok: false, gone: false, status: 0 };
  }

  try {
    const url = new URL(subscription.endpoint);
    const authorization = await vapidHeader(
      url.origin,
      "mailto:notifications@kid-safe-spots.lovable.app",
      privateKey,
      publicKey,
    );
    const encrypted = await encryptPayload(subscription, enc.encode(JSON.stringify(payload)));

    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(options.ttlSeconds ?? 3600),
        Urgency: "high",
      },
      body: encrypted as BufferSource,
    });

    if (response.ok) return { ok: true };

    const gone = response.status === 404 || response.status === 410;
    if (!gone) {
      console.error(`[push] send failed ${response.status}: ${await response.text()}`);
    }
    return { ok: false, gone, status: response.status };
  } catch (error) {
    console.error("[push] send threw", error);
    return { ok: false, gone: false, status: 0 };
  }
}
