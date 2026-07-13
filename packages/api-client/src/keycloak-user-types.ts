export type KeycloakUserDto = {
  id: string;
  email: string;
  name: string;
  enabled: boolean;
  groups: string[];
  createdAt?: string;
};

export type CreateKeycloakUserInput = {
  email: string;
  name: string;
  role: "admin" | "creator" | "end_user";
  temporaryPassword: string;
};

export type KeycloakUserListMeta = { first: number; max: number; total: number };
export type KeycloakUserListPage = { users: KeycloakUserDto[]; meta: KeycloakUserListMeta };
