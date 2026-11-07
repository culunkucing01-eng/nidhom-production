const HASH_VERSION = "v1";
const HASH_ALGORITHM = "pbkdf2";
const HASH_DIGEST = "sha256";
const WEB_CRYPTO_DIGEST = "SHA-256";
const ITERATIONS = 600_000;
const SALT_LENGTH = 16;
const MAX_SALT_LENGTH = 64;
const HASH_LENGTH = 32;
const MAX_STORED_HASH_LENGTH = 154;
const MAX_PASSWORD_BYTES = 1024;
const encoder = new TextEncoder();

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
    return null;
  }

  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return encodeBase64Url(bytes) === value ? bytes : null;
  } catch {
    return null;
  }
}

function getPasswordBytes(password: string): Uint8Array {
  if (typeof password !== "string") {
    throw new TypeError("Password must be a string.");
  }

  const passwordBytes = encoder.encode(password);
  if (passwordBytes.length > MAX_PASSWORD_BYTES) {
    throw new RangeError("Password exceeds the maximum supported length.");
  }

  return passwordBytes;
}

async function deriveHash(passwordBytes: Uint8Array, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", passwordBytes, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: WEB_CRYPTO_DIGEST, salt, iterations: ITERATIONS },
    key,
    HASH_LENGTH * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const passwordBytes = getPasswordBytes(password);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const hash = await deriveHash(passwordBytes, salt);

  return [
    HASH_VERSION,
    HASH_ALGORITHM,
    HASH_DIGEST,
    String(ITERATIONS),
    encodeBase64Url(salt),
    encodeBase64Url(hash),
  ].join("$");
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const passwordBytes = getPasswordBytes(password);
    if (
      typeof storedHash !== "string" ||
      storedHash.length === 0 ||
      storedHash.length > MAX_STORED_HASH_LENGTH
    ) {
      return false;
    }

    const parts = storedHash.split("$");
    if (
      parts.length !== 6 ||
      parts[0] !== HASH_VERSION ||
      parts[1] !== HASH_ALGORITHM ||
      parts[2] !== HASH_DIGEST ||
      parts[3] !== String(ITERATIONS)
    ) {
      return false;
    }

    const salt = decodeBase64Url(parts[4]);
    const expectedHash = decodeBase64Url(parts[5]);
    if (
      salt === null ||
      salt.length < SALT_LENGTH ||
      salt.length > MAX_SALT_LENGTH ||
      expectedHash === null ||
      expectedHash.length !== HASH_LENGTH
    ) {
      return false;
    }

    const actualHash = await deriveHash(passwordBytes, salt);
    return crypto.subtle.timingSafeEqual(actualHash, expectedHash);
  } catch {
    return false;
  }
}
