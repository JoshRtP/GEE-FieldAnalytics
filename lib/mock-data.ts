import type {
  Project,
  AnalysisRun,
  FieldResult,
  ExportArtifact,
  QAFlag,
  TillageYearRecord,
  AnalysisConfig,
} from './types';

// ─── Default analysis config (mirrors GEE script defaults) ────────────────

export const DEFAULT_ANALYSIS_CONFIG: AnalysisConfig = {
  date_range: { start: '2025-02-01', end: '2025-07-01' },
  cloud_pct_max: 90,
  mask_mode: 'Standard',
  include_sar: false,
  min_valid_pct: 20,
  management_windows: {
    fall: { start: '09-01', end: '11-30', enabled: true },
    spring: { start: '02-01', end: '05-15', enabled: true },
  },
  cover_crop: {
    ndvi_source: 'Sentinel-2 NDVI',
    fall_threshold: 0.3,
    spring_threshold: 0.35,
  },
  tillage: {
    ndti_low: -0.2,
    ndti_high: 0.4,
    reduced_threshold: 0.3,
    notill_threshold: 0.6,
  },
  covariates: {
    era5_year: 2024,
    soil_depth_cm: '15-30',
  },
  analytics_version: 'emea-v1.0.0',
};

// ─── Mock projects ────────────────────────────────────────────────────────

export const MOCK_PROJECTS: Project[] = [
  {
    id: '00000000-0000-0000-0000-000000000010',
    organization_id: '00000000-0000-0000-0000-000000000001',
    name: 'EMEA France 26',
    description: 'Productionized analytics for EMEA France 26 field boundary collection — cover crop and tillage proxy classification.',
    region: 'EMEA',
    field_asset: 'projects/gen-lang-client-0499108456/assets/EMEA_France_26',
    iacs_asset: '',
    csb_asset: '',
    default_config: DEFAULT_ANALYSIS_CONFIG,
    status: 'active',
    field_count: 247,
    created_at: '2024-09-15T08:00:00Z',
    updated_at: '2025-04-20T14:32:00Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000011',
    organization_id: '00000000-0000-0000-0000-000000000001',
    name: 'EMEA Germany Pilot',
    description: 'Pilot project for German fields with IACS integration testing.',
    region: 'EMEA',
    field_asset: 'projects/gen-lang-client-0499108456/assets/EMEA_Germany_Pilot',
    iacs_asset: '',
    csb_asset: '',
    default_config: { ...DEFAULT_ANALYSIS_CONFIG },
    status: 'draft',
    field_count: 0,
    created_at: '2025-03-01T10:00:00Z',
    updated_at: '2025-03-01T10:00:00Z',
  },
];

// ─── Mock fields ──────────────────────────────────────────────────────────

export const MOCK_FIELDS = [
  { poly_id: '69005', mrv_field_id: '69005', field_name: 'Champ Nord', farm_name: 'Ferme Durand', area_ha: 12.4, centroid_lon: 2.1, centroid_lat: 48.7 },
  { poly_id: '69006', mrv_field_id: '69006', field_name: 'Parcelle Sud', farm_name: 'Ferme Durand', area_ha: 8.9, centroid_lon: 2.12, centroid_lat: 48.68 },
  { poly_id: '69007', mrv_field_id: '69007', field_name: 'Grand Champ', farm_name: 'Exploitation Martin', area_ha: 24.1, centroid_lon: 2.15, centroid_lat: 48.72 },
  { poly_id: '69008', mrv_field_id: '69008', field_name: 'Parcelle Est', farm_name: 'Exploitation Martin', area_ha: 6.3, centroid_lon: 2.18, centroid_lat: 48.69 },
  { poly_id: '69009', mrv_field_id: '69009', field_name: 'Bas Champ', farm_name: 'Ferme Leroy', area_ha: 15.7, centroid_lon: 2.08, centroid_lat: 48.75 },
  { poly_id: '69010', mrv_field_id: '69010', field_name: 'Plateau Ouest', farm_name: 'Ferme Leroy', area_ha: 19.2, centroid_lon: 2.05, centroid_lat: 48.71 },
  { poly_id: '69011', mrv_field_id: '69011', field_name: 'Limon Jaune', farm_name: 'GAEC Bourgeois', area_ha: 11.8, centroid_lon: 2.2, centroid_lat: 48.66 },
  { poly_id: '69012', mrv_field_id: '69012', field_name: 'Grande Plaine', farm_name: 'GAEC Bourgeois', area_ha: 32.5, centroid_lon: 2.22, centroid_lat: 48.64 },
  { poly_id: '69013', mrv_field_id: '69013', field_name: 'Orge Parcelle', farm_name: 'Ferme Petit', area_ha: 9.1, centroid_lon: 2.25, centroid_lat: 48.68 },
  { poly_id: '69014', mrv_field_id: '69014', field_name: 'Colza Bloc', farm_name: 'Ferme Petit', area_ha: 14.6, centroid_lon: 2.28, centroid_lat: 48.7 },
];

// ─── Mock yearly tillage history ──────────────────────────────────────────

function makeTillageHistory(baseNdti: number): TillageYearRecord[] {
  return [2020, 2021, 2022, 2023, 2024].map((year) => {
    const ndti = baseNdti + (Math.random() - 0.5) * 0.15;
    const norm = Math.min(1, Math.max(0, (ndti - -0.2) / (0.4 - -0.2)));
    const residue = Math.round(norm * 100);
    const likelihood =
      norm >= 0.6 ? 'no event' : norm >= 0.3 ? 'possible event' : 'LIKELY EVENT';
    const intensity =
      norm >= 0.6 ? 'none' : norm >= 0.3 ? 'light' : norm >= 0.15 ? 'moderate' : 'heavy';
    return {
      year,
      spring_ndti: Math.round(ndti * 1000) / 1000,
      ndti_norm: Math.round(norm * 100) / 100,
      residue_pct: residue,
      event_likelihood: likelihood as TillageYearRecord['event_likelihood'],
      event_intensity: intensity as TillageYearRecord['event_intensity'],
    };
  });
}

// ─── Mock field results ───────────────────────────────────────────────────

export const MOCK_FIELD_RESULTS: Record<string, FieldResult> = {
  '69005': {
    id: 'fr-001',
    run_id: 'run-001',
    project_id: '00000000-0000-0000-0000-000000000010',
    poly_id: '69005',
    cover_class: 'likely',
    cover_freq_score: 0.8,
    cover_confidence_pct: 76,
    tillage_class: 'NO-TILL',
    till_ndti_med: 0.28,
    till_ndti_norm: 0.80,
    tillage_confidence_pct: 82,
    spring_bare_freq: 0.12,
    covariates: {
      terrain: { dem_m: 142, slope_deg: 1.2, aspect_deg: 185, hillshade: 218 },
      climate: { era5_tmean_c: 10.8, era5_tmin_c: 4.2, era5_tmax_c: 18.1, era5_prcp_sum_mm: 612, era5_year_used: 2024 },
      soil: { clay_pct: 28.4, sand_pct: 31.2, silt_pct: 40.4, ph: 6.8, nitrogen_g_kg: 1.62, cec_cmol_kg: 18.4, cfvo_pct: 4.2, bdod_g_cm3: 1.38, soc_pct: 1.82, ocs_0_30_t_ha: 62.4, ocs_0_30_t_ac: 25.3 },
    },
    yearly_history: makeTillageHistory(0.27),
    data_quality: { valid_pixel_frac_fall: 0.84, valid_pixel_frac_spring: 0.91 },
    created_at: '2025-04-20T09:00:00Z',
  },
  '69006': {
    id: 'fr-002',
    run_id: 'run-001',
    project_id: '00000000-0000-0000-0000-000000000010',
    poly_id: '69006',
    cover_class: 'possible',
    cover_freq_score: 0.4,
    cover_confidence_pct: 41,
    tillage_class: 'REDUCED TILL',
    till_ndti_med: 0.12,
    till_ndti_norm: 0.53,
    tillage_confidence_pct: 54,
    spring_bare_freq: 0.38,
    covariates: {
      terrain: { dem_m: 138, slope_deg: 2.1, aspect_deg: 210, hillshade: 211 },
      climate: { era5_tmean_c: 10.6, era5_tmin_c: 4.0, era5_tmax_c: 17.8, era5_prcp_sum_mm: 598, era5_year_used: 2024 },
      soil: { clay_pct: 31.2, sand_pct: 28.4, silt_pct: 40.4, ph: 6.6, nitrogen_g_kg: 1.48, cec_cmol_kg: 20.1, cfvo_pct: 3.8, bdod_g_cm3: 1.42, soc_pct: 1.56, ocs_0_30_t_ha: 54.2, ocs_0_30_t_ac: 21.9 },
    },
    yearly_history: makeTillageHistory(0.11),
    data_quality: { valid_pixel_frac_fall: 0.62, valid_pixel_frac_spring: 0.78 },
    created_at: '2025-04-20T09:02:00Z',
  },
  '69007': {
    id: 'fr-003',
    run_id: 'run-001',
    project_id: '00000000-0000-0000-0000-000000000010',
    poly_id: '69007',
    cover_class: 'No Cover Crop',
    cover_freq_score: 0.2,
    cover_confidence_pct: 68,
    tillage_class: 'INTENSIVE TILL',
    till_ndti_med: -0.08,
    till_ndti_norm: 0.18,
    tillage_confidence_pct: 71,
    spring_bare_freq: 0.74,
    covariates: {
      terrain: { dem_m: 156, slope_deg: 0.8, aspect_deg: 162, hillshade: 224 },
      climate: { era5_tmean_c: 10.4, era5_tmin_c: 3.9, era5_tmax_c: 17.5, era5_prcp_sum_mm: 578, era5_year_used: 2024 },
      soil: { clay_pct: 25.1, sand_pct: 38.6, silt_pct: 36.3, ph: 7.1, nitrogen_g_kg: 1.21, cec_cmol_kg: 15.8, cfvo_pct: 5.6, bdod_g_cm3: 1.51, soc_pct: 1.24, ocs_0_30_t_ha: 44.8, ocs_0_30_t_ac: 18.1 },
    },
    yearly_history: makeTillageHistory(-0.08),
    data_quality: { valid_pixel_frac_fall: 0.88, valid_pixel_frac_spring: 0.85 },
    created_at: '2025-04-20T09:04:00Z',
  },
};

// ─── Mock runs ────────────────────────────────────────────────────────────

export const MOCK_RUNS: AnalysisRun[] = [
  {
    id: 'run-001',
    project_id: '00000000-0000-0000-0000-000000000010',
    name: 'Spring 2025 Management Screen',
    status: 'completed',
    analysis_config: DEFAULT_ANALYSIS_CONFIG,
    analytics_version: 'emea-v1.0.0',
    source_asset_snapshot: {
      field_asset: 'projects/gen-lang-client-0499108456/assets/EMEA_France_26',
      iacs_asset: '',
      csb_asset: '',
    },
    field_count: 247,
    completed_count: 241,
    failed_count: 6,
    started_at: '2025-04-20T08:00:00Z',
    completed_at: '2025-04-20T10:14:00Z',
    created_at: '2025-04-20T07:58:00Z',
  },
  {
    id: 'run-002',
    project_id: '00000000-0000-0000-0000-000000000010',
    name: 'Annual Baseline 2024',
    status: 'completed',
    analysis_config: {
      ...DEFAULT_ANALYSIS_CONFIG,
      date_range: { start: '2024-02-01', end: '2024-07-01' },
      covariates: { era5_year: 2023, soil_depth_cm: '15-30' },
    },
    analytics_version: 'emea-v1.0.0',
    source_asset_snapshot: {
      field_asset: 'projects/gen-lang-client-0499108456/assets/EMEA_France_26',
      iacs_asset: '',
      csb_asset: '',
    },
    field_count: 247,
    completed_count: 247,
    failed_count: 0,
    started_at: '2024-08-10T06:00:00Z',
    completed_at: '2024-08-10T08:22:00Z',
    created_at: '2024-08-10T05:58:00Z',
  },
  {
    id: 'run-003',
    project_id: '00000000-0000-0000-0000-000000000010',
    name: 'SAR Enhanced Screen',
    status: 'failed',
    analysis_config: { ...DEFAULT_ANALYSIS_CONFIG, include_sar: true },
    analytics_version: 'emea-v1.0.0',
    source_asset_snapshot: {
      field_asset: 'projects/gen-lang-client-0499108456/assets/EMEA_France_26',
    },
    field_count: 247,
    completed_count: 0,
    failed_count: 0,
    started_at: '2025-05-01T10:00:00Z',
    created_at: '2025-05-01T09:58:00Z',
  },
  {
    id: 'run-004',
    project_id: '00000000-0000-0000-0000-000000000010',
    name: 'Q2 2025 Spot Check',
    status: 'running',
    analysis_config: DEFAULT_ANALYSIS_CONFIG,
    analytics_version: 'emea-v1.0.0',
    source_asset_snapshot: {
      field_asset: 'projects/gen-lang-client-0499108456/assets/EMEA_France_26',
    },
    field_count: 247,
    completed_count: 118,
    failed_count: 2,
    started_at: '2025-05-13T07:00:00Z',
    created_at: '2025-05-13T06:58:00Z',
  },
];

// ─── Mock exports ─────────────────────────────────────────────────────────

export const MOCK_EXPORTS: ExportArtifact[] = [
  {
    id: 'exp-001',
    run_id: 'run-001',
    project_id: '00000000-0000-0000-0000-000000000010',
    artifact_type: 'csv',
    status: 'ready',
    file_name: 'field_classes_2025-02-01_2025-07-01_s2.csv',
    file_size_bytes: 184320,
    download_url: '#',
    metadata: { row_count: 241, columns: 22 },
    created_at: '2025-04-20T10:20:00Z',
    expires_at: '2025-07-20T10:20:00Z',
  },
  {
    id: 'exp-002',
    run_id: 'run-001',
    project_id: '00000000-0000-0000-0000-000000000010',
    artifact_type: 'geojson',
    status: 'ready',
    file_name: 'field_classes_2025-02-01_2025-07-01.geojson',
    file_size_bytes: 2940800,
    download_url: '#',
    metadata: { feature_count: 241 },
    created_at: '2025-04-20T10:22:00Z',
    expires_at: '2025-07-20T10:22:00Z',
  },
  {
    id: 'exp-003',
    run_id: 'run-001',
    project_id: '00000000-0000-0000-0000-000000000010',
    artifact_type: 'report',
    status: 'ready',
    file_name: 'Spring_2025_Management_Screen_Summary.pdf',
    file_size_bytes: 1452800,
    download_url: '#',
    metadata: { page_count: 24, fields_included: 241 },
    created_at: '2025-04-20T10:30:00Z',
    expires_at: '2025-07-20T10:30:00Z',
  },
  {
    id: 'exp-004',
    run_id: 'run-001',
    project_id: '00000000-0000-0000-0000-000000000010',
    artifact_type: 'audit_package',
    status: 'processing',
    file_name: 'audit_package_run-001.zip',
    metadata: {},
    created_at: '2025-04-20T10:35:00Z',
  },
  {
    id: 'exp-005',
    run_id: 'run-002',
    project_id: '00000000-0000-0000-0000-000000000010',
    artifact_type: 'csv',
    status: 'ready',
    file_name: 'field_classes_2024-02-01_2024-07-01_s2.csv',
    file_size_bytes: 192560,
    download_url: '#',
    metadata: { row_count: 247, columns: 22 },
    created_at: '2024-08-10T08:30:00Z',
    expires_at: '2024-11-10T08:30:00Z',
  },
];

// ─── Mock QA flags ────────────────────────────────────────────────────────

export const MOCK_QA_FLAGS: QAFlag[] = [
  {
    id: 'qa-001',
    run_id: 'run-001',
    poly_id: '69015',
    severity: 'warning',
    code: 'LOW_VALID_PIXEL_FRACTION',
    message: 'Valid pixel fraction below 20% threshold for spring window (spring: 14%)',
    created_at: '2025-04-20T09:30:00Z',
  },
  {
    id: 'qa-002',
    run_id: 'run-001',
    poly_id: '69023',
    severity: 'warning',
    code: 'SMALL_FIELD_SIZE',
    message: 'Field area (1.2 ha) is smaller than S2 pixel size; mixed pixel effects likely',
    created_at: '2025-04-20T09:31:00Z',
  },
  {
    id: 'qa-003',
    run_id: 'run-001',
    poly_id: '69041',
    severity: 'error',
    code: 'NO_NDTI_DATA',
    message: 'No valid NDTI data available for spring window — tillage classification unavailable',
    created_at: '2025-04-20T09:32:00Z',
  },
  {
    id: 'qa-004',
    run_id: 'run-001',
    poly_id: '69055',
    severity: 'info',
    code: 'SAR_INCLUDED',
    message: 'SAR data was included in this analysis run',
    created_at: '2025-04-20T09:33:00Z',
  },
  {
    id: 'qa-005',
    run_id: 'run-001',
    poly_id: '69067',
    severity: 'warning',
    code: 'CLOUD_CONTAMINATION_RISK',
    message: 'Cloud mask mode Relaxed may allow residual cloud contamination',
    created_at: '2025-04-20T09:34:00Z',
  },
  {
    id: 'qa-006',
    run_id: 'run-001',
    poly_id: '69078',
    severity: 'critical',
    code: 'NO_S2_WEEKS',
    message: 'No Sentinel-2 data found for selected date range in this field boundary',
    created_at: '2025-04-20T09:35:00Z',
  },
];

// ─── Dashboard KPI summary ────────────────────────────────────────────────

export const MOCK_DASHBOARD_SUMMARY = {
  total_projects: 2,
  active_runs: 1,
  total_fields_analyzed: 488,
  exports_ready: 3,
  fields_with_cover_crop: 148,
  fields_no_till: 62,
  fields_needing_review: 14,
  recent_activity: [
    { type: 'run_completed', label: 'Spring 2025 Management Screen completed', time: '2025-04-20T10:14:00Z', project: 'EMEA France 26' },
    { type: 'export_ready', label: 'CSV export ready for download', time: '2025-04-20T10:20:00Z', project: 'EMEA France 26' },
    { type: 'run_started', label: 'Q2 2025 Spot Check started', time: '2025-05-13T07:00:00Z', project: 'EMEA France 26' },
    { type: 'run_failed', label: 'SAR Enhanced Screen failed', time: '2025-05-01T10:45:00Z', project: 'EMEA France 26' },
    { type: 'report_ready', label: 'Project summary report generated', time: '2025-04-20T10:30:00Z', project: 'EMEA France 26' },
  ],
};
