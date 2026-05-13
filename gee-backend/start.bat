@echo off
REM ─── GEE Backend startup script (Windows) ────────────────────────────────────
REM Run this from the gee-backend directory.

cd /d "%~dp0"

REM Optional: activate a virtual environment if you use one.
REM call .venv\Scripts\activate.bat

echo Starting FieldAnalytics GEE backend on http://localhost:8000 ...
echo.
echo Make sure you have authenticated first:
echo   gcloud auth application-default login
echo.
echo Or set GEE_SERVICE_ACCOUNT_KEY_JSON for service account auth.
echo.

uvicorn main:app --host 0.0.0.0 --port 8000 --reload
