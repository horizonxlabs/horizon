function hasRootExport(exportsField) {
  return Boolean(
    exportsField &&
    typeof exportsField === "object" &&
    !Array.isArray(exportsField) &&
    Object.hasOwn(exportsField, ".")
  );
}

const dependencySections = ["dependencies", "devDependencies", "optionalDependencies"];

function workspaceDependencyGraph(packages, workspaceNames) {
  return new Map(
    packages.map(({ manifest }) => {
      const dependencies = dependencySections.flatMap((section) =>
        Object.keys(manifest[section] ?? {}).filter((name) => workspaceNames.has(name))
      );
      return [manifest.name, [...new Set(dependencies)]];
    })
  );
}

function findDependencyCycles(graph) {
  const cycles = [];
  const completed = new Set();
  const visiting = new Set();
  const path = [];

  function visit(packageName) {
    if (completed.has(packageName)) return;
    if (visiting.has(packageName)) {
      const cycleStart = path.indexOf(packageName);
      cycles.push([...path.slice(cycleStart), packageName]);
      return;
    }

    visiting.add(packageName);
    path.push(packageName);
    for (const dependencyName of graph.get(packageName) ?? []) visit(dependencyName);
    path.pop();
    visiting.delete(packageName);
    completed.add(packageName);
  }

  for (const packageName of graph.keys()) visit(packageName);
  return cycles;
}

export function validateWorkspaceContracts(packages) {
  const failures = [];
  const workspaceNames = new Set(packages.map(({ manifest }) => manifest.name).filter(Boolean));
  const directoryByPackageName = new Map(
    packages.map(({ directory, manifest }) => [manifest.name, directory])
  );

  for (const workspacePackage of packages) {
    if (
      workspacePackage.directory.startsWith("packages/") &&
      !hasRootExport(workspacePackage.manifest.exports)
    ) {
      failures.push(
        `${workspacePackage.directory}/package.json must declare package.json "exports" with a "." entry`
      );
    }

    for (const section of dependencySections) {
      for (const [dependencyName, version] of Object.entries(
        workspacePackage.manifest[section] ?? {}
      )) {
        if (workspaceNames.has(dependencyName) && !version.startsWith("workspace:")) {
          failures.push(
            `${workspacePackage.directory}/package.json dependency "${dependencyName}" must use the workspace: protocol`
          );
        }
        if (
          workspacePackage.directory.startsWith("packages/") &&
          directoryByPackageName.get(dependencyName)?.startsWith("apps/")
        ) {
          failures.push(
            `${workspacePackage.directory}/package.json must not depend on application package "${dependencyName}"`
          );
        }
      }
    }
  }

  const graph = workspaceDependencyGraph(packages, workspaceNames);
  for (const cycle of findDependencyCycles(graph)) {
    failures.push(`workspace dependency cycle: ${cycle.join(" -> ")}`);
  }

  return failures;
}
