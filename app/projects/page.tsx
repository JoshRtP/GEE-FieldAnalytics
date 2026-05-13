'use client';

import { useEffect, useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getProjects } from '@/lib/api';
import type { Project } from '@/lib/types';
import Link from 'next/link';
import { Plus, Map, Settings, ChartBar as BarChart3, Leaf, ChevronRight, Database } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProjects().then(setProjects).finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar
        title="Projects"
        subtitle="Manage your field analytics projects"
        actions={
          <Button size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> New Project
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-52 rounded-xl" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <Leaf className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-[15px] font-medium text-foreground">No projects yet</p>
            <p className="text-[13px] text-muted-foreground">Create a project to start analyzing field boundaries</p>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Create First Project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}

            {/* New project card */}
            <button className="group flex h-full min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border p-6 text-center transition-all hover:border-primary hover:bg-primary/5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted group-hover:bg-primary/10 transition-colors">
                <Plus className="h-6 w-6 text-muted-foreground group-hover:text-primary" />
              </div>
              <div>
                <p className="text-[14px] font-medium text-foreground">New Project</p>
                <p className="text-[12px] text-muted-foreground mt-0.5">Connect a GEE field asset</p>
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const statusColor: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-800',
    draft: 'bg-amber-100 text-amber-800',
    archived: 'bg-slate-100 text-slate-600',
  };

  return (
    <Card className="group flex flex-col overflow-hidden hover:shadow-md transition-shadow">
      <div className="h-2 bg-gradient-to-r from-primary/80 to-primary/40" />
      <CardContent className="flex flex-1 flex-col p-4 gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-foreground truncate">{project.name}</p>
            <p className="text-[12px] text-muted-foreground truncate mt-0.5">{project.region}</p>
          </div>
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', statusColor[project.status])}>
            {project.status}
          </span>
        </div>

        {project.description && (
          <p className="text-[12px] text-muted-foreground line-clamp-2">{project.description}</p>
        )}

        <div className="flex items-center gap-1.5 rounded-md bg-muted/60 px-2.5 py-1.5">
          <Database className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <p className="text-[11px] text-muted-foreground truncate font-mono">{project.field_asset}</p>
        </div>

        <div className="flex items-center gap-4 text-[12px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Map className="h-3.5 w-3.5" />
            {project.field_count.toLocaleString()} fields
          </span>
          <span className="flex items-center gap-1">
            <BarChart3 className="h-3.5 w-3.5" />
            {project.status === 'active' ? 'Analytics ready' : 'Setup pending'}
          </span>
        </div>

        <div className="mt-auto flex gap-2">
          <Button asChild variant="default" className="flex-1 h-8 text-[12px] gap-1.5">
            <Link href={`/projects/${project.id}/workspace`}>
              <Map className="h-3.5 w-3.5" /> Open
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-8 w-8 p-0" title="Settings">
            <Link href={`/projects/${project.id}/settings`}>
              <Settings className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
