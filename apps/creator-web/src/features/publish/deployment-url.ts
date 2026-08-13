export type DeploymentEnvironment = "staging" | "production";

export function deploymentUrl(
  slug: string,
  environment: DeploymentEnvironment,
  origin = typeof window !== "undefined" ? window.location.origin : ""
): string {
  const base = `${origin}/apps/${slug}`;
  return environment === "production" ? base : `${base}/staging`;
}
