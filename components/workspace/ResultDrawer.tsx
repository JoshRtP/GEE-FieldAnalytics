'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { CoverCropResult, TillageResult, CovariateResult, QAFlag, FieldResult, TillageYearRecord } from '@/lib/types';
import { Leaf, Tractor, ChartBar as BarChart3, Flag, Download, ChevronDown, ChevronUp, TriangleAlert as AlertTriangle, Info, CircleCheck as CheckCircle2, Circle as XCircle, RefreshCw, FileText, Package, Sprout } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ResultDrawerProps {
  fieldId: string | null;
  fieldResult: FieldResult | null;
  coverResult: CoverCropResult | null;
  tillageResult: TillageResult | null;
  covariateResult: CovariateResult | null;
  qaFlags: QAFlag[];
  loading: boolean;
  onExport: (type: 'csv' | 'geojson' | 'report' | 'audit_package') => void;
  onRerun: () => void;
}

function CoverClassBadge({ cls }: { cls: string | undefined }) {
  if (!cls) return null;
  const map: Record<string, string> = {
    likely: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    possible: 'bg-amber-100 text-amber-800 border-amber-200',
    'No Cover Crop': 'bg-slate-100 text-slate-700 border-slate-200',
    UNAVAILABLE: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold', map[cls] ?? 'bg-slate-100 text-slate-600 border-slate-200')}>
      {cls}
    </span>
  );
}

function TillageClassBadge({ cls }: { cls: string | undefined }) {
  if (!cls) return null;
  const map: Record<string, string> = {
    'NO-TILL': 'bg-blue-100 text-blue-800 border-blue-200',
    'REDUCED TILL': 'bg-cyan-100 text-cyan-800 border-cyan-200',
    'INTENSIVE TILL': 'bg-orange-100 text-orange-800 border-orange-200',
    UNAVAILABLE: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold', map[cls] ?? 'bg-slate-100 text-slate-600 border-slate-200')}>
      {cls}
    </span>
  );
}

function QASeverityIcon({ severity }: { severity: string }) {
  if (severity === 'critical' || severity === 'error') return <XCircle className="h-4 w-4 text-red-500" />;
  if (severity === 'warning') return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  return <Info className="h-4 w-4 text-blue-500" />;
}

function CovRow({ label, value, unit }: { label: string; value: number | null | undefined; unit?: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="text-[12px] font-medium text-foreground tabular-nums">
        {value == null ? '—' : `${value}${unit ? ` ${unit}` : ''}`}
      </span>
    </div>
  );
}

function EventRow({ record }: { record: TillageYearRecord }) {
  const severityColor = {
    'no event': 'text-emerald-600',
    'possible event': 'text-amber-600',
    'LIKELY EVENT': 'text-red-600',
  }[record.event_likelihood] ?? 'text-muted-foreground';

  return (
    <div className="grid grid-cols-5 gap-1 py-0.5 text-[11px]">
      <span className="font-medium tabular-nums">{record.year}</span>
      <span className="tabular-nums text-right">{record.spring_ndti?.toFixed(3) ?? '—'}</span>
      <span className="tabular-nums text-right">{record.ndti_norm?.toFixed(2) ?? '—'}</span>
      <span className="tabular-nums text-right">{record.residue_pct ?? '—'}%</span>
      <span className={cn('text-right truncate', severityColor)}>{record.event_likelihood}</span>
    </div>
  );
}

export function ResultDrawer({
  fieldId,
  fieldResult,
  coverResult,
  tillageResult,
  covariateResult,
  qaFlags,
  loading,
  onExport,
  onRerun,
}: ResultDrawerProps) {
  const [drawerExpanded, setDrawerExpanded] = useState(true);

  if (!fieldId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-2 px-6">
          <Sprout className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="text-[13px] text-muted-foreground">Select a field on the map to view analytics results</p>
        </div>
      </div>
    );
  }

  const hasWarnings = qaFlags.some((f) => f.severity === 'warning' || f.severity === 'error' || f.severity === 'critical');

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Drawer handle */}
      <div
        className="flex items-center justify-between border-b border-border px-4 py-2 cursor-pointer hover:bg-muted/40 transition-colors"
        onClick={() => setDrawerExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <span className="text-[13px] font-semibold">Field {fieldId}</span>
          {loading && <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
          {hasWarnings && !loading && (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-[12px]" onClick={(e) => { e.stopPropagation(); onRerun(); }}>
            <RefreshCw className="h-3 w-3" /> Re-run
          </Button>
          {drawerExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {drawerExpanded && (
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <Tabs defaultValue="cover" className="h-full flex flex-col">
            <TabsList className="mx-3 mt-2 mb-0 grid grid-cols-4 h-8">
              <TabsTrigger value="cover" className="text-[11px] gap-1 h-7">
                <Leaf className="h-3 w-3" /> Cover
              </TabsTrigger>
              <TabsTrigger value="tillage" className="text-[11px] gap-1 h-7">
                <Tractor className="h-3 w-3" /> Tillage
              </TabsTrigger>
              <TabsTrigger value="covariates" className="text-[11px] gap-1 h-7">
                <BarChart3 className="h-3 w-3" /> Covariates
              </TabsTrigger>
              <TabsTrigger value="qa" className="relative text-[11px] gap-1 h-7">
                <Flag className="h-3 w-3" /> QA
                {qaFlags.length > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">{qaFlags.length}</span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Cover crop */}
            <TabsContent value="cover" className="flex-1 px-3 pb-3 mt-2 space-y-3">
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-20" />
                  <Skeleton className="h-16" />
                </div>
              ) : coverResult ? (
                <>
                  <Card>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-semibold">Selected period</span>
                        <CoverClassBadge cls={coverResult.cover_class} />
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[12px]">
                        <div>
                          <p className="text-muted-foreground">Frequency score</p>
                          <p className="font-semibold tabular-nums">{coverResult.cover_freq_score?.toFixed(3) ?? '—'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Confidence proxy</p>
                          <p className="font-semibold tabular-nums">{coverResult.cover_confidence_pct ?? '—'}%</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">NDVI source</p>
                          <p className="font-medium truncate">{coverResult.ndvi_source === 'Sentinel-2 NDVI' ? 'S2 NDVI' : 'MODIS NDVI'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Year span</p>
                          <p className="font-medium">{coverResult.year_span}</p>
                        </div>
                      </div>
                      <Separator />
                      <div className="grid grid-cols-2 gap-2 text-[12px]">
                        <div>
                          <p className="text-muted-foreground">Fall NDVI mean</p>
                          <p className="font-medium tabular-nums">{coverResult.fall_ndvi_mean?.toFixed(3) ?? '—'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Spring NDVI mean</p>
                          <p className="font-medium tabular-nums">{coverResult.spring_ndvi_mean?.toFixed(3) ?? '—'}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="rounded-md bg-muted/50 px-3 py-2">
                    <p className="text-[10px] text-muted-foreground font-medium mb-1">Windows</p>
                    <div className="flex gap-2">
                      <Badge variant={coverResult.fall_enabled ? 'default' : 'outline'} className="text-[10px] h-5">
                        {coverResult.fall_enabled ? '✓' : '✗'} Fall
                      </Badge>
                      <Badge variant={coverResult.spring_enabled ? 'default' : 'outline'} className="text-[10px] h-5">
                        {coverResult.spring_enabled ? '✓' : '✗'} Spring
                      </Badge>
                    </div>
                  </div>

                  <Alert className="border-amber-200 bg-amber-50 text-amber-800">
                    <Info className="h-3.5 w-3.5 text-amber-600" />
                    <AlertDescription className="text-[11px]">
                      Remote sensing proxy indicator — review alongside farm records before formal verification.
                    </AlertDescription>
                  </Alert>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-24 gap-2">
                  <p className="text-[13px] text-muted-foreground">No cover crop results</p>
                  <Button size="sm" variant="outline" onClick={onRerun} className="gap-1.5 text-[12px]">
                    <RefreshCw className="h-3.5 w-3.5" /> Run analysis
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* Tillage */}
            <TabsContent value="tillage" className="flex-1 px-3 pb-3 mt-2 space-y-3">
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-20" />
                  <Skeleton className="h-32" />
                </div>
              ) : tillageResult ? (
                <>
                  <Card>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-semibold">Selected period</span>
                        <TillageClassBadge cls={tillageResult.tillage_class} />
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[12px]">
                        <div>
                          <p className="text-muted-foreground">NDTI median</p>
                          <p className="font-semibold tabular-nums">{tillageResult.till_ndti_med?.toFixed(3) ?? '—'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">NDTI norm (0–1)</p>
                          <p className="font-semibold tabular-nums">{tillageResult.till_ndti_norm?.toFixed(2) ?? '—'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Residue estimate</p>
                          <p className="font-semibold tabular-nums">~{tillageResult.residue_estimate_pct ?? '—'}%</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Confidence proxy</p>
                          <p className="font-semibold tabular-nums">{tillageResult.tillage_confidence_pct ?? '—'}%</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Spring bare freq</p>
                          <p className="font-medium tabular-nums">{tillageResult.spring_bare_freq?.toFixed(2) ?? '—'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Event years</p>
                          <p className="font-medium">{tillageResult.event_years.length > 0 ? tillageResult.event_years.join(', ') : 'None'}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Historical event table */}
                  {tillageResult.yearly_history.length > 0 && (
                    <Card>
                      <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-[12px]">Historical Event Table</CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-1">
                        <div className="grid grid-cols-5 gap-1 py-0.5 text-[10px] font-semibold text-muted-foreground border-b border-border mb-1">
                          <span>Year</span>
                          <span className="text-right">NDTI</span>
                          <span className="text-right">Norm</span>
                          <span className="text-right">Resid%</span>
                          <span className="text-right">Event</span>
                        </div>
                        {tillageResult.yearly_history.map((r) => (
                          <EventRow key={r.year} record={r} />
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-24 gap-2">
                  <p className="text-[13px] text-muted-foreground">No tillage results</p>
                  <Button size="sm" variant="outline" onClick={onRerun} className="gap-1.5 text-[12px]">
                    <RefreshCw className="h-3.5 w-3.5" /> Run analysis
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* Covariates */}
            <TabsContent value="covariates" className="flex-1 px-3 pb-3 mt-2 space-y-3">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
                </div>
              ) : covariateResult ? (
                <>
                  <Card>
                    <CardHeader className="p-3 pb-1"><CardTitle className="text-[12px]">Terrain (CopDEM 30m)</CardTitle></CardHeader>
                    <CardContent className="p-3 pt-0 divide-y divide-border">
                      <CovRow label="Elevation" value={covariateResult.terrain.dem_m} unit="m" />
                      <CovRow label="Slope" value={covariateResult.terrain.slope_deg} unit="°" />
                      <CovRow label="Aspect" value={covariateResult.terrain.aspect_deg} unit="°" />
                      <CovRow label="Hillshade" value={covariateResult.terrain.hillshade} />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="p-3 pb-1">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-[12px]">Climate (ERA5-Land ~9km)</CardTitle>
                        <span className="text-[10px] text-muted-foreground">Year {covariateResult.climate.era5_year_used}</span>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 divide-y divide-border">
                      <CovRow label="Mean temperature" value={covariateResult.climate.era5_tmean_c} unit="°C" />
                      <CovRow label="Min temperature" value={covariateResult.climate.era5_tmin_c} unit="°C" />
                      <CovRow label="Max temperature" value={covariateResult.climate.era5_tmax_c} unit="°C" />
                      <CovRow label="Annual precipitation" value={covariateResult.climate.era5_prcp_sum_mm} unit="mm" />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="p-3 pb-1">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-[12px]">Soil (SoilGrids ISRIC)</CardTitle>
                        <span className="text-[10px] text-muted-foreground">{covariateResult.depth_cm} cm</span>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 divide-y divide-border">
                      <CovRow label="Clay" value={covariateResult.soil.clay_pct} unit="%" />
                      <CovRow label="Sand" value={covariateResult.soil.sand_pct} unit="%" />
                      <CovRow label="Silt" value={covariateResult.soil.silt_pct} unit="%" />
                      <CovRow label="pH" value={covariateResult.soil.ph} />
                      <CovRow label="Nitrogen" value={covariateResult.soil.nitrogen_g_kg} unit="g/kg" />
                      <CovRow label="CEC" value={covariateResult.soil.cec_cmol_kg} unit="cmol/kg" />
                      <CovRow label="Bulk density" value={covariateResult.soil.bdod_g_cm3} unit="g/cm³" />
                      <CovRow label="SOC" value={covariateResult.soil.soc_pct} unit="%" />
                      <CovRow label="OCS 0-30cm" value={covariateResult.soil.ocs_0_30_t_ha} unit="tC/ha" />
                    </CardContent>
                  </Card>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-24 gap-2">
                  <p className="text-[13px] text-muted-foreground">No covariate data</p>
                </div>
              )}
            </TabsContent>

            {/* QA flags */}
            <TabsContent value="qa" className="flex-1 px-3 pb-3 mt-2 space-y-2">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
                </div>
              ) : qaFlags.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-24 gap-2">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                  <p className="text-[13px] text-muted-foreground">No QA flags for this field</p>
                </div>
              ) : (
                qaFlags.map((flag) => (
                  <div key={flag.id} className="flex gap-2.5 rounded-lg border border-border bg-card p-3">
                    <QASeverityIcon severity={flag.severity} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-semibold text-foreground">{flag.code}</span>
                        <Badge variant="outline" className={cn('text-[10px] h-4 px-1.5', {
                          'border-red-200 text-red-700': flag.severity === 'critical' || flag.severity === 'error',
                          'border-amber-200 text-amber-700': flag.severity === 'warning',
                          'border-blue-200 text-blue-700': flag.severity === 'info',
                        })}>
                          {flag.severity}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{flag.message}</p>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>

          {/* Export buttons */}
          <div className="border-t border-border px-3 py-2 mt-auto">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Export</p>
            <div className="grid grid-cols-2 gap-1.5">
              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" onClick={() => onExport('csv')}>
                <Download className="h-3 w-3" /> CSV
              </Button>
              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" onClick={() => onExport('geojson')}>
                <Download className="h-3 w-3" /> GeoJSON
              </Button>
              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" onClick={() => onExport('report')}>
                <FileText className="h-3 w-3" /> Report
              </Button>
              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" onClick={() => onExport('audit_package')}>
                <Package className="h-3 w-3" /> Audit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
