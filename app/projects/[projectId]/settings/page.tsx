'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { getProject, updateProject } from '@/lib/api';
import { DEFAULT_ANALYSIS_CONFIG } from '@/lib/mock-data';
import type { Project } from '@/lib/types';
import { Settings, Database, Layers, Save, TriangleAlert as AlertTriangle, Copy, Check, FolderOpen, Globe, Archive } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

function CopyableField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1.5">
        <code className={cn(
          'flex-1 rounded-md border border-border bg-muted px-3 py-2 font-mono text-[12px] truncate',
          !value && 'text-muted-foreground italic'
        )}>
          {value || '(not set)'}
        </code>
        {value && (
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={copy} title="Copy">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function ProjectSettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [region, setRegion] = useState('');
  const [status, setStatus] = useState<'active' | 'archived' | 'draft'>('active');
  const [fieldAsset, setFieldAsset] = useState('');
  const [iacsAsset, setIacsAsset] = useState('');
  const [csbAsset, setCsbAsset] = useState('');

  useEffect(() => {
    getProject(projectId).then((p) => {
      if (!p) return;
      setProject(p);
      setName(p.name);
      setDescription(p.description);
      setRegion(p.region);
      setStatus(p.status);
      setFieldAsset(p.field_asset);
      setIacsAsset(p.iacs_asset);
      setCsbAsset(p.csb_asset);
    }).finally(() => setLoading(false));
  }, [projectId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProject(projectId, {
        name,
        description,
        region,
        status,
        field_asset: fieldAsset,
        iacs_asset: iacsAsset,
        csb_asset: csbAsset,
      });
      toast({ title: 'Settings saved', description: 'Project configuration updated successfully.' });
    } catch {
      toast({ title: 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <TopBar title="Project Settings" subtitle="Configure project assets and defaults" />
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const config = project?.default_config ?? DEFAULT_ANALYSIS_CONFIG;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar
        title="Project Settings"
        subtitle={project?.name ?? 'Configure project assets and defaults'}
        actions={
          <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
            {saving ? (
              <div className="h-3.5 w-3.5 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save Changes
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="max-w-2xl space-y-8">

          {/* General */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-[14px] font-semibold">General</h2>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="proj-name" className="text-[13px]">Project Name</Label>
                <Input
                  id="proj-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-9 text-[13px]"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="proj-desc" className="text-[13px]">Description</Label>
                <Textarea
                  id="proj-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="text-[13px] resize-none"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="proj-region" className="text-[13px]">Region</Label>
                  <Input
                    id="proj-region"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="h-9 text-[13px]"
                    placeholder="e.g. EMEA"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="proj-status" className="text-[13px]">Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                    <SelectTrigger id="proj-status" className="h-9 text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </section>

          <Separator />

          {/* GEE Asset Paths */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-[14px] font-semibold">Google Earth Engine Assets</h2>
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 ml-auto">GEE</Badge>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-3 flex gap-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[12px] text-amber-800">
                Asset paths are used by the Earth Engine backend. Changes will take effect on the next analysis run. Verify paths are accessible to the service account before running.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="field-asset" className="text-[13px]">
                  Field Asset Path <span className="text-muted-foreground font-normal">(FIELD_ASSET)</span>
                </Label>
                <div className="flex items-center gap-1.5">
                  <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Input
                    id="field-asset"
                    value={fieldAsset}
                    onChange={(e) => setFieldAsset(e.target.value)}
                    className="h-9 font-mono text-[12px]"
                    placeholder="projects/your-project/assets/your-asset"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">The GEE FeatureCollection asset containing field boundaries (poly_id attribute required).</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="iacs-asset" className="text-[13px]">
                  IACS Asset Path <span className="text-muted-foreground font-normal">(IACS_ASSET)</span>
                </Label>
                <div className="flex items-center gap-1.5">
                  <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Input
                    id="iacs-asset"
                    value={iacsAsset}
                    onChange={(e) => setIacsAsset(e.target.value)}
                    className="h-9 font-mono text-[12px]"
                    placeholder="(optional)"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">Integrated Administration and Control System reference boundaries. Leave empty to skip IACS join.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="csb-asset" className="text-[13px]">
                  CSB Asset Path <span className="text-muted-foreground font-normal">(CSB_ASSET)</span>
                </Label>
                <div className="flex items-center gap-1.5">
                  <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Input
                    id="csb-asset"
                    value={csbAsset}
                    onChange={(e) => setCsbAsset(e.target.value)}
                    className="h-9 font-mono text-[12px]"
                    placeholder="(optional)"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">Cropland Data Layer / CSB reference asset. Leave empty to skip CSB join.</p>
              </div>
            </div>
          </section>

          <Separator />

          {/* Analysis defaults (read-only summary) */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-[14px] font-semibold">Default Analysis Configuration</h2>
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 ml-auto">{config.analytics_version}</Badge>
            </div>
            <p className="text-[12px] text-muted-foreground -mt-1">
              These defaults are used when creating new runs. They can be overridden per-run in the workspace.
            </p>

            <div className="rounded-lg border border-border overflow-hidden">
              {[
                ['Date range', `${config.date_range.start} → ${config.date_range.end}`],
                ['Cloud max', `${config.cloud_pct_max}%`],
                ['Mask mode', config.mask_mode],
                ['SAR fusion', config.include_sar ? 'Enabled' : 'Disabled'],
                ['Min valid pixels', `${config.min_valid_pct}%`],
                ['Fall window', `${config.management_windows.fall.start} → ${config.management_windows.fall.end}`],
                ['Spring window', `${config.management_windows.spring.start} → ${config.management_windows.spring.end}`],
                ['NDVI source', config.cover_crop.ndvi_source],
                ['Fall NDVI threshold', config.cover_crop.fall_threshold.toFixed(2)],
                ['Spring NDVI threshold', config.cover_crop.spring_threshold.toFixed(2)],
                ['NDTI low anchor', config.tillage.ndti_low.toFixed(2)],
                ['NDTI high anchor', config.tillage.ndti_high.toFixed(2)],
                ['No-till cutoff', config.tillage.notill_threshold.toFixed(2)],
                ['ERA5 year', String(config.covariates.era5_year)],
                ['Soil depth', config.covariates.soil_depth_cm],
              ].map(([label, value], i) => (
                <div
                  key={label}
                  className={cn('flex items-center justify-between px-4 py-2.5 text-[13px]', i > 0 && 'border-t border-border', i % 2 === 0 ? 'bg-card' : 'bg-muted/30')}
                >
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium font-mono text-[12px]">{value}</span>
                </div>
              ))}
            </div>
          </section>

          <Separator />

          {/* Danger zone */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Archive className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-[14px] font-semibold">Archive Project</h2>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-[13px] font-medium">Archive this project</p>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  Archiving hides the project from the active list. All data is preserved and can be restored.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5 text-[12px]"
                onClick={() => {
                  setStatus('archived');
                  toast({ title: 'Project archived', description: 'Set status to archived. Click Save Changes to confirm.' });
                }}
              >
                <Archive className="h-3.5 w-3.5" /> Archive
              </Button>
            </div>
          </section>

          {/* Save button (sticky bottom repeat) */}
          <div className="flex justify-end pt-2 pb-6">
            <Button className="gap-1.5" onClick={handleSave} disabled={saving}>
              {saving ? (
                <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
