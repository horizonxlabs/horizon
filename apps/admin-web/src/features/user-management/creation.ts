import type { CreatePlatformUserInput } from "@evcp/api-client";

export type CreateUserForm = {
  email: string;
  name: string;
  role: string;
  tempPassword: string;
};

export function buildCreateUserPayload(input: CreateUserForm): CreatePlatformUserInput {
  return {
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    role: input.role.trim() || "creator",
    tempPassword: input.tempPassword
  };
}

export function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let index = 0; index < 12; index += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}
