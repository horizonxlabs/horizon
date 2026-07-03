import { navigation } from "@evcp/config";
import { mockUsers, projects } from "@evcp/mock-data";
import { AppShell, ProjectCard } from "@evcp/ui";
import { createRoot } from "react-dom/client";
import "@evcp/ui/styles.css";

function CreatorApp() {
  return (
    <AppShell title="Creator App" navItems={navigation.creator} userName={mockUsers.creator.name}>
      <h1>Project Picker</h1>
      <div className="grid">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </AppShell>
  );
}

createRoot(document.getElementById("root")!).render(<CreatorApp />);
