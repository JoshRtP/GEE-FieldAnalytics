'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { getExports, getRuns } from '@/lib/api';
import type { ExportArtifact, AnalysisRun } from '@/lib/types';
import { FileText, Download, ChartBar as BarChart3, CircleCheck as CheckCircle2, TriangleAlert as AlertTriangle, TrendingUp, Sprout, Tractor, Eye, Plus, Calendar, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface SummaryStats {
  totalFields: number;
  coverLikely: number;
  coverPossible: number;
  noCover: number;
  noTill: number;
  reducedTill: number;
  intensiveTill: number;
  flagCount: number;
}

const MOCK_STATS: SummaryStats = {
  totalFields: 241,
  coverLikely: 89,
  coverPossible: 47,
  noCover: 105,
  noTill: 62,
  reducedTill: 88,
  intensiveTill: 91,
  flagCount: 14,
};

function StatBar({
  label,
  value,
  total,
  colorClass,
}: {
  label: string;
  value: number;
  total: number;
  colorClass: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[13px]">
        <span className="text-foreground">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {value} <span className="text-[11px]">({pct.toFixed(0)}%)</span>
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', colorClass)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();
  const [reports, setReports] = useState<ExportArtifact[]>([]);
  const [runs, setRuns] = useState<AnalysisRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getExports(projectId), getRuns(projectId)])
      .then(([exps, rs]) => {
        setReports(exps.filter((e) => e.artifact_type === 'report' || e.artifact_type === 'audit_package'));
        setRuns(rs.filter((r) => r.status === 'completed'));
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleGenerate = async (runId: string, type: 'report' | 'audit_package') => {
    toast({
      title: type === 'report' ? 'Report queued' : 'Audit package queued',
      description: 'Your document is being generated and will appear in the list when ready.',
    });
  };

  const completedRun = runs[0];
  const s = MOCK_STATS;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar
        title="Reports"
        subtitle="Project summary reports and audit documentation"
        actions={
          <Button size="sm" className="gap-1.5" onClick={() => completedRun && handleGenerate(completedRun.id, 'report')}>
            <Plus className="h-3.5 w-3.5" /> Generate Report
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin space-y-6">

        {/* Summary statistics */}
        {loading ? (
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
        ) : completedRun ? (
          <>
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[13px] font-semibold text-foreground">Latest Run Summary</h2>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5">{completedRun.analytics_version}</Badge>
                  <span className="text-[12px] text-muted-foreground">{completedRun.name}</span>
                  <span className="text-[11px] text-muted-foreground">· {formatDate(completedRun.completed_at!)}</span>
                </div>
              </div>

              {/* KPI row */}
              <div className="grid grid-cols-4 gap-3 mb-5">
                {[
                  { label: 'Fields Analyzed', value: s.totalFields, icon: <BarChart3 className="h-4 w-4" />, color: 'text-blue-600 bg-blue-50' },
                  { label: 'Cover Crop Detected', value: s.coverLikely + s.coverPossible, icon: <Sprout className="h-4 w-4" />, color: 'text-emerald-600 bg-emerald-50' },
                  { label: 'No-Till / Reduced', value: s.noTill + s.reducedTill, icon: <Tractor className="h-4 w-4" />, color: 'text-cyan-600 bg-cyan-50' },
                  { label: 'QA Flags', value: s.flagCount, icon: <AlertTriangle className="h-4 w-4" />, color: 'text-amber-600 bg-amber-50' },
                ].map(({ label, value, icon, color }) => (
                  <div key={label} className="rounded-xl border border-border bg-card p-4">
                    <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg mb-3', color)}>
                      {icon}
                    </div>
                    <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* Distribution charts */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Sprout className="h-4 w-4 text-emerald-600" />
                    <p className="text-[13px] font-semibold">Cover Crop Distribution</p>
                  </div>
                  <StatBar label="Likely cover crop" value={s.coverLikely} total={s.totalFields} colorClass="bg-emerald-500" />
                  <StatBar label="Possible cover crop" value={s.coverPossible} total={s.totalFields} colorClass="bg-amber-400" />
                  <StatBar label="No cover crop" value={s.noCover} total={s.totalFields} colorClass="bg-slate-300" />
                </div>
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Tractor className="h-4 w-4 text-cyan-600" />
                    <p className="text-[13px] font-semibold">Tillage Distribution</p>
                  </div>
                  <StatBar label="No-till" value={s.noTill} total={s.totalFields} colorClass="bg-blue-500" />
                  <StatBar label="Reduced till" value={s.reducedTill} total={s.totalFields} colorClass="bg-cyan-400" />
                  <StatBar label="Intensive till" value={s.intensiveTill} total={s.totalFields} colorClass="bg-orange-400" />
                </div>
              </div>
            </div>

            <Separator />
          </>
        ) : null}

        {/* Available reports */}
        <div>
          <h2 className="text-[13px] font-semibold text-foreground mb-3">Available Documents</h2>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 rounded-xl border border-dashed border-border">
              <FileText className="h-10 w-10 text-muted-foreground/30" />
              <div className="text-center">
                <p className="text-[13px] font-medium">No reports generated yet</p>
                <p className="text-[12px] text-muted-foreground mt-0.5">Run an analysis and generate a report from the completed run.</p>
              </div>
              <Button size="sm" className="gap-1.5 mt-1" onClick={() => completedRun && handleGenerate(completedRun.id, 'report')}>
                <Plus className="h-3.5 w-3.5" /> Generate First Report
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              {reports.map((doc, i) => {
                const isReport = doc.artifact_type === 'report';
                const isReady = doc.status === 'ready';
                return (
                  <div
                    key={doc.id}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 transition-colors',
                      i > 0 && 'border-t border-border',
                      isReady ? 'hover:bg-muted/30' : 'opacity-70'
                    )}
                  >
                    <div className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                      isReport ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-600'
                    )}>
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-medium truncate">
                          {doc.file_name ?? (isReport ? 'Project Summary Report' : 'Audit Package')}
                        </p>
                        <Badge
                          variant="secondary"
                          className={cn('text-[10px] h-4 px-1.5 shrink-0', isReady ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}
                        >
                          {isReady ? 'Ready' : doc.status}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {isReport ? 'Summary Report' : 'Audit Package'} · {doc.file_size_bytes ? formatBytes(doc.file_size_bytes) : 'Generating...'} · {formatDate(doc.created_at)}
                      </p>
                    </div>
                    {isReady ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-[12px]">
                          <Eye className="h-3.5 w-3.5" /> Preview
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px]">
                          <Download className="h-3.5 w-3.5" /> Download
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="h-3.5 w-3.5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                        <span className="text-[12px] text-muted-foreground">Processing</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Separator />

        {/* Generate from run */}
        <div>
          <h2 className="text-[13px] font-semibold text-foreground mb-3">Generate from Run</h2>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
            </div>
          ) : runs.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No completed runs available.</p>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              {runs.map((run, i) => (
                <div
                  key={run.id}
                  className={cn('flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors', i > 0 && 'border-t border-border')}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate">{run.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {run.completed_count} fields · {formatDate(run.completed_at!)}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button
                      size="sm" variant="outline" className="h-7 gap-1 text-[11px]"
                      onClick={() => handleGenerate(run.id, 'report')}
                    >
                      <FileText className="h-3 w-3" /> Report
                    </Button>
                    <Button
                      size="sm" variant="outline" className="h-7 gap-1 text-[11px]"
                      onClick={() => handleGenerate(run.id, 'audit_package')}
                    >
                      <Download className="h-3 w-3" /> Audit ZIP
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
