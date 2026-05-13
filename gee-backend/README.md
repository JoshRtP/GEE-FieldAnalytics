# FieldAnalytics GEE Backend

FastAPI service that wraps the Google Earth Engine Python API.
Supports three authentication modes — no OAuth popup required.

## Authentication (choose one)

### Option A — Application Default Credentials (recommended for local dev)

```bat
# 1. Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install
# 2. Authenticate (opens browser once)
gcloud auth application-default login

# 3. Start the backend
cd gee-backend
start.bat
```

ADC writes credentials to `%APPDATA%\gcloud\application_default_credentials.json`.
On Cloud Run / GCE the attached service account is used automatically.

### Option B — Service Account Key (recommended for production / CI)

1. Create a service account in your GCP project and grant it the **Earth Engine Resource Viewer** role.
2. Download the JSON key file.
3. Set the env var (raw JSON or base64-encoded):

```bat
set GEE_SERVICE_ACCOUNT_KEY_JSON=<paste entire JSON here>
uvicorn main:app --host 0.0.0.0 --port 8000
```

Or point to the file:
```bat
set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\key.json
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Setup

```bat
# 1. Install dependencies (Python 3.11+)
pip install -r requirements.txt

# 2. Authenticate (Option A above)
gcloud auth application-default login

# 3. Start the server
start.bat
```

Server: http://localhost:8000  
Swagger docs: http://localhost:8000/docs

## Connecting the frontend

Create `.env.local` in the project root (copy from `.env.local.example`):

```
GEE_BACKEND_URL=http://localhost:8000
```

The Next.js API proxy at `/api/gee/*` forwards all GEE calls to this backend.
The frontend automatically falls back to mock data when the backend is unreachable.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | GEE connectivity check |
| GET | `/fields` | List fields from a GEE FeatureCollection asset |
| GET | `/weekly-list` | S2 acquisition weeks for a field/date range |
| POST | `/cover-crop` | Cover crop proxy classification |
| POST | `/tillage` | Tillage proxy classification |
| POST | `/covariates` | Terrain (CopDEM), climate (ERA5-Land), soil (SoilGrids) |

## Production deployment

### Cloud Run

```bash
gcloud run deploy gee-backend \
  --source . \
  --region europe-west1 \
  --service-account your-ee-sa@your-project.iam.gserviceaccount.com \
  --set-env-vars GEE_PROJECT=gen-lang-client-0499108456
```

Then set `GEE_BACKEND_URL=https://gee-backend-xxx-ew.a.run.app` in your hosting environment's env vars.
