'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { AnalysisControlPanel } from '@/components/workspace/AnalysisControlPanel';
import { LayerControls } from '@/components/workspace/LayerControls';
import { MapPlaceholder } from '@/components/workspace/MapPlaceholder';
import { ResultDrawer } from '@/components/workspace/ResultDrawer';
import { VisualTimeline } from '@/components/workspace/VisualTimeline';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getProject, getFieldSummary, getWeeklyList, runCoverCrop,
  runTillage, getCovariates, getQAFlags, createExport,
} from '@/lib/api';
import { DEFAULT_ANALYSIS_CONFIG, MOCK_PROJECTS } from '@/lib/mock-data';
import { resetGeeAvailabilityCache } from '@/lib/api';
import { useGEE } from '@/lib/gee-context';
import type {
  Project, AnalysisConfig, UIMode, LayerVisibility,
  CoverCropResult, TillageResult, CovariateResult, QAFlag, FieldResult,
} from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Layers, Map, ChevronLeft, ChevronRight, Activity, LogIn, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

const DEFAULT_LAYERS: LayerVisibility = {
  cropMap: true,
  ndvi: false,
  evi: false,
  ndti: false,
  ndmi: false,
  s2: false,
  coverProxy: false,
  tillageProxy: false,
  tillageEventMask: false,
};

export default function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();
  const { status: geeStatus, error: geeError, login: geeLogin } = useGEE();

  // Project
  const [project, setProject] = useState<Project | null>(null);
  const [projectLoading, setProjectLoading] = useState(true);

  // UI state
  const [mode, setMode] = useState<UIMode>('guided');
  const [config, setConfig] = useState<AnalysisConfig>(DEFAULT_ANALYSIS_CONFIG);
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);
  const [opacity, setOpacity] = useState(0.8);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);

  // Selected field
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [fieldResult, setFieldResult] = useState<FieldResult | null>(null);

  // Analytics results
  const [coverResult, setCoverResult] = useState<CoverCropResult | null>(null);
  const [tillageResult, setTillageResult] = useState<TillageResult | null>(null);
  const [covariateResult, setCovariateResult] = useState<CovariateResult | null>(null);
  const [qaFlags, setQaFlags] = useState<QAFlag[]>([]);
  const [weeks, setWeeks] = useState<string[]>([]);

  // Loading states
  const [isRunning, setIsRunning] = useState(false);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [weeksLoading, setWeeksLoading] = useState(false);

  // geeReady: the Python backend is reachable and GEE is available.
  const geeReady = geeStatus === 'ready';

  // Load project
  useEffect(() => {
    getProject(projectId).then((p) => {
      setProject(p);
      if (p?.default_config) setConfig(p.default_config);
    }).finally(() => setProjectLoading(false));
  }, [projectId]);

  const loadFieldAnalytics = useCallback(async (fieldId: string, cfg: AnalysisConfig) => {
    setResultsLoading(true);
    setWeeksLoading(true);
    setCoverResult(null);
    setTillageResult(null);
    setCovariateResult(null);
    setQaFlags([]);

    try {
      // Load field summary (resolves from backend when available, mock otherwise)
      const fr = await getFieldSummary(projectId, fieldId, cfg);
      setFieldResult(fr);

      // All analytics calls go through api.ts which proxies to the Python
      // GEE backend at /api/gee/* when the backend is reachable.
      const [wks, cover, tillage, covariates] = await Promise.all([
        getWeeklyList(projectId, fieldId, cfg),
        runCoverCrop(projectId, fieldId, cfg),
        runTillage(projectId, fieldId, cfg),
        getCovariates(projectId, fieldId, cfg),
      ]);
      setWeeks(wks);
      setWeeksLoading(false);
      setCoverResult(cover);
      setTillageResult(tillage);
      setCovariateResult(covariates);
      setQaFlags([
        {
          id: 'qa-1',
          severity: 'info',
          code: geeReady ? 'GEE_LIVE' : 'MOCK_DATA',
          message: geeReady
            ? 'Results computed live from Earth Engine via Python backend.'
            : 'Mock data — start the GEE backend to see live results.',
          created_at: new Date().toISOString(),
        },
        { id: 'qa-2', severity: 'info', code: 'ANALYTICS_VERSION', message: 'emea-v1.0.0', created_at: new Date().toISOString() },
      ]);
    } catch (err) {
      toast({ title: 'Analysis failed', description: 'Unable to load field analytics. Check your configuration.', variant: 'destructive' });
    } finally {
      setResultsLoading(false);
      setWeeksLoading(false);
    }
  }, [projectId, toast, geeReady, ee, fieldAsset]);

  const handleFieldSelect = useCallback((fieldId: string) => {
    setSelectedFieldId(fieldId);
    loadFieldAnalytics(fieldId, config);
  }, [config, loadFieldAnalytics]);

  const handleRun = useCallback(async () => {
    setIsRunning(true);
    setWeeks([]);
    try {
      // Force a fresh backend availability check before running.
      resetGeeAvailabilityCache();
      const wks = await getWeeklyList(projectId, selectedFieldId ?? '69005', config);
      setWeeks(wks);
      const src = geeReady ? 'Earth Engine' : 'mock';
      toast({ title: 'Run complete', description: `Found ${wks.length} S2 acquisitions (${src}).` });
      if (selectedFieldId) await loadFieldAnalytics(selectedFieldId, config);
    } catch {
      toast({ title: 'Run failed', description: 'Unable to query Earth Engine data.', variant: 'destructive' });
    } finally {
      setIsRunning(false);
    }
  }, [projectId, selectedFieldId, config, toast, loadFieldAnalytics, geeReady, ee, fieldAsset]);

  const handleSearch = useCallback((query: string) => {
    if (!query.trim()) return;
    handleFieldSelect(query.trim());
  }, [handleFieldSelect]);

  const handleExport = useCallback(async (type: 'csv' | 'geojson' | 'report' | 'audit_package') => {
    try {
      await createExport('run-001', type, projectId);
      toast({ title: 'Export queued', description: `${type.toUpperCase()} export is being prepared. Check the Exports page.` });
    } catch {
      toast({ title: 'Export failed', variant: 'destructive' });
    }
  }, [projectId, toast]);

  const runStatus = isRunning ? 'running' : weeks.length > 0 ? 'ready' : 'idle';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4 gap-3" style={{ backgroundColor: '#161b22', borderColor: '#30363d' }}>
        <div className="flex items-center gap-2 min-w-0">
          <Map className="h-4 w-4 shrink-0" style={{ color: '#8b949e' }} />
          <span className="text-[13px] font-semibold text-white truncate">
            {projectLoading ? <Skeleton className="h-4 w-32 inline-block" /> : (project?.name ?? 'Workspace')}
          </span>
          <Badge variant="outline" className="text-[10px] h-5 px-1.5 shrink-0 border-[#30363d] text-gray-400">emea-v1.0.0</Badge>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium', {
            'bg-blue-900/40 text-blue-300': runStatus === 'running',
            'text-[#131f48]': runStatus === 'ready',
            'bg-[#21262d] text-gray-400': runStatus === 'idle',
          })} style={runStatus === 'ready' ? { backgroundColor: '#9AD1DC' } : undefined}>
            <Activity className="h-3 w-3" />
            {runStatus === 'running' ? 'Running...' : runStatus === 'ready' ? `${weeks.length} weeks` : 'Ready'}
          </div>
          <span className="text-[11px]" style={{ color: '#8b949e' }}>
            {config.date_range.start} — {config.date_range.end}
          </span>

          {/* GEE connection status */}
          {(geeStatus === 'idle') && (
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[11px] border-[#30363d] bg-transparent text-gray-300 hover:bg-[#21262d]" onClick={geeLogin}>
              <LogIn className="h-3 w-3" /> Connect GEE
            </Button>
          )}
          {geeStatus === 'error' && (
            <div className="flex items-center gap-1.5">
              <WifiOff className="h-3 w-3 text-red-400 shrink-0" />
              <span className="text-[11px] text-red-400 max-w-[180px] truncate" title={geeError ?? 'GEE connection failed'}>
                {geeError ? geeError.slice(0, 60) : 'Connection failed'}
              </span>
              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] border-[#30363d] bg-transparent text-gray-400 hover:bg-[#21262d]" onClick={geeLogin}>
                Retry
              </Button>
            </div>
          )}
          {geeStatus === 'ready' && (
            <div className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium" style={{ backgroundColor: 'rgba(154,209,220,0.15)', color: '#9AD1DC' }}>
              <Wifi className="h-3 w-3" /> Live
            </div>
          )}
          {(geeStatus === 'authenticating' || geeStatus === 'initializing') && (
            <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
              <div className="h-3 w-3 rounded-full border border-gray-400 border-t-transparent animate-spin" />
              {geeStatus === 'authenticating' ? 'Authenticating...' : 'Connecting...'}
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — controls */}
        <div className={cn(
          'flex shrink-0 flex-col border-r border-border bg-card transition-all duration-200',
          leftPanelCollapsed ? 'w-0 overflow-hidden' : 'w-64'
        )}>
          <AnalysisControlPanel
            config={config}
            onConfigChange={setConfig}
            onRun={handleRun}
            onSearch={handleSearch}
            mode={mode}
            onModeChange={setMode}
            isRunning={isRunning}
            selectedFieldId={selectedFieldId}
          />
        </div>

        {/* Left collapse toggle */}
        <button
          onClick={() => setLeftPanelCollapsed((v) => !v)}
          className="flex h-full w-4 shrink-0 items-center justify-center border-r border-border bg-muted/40 hover:bg-muted transition-colors"
        >
          {leftPanelCollapsed ? <ChevronRight className="h-3 w-3 text-muted-foreground" /> : <ChevronLeft className="h-3 w-3 text-muted-foreground" />}
        </button>

        {/* Central map area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Map */}
          <div className="flex-1 overflow-hidden">
            <MapPlaceholder
              selectedFieldId={selectedFieldId}
              onFieldSelect={handleFieldSelect}
              layers={layers as unknown as Record<string, boolean>}
            />
          </div>

          {/* Visual timeline — bottom of map */}
          <div className="h-32 shrink-0 border-t border-border bg-card">
            <VisualTimeline
              fieldId={selectedFieldId}
              weeks={weeks}
              loading={weeksLoading}
            />
          </div>
        </div>

        {/* Right collapse toggle */}
        <button
          onClick={() => setRightPanelCollapsed((v) => !v)}
          className="flex h-full w-4 shrink-0 items-center justify-center border-l border-border bg-muted/40 hover:bg-muted transition-colors"
        >
          {rightPanelCollapsed ? <ChevronLeft className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
        </button>

        {/* Right panel — results + layers */}
        <div className={cn(
          'flex shrink-0 flex-col border-l border-border bg-card transition-all duration-200 overflow-hidden',
          rightPanelCollapsed ? 'w-0' : 'w-72'
        )}>
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Layer controls accordion */}
            <div className="border-b border-border px-3 py-2 shrink-0">
              <LayerControls
                layers={layers}
                onChange={setLayers}
                opacity={opacity}
                onOpacityChange={setOpacity}
              />
            </div>

            {/* Result drawer */}
            <div className="flex-1 overflow-hidden">
              <ResultDrawer
                fieldId={selectedFieldId}
                fieldResult={fieldResult}
                coverResult={coverResult}
                tillageResult={tillageResult}
                covariateResult={covariateResult}
                qaFlags={qaFlags}
                loading={resultsLoading}
                onExport={handleExport}
                onRerun={() => selectedFieldId && loadFieldAnalytics(selectedFieldId, config)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
