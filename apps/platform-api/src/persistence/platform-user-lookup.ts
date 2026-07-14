import type { PlatformUser } from "../platform-services";
import { ValidationError } from "../platform-services";
import type { CorePersistenceClient, PlatformUserRecord } from "./core-repositories";

export async function getPlatformUserById(
  client: CorePersistenceClient,
  id: string,
  mapRecord: (record: PlatformUserRecord) => PlatformUser
): Promise<PlatformUser> {
  const record = await client.platformUser.findUnique({
    where: { id },
    include: { roles: { include: { role: true } } }
  });
  if (!record) throw new ValidationError(`Unknown platform user: ${id}`);
  return mapRecord(record);
}
