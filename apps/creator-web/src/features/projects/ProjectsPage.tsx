import { Plus } from "lucide-react";
import { Button } from "@evcp/ui";
import { CreatorState } from "@/shared";
import { CreatorShell } from "./CreatorShell";
import type { useCreatorApp } from "@/app/use-creator-app";

export function formatProjectStatus(status: string): string {
  const readable = status.trim().replace(/[_-]+/g, " ");
  if (!readable) return "Unknown";
  return readable.charAt(0).toUpperCase() + readable.slice(1).toLowerCase();
}

export function ProjectsPage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const { setIsCreateProjectDialogOpen } = app;

  return (
    <CreatorShell
      app={app}
      content={
        <div className="hz-home">
          <CreatorState
            kind="empty"
            title="Create your first project"
            description="Start with a business need and Horizon will prepare the project workspace."
            action={
              <Button variant="primary" onClick={() => setIsCreateProjectDialogOpen(true)}>
                <Plus size={16} aria-hidden="true" />
                <span>Create project</span>
              </Button>
            }
          />
        </div>
      }
    />
  );
}
