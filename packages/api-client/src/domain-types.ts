// Admin domain go-live (B2) DTOs. Kept in a focused module and re-exported from the package
// entry so the client class stays lean (mirrors system-types.ts).

export type DomainStatusDto = {
  domain: string | null;
  publicBaseUrl: string;
  caddyAddress: string;
};

export type SetDomainResponseDto = {
  accepted: true;
  domain: string;
};
