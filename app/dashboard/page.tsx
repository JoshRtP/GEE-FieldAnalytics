'use client';

import { useEffect, useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getDashboardSummary, getRuns, getExports } from '@/lib/api';
import { MOCK_RUNS, MOCK_EXPORTS } from '@/lib/mock-data';
import type { AnalysisRun, ExportArtifact } from '@/lib/types';
import Link from 'next/link';
import { Activity, ChartBar as BarChart3, CircleCheck as CheckCircle2, Download, Leaf, MapPin, TrendingUp, TriangleAlert as AlertTriangle, Clock, ArrowRight, Sprout, Tractor } from 'lucide-react';
import { cn } from '@/lib/utils';

const PROJECT_ID = '00000000-0000-0000-0000-000000000010';

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days > 30) return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (days > 1) return `${days} days ago`;
  if (days === 1) return 'Yesterday';
  const hours = Math.floor(diff / 3600000);
  if (hours > 1) return `${hours}h ago`;
  const mins = Math.floor(diff / 60000);
  return mins < 2 ? 'Just now' : `${mins}m ago`;
}

function RunStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: 'bg-emerald-100 text-emerald-800',
    running: 'bg-blue-100 text-blue-800',
    queued: 'bg-amber-100 text-amber-800',
    failed: 'bg-red-100 text-red-800',
    cancelled: 'bg-slate-100 text-slate-600',
  };
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold', map[status] ?? 'bg-slate-100 text-slate-600')}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getDashboardSummary>> | null>(null);
  const [runs, setRuns] = useState<AnalysisRun[]>([]);
  const [exports, setExports] = useState<ExportArtifact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getDashboardSummary(), getRuns(PROJECT_ID), getExports(PROJECT_ID)])
      .then(([s, r, e]) => {
        setSummary(s);
        setRuns(r.slice(0, 4));
        setExports(e.filter((ex) => ex.status === 'ready').slice(0, 3));
      })
      .finally(() => setLoading(false));
  }, []);

  const kpis = summary
    ? [
        { label: 'Total Fields Analyzed', value: summary.total_fields_analyzed.toLocaleString(), icon: <MapPin className="h-5 w-5" />, color: 'text-blue-600 bg-blue-50' },
        { label: 'Cover Crop Detected', value: summary.fields_with_cover_crop.toLocaleString(), icon: <Leaf className="h-5 w-5" />, color: 'text-emerald-600 bg-emerald-50' },
        { label: 'No-Till Fields', value: summary.fields_no_till.toLocaleString(), icon: <Sprout className="h-5 w-5" />, color: 'text-cyan-600 bg-cyan-50' },
        { label: 'Needs Review', value: summary.fields_needing_review.toLocaleString(), icon: <AlertTriangle className="h-5 w-5" />, color: 'text-amber-600 bg-amber-50' },
        { label: 'Active Runs', value: summary.active_runs.toLocaleString(), icon: <Activity className="h-5 w-5" />, color: 'text-primary bg-primary/10' },
        { label: 'Exports Ready', value: summary.exports_ready.toLocaleString(), icon: <Download className="h-5 w-5" />, color: 'text-violet-600 bg-violet-50' },
      ]
    : [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar
        title="Dashboard"
        subtitle="Overview of field analytics projects and recent activity"
        actions={
          <Button asChild size="sm" className="gap-1.5">
            <Link href={`/projects/${PROJECT_ID}/workspace`}>
              <MapPin className="h-3.5 w-3.5" /> Open Workspace
            </Link>
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        {/* KPI grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 mb-6">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))
            : kpis.map((kpi) => (
                <Card key={kpi.label} className="border shadow-sm">
                  <CardContent className="p-4">
                    <div className={cn('mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg', kpi.color)}>
                      {kpi.icon}
                    </div>
                    <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
                    <p className="text-[12px] text-muted-foreground leading-tight mt-0.5">{kpi.label}</p>
                  </CardContent>
                </Card>
              ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Recent runs */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-[14px] font-semibold">Recent Runs</CardTitle>
              <Button asChild variant="ghost" size="sm" className="text-[12px] gap-1 h-7">
                <Link href={`/projects/${PROJECT_ID}/runs`}>
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {runs.map((run) => (
                    <div key={run.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <BarChart3 className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-foreground truncate">{run.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {run.field_count} fields · {run.analytics_version}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <RunStatusBadge status={run.status} />
                        <span className="text-[11px] text-muted-foreground">{formatTime(run.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick actions + exports */}
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-[14px] font-semibold">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-2">
                <Button asChild variant="outline" className="justify-start gap-2 h-9 text-[13px]">
                  <Link href={`/projects/${PROJECT_ID}/workspace`}>
                    <MapPin className="h-4 w-4 text-primary" /> Map Workspace
                  </Link>
                </Button>
                <Button asChild variant="outline" className="justify-start gap-2 h-9 text-[13px]">
                  <Link href={`/projects/${PROJECT_ID}/runs`}>
                    <TrendingUp className="h-4 w-4 text-emerald-600" /> New Analysis Run
                  </Link>
                </Button>
                <Button asChild variant="outline" className="justify-start gap-2 h-9 text-[13px]">
                  <Link href={`/projects/${PROJECT_ID}/exports`}>
                    <Download className="h-4 w-4 text-violet-600" /> Export Results
                  </Link>
                </Button>
                <Button asChild variant="outline" className="justify-start gap-2 h-9 text-[13px]">
                  <Link href={`/projects/${PROJECT_ID}/reports`}>
                    <Tractor className="h-4 w-4 text-amber-600" /> Generate Report
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-[14px] font-semibold">Ready to Download</CardTitle>
                <Button asChild variant="ghost" size="sm" className="text-[12px] gap-1 h-7">
                  <Link href={`/projects/${PROJECT_ID}/exports`}>
                    All <ArrowRight className="h-3 w-3" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {exports.map((exp) => (
                      <div key={exp.id} className="flex items-center gap-2.5 px-4 py-2.5">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-foreground truncate">
                            {exp.file_name ?? exp.artifact_type}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {exp.artifact_type.toUpperCase()} · {exp.file_size_bytes ? `${(exp.file_size_bytes / 1024).toFixed(0)} KB` : '—'}
                          </p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Activity feed */}
        <Card className="mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-[14px] font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" /> Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {summary?.recent_activity.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <div className={cn(
                      'h-2 w-2 rounded-full shrink-0',
                      item.type === 'run_completed' && 'bg-emerald-500',
                      item.type === 'run_started' && 'bg-blue-500',
                      item.type === 'run_failed' && 'bg-red-500',
                      item.type === 'export_ready' && 'bg-violet-500',
                      item.type === 'report_ready' && 'bg-amber-500',
                    )} />
                    <p className="flex-1 text-[13px] text-foreground">{item.label}</p>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">{item.project}</span>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap w-20 text-right">{formatTime(item.time)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
