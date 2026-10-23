import { Suspense } from "react";
import { ProjectDetailsPage } from "@/components/workspace/jira-combined-workspace";

export default function ProjectPage() {
  return (
    <Suspense fallback={<main className="route-loading">Loading project...</main>}>
      <ProjectDetailsPage />
    </Suspense>
  );
}
