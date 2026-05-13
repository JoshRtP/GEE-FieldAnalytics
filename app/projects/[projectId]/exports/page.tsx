'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { getExports, createExport } from '@/lib/api';
import type { ExportArtifact } from '@/lib/types';
import { Download, FileText, Package, FileJson, Table2, Plus, CircleCheck as CheckCircle2, Clock, CircleAlert as AlertCircle, Loader as Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const TYPE_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  csv: { icon: <Table2 className="h-5 w-5" />, label: 'CSV', color: 'text-emerald-600 bg-emerald-50' },
  geojson: { icon: <FileJson className="h-5 w-5" />, label: 'GeoJSON', color: 'text-blue-600 bg-blue-50' },
  report: { icon: <FileText className="h-5 w-5" />, label: 'Report', color: 'text-amber-600 bg-amber-50' },
  audit_package: { icon: <Package className="h-5 w-5" />, label: 'Audit Package', color: 'text-violet-600 bg-violet-50' },
  field_scorecard: { icon: <FileText className="h-5 w-5" />, label: 'Field Scorecard', color: 'text-teal-600 bg-teal-50' },
};

function StatusIcon({ status }: { status: string }) {
  if (status === 'ready') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === 'processing') return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
  if (status === 'pending') return <Clock className="h-4 w-4 text-amber-500" />;
  return <AlertCircle className="h-4 w-4 text-red-500" />;
}

export default function ExportsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();
  const [exports, setExports] = useState<ExportArtifact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getExports(projectId).then(setExports).finally(() => setLoading(false));
  }, [projectId]);

  const handleCreateExport = async (type: 'csv' | 'geojson' | 'report' | 'audit_package') => {
    try {
      const exp = await createExport('run-001', type, projectId);
      setExports((prev) => [exp, ...prev]);
      toast({ title: 'Export queued', description: `${TYPE_META[type]?.label ?? type} export is being prepared.` });
    } catch {
      toast({ title: 'Export failed', variant: 'destructive' });
    }
  };

  const readyExports = exports.filter((e) => e.status === 'ready');
  const processingExports = exports.filter((e) => e.status !== 'ready');

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar
        title="Exports"
        subtitle="Download center — CSV, GeoJSON, reports, and audit packages"
        actions={
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="gap-1.5 text-[12px]" onClick={() => handleCreateExport('csv')}>
              <Table2 className="h-3.5 w-3.5" /> CSV
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-[12px]" onClick={() => handleCreateExport('geojson')}>
              <FileJson className="h-3.5 w-3.5" /> GeoJSON
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => handleCreateExport('report')}>
              <Plus className="h-3.5 w-3.5" /> New Export
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin space-y-6">
        {/* Quick export cards */}
        <div>
          <h2 className="text-[13px] font-semibold text-foreground mb-3">Generate New Export</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(['csv', 'geojson', 'report', 'audit_package'] as const).map((type) => {
              const meta = TYPE_META[type];
              return (
                <button
                  key={type}
                  onClick={() => handleCreateExport(type)}
                  className="group flex flex-col items-center gap-2 rounded-xl border border-border p-4 text-center transition-all hover:border-primary hover:bg-primary/5 hover:shadow-sm"
                >
                  <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg transition-colors', meta.color)}>
                    {meta.icon}
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold">{meta.label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {type === 'csv' && 'Field classes + QA metadata'}
                      {type === 'geojson' && 'Spatial field boundaries'}
                      {type === 'report' && 'Project summary PDF'}
                      {type === 'audit_package' && 'Full evidence ZIP'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Ready exports */}
        <div>
          <h2 className="text-[13px] font-semibold text-foreground mb-3">
            Ready to Download
            <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-800">{readyExports.length}</span>
          </h2>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
          ) : readyExports.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No downloads ready yet.</p>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              {readyExports.map((exp, i) => {
                const meta = TYPE_META[exp.artifact_type];
                return (
                  <div key={exp.id} className={cn('flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors', i > 0 && 'border-t border-border')}>
                    <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', meta?.color ?? 'bg-muted text-muted-foreground')}>
                      {meta?.icon ?? <Download className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate">{exp.file_name ?? `${exp.artifact_type}.${exp.artifact_type === 'csv' ? 'csv' : 'zip'}`}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {meta?.label ?? exp.artifact_type} · {exp.file_size_bytes ? formatBytes(exp.file_size_bytes) : '—'} · {formatDate(exp.created_at)}
                      </p>
                    </div>
                    <StatusIcon status={exp.status} />
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px] shrink-0">
                      <Download className="h-3.5 w-3.5" /> Download
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Processing */}
        {processingExports.length > 0 && (
          <div>
            <h2 className="text-[13px] font-semibold text-foreground mb-3">In Progress</h2>
            <div className="rounded-lg border border-border overflow-hidden">
              {processingExports.map((exp, i) => {
                const meta = TYPE_META[exp.artifact_type];
                return (
                  <div key={exp.id} className={cn('flex items-center gap-3 px-4 py-3 opacity-70', i > 0 && 'border-t border-border')}>
                    <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', meta?.color ?? 'bg-muted text-muted-foreground')}>
                      {meta?.icon ?? <Download className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium">{exp.file_name ?? `${exp.artifact_type} export`}</p>
                      <p className="text-[11px] text-muted-foreground">{meta?.label} · Started {formatDate(exp.created_at)}</p>
                    </div>
                    <StatusIcon status={exp.status} />
                    <span className="text-[12px] text-muted-foreground capitalize">{exp.status}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
