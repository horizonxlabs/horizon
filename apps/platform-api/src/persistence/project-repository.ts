import { randomUUID } from "node:crypto";
import type { CreateProjectInput, PlatformProject, PlatformUser } from "../platform-services";
import { PermissionError, ValidationError } from "../platform-services";
import type { CorePersistenceClient } from "./core-repositories";
import { mapProject } from "./core-repositories";

export class ProjectRepository {
  constructor(private readonly client: CorePersistenceClient) {}

  async listForActor(actor: PlatformUser): Promise<PlatformProject[]> {
    const records = await this.client.project.findMany({
      where: actor.role === "admin" ? undefined : { ownerUserId: actor.id },
      include: { apps: true },
      orderBy: { createdAt: "asc" }
    });
    return records.map(mapProject);
  }

  async createOrReplace(input: CreateProjectInput): Promise<PlatformProject> {
    if (!["admin", "creator"].includes(input.actor.role)) {
      throw new PermissionError(`Role ${input.actor.role} cannot create projects`);
    }
    if (!input.name.trim()) throw new ValidationError("Project name is required");

    const record = await this.client.project.create({
      data: {
        id: `prj_${randomUUID().replaceAll("-", "")}`,
        name: input.name,
        status: "draft",
        ownerUserId: input.actor.id,
        appType: input.appType ?? "Workflow App",
        businessProblem:
          input.businessProblem ?? "Capture the business problem before PRD generation.",
        targetDepartment: input.targetDepartment ?? "Business Team",
        intendedUsers: input.intendedUsers ?? ["Business User"],
        dataSensitivity: input.dataSensitivity ?? "internal",
        activeFrontendCheckpointId: null,
        createdAt: new Date()
      },
      include: { apps: true }
    });
    return mapProject(record);
  }

  async deleteForActor(actor: PlatformUser, projectId: string): Promise<void> {
    const project = (await this.listForActor(actor)).find(
      (candidate) => candidate.id === projectId
    );
    if (!project || (actor.role !== "admin" && project.ownerUserId !== actor.id)) {
      throw new PermissionError(`Role ${actor.role} cannot delete project ${projectId}`);
    }
    await this.client.project.delete({ where: { id: projectId } });
  }
}
