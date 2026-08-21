import { Type } from "@earendil-works/pi-ai";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

import { isLockedFile } from "../workspace-orchestrator/template";
import { normalizeProjectPath } from "./pi-tool-policy";
import { failure, success, tool, type HorizonPiToolContext, type ToolResult } from "./pi-tool-result";

// generate_image — Lovable-style AI images during a build turn. Bounded hard:
// PNG only, single filename under public/generated/, never overwrites, per-turn call cap
// (context.nextImageCall) and byte cap, and the governed executor applies guardrail +
// quota before any provider call. The result is TEXT (Pi rejects image blocks): it tells
// the model where the file landed, how to reference it under the preview base path, and
// which markdown line to echo in the recap so the user sees a chat thumbnail.
const IMAGE_PATH_PATTERN = /^public\/generated\/[A-Za-z0-9._-]+\.png$/;
const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"] as const;

export function createGenerateImageTool(context: HorizonPiToolContext): ToolDefinition {
  return tool(
    context,
    "generate_image",
    "Generate image",
    "Generate an AI image into public/generated/<name>.png and reference it from the app. PNG only; never overwrite an existing image.",
    Type.Object(
      {
        path: Type.String(),
        prompt: Type.String(),
        aspectRatio: Type.Optional(Type.String())
      },
      { additionalProperties: false }
    ),
    async (id, params): Promise<ToolResult> => {
      const requested = String(params.path ?? "").trim();
      const prompt = String(params.prompt ?? "").trim();
      const aspectRatio = params.aspectRatio ? String(params.aspectRatio).trim() : undefined;
      const fail = (error: string) =>
        failure(id, "image", requested || "generate_image", context, { body: prompt }, error);

      const path = normalizeProjectPath(requested);
      if (isLockedFile(context.template, path)) return fail(`workspace file '${path}' is locked`);
      if (!IMAGE_PATH_PATTERN.test(path))
        return fail(
          `image path must match public/generated/<name>.png (single filename, .png only) — got '${path}'`
        );
      if (!prompt) return fail("image prompt is required");
      if (aspectRatio && !ASPECT_RATIOS.includes(aspectRatio as (typeof ASPECT_RATIOS)[number]))
        return fail(`aspectRatio must be one of ${ASPECT_RATIOS.join(", ")}`);
      const tree = (await context.listWorkspaceTree?.(context.containerId)) ?? [];
      if (tree.includes(path))
        return fail(`'${path}' already exists — generated images are never overwritten; pick a new name`);
      context.nextImageCall?.();
      if (!context.generateImage)
        return fail(
          "image generation is not configured for this workspace — continue the build without generated images and do not retry this tool"
        );
      const generated = await context.generateImage({
        prompt,
        ...(aspectRatio ? { aspectRatio } : {})
      });
      if (generated.status !== "succeeded" && generated.status !== "fallback")
        return fail(
          `image generation ${generated.status}: ${generated.failureReason ?? "unknown"} — continue the build without this image`
        );
      if (!generated.base64) return fail("image generation returned no data");
      const byteLength = Buffer.from(generated.base64, "base64").byteLength;
      const maxImageBytes = context.limits.maxImageBytes ?? 4_194_304;
      if (byteLength > maxImageBytes)
        return fail(
          `generated image size ${byteLength} bytes exceeds the ${maxImageBytes} byte limit — retry with a simpler prompt or skip this image`
        );
      const written = await context.actionRunner.runAction({
        containerId: context.containerId,
        projectId: context.projectId,
        template: context.template,
        action: { id, type: "asset", filePath: path, base64: generated.base64 }
      });
      if (!written.ok) return fail(written.error ?? "asset write failed");
      const fileName = path.slice("public/generated/".length);
      const altText = fileName.replace(/\.png$/, "").replaceAll(/[-_]+/g, " ");
      return success(id, "image", path, context, { body: prompt }, [
          `Generated ${path} (${byteLength} bytes, ${generated.mimeType ?? "image/png"}).`,
          "IMPORTANT: the app is served under a base path. Reference this image ONLY as:",
          `  <img src={\`\${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/generated/${fileName}\`} alt="${altText}" />`,
          `A bare src="/generated/${fileName}" will 404 in the preview and the published app.`,
          "In your final recap message, include this exact markdown line so the user sees a thumbnail:",
          `![${altText}](public/generated/${fileName})`
        ].join("\n"));
    }
  );
}
