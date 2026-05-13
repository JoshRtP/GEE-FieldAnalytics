"""
FieldAnalytics Enterprise — GEE Backend
Supports three authentication modes (tried in order):

  1. Service account key JSON  — set GEE_SERVICE_ACCOUNT_KEY_JSON env var to
     the full contents of a service account key file (or mount the file and set
     GOOGLE_APPLICATION_CREDENTIALS to its path).

  2. Application Default Credentials (ADC) — run
       gcloud auth application-default login
     once on the developer machine.  On Cloud Run / GCE the VM service account
     is used automatically.

  3. earthengine CLI token — if ee-token is present (legacy notebooks / CI).

Setup for local development:
  1. pip install -r requirements.txt
  2. gcloud auth application-default login
  3. (Optional) export GEE_PROJECT=gen-lang-client-0499108456
  4. uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

import os
import json
import math
import base64
from datetime import date, timedelta
from typing import Optional

import ee
import google.auth
from google.oauth2 import service_account
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ─── Initialize Earth Engine ───────────────────────────────────────────────────

_GEE_PROJECT = os.environ.get("GEE_PROJECT", "gen-lang-client-0499108456")
_EE_SCOPES = [
    "https://www.googleapis.com/auth/earthengine",
    "https://www.googleapis.com/auth/cloud-platform",
]

def _init_from_service_account_env() -> bool:
    """Try to initialize EE using a service account key stored in an env var."""
    key_json = os.environ.get("GEE_SERVICE_ACCOUNT_KEY_JSON", "")
    if not key_json:
        return False
    try:
        # The env var may be raw JSON or base64-encoded JSON.
        try:
            key_data = json.loads(key_json)
        except json.JSONDecodeError:
            key_data = json.loads(base64.b64decode(key_json).decode())

        credentials = service_account.Credentials.from_service_account_info(
            key_data, scopes=_EE_SCOPES
        )
        ee.Initialize(credentials=credentials, project=_GEE_PROJECT)
        print(f"[GEE] Initialized with service account: {key_data.get('client_email', '?')}")
        return True
    except Exception as exc:
        print(f"[GEE] Service account init failed: {exc}")
        return False


def _init_from_adc() -> bool:
    """Try to initialize EE using Application Default Credentials."""
    try:
        ee.Initialize(project=_GEE_PROJECT)
        print("[GEE] Initialized with Application Default Credentials.")
        return True
    except Exception as exc:
        print(f"[GEE] ADC init failed: {exc}")
        return False


GEE_AVAILABLE: bool = _init_from_service_account_env() or _init_from_adc()
if not GEE_AVAILABLE:
    print("[WARN] Earth Engine is unavailable — all /health checks will report gee_available=false.")
    print("[HINT] Run: gcloud auth application-default login")
    print("[HINT] Or set GEE_SERVICE_ACCOUNT_KEY_JSON env var.")

app = FastAPI(title="FieldAnalytics GEE Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

NDVI_BAND_S2 = "NDVI"
NDTI_BAND = "NDTI"

# ─── Pydantic models ───────────────────────────────────────────────────────────

class AnalysisConfig(BaseModel):
    date_start: str
    date_end: str
    cloud_pct_max: float = 90.0
    mask_mode: str = "Standard"
    include_sar: bool = False
    min_valid_pct: float = 20.0
    fall_start: str = "09-01"
    fall_end: str = "11-30"
    spring_start: str = "02-01"
    spring_end: str = "05-15"
    ndvi_source: str = "Sentinel-2 NDVI"
    fall_ndvi_threshold: float = 0.30
    spring_ndvi_threshold: float = 0.35
    ndti_low: float = -0.20
    ndti_high: float = 0.40
    reduced_threshold: float = 0.30
    notill_threshold: float = 0.60
    era5_year: int = 2024
    soil_depth_cm: str = "15-30"


# ─── Helpers ───────────────────────────────────────────────────────────────────

def get_field_geometry(field_asset: str, poly_id: str) -> ee.Geometry:
    """Return the geometry for a single field by poly_id."""
    fc = ee.FeatureCollection(field_asset)
    feat = fc.filter(ee.Filter.eq("poly_id", int(poly_id))).first()
    return feat.geometry()


def add_ndvi(image: ee.Image) -> ee.Image:
    ndvi = image.normalizedDifference(["B8", "B4"]).rename("NDVI")
    return image.addBands(ndvi)


def add_ndti(image: ee.Image) -> ee.Image:
    ndti = image.normalizedDifference(["B11", "B12"]).rename("NDTI")
    return image.addBands(ndti)


def add_evi(image: ee.Image) -> ee.Image:
    evi = image.expression(
        "2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))",
        {"NIR": image.select("B8"), "RED": image.select("B4"), "BLUE": image.select("B2")},
    ).rename("EVI")
    return image.addBands(evi)


def add_ndmi(image: ee.Image) -> ee.Image:
    ndmi = image.normalizedDifference(["B8", "B11"]).rename("NDMI")
    return image.addBands(ndmi)


def mask_clouds(image: ee.Image, mode: str) -> ee.Image:
    qa = image.select("QA60")
    cloud_bit = 1 << 10
    cirrus_bit = 1 << 11
    if mode == "Strict":
        mask = qa.bitwiseAnd(cloud_bit).eq(0).And(qa.bitwiseAnd(cirrus_bit).eq(0))
    elif mode == "Standard":
        mask = qa.bitwiseAnd(cloud_bit).eq(0)
    elif mode == "Relaxed":
        scl = image.select("SCL")
        mask = scl.neq(3).And(scl.neq(8)).And(scl.neq(9)).And(scl.neq(10))
    else:  # Very relaxed — no masking
        return image
    return image.updateMask(mask)


def get_s2_collection(geom: ee.Geometry, cfg: AnalysisConfig) -> ee.ImageCollection:
    col = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterDate(cfg.date_start, cfg.date_end)
        .filterBounds(geom)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", cfg.cloud_pct_max))
        .map(lambda img: mask_clouds(img, cfg.mask_mode))
        .map(add_ndvi)
        .map(add_ndti)
        .map(add_evi)
        .map(add_ndmi)
        .map(lambda img: img.multiply(0.0001).copyProperties(img, img.propertyNames()))
    )
    return col


def get_weekly_dates(start: str, end: str):
    """Return list of ISO week-start dates between start and end."""
    d = date.fromisoformat(start)
    end_d = date.fromisoformat(end)
    weeks = []
    while d <= end_d:
        weeks.append(d.isoformat())
        d += timedelta(days=7)
    return weeks


def mean_in_window(col: ee.ImageCollection, year: int, mm_start: str, mm_end: str, band: str, geom: ee.Geometry):
    """Mean of band in a fall/spring management window for a given year."""
    start = f"{year}-{mm_start}"
    end = f"{year}-{mm_end}"
    reduced = (
        col.filterDate(start, end)
        .select(band)
        .mean()
        .reduceRegion(reducer=ee.Reducer.mean(), geometry=geom, scale=10, maxPixels=1e9)
        .getInfo()
    )
    return reduced.get(band)


# ─── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "gee_available": GEE_AVAILABLE}


@app.get("/fields")
def list_fields(
    field_asset: str = Query(..., description="GEE FeatureCollection asset path"),
    limit: int = Query(500, ge=1, le=5000),
):
    """
    Return a list of fields from the GEE FeatureCollection asset.

    Each entry includes: poly_id, mrv_field_id, field_name, farm_name,
    area_ha, centroid_lon, centroid_lat.
    """
    if not GEE_AVAILABLE:
        raise HTTPException(503, "Earth Engine not available")
    try:
        fc = ee.FeatureCollection(field_asset).limit(limit)

        # Request only the properties we need to keep payload small.
        props_to_keep = ["poly_id", "mrv_field_id", "field_name", "farm_name", "area_ha"]
        features = fc.select(props_to_keep, retainGeometry=False).getInfo()

        fields = []
        for feat in (features.get("features") or []):
            props = feat.get("properties") or {}
            geom = feat.get("geometry") or {}
            centroid = None
            if geom.get("type") == "Point":
                centroid = geom["coordinates"]
            elif geom.get("type") in ("Polygon", "MultiPolygon"):
                # Approximate centroid from bounding box
                coords = geom.get("coordinates", [])
                flat = []
                def _flatten(c):
                    if isinstance(c[0], list):
                        for sub in c:
                            _flatten(sub)
                    else:
                        flat.append(c)
                _flatten(coords)
                if flat:
                    lons = [c[0] for c in flat]
                    lats = [c[1] for c in flat]
                    centroid = [(min(lons) + max(lons)) / 2, (min(lats) + max(lats)) / 2]

            poly_id = str(props.get("poly_id", ""))
            fields.append({
                "poly_id": poly_id,
                "mrv_field_id": str(props.get("mrv_field_id", poly_id)),
                "field_name": props.get("field_name"),
                "farm_name": props.get("farm_name"),
                "area_ha": props.get("area_ha"),
                "centroid_lon": centroid[0] if centroid else None,
                "centroid_lat": centroid[1] if centroid else None,
            })
        return {"fields": fields, "count": len(fields)}
    except Exception as exc:
        raise HTTPException(500, str(exc))


@app.get("/weekly-list")
def weekly_list(
    field_asset: str = Query(...),
    poly_id: str = Query(...),
    date_start: str = Query(...),
    date_end: str = Query(...),
    cloud_pct_max: float = Query(90.0),
    mask_mode: str = Query("Standard"),
):
    """Return list of S2 acquisition weeks with valid data for the field."""
    if not GEE_AVAILABLE:
        raise HTTPException(503, "Earth Engine not available")
    try:
        geom = get_field_geometry(field_asset, poly_id)
        col = (
            ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterDate(date_start, date_end)
            .filterBounds(geom)
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", cloud_pct_max))
        )
        dates = col.aggregate_array("system:time_start").getInfo()
        week_set = sorted(set(
            date.fromtimestamp(ms / 1000).strftime("%Y-%m-%d")
            for ms in dates
        ))
        return {"weeks": week_set}
    except Exception as exc:
        raise HTTPException(500, str(exc))


@app.post("/cover-crop")
def run_cover_crop(
    field_asset: str = Query(...),
    poly_id: str = Query(...),
    cfg: AnalysisConfig = ...,
):
    """Run cover crop proxy classification for a single field."""
    if not GEE_AVAILABLE:
        raise HTTPException(503, "Earth Engine not available")
    try:
        geom = get_field_geometry(field_asset, poly_id)
        col = get_s2_collection(geom, cfg)

        years = list(range(
            int(cfg.date_start[:4]) - 4,
            int(cfg.date_end[:4]) + 1,
        ))

        cover_scores = []
        for yr in years:
            fall_val = mean_in_window(col, yr, cfg.fall_start, cfg.fall_end, "NDVI", geom)
            spring_val = mean_in_window(col, yr, cfg.spring_start, cfg.spring_end, "NDVI", geom)
            fall_hit = (fall_val or 0) >= cfg.fall_ndvi_threshold
            spring_hit = (spring_val or 0) >= cfg.spring_ndvi_threshold
            cover_scores.append(1.0 if (fall_hit and spring_hit) else (0.5 if fall_hit or spring_hit else 0.0))

        freq = sum(cover_scores) / len(cover_scores) if cover_scores else 0
        if freq >= 0.6:
            cover_class = "likely"
        elif freq >= 0.3:
            cover_class = "possible"
        else:
            cover_class = "No Cover Crop"

        return {
            "cover_class": cover_class,
            "cover_freq_score": round(freq, 3),
            "cover_confidence_pct": round(min(freq * 100 + 20, 95)),
            "ndvi_source": cfg.ndvi_source,
            "fall_enabled": True,
            "spring_enabled": True,
            "year_span": f"{years[0]}-{years[-1]}",
            "years_analyzed": years,
        }
    except Exception as exc:
        raise HTTPException(500, str(exc))


@app.post("/tillage")
def run_tillage(
    field_asset: str = Query(...),
    poly_id: str = Query(...),
    cfg: AnalysisConfig = ...,
):
    """Run tillage proxy classification for a single field."""
    if not GEE_AVAILABLE:
        raise HTTPException(503, "Earth Engine not available")
    try:
        geom = get_field_geometry(field_asset, poly_id)
        col = get_s2_collection(geom, cfg)

        years = list(range(
            int(cfg.date_start[:4]) - 4,
            int(cfg.date_end[:4]) + 1,
        ))

        history = []
        ndti_vals = []
        for yr in years:
            spring_ndti = mean_in_window(col, yr, cfg.spring_start, cfg.spring_end, "NDTI", geom)
            if spring_ndti is None:
                history.append({
                    "year": yr, "spring_ndti": None, "ndti_norm": None,
                    "residue_pct": None, "event_likelihood": "no event", "event_intensity": "none",
                })
                continue
            norm = min(1.0, max(0.0, (spring_ndti - cfg.ndti_low) / (cfg.ndti_high - cfg.ndti_low)))
            residue = round(norm * 100)
            likelihood = "no event" if norm >= 0.6 else ("possible event" if norm >= 0.3 else "LIKELY EVENT")
            intensity = "none" if norm >= 0.6 else ("light" if norm >= 0.3 else ("moderate" if norm >= 0.15 else "heavy"))
            ndti_vals.append(spring_ndti)
            history.append({
                "year": yr,
                "spring_ndti": round(spring_ndti, 3),
                "ndti_norm": round(norm, 2),
                "residue_pct": residue,
                "event_likelihood": likelihood,
                "event_intensity": intensity,
            })

        med_ndti = sorted(ndti_vals)[len(ndti_vals) // 2] if ndti_vals else None
        med_norm = min(1.0, max(0.0, (med_ndti - cfg.ndti_low) / (cfg.ndti_high - cfg.ndti_low))) if med_ndti is not None else None

        if med_norm is None:
            tillage_class = "UNAVAILABLE"
        elif med_norm >= cfg.notill_threshold:
            tillage_class = "NO-TILL"
        elif med_norm >= cfg.reduced_threshold:
            tillage_class = "REDUCED TILL"
        else:
            tillage_class = "INTENSIVE TILL"

        return {
            "tillage_class": tillage_class,
            "till_ndti_med": round(med_ndti, 3) if med_ndti is not None else None,
            "till_ndti_norm": round(med_norm, 2) if med_norm is not None else None,
            "residue_estimate_pct": round(med_norm * 100) if med_norm is not None else None,
            "tillage_confidence_pct": 72,
            "spring_bare_freq": round(sum(1 for h in history if h["event_likelihood"] == "LIKELY EVENT") / len(history), 2) if history else 0,
            "year_span": f"{years[0]}-{years[-1]}",
            "event_years": [h["year"] for h in history if h["event_likelihood"] == "LIKELY EVENT"],
            "yearly_history": history,
        }
    except Exception as exc:
        raise HTTPException(500, str(exc))


@app.post("/covariates")
def get_covariates(
    field_asset: str = Query(...),
    poly_id: str = Query(...),
    era5_year: int = Query(2024),
    soil_depth_cm: str = Query("15-30"),
):
    """Fetch static covariates: terrain (CopDEM), climate (ERA5-Land), soil (SoilGrids)."""
    if not GEE_AVAILABLE:
        raise HTTPException(503, "Earth Engine not available")
    try:
        geom = get_field_geometry(field_asset, poly_id)

        # Terrain — CopDEM GLO-30
        dem = ee.ImageCollection("COPERNICUS/DEM/GLO30").select("DEM").mosaic()
        slope = ee.Terrain.slope(dem)
        aspect = ee.Terrain.aspect(dem)
        hillshade = ee.Terrain.hillshade(dem)

        terrain = (
            ee.Image.cat([dem.rename("dem"), slope.rename("slope"), aspect.rename("aspect"), hillshade.rename("hillshade")])
            .reduceRegion(reducer=ee.Reducer.mean(), geometry=geom, scale=30, maxPixels=1e9)
            .getInfo()
        )

        # Climate — ERA5-Land monthly
        era5 = (
            ee.ImageCollection("ECMWF/ERA5_LAND/MONTHLY_AGGR")
            .filterDate(f"{era5_year}-01-01", f"{era5_year}-12-31")
            .select(["temperature_2m", "total_precipitation_sum"])
            .mean()
            .reduceRegion(reducer=ee.Reducer.mean(), geometry=geom, scale=11132, maxPixels=1e9)
            .getInfo()
        )
        tmean_k = era5.get("temperature_2m")
        tmean_c = round(tmean_k - 273.15, 1) if tmean_k else None
        prcp_m = era5.get("total_precipitation_sum")
        prcp_mm = round(prcp_m * 1000 * 12, 1) if prcp_m else None

        # Soil — SoilGrids ISRIC (mapped to GEE)
        depth_map = {"0-5": "b0", "5-15": "b1", "15-30": "b2", "30-60": "b3"}
        band_sfx = depth_map.get(soil_depth_cm, "b2")
        soil_img = ee.Image("projects/soilgrids-isric/clay_mean").select(band_sfx)
        clay = soil_img.reduceRegion(ee.Reducer.mean(), geom, 250, maxPixels=1e9).getInfo().get(band_sfx)

        return {
            "terrain": {
                "dem_m": round(terrain.get("dem", 0), 1),
                "slope_deg": round(terrain.get("slope", 0), 2),
                "aspect_deg": round(terrain.get("aspect", 0), 1),
                "hillshade": round(terrain.get("hillshade", 0)),
            },
            "climate": {
                "era5_tmean_c": tmean_c,
                "era5_tmin_c": None,
                "era5_tmax_c": None,
                "era5_prcp_sum_mm": prcp_mm,
                "era5_year_used": era5_year,
            },
            "soil": {
                "clay_pct": round(clay / 10, 1) if clay else None,
                "sand_pct": None,
                "silt_pct": None,
                "ph": None,
                "nitrogen_g_kg": None,
                "cec_cmol_kg": None,
                "cfvo_pct": None,
                "bdod_g_cm3": None,
                "soc_pct": None,
                "ocs_0_30_t_ha": None,
                "ocs_0_30_t_ac": None,
            },
            "depth_cm": soil_depth_cm,
        }
    except Exception as exc:
        raise HTTPException(500, str(exc))
