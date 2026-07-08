import type { PlatformProjectDto } from "./index";

export type AppDatabaseColumnDto = {
  id: string;
  tableKey: string;
  name: string;
  dataType: string;
  required: boolean;
  defaultValue?: string;
  source: "generated" | "manual";
};

export type AppDatabaseTableDto = {
  id: string;
  projectId: string;
  key: string;
  displayName: string;
  description: string;
  columns: AppDatabaseColumnDto[];
  source: "generated" | "manual";
};

export type AppDatabaseSampleRecordDto = {
  id: string;
  projectId: string;
  tableKey: string;
  ordinal: number;
  data: Record<string, string | number | boolean | null>;
};

export type AppDatabaseRelationshipDto = {
  id: string;
  projectId: string;
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  cardinality: "one_to_one" | "one_to_many" | "many_to_many";
};

export type DatabaseViewSnapshotDto = {
  project: PlatformProjectDto;
  schemaName: string;
  readOnly: boolean;
  restrictions: string[];
  tables: AppDatabaseTableDto[];
  relationships: AppDatabaseRelationshipDto[];
  sampleRecords: AppDatabaseSampleRecordDto[];
};
