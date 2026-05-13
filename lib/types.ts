// ─── Core domain types ────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface Project {
  id: string;
  organization_id: string;
  name: string;
  description: string;
  region: string;
  field_asset: string;
  iacs_asset: string;
  csb_asset: string;
  default_config: AnalysisConfig;
  status: 'active' | 'archived' | 'draft';
  field_count: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Field {
  id: string;
  project_id: string;
  poly_id: string;
  source_feature_id?: string;
  mrv_field_id?: string;
  field_name?: string;
  farm_name?: string;
  area_ha?: number;
  properties: Record<string, unknown>;
  centroid_lon?: number;
  centroid_lat?: number;
  created_at: string;
}

// ─── Analysis configuration ───────────────────────────────────────────────

export interface DateRange {
  start: string;
  end: string;
}

export interface ManagementWindow {
  start: string;
  end: string;
  enabled: boolean;
}

export interface ManagementWindows {
  fall: ManagementWindow;
  spring: ManagementWindow;
}

export interface CoverCropConfig {
  ndvi_source: 'Sentinel-2 NDVI' | 'MODIS NDVI (Terra + Aqua)';
  fall_threshold: number;
  spring_threshold: number;
}

export interface TillageConfig {
  ndti_low: number;
  ndti_high: number;
  reduced_threshold: number;
  notill_threshold: number;
}

export interface CovariateConfig {
  era5_year: number;
  soil_depth_cm: string;
}

export interface AnalysisConfig {
  date_range: DateRange;
  cloud_pct_max: number;
  mask_mode: 'Strict' | 'Standard' | 'Relaxed' | 'Very relaxed';
  include_sar: boolean;
  min_valid_pct: number;
  management_windows: ManagementWindows;
  cover_crop: CoverCropConfig;
  tillage: TillageConfig;
  covariates: CovariateConfig;
  analytics_version?: string;
}

// ─── Analysis results ──────────────────────────────────────────────────────

export interface CoverCropResult {
  cover_class: 'likely' | 'possible' | 'No Cover Crop' | 'UNAVAILABLE';
  cover_freq_score: number | null;
  cover_confidence_pct: number | null;
  ndvi_source: string;
  fall_enabled: boolean;
  spring_enabled: boolean;
  fall_ndvi_mean: number | null;
  spring_ndvi_mean: number | null;
  year_span: string;
  years_analyzed: number[];
}

export interface TillageYearRecord {
  year: number;
  spring_ndti: number | null;
  ndti_norm: number | null;
  residue_pct: number | null;
  event_likelihood: 'no event' | 'possible event' | 'LIKELY EVENT';
  event_intensity: 'none' | 'light' | 'moderate' | 'heavy';
}

export interface TillageResult {
  tillage_class: 'NO-TILL' | 'REDUCED TILL' | 'INTENSIVE TILL' | 'UNAVAILABLE';
  till_ndti_med: number | null;
  till_ndti_norm: number | null;
  residue_estimate_pct: number | null;
  tillage_confidence_pct: number | null;
  spring_bare_freq: number | null;
  year_span: string;
  event_years: number[];
  yearly_history: TillageYearRecord[];
}

export interface TerrainCovariates {
  dem_m: number | null;
  slope_deg: number | null;
  aspect_deg: number | null;
  hillshade: number | null;
}

export interface ClimateCovariates {
  era5_tmean_c: number | null;
  era5_tmin_c: number | null;
  era5_tmax_c: number | null;
  era5_prcp_sum_mm: number | null;
  era5_year_used: number | null;
}

export interface SoilCovariates {
  clay_pct: number | null;
  sand_pct: number | null;
  silt_pct: number | null;
  ph: number | null;
  nitrogen_g_kg: number | null;
  cec_cmol_kg: number | null;
  cfvo_pct: number | null;
  bdod_g_cm3: number | null;
  soc_pct: number | null;
  ocs_0_30_t_ha: number | null;
  ocs_0_30_t_ac: number | null;
}

export interface CovariateResult {
  terrain: TerrainCovariates;
  climate: ClimateCovariates;
  soil: SoilCovariates;
  depth_cm: string;
}

// ─── QA & audit ───────────────────────────────────────────────────────────

export interface QAFlag {
  id: string;
  run_id?: string;
  field_result_id?: string;
  poly_id?: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  code: string;
  message: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// ─── Runs ─────────────────────────────────────────────────────────────────

export interface AnalysisRun {
  id: string;
  project_id: string;
  name: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  analysis_config: AnalysisConfig;
  analytics_version: string;
  source_asset_snapshot: Record<string, string>;
  field_count: number;
  completed_count: number;
  failed_count: number;
  requested_by?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

export interface FieldResult {
  id: string;
  run_id: string;
  project_id: string;
  poly_id: string;
  cover_class?: string;
  cover_freq_score?: number;
  cover_confidence_pct?: number;
  tillage_class?: string;
  till_ndti_med?: number;
  till_ndti_norm?: number;
  tillage_confidence_pct?: number;
  spring_bare_freq?: number;
  covariates?: Record<string, unknown>;
  yearly_history?: TillageYearRecord[];
  data_quality?: Record<string, unknown>;
  raw_stats?: Record<string, unknown>;
  created_at: string;
}

// ─── Exports ──────────────────────────────────────────────────────────────

export type ExportType = 'csv' | 'geojson' | 'report' | 'audit_package' | 'field_scorecard';
export type ExportStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface ExportArtifact {
  id: string;
  run_id: string;
  project_id: string;
  artifact_type: ExportType;
  status: ExportStatus;
  file_name?: string;
  file_size_bytes?: number;
  gcs_uri?: string;
  download_url?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  expires_at?: string;
}

// ─── UI state types ────────────────────────────────────────────────────────

export interface LayerVisibility {
  cropMap: boolean;
  ndvi: boolean;
  evi: boolean;
  ndti: boolean;
  ndmi: boolean;
  s2: boolean;
  coverProxy: boolean;
  tillageProxy: boolean;
  tillageEventMask: boolean;
}

export type UIMode = 'guided' | 'expert';
