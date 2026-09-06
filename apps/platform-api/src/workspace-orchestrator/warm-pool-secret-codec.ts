import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const ENVELOPE_VERSION = "v1";
const AUTHENTICATED_CONTEXT = Buffer.from("evcp.workspace-warm-pool.v1", "utf8");

export interface WarmPoolSecretCodec {
  seal(env: Record<string, string>): string;
  open(payload: string): Record<string, string>;
}

export function createWarmPoolSecretCodec(keyHex: string): WarmPoolSecretCodec {
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error("workspace warm-pool encryption key must be 64 hexadecimal characters");
  }
  const key = Buffer.from(keyHex, "hex");

  return {
    seal(env) {
      assertStringRecord(env);
      const nonce = randomBytes(12);
      const cipher = createCipheriv(ALGORITHM, key, nonce);
      cipher.setAAD(AUTHENTICATED_CONTEXT);
      const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(env), "utf8"),
        cipher.final()
      ]);
      const authTag = cipher.getAuthTag();
      return [
        ENVELOPE_VERSION,
        nonce.toString("base64url"),
        authTag.toString("base64url"),
        ciphertext.toString("base64url")
      ].join(".");
    },
    open(payload) {
      const [version, nonceText, authTagText, ciphertextText, extra] = payload.split(".");
      if (
        version !== ENVELOPE_VERSION ||
        !nonceText ||
        !authTagText ||
        !ciphertextText ||
        extra !== undefined
      ) {
        throw new Error("invalid workspace warm-pool credential envelope");
      }

      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(nonceText, "base64url"));
      decipher.setAAD(AUTHENTICATED_CONTEXT);
      decipher.setAuthTag(Buffer.from(authTagText, "base64url"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ciphertextText, "base64url")),
        decipher.final()
      ]).toString("utf8");
      const env: unknown = JSON.parse(plaintext);
      assertStringRecord(env);
      return env;
    }
  };
}

function assertStringRecord(value: unknown): asserts value is Record<string, string> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.values(value).some((item) => typeof item !== "string")
  ) {
    throw new Error("workspace warm-pool credentials must be a string record");
  }
}
