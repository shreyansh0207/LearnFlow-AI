import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;

// OWASP-recommended scrypt parameters (N=2^15, r=8, p=1).
const PARAMS = { N: 32768, r: 8, p: 1 };
const KEYLEN = 64;
const MAXMEM = 128 * PARAMS.N * PARAMS.r * 2;

/** Hash format: scrypt$N$r$p$saltB64$hashB64 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { ...PARAMS, maxmem: MAXMEM });
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  if (![N, r, p].every(Number.isFinite) || N > 1_048_576) return false;
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  const actual = await scrypt(password.normalize("NFKC"), salt, expected.length, { N, r, p, maxmem: 128 * N * r * 2 });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A random, URL-safe token (for session cookies and reset links). */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only hashes of tokens are stored in the database. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A precomputed hash used to keep sign-in timing equal for unknown emails. */
export const DUMMY_HASH = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");
