import { Check, ChevronDown, FolderKanban, Grid2X2, Plus, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { projectSwitchTargetPage, type CreatorPage } from "@/app/routes";
import type { CreatorProjectView } from "@/shared/types";

function projectInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "PR";
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function projectTone(projectId: string): number {
  let hash = 0;
  for (const character of projectId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % 6;
}

export function ProjectSwitcher({
  projects,
  selectedProject,
  currentPage,
  onSelectProject,
  onViewAllProjects,
  onCreateProject
}: {
  projects: CreatorProjectView[];
  selectedProject: CreatorProjectView;
  currentPage: CreatorPage;
  onSelectProject: (project: CreatorProjectView, targetPage: CreatorPage) => void;
  onViewAllProjects: () => void;
  onCreateProject: () => void;
}) {
  const isAllProjects = currentPage === "projects" || !selectedProject.id;
  const currentLabel = isAllProjects ? "All Projects" : selectedProject.name;
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listboxId = `creator-project-list-${useId().replace(/:/g, "")}`;
  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return projects;
    return projects.filter((project) =>
      `${project.name} ${project.appType} ${project.owner}`.toLowerCase().includes(normalized)
    );
  }, [projects, query]);

  useEffect(() => {
    if (!isOpen) return;
    searchRef.current?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function closeMenu() {
    setIsOpen(false);
    setQuery("");
  }

  function selectProject(project: CreatorProjectView) {
    closeMenu();
    onSelectProject(project, projectSwitchTargetPage(currentPage));
  }

  function viewAllProjects() {
    closeMenu();
    onViewAllProjects();
  }

  function createProject() {
    closeMenu();
    onCreateProject();
  }

  return (
    <div className="creator-project-switcher" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="creator-project-switcher-trigger"
        aria-label={`Switch project. Current project: ${currentLabel}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        title={currentLabel}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span
          className="creator-project-switcher-mark"
          data-tone={isAllProjects ? "all" : projectTone(selectedProject.id)}
          aria-hidden="true"
        >
          {isAllProjects ? <Grid2X2 size={17} /> : projectInitials(selectedProject.name)}
        </span>
        <span className="creator-project-switcher-copy">
          <span>Project</span>
          <strong>{currentLabel}</strong>
        </span>
        <ChevronDown className="creator-project-switcher-chevron" size={16} aria-hidden="true" />
      </button>

      {isOpen ? (
        <div className="creator-project-switcher-menu">
          <label className="creator-project-switcher-search">
            <Search size={15} aria-hidden="true" />
            <span className="sr-only">Search projects</span>
            <input
              ref={searchRef}
              type="search"
              placeholder="Search projects"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <div
            id={listboxId}
            className="creator-project-switcher-options"
            role="listbox"
            aria-label="Projects"
          >
            <button
              type="button"
              role="option"
              aria-selected={isAllProjects}
              className="creator-project-switcher-option"
              onClick={viewAllProjects}
            >
              <span
                className="creator-project-switcher-option-mark"
                data-tone="all"
                aria-hidden="true"
              >
                <Grid2X2 size={16} />
              </span>
              <span className="creator-project-switcher-option-copy">
                <strong>All Projects</strong>
                <span>Browse and manage your projects</span>
              </span>
              {isAllProjects ? <Check size={16} aria-hidden="true" /> : null}
            </button>

            {filteredProjects.map((project) => {
              const isSelected = !isAllProjects && project.id === selectedProject.id;
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className="creator-project-switcher-option"
                  key={project.id}
                  onClick={() => selectProject(project)}
                >
                  <span
                    className="creator-project-switcher-option-mark"
                    data-tone={projectTone(project.id)}
                    aria-hidden="true"
                  >
                    {projectInitials(project.name)}
                  </span>
                  <span className="creator-project-switcher-option-copy">
                    <strong>{project.name}</strong>
                    <span>{project.appType}</span>
                  </span>
                  {isSelected ? <Check size={16} aria-hidden="true" /> : null}
                </button>
              );
            })}

            {filteredProjects.length === 0 ? (
              <div className="creator-project-switcher-empty">
                <FolderKanban size={18} aria-hidden="true" />
                <span>No projects match “{query.trim()}”</span>
              </div>
            ) : null}
          </div>

          <div className="creator-project-switcher-actions">
            <button type="button" onClick={createProject}>
              <Plus size={15} aria-hidden="true" />
              Create new project
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
