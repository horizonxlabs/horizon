// Admin system-version + in-UI update DTOs. Kept in a focused module and re-exported from the
// package entry so the client class stays lean (mirrors setup-types.ts).

export type SystemAppServiceDto = {
  name: string;
  image: string;
  tag: string;
};

export type SystemVersionDto = {
  currentVersion: string;
  imageRepository: string;
  appServices: SystemAppServiceDto[];
};

export type SystemUpdateResponseDto = {
  accepted: true;
  targetVersion: string;
};
