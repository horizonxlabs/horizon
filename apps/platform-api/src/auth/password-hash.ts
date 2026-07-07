import bcrypt from "bcryptjs";

export const MIN_PASSWORD_LENGTH = 8;
const BCRYPT_COST = 10;

export function isStrongEnough(plaintext: string): boolean {
  return typeof plaintext === "string" && plaintext.length >= MIN_PASSWORD_LENGTH;
}

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_COST);
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plaintext, hash);
}
