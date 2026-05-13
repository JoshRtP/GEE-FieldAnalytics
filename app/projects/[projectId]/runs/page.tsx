'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { getRuns, createRun } from '@/lib/api';
import { DEFAULT_ANALYSIS_CONFIG } from '@/lib/mock-data';
import type { AnalysisRun } from '@/lib/types';
import { Plus, ChartBar as BarChart3, CircleCheck as CheckCircle2, Circle as XCircle, Clock, Activity, RefreshCw, Download, ChevronDown, Settings, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

function formatDuration(start?: string, end?: string) {
  if (!start) return '—';
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const diff = e - s;
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode }> = {
    completed: { cls: 'bg-emerald-100 text-emerald-800', icon: <CheckCircle2 className="h-3 w-3" /> },
    running: { cls: 'bg-blue-100 text-blue-800', icon: <Activity className="h-3 w-3 animate-pulse" /> },
    queued: { cls: 'bg-amber-100 text-amber-800', icon: <Clock className="h-3 w-3" /> },
    failed: { cls: 'bg-red-100 text-red-800', icon: <XCircle className="h-3 w-3" /> },
    cancelled: { cls: 'bg-slate-100 text-slate-600', icon: <XCircle className="h-3 w-3" /> },
  };
  const { cls, icon } = map[status] ?? { cls: 'bg-slate-100 text-slate-600', icon: null };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', cls)}>
      {icon}{status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function RunsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();
  const [runs, setRuns] = useState<AnalysisRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    getRuns(projectId).then(setRuns).finally(() => setLoading(false));
  }, [projectId]);

  const handleCreateRun = async () => {
    setCreating(true);
    try {
      const run = await createRun(projectId, DEFAULT_ANALYSIS_CONFIG, `Run ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`);
      setRuns((prev) => [run, ...prev]);
      toast({ title: 'Run queued', description: `"${run.name}" has been queued for processing.` });
    } catch {
      toast({ title: 'Failed to create run', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar
        title="Run History"
        subtitle="Analysis run history and batch processing status"
        actions={
          <Button size="sm" className="gap-1.5" onClick={handleCreateRun} disabled={creating}>
            {creating ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" /> : <Plus className="h-3.5 w-3.5" />}
            New Run
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <BarChart3 className="h-12 w-12 text-muted-foreground/30" />
            <p className="text-[14px] font-medium text-foreground">No runs yet</p>
            <Button className="gap-2" onClick={handleCreateRun}>
              <Play className="h-4 w-4" /> Create first run
            </Button>
          </div>
        ) : (
          runs.map((run) => {
            const progress = run.field_count > 0 ? ((run.completed_count + run.failed_count) / run.field_count) * 100 : 0;
            const isExpanded = expandedId === run.id;

            return (
              <Card key={run.id} className="overflow-hidden">
                <div className="flex items-start gap-4 p-4">
                  {/* Icon */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[14px] font-semibold text-foreground">{run.name}</p>
                      <StatusBadge status={run.status} />
                      <Badge variant="outline" className="text-[10px] h-5 px-1.5">{run.analytics_version}</Badge>
                    </div>

                    <div className="flex items-center gap-4 mt-1 text-[12px] text-muted-foreground flex-wrap">
                      <span>Created {formatDate(run.created_at)}</span>
                      <span>Duration: {formatDuration(run.started_at, run.completed_at)}</span>
                      <span>{run.field_count} fields</span>
                      {run.failed_count > 0 && (
                        <span className="text-red-600">{run.failed_count} failed</span>
                      )}
                    </div>

                    {run.status === 'running' && (
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>{run.completed_count} / {run.field_count} fields</span>
                          <span>{Math.round(progress)}%</span>
                        </div>
                        <Progress value={progress} className="h-1.5" />
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {run.status === 'completed' && (
                      <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]">
                        <Download className="h-3 w-3" /> Export
                      </Button>
                    )}
                    {run.status === 'failed' && (
                      <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]">
                        <RefreshCw className="h-3 w-3" /> Re-run
                      </Button>
                    )}
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => setExpandedId(isExpanded ? null : run.id)}
                    >
                      <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-180')} />
                    </Button>
                  </div>
                </div>

                {/* Expanded config */}
                {isExpanded && (
                  <div className="border-t border-border bg-muted/30 px-4 py-3">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Run Configuration</p>
                    <div className="grid grid-cols-3 gap-3 text-[12px]">
                      <div>
                        <p className="text-muted-foreground">Date range</p>
                        <p className="font-medium">{run.analysis_config.date_range.start} → {run.analysis_config.date_range.end}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Cloud max</p>
                        <p className="font-medium">{run.analysis_config.cloud_pct_max}%</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Mask mode</p>
                        <p className="font-medium">{run.analysis_config.mask_mode}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">SAR</p>
                        <p className="font-medium">{run.analysis_config.include_sar ? 'Yes' : 'No'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">NDVI source</p>
                        <p className="font-medium">{run.analysis_config.cover_crop.ndvi_source === 'Sentinel-2 NDVI' ? 'S2 NDVI' : 'MODIS NDVI'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Field asset</p>
                        <p className="font-medium font-mono text-[10px] truncate">{run.source_asset_snapshot.field_asset}</p>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
