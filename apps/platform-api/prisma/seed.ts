import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const roles = [
  { id: "role_admin", key: "admin", name: "Platform Admin", permissions: ["platform:admin", "ai:manage", "guardrail:manage", "audit:view"] },
  { id: "role_creator", key: "creator", name: "Creator", permissions: ["project:create", "project:update", "app:publish-request", "ticket:manage"] },
  { id: "role_end_user", key: "end_user", name: "End User", permissions: ["store:view", "ticket:create", "access:request"] }
];

const users = [
  { id: "usr_admin", email: "admin@company.com", name: "Admin User", roleId: "role_admin" },
  { id: "usr_creator", email: "creator@company.com", name: "Creator User", roleId: "role_creator" },
  { id: "usr_end_user", email: "user@company.com", name: "End User", roleId: "role_end_user" }
];

async function main() {
  for (const role of roles) {
    await prisma.platformRole.upsert({
      where: { key: role.key },
      update: { name: role.name, permissions: role.permissions },
      create: role
    });
  }

  await prisma.platformGroup.upsert({
    where: { key: "hr_department" },
    update: { name: "HR Department" },
    create: { id: "grp_hr_department", key: "hr_department", name: "HR Department" }
  });

  for (const user of users) {
    await prisma.platformUser.upsert({
      where: { email: user.email },
      update: { name: user.name, status: "active" },
      create: { id: user.id, email: user.email, name: user.name, status: "active" }
    });

    await prisma.platformUserRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: user.roleId } },
      update: {},
      create: { userId: user.id, roleId: user.roleId }
    });
  }

  await prisma.platformUserGroup.upsert({
    where: { userId_groupId: { userId: "usr_creator", groupId: "grp_hr_department" } },
    update: {},
    create: { userId: "usr_creator", groupId: "grp_hr_department" }
  });

  await prisma.project.upsert({
    where: { slug: "leave-management" },
    update: { name: "Leave Management", status: "draft", ownerUserId: "usr_creator" },
    create: {
      id: "prj_leave_management",
      slug: "leave-management",
      name: "Leave Management",
      status: "draft",
      ownerUserId: "usr_creator"
    }
  });

  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: "prj_leave_management", userId: "usr_creator" } },
    update: { role: "owner" },
    create: { projectId: "prj_leave_management", userId: "usr_creator", role: "owner" }
  });

  await prisma.app.upsert({
    where: { slug: "leave-management" },
    update: { name: "Leave Management", status: "draft", projectId: "prj_leave_management" },
    create: {
      id: "app_leave_management",
      slug: "leave-management",
      name: "Leave Management",
      status: "draft",
      projectId: "prj_leave_management",
      databaseSchemaName: "app_leave_management"
    }
  });

  await prisma.appRole.upsert({
    where: { appId_key: { appId: "app_leave_management", key: "employee" } },
    update: { name: "Employee", permissions: ["leave:request", "leave:view-own"] },
    create: {
      id: "app_role_leave_employee",
      appId: "app_leave_management",
      key: "employee",
      name: "Employee",
      permissions: ["leave:request", "leave:view-own"]
    }
  });

  await prisma.appMember.upsert({
    where: {
      appId_userId_roleId: {
        appId: "app_leave_management",
        userId: "usr_end_user",
        roleId: "app_role_leave_employee"
      }
    },
    update: {},
    create: {
      appId: "app_leave_management",
      userId: "usr_end_user",
      roleId: "app_role_leave_employee"
    }
  });

  await prisma.auditLog.upsert({
    where: { id: "aud_seed_sprint1" },
    update: {
      action: "seed.sprint1",
      resourceType: "platform",
      resourceId: "sprint1"
    },
    create: {
      id: "aud_seed_sprint1",
      actorUserId: "usr_admin",
      action: "seed.sprint1",
      resourceType: "platform",
      resourceId: "sprint1",
      severity: "info",
      metadata: { source: "apps/platform-api/prisma/seed.ts" }
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
