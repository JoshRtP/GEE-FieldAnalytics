/**
 * GEE analytics functions using the Earth Engine JS client.
 * Each function accepts a live `ee` instance and returns a Promise.
 * Falls back to null on error so callers can use mock data.
 */

import type { EEInstance } from './gee';
import type { AnalysisConfig, CoverCropResult, TillageResult, CovariateResult } from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addNDVI(ee: EEInstance) {
  return (img: unknown) =>
    (img as any).addBands((img as any).normalizedDifference(['B8', 'B4']).rename('NDVI'));
}

function addNDTI(ee: EEInstance) {
  return (img: unknown) =>
    (img as any).addBands((img as any).normalizedDifference(['B11', 'B12']).rename('NDTI'));
}

function maskClouds(ee: EEInstance, mode: string) {
  return (img: unknown) => {
    const image = img as any;
    if (mode === 'Very relaxed') return image;
    if (mode === 'Strict' || mode === 'Standard') {
      const qa = image.select('QA60');
      const cloudBit = 1 << 10;
      const cirrusBit = 1 << 11;
      let mask = qa.bitwiseAnd(ee.Number(cloudBit)).eq(0);
      if (mode === 'Strict') mask = mask.and(qa.bitwiseAnd(ee.Number(cirrusBit)).eq(0));
      return image.updateMask(mask);
    }
    // Relaxed — use SCL
    const scl = image.select('SCL');
    return image.updateMask(scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)));
  };
}

function getS2Collection(ee: EEInstance, geom: unknown, cfg: AnalysisConfig) {
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterDate(cfg.date_range.start, cfg.date_range.end)
    .filterBounds(geom)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', cfg.cloud_pct_max))
    .map(maskClouds(ee, cfg.mask_mode))
    .map(addNDVI(ee))
    .map(addNDTI(ee))
    .map((img: any) => img.multiply(0.0001).copyProperties(img, img.propertyNames()));
}

function getFieldGeometry(ee: EEInstance, fieldAsset: string, polyId: string) {
  return ee.FeatureCollection(fieldAsset)
    .filter(ee.Filter.eq('poly_id', parseInt(polyId, 10)))
    .first()
    .geometry();
}

function windowMean(
  ee: EEInstance,
  col: unknown,
  year: number,
  mmStart: string,
  mmEnd: string,
  band: string,
  geom: unknown
): Promise<number | null> {
  return new Promise((resolve) => {
    const start = `${year}-${mmStart}`;
    const end = `${year}-${mmEnd}`;
    const img = (col as any).filterDate(start, end).select(band).mean();
    img
      .reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: geom,
        scale: 10,
        maxPixels: 1e9,
      })
      .evaluate((result: Record<string, number | null> | null, err: string | null) => {
        if (err || !result) { resolve(null); return; }
        resolve(result[band] ?? null);
      });
  });
}

// ─── Weekly list ──────────────────────────────────────────────────────────────

export async function eeGetWeeklyList(
  ee: EEInstance,
  fieldAsset: string,
  polyId: string,
  cfg: AnalysisConfig
): Promise<string[]> {
  const geom = getFieldGeometry(ee, fieldAsset, polyId);
  const col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterDate(cfg.date_range.start, cfg.date_range.end)
    .filterBounds(geom)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', cfg.cloud_pct_max));

  return new Promise((resolve, reject) => {
    col.aggregate_array('system:time_start').evaluate(
      (timestamps: number[] | null, err: string | null) => {
        if (err || !timestamps) { reject(new Error(err ?? 'No data')); return; }
        const weekSet = new Set(
          timestamps.map((ms) => {
            const d = new Date(ms);
            // Round to nearest Monday
            const day = d.getUTCDay();
            d.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
            return d.toISOString().split('T')[0];
          })
        );
        resolve(Array.from(weekSet).sort());
      }
    );
  });
}

// ─── Cover crop ───────────────────────────────────────────────────────────────

export async function eeRunCoverCrop(
  ee: EEInstance,
  fieldAsset: string,
  polyId: string,
  cfg: AnalysisConfig
): Promise<CoverCropResult> {
  const geom = getFieldGeometry(ee, fieldAsset, polyId);
  const col = getS2Collection(ee, geom, cfg);

  const endYear = parseInt(cfg.date_range.end.slice(0, 4), 10);
  const years = Array.from({ length: 5 }, (_, i) => endYear - 4 + i);

  const scores: number[] = [];
  for (const yr of years) {
    const fallVal = await windowMean(
      ee, col, yr,
      cfg.management_windows.fall.start,
      cfg.management_windows.fall.end,
      'NDVI', geom
    );
    const springVal = await windowMean(
      ee, col, yr,
      cfg.management_windows.spring.start,
      cfg.management_windows.spring.end,
      'NDVI', geom
    );
    const fallHit = cfg.management_windows.fall.enabled && (fallVal ?? 0) >= cfg.cover_crop.fall_threshold;
    const springHit = cfg.management_windows.spring.enabled && (springVal ?? 0) >= cfg.cover_crop.spring_threshold;
    scores.push(fallHit && springHit ? 1 : fallHit || springHit ? 0.5 : 0);
  }

  const freq = scores.reduce((a, b) => a + b, 0) / scores.length;
  const cover_class: CoverCropResult['cover_class'] =
    freq >= 0.6 ? 'likely' : freq >= 0.3 ? 'possible' : 'No Cover Crop';

  return {
    cover_class,
    cover_freq_score: Math.round(freq * 1000) / 1000,
    cover_confidence_pct: Math.round(Math.min(freq * 100 + 20, 95)),
    ndvi_source: cfg.cover_crop.ndvi_source,
    fall_enabled: cfg.management_windows.fall.enabled,
    spring_enabled: cfg.management_windows.spring.enabled,
    fall_ndvi_mean: null,
    spring_ndvi_mean: null,
    year_span: `${years[0]}-${years[years.length - 1]}`,
    years_analyzed: years,
  };
}

// ─── Tillage ─────────────────────────────────────────────────────────────────

export async function eeRunTillage(
  ee: EEInstance,
  fieldAsset: string,
  polyId: string,
  cfg: AnalysisConfig
): Promise<TillageResult> {
  const geom = getFieldGeometry(ee, fieldAsset, polyId);
  const col = getS2Collection(ee, geom, cfg);

  const endYear = parseInt(cfg.date_range.end.slice(0, 4), 10);
  const years = Array.from({ length: 5 }, (_, i) => endYear - 4 + i);

  const history: TillageResult['yearly_history'] = [];
  const ndtiVals: number[] = [];

  for (const yr of years) {
    const springNdti = await windowMean(
      ee, col, yr,
      cfg.management_windows.spring.start,
      cfg.management_windows.spring.end,
      'NDTI', geom
    );
    if (springNdti == null) {
      history.push({ year: yr, spring_ndti: null, ndti_norm: null, residue_pct: null, event_likelihood: 'no event', event_intensity: 'none' });
      continue;
    }
    const norm = Math.min(1, Math.max(0, (springNdti - cfg.tillage.ndti_low) / (cfg.tillage.ndti_high - cfg.tillage.ndti_low)));
    const residue = Math.round(norm * 100);
    const event_likelihood: TillageResult['yearly_history'][number]['event_likelihood'] =
      norm >= 0.6 ? 'no event' : norm >= 0.3 ? 'possible event' : 'LIKELY EVENT';
    const event_intensity: TillageResult['yearly_history'][number]['event_intensity'] =
      norm >= 0.6 ? 'none' : norm >= 0.3 ? 'light' : norm >= 0.15 ? 'moderate' : 'heavy';
    ndtiVals.push(springNdti);
    history.push({ year: yr, spring_ndti: Math.round(springNdti * 1000) / 1000, ndti_norm: Math.round(norm * 100) / 100, residue_pct: residue, event_likelihood, event_intensity });
  }

  const sorted = [...ndtiVals].sort((a, b) => a - b);
  const medNdti = sorted[Math.floor(sorted.length / 2)] ?? null;
  const medNorm = medNdti != null
    ? Math.min(1, Math.max(0, (medNdti - cfg.tillage.ndti_low) / (cfg.tillage.ndti_high - cfg.tillage.ndti_low)))
    : null;

  const tillage_class: TillageResult['tillage_class'] =
    medNorm == null ? 'UNAVAILABLE'
    : medNorm >= cfg.tillage.notill_threshold ? 'NO-TILL'
    : medNorm >= cfg.tillage.reduced_threshold ? 'REDUCED TILL'
    : 'INTENSIVE TILL';

  return {
    tillage_class,
    till_ndti_med: medNdti != null ? Math.round(medNdti * 1000) / 1000 : null,
    till_ndti_norm: medNorm != null ? Math.round(medNorm * 100) / 100 : null,
    residue_estimate_pct: medNorm != null ? Math.round(medNorm * 100) : null,
    tillage_confidence_pct: 72,
    spring_bare_freq: Math.round(history.filter(h => h.event_likelihood === 'LIKELY EVENT').length / history.length * 100) / 100,
    year_span: `${years[0]}-${years[years.length - 1]}`,
    event_years: history.filter(h => h.event_likelihood === 'LIKELY EVENT').map(h => h.year),
    yearly_history: history,
  };
}

// ─── Covariates ───────────────────────────────────────────────────────────────

export async function eeGetCovariates(
  ee: EEInstance,
  fieldAsset: string,
  polyId: string,
  cfg: AnalysisConfig
): Promise<CovariateResult> {
  const geom = getFieldGeometry(ee, fieldAsset, polyId);

  // Terrain — CopDEM GLO-30
  const terrainResult = await new Promise<Record<string, number | null>>((resolve) => {
    const dem = ee.ImageCollection('COPERNICUS/DEM/GLO30').select('DEM').mosaic();
    const slope = ee.Terrain.slope(dem);
    const aspect = ee.Terrain.aspect(dem);
    const hillshade = ee.Terrain.hillshade(dem);
    ee.Image.cat([dem.rename('dem'), slope.rename('slope'), aspect.rename('aspect'), hillshade.rename('hs')])
      .reduceRegion({ reducer: ee.Reducer.mean(), geometry: geom, scale: 30, maxPixels: 1e9 })
      .evaluate((res: Record<string, number | null> | null, err: string | null) => {
        resolve(err || !res ? {} : res);
      });
  });

  // Climate — ERA5-Land monthly
  const climateResult = await new Promise<Record<string, number | null>>((resolve) => {
    ee.ImageCollection('ECMWF/ERA5_LAND/MONTHLY_AGGR')
      .filterDate(`${cfg.covariates.era5_year}-01-01`, `${cfg.covariates.era5_year}-12-31`)
      .select(['temperature_2m', 'total_precipitation_sum'])
      .mean()
      .reduceRegion({ reducer: ee.Reducer.mean(), geometry: geom, scale: 11132, maxPixels: 1e9 })
      .evaluate((res: Record<string, number | null> | null, err: string | null) => {
        resolve(err || !res ? {} : res);
      });
  });

  const tmeanK = climateResult['temperature_2m'];
  const tmeanC = tmeanK != null ? Math.round((tmeanK - 273.15) * 10) / 10 : null;
  const prcpM = climateResult['total_precipitation_sum'];
  const prcpMm = prcpM != null ? Math.round(prcpM * 1000 * 12 * 10) / 10 : null;

  return {
    terrain: {
      dem_m: terrainResult['dem'] != null ? Math.round(terrainResult['dem']! * 10) / 10 : null,
      slope_deg: terrainResult['slope'] != null ? Math.round(terrainResult['slope']! * 100) / 100 : null,
      aspect_deg: terrainResult['aspect'] != null ? Math.round(terrainResult['aspect']! * 10) / 10 : null,
      hillshade: terrainResult['hs'] != null ? Math.round(terrainResult['hs']!) : null,
    },
    climate: {
      era5_tmean_c: tmeanC,
      era5_tmin_c: null,
      era5_tmax_c: null,
      era5_prcp_sum_mm: prcpMm,
      era5_year_used: cfg.covariates.era5_year,
    },
    soil: {
      clay_pct: null, sand_pct: null, silt_pct: null, ph: null,
      nitrogen_g_kg: null, cec_cmol_kg: null, cfvo_pct: null,
      bdod_g_cm3: null, soc_pct: null, ocs_0_30_t_ha: null, ocs_0_30_t_ac: null,
    },
    depth_cm: cfg.covariates.soil_depth_cm,
  };
}
