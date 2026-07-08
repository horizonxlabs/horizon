// LOCKED FILE — provisioned object storage client. Do not edit.
import { platformConfig } from "../platform.config";

export function storageConfig() {
  return platformConfig.s3;
}
