'use client';

import type {
  Project,
  Field,
  AnalysisConfig,
  CoverCropResult,
  TillageResult,
  CovariateResult,
  AnalysisRun,
  FieldResult,
  ExportArtifact,
  ExportType,
  QAFlag,
} from './types';
import {
  MOCK_PROJECTS,
  MOCK_FIELDS,
  MOCK_FIELD_RESULTS,
  MOCK_RUNS,
  MOCK_EXPORTS,
  MOCK_QA_FLAGS,
  MOCK_DASHBOARD_SUMMARY,
  DEFAULT_ANALYSIS_CONFIG,
} from './mock-data';

// Simulate network latency
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── GEE proxy helpers ────────────────────────────────────────────────────────
// Routes through the Next.js API proxy at /api/gee/* which forwards to the
// Python GEE backend (GEE_BACKEND_URL env var).  No Supabase auth needed.

const GEE_PROXY = '/api/gee';

const geeHeaders = {
  'Content-Type': 'application/json',
};

// Cached availability flag — reset on each page load, checked lazily.
let _geeAvailable: boolean | null = null;

/** Reset the cached GEE availability (call after backend URL changes). */
export function resetGeeAvailabilityCache(): void {
  _geeAvailable = null;
}

async function isGeeAvailable(): Promise<boolean> {
  if (_geeAvailable !== null) return _geeAvailable;
  try {
    const res = await fetch(`${GEE_PROXY}/health`, {
      headers: geeHeaders,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) { _geeAvailable = false; return false; }
    const data = await res.json();
    _geeAvailable = data?.gee_available === true;
    return _geeAvailable;
  } catch {
    _geeAvailable = false;
    return false;
  }
}

function configToGeeParams(cfg: AnalysisConfig): Record<string, unknown> {
  return {
    date_start: cfg.date_range.start,
    date_end: cfg.date_range.end,
    cloud_pct_max: cfg.cloud_pct_max,
    mask_mode: cfg.mask_mode,
    include_sar: cfg.include_sar,
    min_valid_pct: cfg.min_valid_pct,
    fall_start: cfg.management_windows.fall.start,
    fall_end: cfg.management_windows.fall.end,
    spring_start: cfg.management_windows.spring.start,
    spring_end: cfg.management_windows.spring.end,
    ndvi_source: cfg.cover_crop.ndvi_source,
    fall_ndvi_threshold: cfg.cover_crop.fall_threshold,
    spring_ndvi_threshold: cfg.cover_crop.spring_threshold,
    ndti_low: cfg.tillage.ndti_low,
    ndti_high: cfg.tillage.ndti_high,
    reduced_threshold: cfg.tillage.reduced_threshold,
    notill_threshold: cfg.tillage.notill_threshold,
    era5_year: cfg.covariates.era5_year,
    soil_depth_cm: cfg.covariates.soil_depth_cm,
  };
}

// ─── Projects ─────────────────────────────────────────────────────────────

export async function getProjects(): Promise<Project[]> {
  await delay(300);
  return MOCK_PROJECTS;
}

export async function getProject(projectId: string): Promise<Project | null> {
  await delay(200);
  return MOCK_PROJECTS.find((p) => p.id === projectId) ?? null;
}

export async function createProject(data: Partial<Project>): Promise<Project> {
  await delay(400);
  const project: Project = {
    id: `proj-${Date.now()}`,
    organization_id: '00000000-0000-0000-0000-000000000001',
    name: data.name ?? 'Untitled Project',
    description: data.description ?? '',
    region: data.region ?? 'EMEA',
    field_asset: data.field_asset ?? '',
    iacs_asset: data.iacs_asset ?? '',
    csb_asset: data.csb_asset ?? '',
    default_config: data.default_config ?? DEFAULT_ANALYSIS_CONFIG,
    status: 'active',
    field_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  return project;
}

export async function updateProject(projectId: string, data: Partial<Project>): Promise<Project> {
  await delay(300);
  const existing = MOCK_PROJECTS.find((p) => p.id === projectId);
  if (!existing) throw new Error('Project not found');
  return { ...existing, ...data, updated_at: new Date().toISOString() };
}

// ─── Fields ───────────────────────────────────────────────────────────────

export async function getFields(projectId: string): Promise<Field[]> {
  const project = MOCK_PROJECTS.find((p) => p.id === projectId);
  const fieldAsset = project?.field_asset ?? '';

  if (fieldAsset && await isGeeAvailable()) {
    try {
      const params = new URLSearchParams({ field_asset: fieldAsset, limit: '2000' });
      const res = await fetch(`${GEE_PROXY}/fields?${params}`, {
        headers: geeHeaders,
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.fields)) {
          return (data.fields as Array<Record<string, unknown>>).map((f, i) => ({
            id: `field-${i}`,
            project_id: projectId,
            poly_id: String(f.poly_id),
            mrv_field_id: String(f.mrv_field_id ?? f.poly_id),
            field_name: f.field_name as string | undefined,
            farm_name: f.farm_name as string | undefined,
            area_ha: f.area_ha as number | undefined,
            centroid_lon: f.centroid_lon as number | undefined,
            centroid_lat: f.centroid_lat as number | undefined,
            properties: {},
            created_at: '2024-09-15T08:00:00Z',
          }));
        }
      }
    } catch {
      // fall through to mock
    }
  }

  await delay(400);
  return MOCK_FIELDS.map((f, i) => ({
    id: `field-${i}`,
    project_id: projectId,
    poly_id: f.poly_id,
    mrv_field_id: f.mrv_field_id,
    field_name: f.field_name,
    farm_name: f.farm_name,
    area_ha: f.area_ha,
    centroid_lon: f.centroid_lon,
    centroid_lat: f.centroid_lat,
    properties: {},
    created_at: '2024-09-15T08:00:00Z',
  }));
}

export async function searchFields(
  projectId: string,
  query: string
): Promise<Field[]> {
  await delay(250);
  const all = await getFields(projectId);
  const q = query.toLowerCase();
  return all.filter(
    (f) =>
      f.poly_id.toLowerCase().includes(q) ||
      f.mrv_field_id?.toLowerCase().includes(q) ||
      f.field_name?.toLowerCase().includes(q) ||
      f.farm_name?.toLowerCase().includes(q)
  );
}

// ─── Interactive field analytics ──────────────────────────────────────────

export async function getFieldSummary(
  projectId: string,
  polyId: string,
  config: AnalysisConfig
): Promise<FieldResult | null> {
  await delay(200);
  return MOCK_FIELD_RESULTS[polyId] ?? null;
}

export async function getWeeklyList(
  projectId: string,
  polyId: string,
  config: AnalysisConfig
): Promise<string[]> {
  // Try live GEE backend first (only if available)
  if (await isGeeAvailable()) {
    try {
      const project = MOCK_PROJECTS.find((p) => p.id === projectId);
      const fieldAsset = project?.field_asset ?? '';
      const params = new URLSearchParams({
        field_asset: fieldAsset,
        poly_id: polyId,
        date_start: config.date_range.start,
        date_end: config.date_range.end,
        cloud_pct_max: String(config.cloud_pct_max),
        mask_mode: config.mask_mode,
      });
      const res = await fetch(`${GEE_PROXY}/weekly-list?${params}`, {
        headers: geeHeaders,
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.weeks)) return data.weeks as string[];
      }
    } catch {
      // fall through to mock
    }
  }

  // Mock fallback: generate weekly dates for the configured range
  await delay(600);
  const start = new Date(config.date_range.start);
  const end = new Date(config.date_range.end);
  const weeks: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    weeks.push(cursor.toISOString().split('T')[0]);
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
}

export async function runCoverCrop(
  projectId: string,
  polyId: string,
  config: AnalysisConfig
): Promise<CoverCropResult> {
  if (await isGeeAvailable()) {
    try {
      const project = MOCK_PROJECTS.find((p) => p.id === projectId);
      const fieldAsset = project?.field_asset ?? '';
      const params = new URLSearchParams({ field_asset: fieldAsset, poly_id: polyId });
      const res = await fetch(`${GEE_PROXY}/cover-crop?${params}`, {
        method: 'POST',
        headers: geeHeaders,
        body: JSON.stringify(configToGeeParams(config)),
        signal: AbortSignal.timeout(60000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.cover_class) return data as CoverCropResult;
      }
    } catch {
      // fall through to mock
    }
  }

  await delay(800);
  const result = MOCK_FIELD_RESULTS[polyId];
  return {
    cover_class: (result?.cover_class as CoverCropResult['cover_class']) ?? 'possible',
    cover_freq_score: result?.cover_freq_score ?? 0.4,
    cover_confidence_pct: result?.cover_confidence_pct ?? 44,
    ndvi_source: config.cover_crop.ndvi_source,
    fall_enabled: config.management_windows.fall.enabled,
    spring_enabled: config.management_windows.spring.enabled,
    fall_ndvi_mean: 0.32,
    spring_ndvi_mean: 0.38,
    year_span: '2020-2024',
    years_analyzed: [2020, 2021, 2022, 2023, 2024],
  };
}

export async function runTillage(
  projectId: string,
  polyId: string,
  config: AnalysisConfig
): Promise<TillageResult> {
  if (await isGeeAvailable()) {
    try {
      const project = MOCK_PROJECTS.find((p) => p.id === projectId);
      const fieldAsset = project?.field_asset ?? '';
      const params = new URLSearchParams({ field_asset: fieldAsset, poly_id: polyId });
      const res = await fetch(`${GEE_PROXY}/tillage?${params}`, {
        method: 'POST',
        headers: geeHeaders,
        body: JSON.stringify(configToGeeParams(config)),
        signal: AbortSignal.timeout(60000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.tillage_class) return data as TillageResult;
      }
    } catch {
      // fall through to mock
    }
  }

  await delay(800);
  const result = MOCK_FIELD_RESULTS[polyId];
  return {
    tillage_class: (result?.tillage_class as TillageResult['tillage_class']) ?? 'REDUCED TILL',
    till_ndti_med: result?.till_ndti_med ?? 0.12,
    till_ndti_norm: result?.till_ndti_norm ?? 0.53,
    residue_estimate_pct: result?.till_ndti_norm ? Math.round(result.till_ndti_norm * 100) : 53,
    tillage_confidence_pct: result?.tillage_confidence_pct ?? 54,
    spring_bare_freq: result?.spring_bare_freq ?? 0.38,
    year_span: '2020-2024',
    event_years: [2022, 2024],
    yearly_history: (result?.yearly_history ?? []) as TillageResult['yearly_history'],
  };
}

export async function getCovariates(
  projectId: string,
  polyId: string,
  config: AnalysisConfig
): Promise<CovariateResult> {
  if (await isGeeAvailable()) {
    try {
      const project = MOCK_PROJECTS.find((p) => p.id === projectId);
      const fieldAsset = project?.field_asset ?? '';
      const params = new URLSearchParams({
        field_asset: fieldAsset,
        poly_id: polyId,
        era5_year: String(config.covariates.era5_year),
        soil_depth_cm: config.covariates.soil_depth_cm,
      });
      const res = await fetch(`${GEE_PROXY}/covariates?${params}`, {
        method: 'POST',
        headers: geeHeaders,
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.terrain) return data as CovariateResult;
      }
    } catch {
      // fall through to mock
    }
  }

  await delay(600);
  const result = MOCK_FIELD_RESULTS[polyId];
  const cov = result?.covariates as Record<string, unknown> | undefined;
  return {
    terrain: (cov?.terrain as CovariateResult['terrain']) ?? {
      dem_m: 142, slope_deg: 1.2, aspect_deg: 185, hillshade: 218,
    },
    climate: (cov?.climate as CovariateResult['climate']) ?? {
      era5_tmean_c: 10.8, era5_tmin_c: 4.2, era5_tmax_c: 18.1,
      era5_prcp_sum_mm: 612, era5_year_used: config.covariates.era5_year,
    },
    soil: (cov?.soil as CovariateResult['soil']) ?? {
      clay_pct: 28.4, sand_pct: 31.2, silt_pct: 40.4, ph: 6.8,
      nitrogen_g_kg: 1.62, cec_cmol_kg: 18.4, cfvo_pct: 4.2,
      bdod_g_cm3: 1.38, soc_pct: 1.82, ocs_0_30_t_ha: 62.4, ocs_0_30_t_ac: 25.3,
    },
    depth_cm: config.covariates.soil_depth_cm,
  };
}

// ─── Batch runs ───────────────────────────────────────────────────────────

export async function createRun(
  projectId: string,
  config: AnalysisConfig,
  name: string,
  fieldFilter?: { poly_ids?: string[] }
): Promise<AnalysisRun> {
  await delay(500);
  return {
    id: `run-${Date.now()}`,
    project_id: projectId,
    name,
    status: 'queued',
    analysis_config: config,
    analytics_version: 'emea-v1.0.0',
    source_asset_snapshot: { field_asset: 'projects/gen-lang-client-0499108456/assets/EMEA_France_26' },
    field_count: fieldFilter?.poly_ids?.length ?? 247,
    completed_count: 0,
    failed_count: 0,
    created_at: new Date().toISOString(),
  };
}

export async function getRun(runId: string): Promise<AnalysisRun | null> {
  await delay(200);
  return MOCK_RUNS.find((r) => r.id === runId) ?? null;
}

export async function getRuns(projectId: string): Promise<AnalysisRun[]> {
  await delay(300);
  return MOCK_RUNS.filter((r) => r.project_id === projectId);
}

export async function getRunResults(runId: string): Promise<FieldResult[]> {
  await delay(400);
  return Object.values(MOCK_FIELD_RESULTS).filter((r) => r.run_id === runId);
}

// ─── Exports ──────────────────────────────────────────────────────────────

export async function createExport(
  runId: string,
  exportType: ExportType,
  projectId?: string
): Promise<ExportArtifact> {
  await delay(600);
  return {
    id: `exp-${Date.now()}`,
    run_id: runId,
    project_id: projectId ?? '',
    artifact_type: exportType,
    status: 'processing',
    metadata: {},
    created_at: new Date().toISOString(),
  };
}

export async function getExports(projectId?: string, runId?: string): Promise<ExportArtifact[]> {
  await delay(300);
  return MOCK_EXPORTS.filter(
    (e) =>
      (projectId == null || e.project_id === projectId) &&
      (runId == null || e.run_id === runId)
  );
}

// ─── QA flags ─────────────────────────────────────────────────────────────

export async function getQAFlags(runId: string): Promise<QAFlag[]> {
  await delay(250);
  return MOCK_QA_FLAGS.filter((f) => f.run_id === runId);
}

// ─── Dashboard ────────────────────────────────────────────────────────────

export async function getDashboardSummary() {
  await delay(400);
  return MOCK_DASHBOARD_SUMMARY;
}
