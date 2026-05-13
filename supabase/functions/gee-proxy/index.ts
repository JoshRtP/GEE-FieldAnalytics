import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * GEE Proxy Edge Function
 *
 * Forwards requests to the Python GEE backend (FastAPI + ADC).
 * The backend URL is configured via the GEE_BACKEND_URL secret.
 *
 * Routes forwarded:
 *   GET  /gee-proxy/health
 *   GET  /gee-proxy/weekly-list?field_asset=...&poly_id=...&date_start=...&date_end=...
 *   POST /gee-proxy/cover-crop?field_asset=...&poly_id=...  (body: AnalysisConfig JSON)
 *   POST /gee-proxy/tillage?field_asset=...&poly_id=...     (body: AnalysisConfig JSON)
 *   POST /gee-proxy/covariates?field_asset=...&poly_id=...  (body: { era5_year, soil_depth_cm })
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const backendUrl = Deno.env.get("GEE_BACKEND_URL");
    if (!backendUrl) {
      return new Response(
        JSON.stringify({ error: "GEE_BACKEND_URL not configured", available: false }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Strip the /gee-proxy prefix from the path and forward everything else
    const url = new URL(req.url);
    const upstreamPath = url.pathname.replace(/^\/functions\/v1\/gee-proxy/, "");
    const upstreamUrl = `${backendUrl.replace(/\/$/, "")}${upstreamPath}${url.search}`;

    const upstreamReq = new Request(upstreamUrl, {
      method: req.method,
      headers: { "Content-Type": "application/json" },
      body: req.method !== "GET" ? req.body : undefined,
    });

    const upstream = await fetch(upstreamReq);
    const data = await upstream.json();

    return new Response(JSON.stringify(data), {
      status: upstream.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: message, available: false }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
