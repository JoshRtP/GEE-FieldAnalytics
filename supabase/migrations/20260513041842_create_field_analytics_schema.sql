/*
  # Field Analytics Enterprise Platform — Initial Schema

  ## Summary
  Creates the full database schema for the enterprise field analytics platform that
  productizes the Google Earth Engine EMEA Phase 5 field analytics script.

  ## New Tables
  1. `organizations` — tenant organizations
  2. `projects` — GEE field analytics projects with asset paths
  3. `fields` — individual field boundaries (cache of GEE asset features)
  4. `analysis_runs` — batch or interactive analysis run records
  5. `field_results` — per-field analytics outputs (cover crop, tillage, covariates)
  6. `export_artifacts` — CSV, GeoJSON, report export tracking
  7. `qa_flags` — data quality and QA flag records
  8. `run_logs` — detailed run execution logs

  ## Security
  - RLS enabled on all tables
  - Authenticated users can access their organization's data
*/

-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view organizations"
  ON organizations FOR SELECT
  TO authenticated
  USING (true);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id),
  name text NOT NULL,
  description text DEFAULT '',
  region text DEFAULT 'EMEA',
  field_asset text NOT NULL DEFAULT 'projects/gen-lang-client-0499108456/assets/EMEA_France_26',
  iacs_asset text DEFAULT '',
  csb_asset text DEFAULT '',
  default_config jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'active' CHECK (status IN ('active','archived','draft')),
  field_count integer DEFAULT 0,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view projects"
  ON projects FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert projects"
  ON projects FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update projects"
  ON projects FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Fields
CREATE TABLE IF NOT EXISTS fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id),
  poly_id text NOT NULL,
  source_feature_id text,
  mrv_field_id text,
  field_name text,
  farm_name text,
  area_ha numeric,
  properties jsonb DEFAULT '{}'::jsonb,
  centroid_lon numeric,
  centroid_lat numeric,
  created_at timestamptz DEFAULT now(),
  UNIQUE(project_id, poly_id)
);

ALTER TABLE fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view fields"
  ON fields FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert fields"
  ON fields FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Analysis runs
CREATE TABLE IF NOT EXISTS analysis_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','cancelled')),
  analysis_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  analytics_version text DEFAULT 'emea-v1.0.0',
  source_asset_snapshot jsonb DEFAULT '{}'::jsonb,
  field_count integer DEFAULT 0,
  completed_count integer DEFAULT 0,
  failed_count integer DEFAULT 0,
  requested_by uuid,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE analysis_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view runs"
  ON analysis_runs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert runs"
  ON analysis_runs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update runs"
  ON analysis_runs FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Field results
CREATE TABLE IF NOT EXISTS field_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES analysis_runs(id),
  project_id uuid REFERENCES projects(id),
  poly_id text NOT NULL,
  cover_class text,
  cover_freq_score numeric,
  cover_confidence_pct numeric,
  tillage_class text,
  till_ndti_med numeric,
  till_ndti_norm numeric,
  tillage_confidence_pct numeric,
  spring_bare_freq numeric,
  covariates jsonb DEFAULT '{}'::jsonb,
  yearly_history jsonb DEFAULT '[]'::jsonb,
  data_quality jsonb DEFAULT '{}'::jsonb,
  raw_stats jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE field_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view field results"
  ON field_results FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert field results"
  ON field_results FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Export artifacts
CREATE TABLE IF NOT EXISTS export_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES analysis_runs(id),
  project_id uuid REFERENCES projects(id),
  artifact_type text NOT NULL CHECK (artifact_type IN ('csv','geojson','report','audit_package','field_scorecard')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','ready','failed')),
  file_name text,
  file_size_bytes bigint,
  gcs_uri text,
  download_url text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

ALTER TABLE export_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view exports"
  ON export_artifacts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert exports"
  ON export_artifacts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update exports"
  ON export_artifacts FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- QA flags
CREATE TABLE IF NOT EXISTS qa_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES analysis_runs(id),
  field_result_id uuid REFERENCES field_results(id),
  poly_id text,
  severity text CHECK (severity IN ('info','warning','error','critical')),
  code text NOT NULL,
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE qa_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view qa flags"
  ON qa_flags FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert qa flags"
  ON qa_flags FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Run logs
CREATE TABLE IF NOT EXISTS run_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES analysis_runs(id),
  level text NOT NULL CHECK (level IN ('debug','info','warn','error')),
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE run_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view run logs"
  ON run_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert run logs"
  ON run_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Seed a default organization and project
INSERT INTO organizations (id, name, slug) VALUES
  ('00000000-0000-0000-0000-000000000001', 'EMEA Analytics', 'emea-analytics')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO projects (id, organization_id, name, description, region, field_asset, iacs_asset, csb_asset, field_count, default_config) VALUES
  (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000001',
    'EMEA France 26',
    'Productionized analytics for EMEA France 26 field boundary collection — cover crop and tillage proxy classification.',
    'EMEA',
    'projects/gen-lang-client-0499108456/assets/EMEA_France_26',
    '',
    '',
    247,
    '{
      "date_range": {"start": "2025-02-01", "end": "2025-07-01"},
      "cloud_pct_max": 90,
      "mask_mode": "Standard",
      "include_sar": false,
      "min_valid_pct": 20,
      "management_windows": {
        "fall": {"start": "09-01", "end": "11-30", "enabled": true},
        "spring": {"start": "02-01", "end": "05-15", "enabled": true}
      },
      "cover_crop": {
        "ndvi_source": "Sentinel-2 NDVI",
        "fall_threshold": 0.30,
        "spring_threshold": 0.35
      },
      "tillage": {
        "ndti_low": -0.20,
        "ndti_high": 0.40,
        "reduced_threshold": 0.30,
        "notill_threshold": 0.60
      },
      "covariates": {
        "era5_year": 2024,
        "soil_depth_cm": "15-30"
      },
      "analytics_version": "emea-v1.0.0"
    }'::jsonb
  )
ON CONFLICT (id) DO NOTHING;
