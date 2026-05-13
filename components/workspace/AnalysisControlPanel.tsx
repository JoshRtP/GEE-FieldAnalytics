'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { AnalysisConfig, UIMode } from '@/lib/types';
import { DEFAULT_ANALYSIS_CONFIG } from '@/lib/mock-data';
import { ChevronDown, ChevronRight, Search, Play, RotateCcw, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AnalysisControlPanelProps {
  config: AnalysisConfig;
  onConfigChange: (config: AnalysisConfig) => void;
  onRun: () => void;
  onSearch: (query: string) => void;
  mode: UIMode;
  onModeChange: (mode: UIMode) => void;
  isRunning: boolean;
  selectedFieldId: string | null;
}

function SectionHeader({ title, open, onToggle, badge }: { title: string; open: boolean; onToggle: () => void; badge?: string }) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center justify-between py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
    >
      <div className="flex items-center gap-1.5">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {title}
      </div>
      {badge && <span className="text-[10px] normal-case font-medium text-primary">{badge}</span>}
    </button>
  );
}

function SliderRow({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground">{label}</Label>
        <span className="text-[11px] font-medium text-foreground tabular-nums">
          {format ? format(value) : value}
        </span>
      </div>
      <Slider
        min={min} max={max} step={step} value={[value]}
        onValueChange={([v]) => onChange(v)}
        className="h-4"
      />
    </div>
  );
}

export function AnalysisControlPanel({
  config,
  onConfigChange,
  onRun,
  onSearch,
  mode,
  onModeChange,
  isRunning,
  selectedFieldId,
}: AnalysisControlPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    dateRange: true,
    cloudMask: true,
    management: true,
    coverCrop: mode === 'expert',
    tillage: mode === 'expert',
    covariates: mode === 'expert',
  });

  const toggle = (key: string) =>
    setOpenSections((s) => ({ ...s, [key]: !s[key] }));

  const update = <K extends keyof AnalysisConfig>(key: K, val: AnalysisConfig[K]) =>
    onConfigChange({ ...config, [key]: val });

  const updateNested = <K extends keyof AnalysisConfig, NK extends keyof AnalysisConfig[K]>(
    key: K, nested: NK, val: AnalysisConfig[K][NK]
  ) => onConfigChange({ ...config, [key]: { ...(config[key] as object), [nested]: val } as unknown as AnalysisConfig[K] });

  const resetDefaults = () => onConfigChange(DEFAULT_ANALYSIS_CONFIG);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Mode toggle */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <div className="flex rounded-md border border-border overflow-hidden">
          <button
            onClick={() => { onModeChange('guided'); }}
            className={cn('px-2.5 py-1 text-[11px] font-medium transition-colors', mode === 'guided' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            Guided
          </button>
          <button
            onClick={() => { onModeChange('expert'); setOpenSections(s => ({ ...s, coverCrop: true, tillage: true, covariates: true })); }}
            className={cn('px-2.5 py-1 text-[11px] font-medium transition-colors', mode === 'expert' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            Expert
          </button>
        </div>
        <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" title="Reset to defaults" onClick={resetDefaults}>
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Search */}
      <div className="border-b border-border px-3 py-2">
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search poly_id / mrv_field_id"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSearch(searchQuery)}
              className="h-8 pl-7 text-[12px]"
            />
          </div>
          <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => onSearch(searchQuery)}>
            <Search className="h-3.5 w-3.5" />
          </Button>
        </div>
        {selectedFieldId && (
          <p className="mt-1 text-[11px] text-primary font-medium">Selected: {selectedFieldId}</p>
        )}
      </div>

      {/* Controls — scrollable */}
      <div className="flex-1 overflow-y-auto px-3 py-1 scrollbar-thin space-y-0.5">
        {/* Date range */}
        <SectionHeader title="Date Range" open={openSections.dateRange} onToggle={() => toggle('dateRange')} />
        {openSections.dateRange && (
          <div className="pb-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px] text-muted-foreground">Start</Label>
                <Input
                  type="date"
                  value={config.date_range.start}
                  onChange={(e) => update('date_range', { ...config.date_range, start: e.target.value })}
                  className="h-8 text-[12px] mt-0.5"
                />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">End</Label>
                <Input
                  type="date"
                  value={config.date_range.end}
                  onChange={(e) => update('date_range', { ...config.date_range, end: e.target.value })}
                  className="h-8 text-[12px] mt-0.5"
                />
              </div>
            </div>
          </div>
        )}

        <Separator className="my-1" />

        {/* Cloud & mask */}
        <SectionHeader title="Cloud & Masking" open={openSections.cloudMask} onToggle={() => toggle('cloudMask')} />
        {openSections.cloudMask && (
          <div className="pb-2 space-y-3">
            <SliderRow
              label="Max cloud cover (%)"
              value={config.cloud_pct_max}
              min={0} max={100} step={5}
              onChange={(v) => update('cloud_pct_max', v)}
              format={(v) => `${v}%`}
            />
            <div>
              <Label className="text-[11px] text-muted-foreground">Mask mode</Label>
              <Select
                value={config.mask_mode}
                onValueChange={(v) => update('mask_mode', v as AnalysisConfig['mask_mode'])}
              >
                <SelectTrigger className="mt-0.5 h-8 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Strict">Strict</SelectItem>
                  <SelectItem value="Standard">Standard</SelectItem>
                  <SelectItem value="Relaxed">Relaxed</SelectItem>
                  <SelectItem value="Very relaxed">Very relaxed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {mode === 'expert' && (
              <>
                <SliderRow
                  label="Min valid pixels (%)"
                  value={config.min_valid_pct}
                  min={0} max={100} step={5}
                  onChange={(v) => update('min_valid_pct', v)}
                  format={(v) => `${v}%`}
                />
                <div className="flex items-center justify-between">
                  <Label className="text-[12px]">Include Sentinel-1 SAR</Label>
                  <Switch
                    checked={config.include_sar}
                    onCheckedChange={(v) => update('include_sar', v)}
                  />
                </div>
              </>
            )}
          </div>
        )}

        <Separator className="my-1" />

        {/* Management windows */}
        <SectionHeader title="Management Windows" open={openSections.management} onToggle={() => toggle('management')} />
        {openSections.management && (
          <div className="pb-2 space-y-3">
            {/* Fall window */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-[11px] font-medium">Fall window</Label>
                <Switch
                  checked={config.management_windows.fall.enabled}
                  onCheckedChange={(v) => update('management_windows', { ...config.management_windows, fall: { ...config.management_windows.fall, enabled: v } })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Start (MM-DD)</Label>
                  <Input
                    value={config.management_windows.fall.start}
                    onChange={(e) => update('management_windows', { ...config.management_windows, fall: { ...config.management_windows.fall, start: e.target.value } })}
                    className="h-7 text-[11px] mt-0.5 font-mono"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">End (MM-DD)</Label>
                  <Input
                    value={config.management_windows.fall.end}
                    onChange={(e) => update('management_windows', { ...config.management_windows, fall: { ...config.management_windows.fall, end: e.target.value } })}
                    className="h-7 text-[11px] mt-0.5 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Spring window */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-[11px] font-medium">Spring window</Label>
                <Switch
                  checked={config.management_windows.spring.enabled}
                  onCheckedChange={(v) => update('management_windows', { ...config.management_windows, spring: { ...config.management_windows.spring, enabled: v } })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Start (MM-DD)</Label>
                  <Input
                    value={config.management_windows.spring.start}
                    onChange={(e) => update('management_windows', { ...config.management_windows, spring: { ...config.management_windows.spring, start: e.target.value } })}
                    className="h-7 text-[11px] mt-0.5 font-mono"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">End (MM-DD)</Label>
                  <Input
                    value={config.management_windows.spring.end}
                    onChange={(e) => update('management_windows', { ...config.management_windows, spring: { ...config.management_windows.spring, end: e.target.value } })}
                    className="h-7 text-[11px] mt-0.5 font-mono"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Expert-only sections */}
        {mode === 'expert' && (
          <>
            <Separator className="my-1" />

            {/* Cover crop */}
            <SectionHeader title="Cover Crop" open={openSections.coverCrop} onToggle={() => toggle('coverCrop')} badge="Expert" />
            {openSections.coverCrop && (
              <div className="pb-2 space-y-3">
                <div>
                  <Label className="text-[11px] text-muted-foreground">NDVI source</Label>
                  <Select
                    value={config.cover_crop.ndvi_source}
                    onValueChange={(v) => updateNested('cover_crop', 'ndvi_source', v as AnalysisConfig['cover_crop']['ndvi_source'])}
                  >
                    <SelectTrigger className="mt-0.5 h-8 text-[12px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Sentinel-2 NDVI">Sentinel-2 NDVI</SelectItem>
                      <SelectItem value="MODIS NDVI (Terra + Aqua)">MODIS NDVI (Terra + Aqua)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <SliderRow
                  label="Fall NDVI threshold"
                  value={config.cover_crop.fall_threshold}
                  min={0.1} max={0.6} step={0.05}
                  onChange={(v) => updateNested('cover_crop', 'fall_threshold', v)}
                  format={(v) => v.toFixed(2)}
                />
                <SliderRow
                  label="Spring NDVI threshold"
                  value={config.cover_crop.spring_threshold}
                  min={0.1} max={0.6} step={0.05}
                  onChange={(v) => updateNested('cover_crop', 'spring_threshold', v)}
                  format={(v) => v.toFixed(2)}
                />
              </div>
            )}

            <Separator className="my-1" />

            {/* Tillage */}
            <SectionHeader title="Tillage" open={openSections.tillage} onToggle={() => toggle('tillage')} badge="Expert" />
            {openSections.tillage && (
              <div className="pb-2 space-y-3">
                <SliderRow
                  label="NDTI normalize low"
                  value={config.tillage.ndti_low}
                  min={-0.4} max={0.2} step={0.01}
                  onChange={(v) => updateNested('tillage', 'ndti_low', v)}
                  format={(v) => v.toFixed(2)}
                />
                <SliderRow
                  label="NDTI normalize high"
                  value={config.tillage.ndti_high}
                  min={0.0} max={0.7} step={0.01}
                  onChange={(v) => updateNested('tillage', 'ndti_high', v)}
                  format={(v) => v.toFixed(2)}
                />
                <SliderRow
                  label="Reduced till threshold"
                  value={config.tillage.reduced_threshold}
                  min={0.1} max={0.7} step={0.05}
                  onChange={(v) => updateNested('tillage', 'reduced_threshold', v)}
                  format={(v) => v.toFixed(2)}
                />
                <SliderRow
                  label="No-till threshold"
                  value={config.tillage.notill_threshold}
                  min={0.3} max={0.95} step={0.05}
                  onChange={(v) => updateNested('tillage', 'notill_threshold', v)}
                  format={(v) => v.toFixed(2)}
                />
              </div>
            )}

            <Separator className="my-1" />

            {/* Covariates */}
            <SectionHeader title="Covariates" open={openSections.covariates} onToggle={() => toggle('covariates')} badge="Expert" />
            {openSections.covariates && (
              <div className="pb-2 space-y-3">
                <div>
                  <Label className="text-[11px] text-muted-foreground">ERA5 year</Label>
                  <Input
                    type="number"
                    value={config.covariates.era5_year}
                    onChange={(e) => updateNested('covariates', 'era5_year', parseInt(e.target.value) || 2024)}
                    className="h-8 text-[12px] mt-0.5"
                    min={2015} max={2025}
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">SoilGrids depth (cm)</Label>
                  <Select
                    value={config.covariates.soil_depth_cm}
                    onValueChange={(v) => updateNested('covariates', 'soil_depth_cm', v)}
                  >
                    <SelectTrigger className="mt-0.5 h-8 text-[12px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['0-5', '5-15', '15-30', '30-60', '60-100', '100-200'].map((d) => (
                        <SelectItem key={d} value={d}>{d} cm</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </>
        )}

        <div className="h-4" />
      </div>

      {/* Run button */}
      <div className="border-t border-border p-3">
        <Button
          className="w-full gap-2 font-semibold"
          onClick={onRun}
          disabled={isRunning}
        >
          {isRunning ? (
            <>
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              Running...
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" /> Run / Update
            </>
          )}
        </Button>

        {/* Config summary */}
        <div className="mt-2 rounded-md bg-muted/60 px-2.5 py-1.5">
          <p className="text-[10px] font-medium text-muted-foreground mb-1">Configuration summary</p>
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline" className="text-[10px] h-4 px-1.5">{config.mask_mode}</Badge>
            <Badge variant="outline" className="text-[10px] h-4 px-1.5">Cloud ≤{config.cloud_pct_max}%</Badge>
            <Badge variant="outline" className="text-[10px] h-4 px-1.5">{config.cover_crop.ndvi_source === 'Sentinel-2 NDVI' ? 'S2 NDVI' : 'MODIS NDVI'}</Badge>
            {config.include_sar && <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-amber-700 border-amber-300">+SAR</Badge>}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            {config.date_range.start} → {config.date_range.end}
          </p>
        </div>
      </div>
    </div>
  );
}
