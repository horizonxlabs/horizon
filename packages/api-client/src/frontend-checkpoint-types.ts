import type { PlatformProjectDto } from "./index";

export type FrontendCheckpointDto = {
  id: string;
  projectId: string;
  version: string;
  sourcePreviewVersion: string;
  sourceTaskId?: string;
  status: "current" | "previous" | "restored";
  checksum: string;
  fileManifest: string[];
  routeSnapshot: string[];
  changeSummary: string;
  changedAreas: string[];
  createdByUserId: string;
  restoreSourceCheckpointId?: string;
  createdAt: string;
};

export type FrontendCheckpointTimelineDto = {
  project: PlatformProjectDto;
  activeCheckpoint: FrontendCheckpointDto;
  checkpoints: FrontendCheckpointDto[];
};

export type FrontendRestoreResultDto = {
  checkpoint: FrontendCheckpointDto;
  restoredFrom: FrontendCheckpointDto;
  boundary: {
    frontendChanged: true;
    unchanged: Array<
      "backend" | "database" | "auth" | "app_roles" | "membership" | "domain" | "prd_baseline"
    >;
  };
  auditEventId: string;
};
