

/*******************************************************
 * Field Analytics — ON-DEMAND (S2 + optional S1 + MODIS)
 * + STATIC COVARIATES (Terrain/CopDEM + ERA5-Land Climate + SoilGrids ISRIC)
 * PHASE 5: NDTI overlay NDVI mask threshold raised 0.35 → 0.65
 *
 * Changes from Phase 4 (EMEA-Phase4CovWIP.js):
 *  - NDTI overlay mask threshold raised from 0.35 to 0.65. The 0.35 threshold
 *    inadvertently blanked out no-till spring fields where greening wheat/cover
 *    crop grows through the residue (NDVI 0.35–0.55) — hiding the blue residue
 *    signal that confirms no-till practice. 0.65 masks only dense closed-canopy
 *    summer pixels (maize/wheat July-Aug, NDVI ~0.70-0.90) as originally intended.
 *  - Colour guide NDTI note updated accordingly
 *  - auto-analysis fires on field click when Run/Update has been called
 *******************************************************/

/* =========================
 * DEBUG SWITCH
 * ========================= */
var DEBUG = true;   // set false to silence console prints

/* ---------- USER ASSETS ---------- */
var FIELD_ASSET = 'projects/gen-lang-client-0499108456/assets/EMEA_France_26';
// IACS Germany crop attributes — spatial join with EMEA_1127.
// NOTE: The public DE_LSA dataset (Zenodo 18670815, v1.3) covers lon 6.67–11.60°E only.
// Fields near Alsleben an der Saale (11.735°E) fall outside the public coverage area.
// Falling back to JRC EUCROPMAP catalog (in the else branch below).
// Re-enable by setting this to a GEE asset if a suitable IACS source is obtained
// that covers Salzlandkreis / eastern Saxony-Anhalt.
var IACS_ASSET  = '';
var CSB_ASSET   = ''; // (was TIGER/2018/Counties — US-only, not needed for EMEA)

/* ---------- GLOBALS ---------- */
Map.setOptions('SATELLITE');

var state = {
  s2Base: null,
  s1Base: null,
  allWeeksWithScenes: [],
  refinedWeeks: [],
  lastGeom: null,
  lastPid: null,
  contactSheetPopup: null,
  showCoverLayer: false,
  showTillageLayer: false,
  showUsdaS2Layer: false,
  showEntropyLayer: false,
  showNdtiLayer: false,
  showTillageEventLayer: false,
  cdlYearUsed: null,
  selectedClassPanel: null,
  selectedClassByTitle: {},
  mgmtResultsPanel: null,
  mgmtResultByTitle: {},
  mgmtYears: [],
  mgmtProxyImage: null,
  annualMgmtImage: null,
  lastMgmtGeomHash: null
};

/* ---------- CDL overlay (latest) + helpers ---------- */
var CDL_FIRST = 2008;
var CDL_LAST  = 2024; // update when newer year is available
var CDL_FALLBACK = 2024;
var ENTROPY_FIRST_YEAR = 2008;
var CDL_2025_OVERRIDE_ASSET = '';
var USDA_S2_LAYER_NAME = 'Sentinel-2 MSI (USDA style)';
var USDA_ENTROPY_LAYER_NAME = 'Temporal Crop Entropy (USDA style)';
var NDTI_LAYER_NAME = 'NDTI Overlay (Tillage Indicator)';
var TILL_EVENT_LAYER_NAME = 'Likely Tillage Event Mask';
var EUCROPMAP_LAYER_NAME = 'EUCROPMAP Crop Types';
// EUCROPMAP remap arrays and CDL-matched palette — kept here so refreshEucropLayer()
// and the click-popup color lookup both reference the same single definition.
var EUCROPMAP_FROM = [100,211,212,213,214,215,216,217,218,219,221,222,223,230,231,232,233,240,250,290,300,500,600,700,800];
var EUCROPMAP_TO   = [  0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
var EUCROPMAP_PALETTE = [
  '9B9B9B', // 0  Artificial
  'AAA000', // 1  Common wheat      → CDL Winter Wheat
  'D69EBC', // 2  Durum wheat        → CDL Durum Wheat
  'A57000', // 3  Barley             → CDL Barley
  '73008C', // 4  Rye                → CDL Rye
  '732600', // 5  Oats               → CDL Oats
  'FFD300', // 6  Maize              → CDL Corn
  '00A8E2', // 7  Rice               → CDL Rice
  'D1FF73', // 8  Triticale          → CDL Spring Wheat analogue
  '73D2F5', // 9  Other cereals      → CDL Other Small Grains
  'FF6666', // 10 Potatoes           → CDL Potatoes
  'FF6CA6', // 11 Sugar beet         → CDL Sugarbeets
  'FFB28C', // 12 Other root crops
  'D1C26B', // 13 Other industrial   → CDL Rape Seed
  'FFFF00', // 14 Sunflower          → CDL Sunflower
  'D1C26B', // 15 Rapeseed           → CDL Rape Seed
  '267000', // 16 Soya               → CDL Soybeans
  'A5F28C', // 17 Dry pulses         → CDL Dry Beans
  '00AF49', // 18 Fodder crops       → CDL Alfalfa
  'B5B26E', // 19 Bare arable        → CDL Fallow/Idle
  '6CA966', // 20 Woodland/Shrubland → CDL Deciduous Forest
  'E8FFBF', // 21 Grasslands         → CDL Grassland/Pasture
  '827D7E', // 22 Bare land          → CDL Barren Land
  '4897D8', // 23 Water              → CDL Open Water
  '7FC7C7'  // 24 Wetlands           → CDL Woody Wetlands
];

// ── IACS crop-layer support ────────────────────────────────────────────────
// Maps EC_hcat_n text values (from HIACS v1.3) → EUCROPMAP_PALETTE indices
// so IACS and EUCROPMAP layers share the same color scheme.
var IACS_LAYER_NAME = 'IACS Crop Types (HIACS v1.3)';
var IACS_HCAT_TO_IDX = {
  // Wheat
  'winter_common_soft_wheat':  1,  'spring_common_soft_wheat':  1,
  // Durum wheat
  'winter_durum_hard_wheat':   2,  'spring_durum_hard_wheat':   2,
  // Barley
  'winter_barley':             3,  'spring_barley':             3,
  // Rye / millet / sorghum
  'millet_sorghum':            4,
  // Oats
  'spring_oats':               5,  'winter_oats':               5,
  // Maize
  'grain_maize_corn_popcorn':  6,
  // Triticale
  'winter_triticale':          8,
  // Other cereals
  'other_cereals':             9,  'cereal_legume_mix':         9,  'buckwheat': 9,
  // Potatoes
  'potatoes':                  10,
  // Legumes / pulses / vegetables (grouped)
  'legumes_dried_pulses_protein_crops': 12,
  'beans': 12,  'chickpeas': 12,  'lentils': 12,
  'chard': 12,  'leek': 12,  'celery': 12,  'carrots_daucus': 12,
  // Other non-permanent industrial
  'oilseed_crops': 13,  'mustard': 13,  'brassica_oleracea_cabbage': 13,
  'aromatic_medicinal_culinary_plants_spices_herbs': 13,
  // Sunflower
  'sunflower': 14,
  // Rapeseed / flax / hemp / poppy
  'winter_rapeseed_rape': 15,  'flax_linen': 15,  'poppy': 15,  'hemp_cannabis': 15,
  // Soya
  'soy_soybeans': 16,
  // Dry pulses
  'peas': 17,
  // Fodder / cover crops
  'alfalfa_lucerne': 18,  'clover': 18,  'temporary_grass': 18,
  // Bare / fallow
  'fallow_land_not_crop': 19,
  // Grassland / pasture / margins
  'pasture_meadow_grassland_grass': 21,
  'field_margins_buffer_strips_flowering_areas': 21
};

function refreshEucropLayer(year) {
  removeLayerByName(EUCROPMAP_LAYER_NAME);
  // Pick the most recent image whose year is <= the requested year.
  // Using lte on system:time_start means new collection releases (e.g. 2025)
  // are automatically used without any code change.
  var img = ee.ImageCollection('JRC/D5/EUCROPMAP/V1')
    .filter(ee.Filter.lte('system:time_start', ee.Date(year + '-12-31').millis()))
    .sort('system:time_start', false)
    .first().select('classification');
  var remapped = img.remap(EUCROPMAP_FROM, EUCROPMAP_TO, -1);
  remapped = remapped.updateMask(remapped.gte(0));
  Map.addLayer(
    remapped.clipToCollection(fields),
    {min: 0, max: 24, palette: EUCROPMAP_PALETTE},
    EUCROPMAP_LAYER_NAME, true, 0.75
  );
}
function cdlImage(year){
  if (Number(year) === 2025 && CDL_2025_OVERRIDE_ASSET && CDL_2025_OVERRIDE_ASSET.length > 0) {
    return ee.Image(CDL_2025_OVERRIDE_ASSET).select('cropland');
  }
  return ee.Image('USDA/NASS/CDL/' + year).select('cropland');
}
function activeCdlYear(){ return state.cdlYearUsed || CDL_LAST; }
function cdlLegendDict(){
  return {
    '1': 'Corn','2': 'Cotton','3': 'Rice','4': 'Sorghum','5': 'Soybeans','6': 'Sunflower',
    '10': 'Peanuts','11': 'Tobacco','12': 'Sweet Corn','13': 'Pop or Orn Corn','14': 'Mint',
    '21': 'Barley','22': 'Durum Wheat','23': 'Spring Wheat','24': 'Winter Wheat','25': 'Other Small Grains',
    '26': 'Dbl Crop WinWht/Soybeans','27': 'Rye','28': 'Oats','29': 'Millet','30': 'Speltz',
    '31': 'Canola','32': 'Flaxseed','33': 'Safflower','34': 'Rape Seed','35': 'Mustard',
    '36': 'Alfalfa','37': 'Other Hay/Non Alfalfa','38': 'Camelina','39': 'Buckwheat',
    '41': 'Sugarbeets','42': 'Dry Beans','43': 'Potatoes','44': 'Other Crops','45': 'Sugarcane',
    '46': 'Sweet Potatoes','47': 'Misc Vegs & Fruits','48': 'Watermelons','49': 'Onions','50': 'Cucumbers',
    '51': 'Chick Peas','52': 'Lentils','53': 'Peas','54': 'Tomatoes','55': 'Caneberries','56': 'Hops',
    '57': 'Herbs','58': 'Clover/Wildflowers','59': 'Sod/Grass Seed','60': 'Switchgrass','61': 'Fallow/Idle Cropland',
    '63': 'Forest','64': 'Shrubland','65': 'Barren','81': 'Clouds/No Data','82': 'Developed','83': 'Water',
    '87': 'Wetlands','88': 'Nonag/Undefined','92': 'Aquaculture','111': 'Open Water','112': 'Perennial Ice/Snow',
    '121': 'Developed/Open Space','122': 'Developed/Low Intensity','123': 'Developed/Med Intensity','124': 'Developed/High Intensity',
    '131': 'Barren Land','141': 'Deciduous Forest','142': 'Evergreen Forest','143': 'Mixed Forest','152': 'Shrubland',
    '176': 'Grassland/Pasture','190': 'Woody Wetlands','195': 'Herbaceous Wetlands'
  };
}

/* ---------- UI ---------- */
var uiPanel = ui.Panel({style:{width:'800px'}});
ui.root.insert(0, uiPanel);
uiPanel.add(ui.Label('Field Analytics — On-Demand (S2 + S1 + MODIS) + Covariates (EMEA)', {
  fontWeight:'bold', fontSize:'16px'
}));

// Always-visible panel width control so the map area can be expanded quickly.
// Drag left = wider panel / drag right = narrower panel = more map.
var uiWidthSlider = ui.Slider({
  min: 300, max: 1100, value: 800, step: 10,
  style: {stretch: 'horizontal', margin: '0 4px'}
});
uiWidthSlider.onChange(function(v){ uiPanel.style().set('width', v + 'px'); });
uiPanel.add(ui.Panel(
  [ui.Label('↓ Panel width', {color:'#666', fontSize:'11px', margin:'4px 4px 0 0'}),
   uiWidthSlider,
   ui.Label('(drag to resize)', {color:'#999', fontSize:'10px', margin:'4px 0 0 2px'})],
  ui.Panel.Layout.flow('horizontal'),
  {margin:'0 0 2px 0', padding:'0'}
));

// Timeline thumbnail size override: 0 = auto-size by frame count; >0 = fixed px per thumb.
var timelineSizeSlider = ui.Slider({
  min: 0, max: 200, value: 0, step: 10,
  style: {stretch: 'horizontal', margin: '0 4px'}
});
// Timeline popup height override: 0 = auto; >0 = fixed max height in px for the grid area.
var timelineHeightSlider = ui.Slider({
  min: 0, max: 800, value: 0, step: 20,
  style: {stretch: 'horizontal', margin: '0 4px'}
});
uiPanel.add(ui.Panel(
  [ui.Panel(
    [ui.Label('↓ Timeline thumb size', {color:'#666', fontSize:'11px', margin:'4px 4px 0 0'}),
     timelineSizeSlider,
     ui.Label('(0=auto)', {color:'#999', fontSize:'10px', margin:'4px 0 0 2px'})],
    ui.Panel.Layout.flow('horizontal'), {stretch:'horizontal', margin:'0 0 2px 0'}),
   ui.Panel(
    [ui.Label('↓ Timeline height', {color:'#666', fontSize:'11px', margin:'4px 4px 0 0'}),
     timelineHeightSlider,
     ui.Label('(0=auto)', {color:'#999', fontSize:'10px', margin:'4px 0 0 2px'})],
    ui.Panel.Layout.flow('horizontal'), {stretch:'horizontal', margin:'0'})],
  ui.Panel.Layout.flow('vertical'),
  {margin:'0 0 4px 0', padding:'0'}
));

var startBox   = ui.Textbox({placeholder:'YYYY-MM-DD', value:'2025-02-01', style:{width:'140px'}});
var endBox     = ui.Textbox({placeholder:'YYYY-MM-DD', value:'2025-07-01', style:{width:'140px'}});
var cloudSlide = ui.Slider({min:0,max:100,value:90,step:1,style:{stretch:'horizontal'}});
var sarToggle  = ui.Checkbox({label:'Include Sentinel-1 SAR (VV, VH, VH/VV)', value:false});
var minValidPct= ui.Slider({min:0,max:100,value:20,step:5,style:{width:'160px'}});
var maskMode   = ui.Select({items:['Strict','Standard','Relaxed','Very relaxed'], value:'Standard'});

uiPanel.add(ui.Label('Date range'));
uiPanel.add(ui.Panel(
  [ui.Label('Start'), startBox, ui.Label('End'), endBox],
  ui.Panel.Layout.flow('horizontal'),
  {stretch:'horizontal', margin:'4px 0'}
));

/* Field search controls */
var searchRow = ui.Panel({layout:ui.Panel.Layout.flow('horizontal')});
var searchBox = ui.Textbox({placeholder:'Enter poly_id (e.g., 69005)', style:{width:'200px'}});
var searchBtn = ui.Button({label:'Find Field', style:{color:'blue'}});
searchRow.add(ui.Label('Search:')).add(searchBox).add(searchBtn);
uiPanel.add(searchRow);

/* Contact sheet controls */
var sheetRow  = ui.Panel({layout:ui.Panel.Layout.flow('horizontal')});
var sheetIdx  = ui.Select({items:['NDVI','EVI','NDTI','NDMI','S2','ALL'], value:'NDVI'});
var naipMaxAgeDays = 365;
var lsMaxDeltaDays = 45;
var sheetN    = ui.Slider({min:6,max:52,value:24,step:1,style:{width:'160px'}});
var showSheet = ui.Button({label:'Visual Timeline'});
var hideInvalid = ui.Checkbox({label:'Hide invalid S2 weeks', value:false});
sheetRow.add(ui.Label('Index')).add(sheetIdx).add(ui.Label('Frames')).add(sheetN).add(showSheet);
uiPanel.add(sheetRow);
uiPanel.add(hideInvalid);

// Run / Update
var runBtn = ui.Button({label:'Run / Update', style:{stretch:'horizontal'}});
uiPanel.add(runBtn);

// Phase 1 analysis controls
var coverCropBtn = ui.Button({label:'Cover Crop Analysis', style:{color:'#1f7a1f'}});
var tillageBtn = ui.Button({label:'Tillage Detection', style:{color:'#0b5394'}});
var toggleCoverLayerBtn = ui.Button({label:'Toggle Cover Proxy', style:{color:'#1f7a1f'}});
var toggleTillageLayerBtn = ui.Button({label:'Toggle Tillage Proxy', style:{color:'#0b5394'}});
var exportFieldClassesBtn = ui.Button({label:'Export Field Classes (CSV)', style:{color:'#6a1b9a'}});
var mgmtRow1 = ui.Panel([coverCropBtn, tillageBtn], ui.Panel.Layout.flow('horizontal'));
var mgmtRow2 = ui.Panel([toggleCoverLayerBtn, toggleTillageLayerBtn], ui.Panel.Layout.flow('horizontal'));
var mgmtRow3 = ui.Panel([exportFieldClassesBtn], ui.Panel.Layout.flow('horizontal'));
uiPanel.add(mgmtRow1);
uiPanel.add(mgmtRow2);
uiPanel.add(mgmtRow3);

/* Management window & threshold controls */
var mgmtWindowsPanel = ui.Panel({layout: ui.Panel.Layout.flow('vertical'),
  style:{border:'1px solid #aaa', padding:'6px', margin:'4px 0', backgroundColor:'#f8fff8'}});
mgmtWindowsPanel.add(ui.Label('Management Detection Windows & Thresholds', {fontWeight:'bold', fontSize:'12px', color:'#1f4a1f'}));

var fallStartBox  = ui.Textbox({value:'09-01', style:{width:'70px'}});
var fallEndBox    = ui.Textbox({value:'11-30', style:{width:'70px'}});
mgmtWindowsPanel.add(ui.Panel(
  [ui.Label('Fall window (MM-DD):'), fallStartBox, ui.Label('->'), fallEndBox],
  ui.Panel.Layout.flow('horizontal'), {margin:'2px 0'}));

var springStartBox = ui.Textbox({value:'02-01', style:{width:'70px'}});
var springEndBox   = ui.Textbox({value:'05-15', style:{width:'70px'}});
mgmtWindowsPanel.add(ui.Panel(
  [ui.Label('Spring window (MM-DD):'), springStartBox, ui.Label('->'), springEndBox],
  ui.Panel.Layout.flow('horizontal'), {margin:'2px 0'}));

var includeFallCoverChk = ui.Checkbox({label:'Use fall window in cover detection', value:true});
var includeSpringCoverChk = ui.Checkbox({label:'Use spring window in cover detection', value:true});
mgmtWindowsPanel.add(ui.Panel(
  [includeFallCoverChk, includeSpringCoverChk],
  ui.Panel.Layout.flow('horizontal'), {margin:'2px 0'}));

var coverNdviSourceSel = ui.Select({
  items: ['Sentinel-2 NDVI', 'MODIS NDVI (Terra + Aqua)'],
  value: 'Sentinel-2 NDVI',
  style: {width:'210px'}
});
mgmtWindowsPanel.add(ui.Panel(
  [ui.Label('Cover NDVI source:'), coverNdviSourceSel],
  ui.Panel.Layout.flow('horizontal'), {margin:'2px 0'}));

var ccFallNdviSlider   = ui.Slider({min:0.1, max:0.6, value:0.30, step:0.05, style:{width:'120px'}});
var ccSpringNdviSlider = ui.Slider({min:0.1, max:0.6, value:0.35, step:0.05, style:{width:'120px'}});
mgmtWindowsPanel.add(ui.Panel(
  [ui.Label('Cover crop: fall NDVI thresh'), ccFallNdviSlider, ui.Label('spring NDVI thresh'), ccSpringNdviSlider],
  ui.Panel.Layout.flow('horizontal'), {margin:'2px 0'}));

var tillNdtiLowSlider  = ui.Slider({min:-0.40, max:0.20, value:-0.20, step:0.01, style:{width:'110px'}});
var tillNdtiHighSlider = ui.Slider({min: 0.00, max:0.70, value: 0.40, step:0.01, style:{width:'110px'}});
mgmtWindowsPanel.add(ui.Panel(
  [ui.Label('Tillage NDTI normalize: low'), tillNdtiLowSlider,
   ui.Label('high'), tillNdtiHighSlider],
  ui.Panel.Layout.flow('horizontal'), {margin:'2px 0'}));

var tillReducedNormSlider = ui.Slider({min:0.10, max:0.70, value:0.30, step:0.05, style:{width:'110px'}});
var tillNoTillNormSlider  = ui.Slider({min:0.30, max:0.95, value:0.60, step:0.05, style:{width:'110px'}});
mgmtWindowsPanel.add(ui.Panel(
  [ui.Label('Class cutoffs: Reduced >='), tillReducedNormSlider,
   ui.Label('No-till >='), tillNoTillNormSlider],
  ui.Panel.Layout.flow('horizontal'), {margin:'2px 0'}));

uiPanel.add(mgmtWindowsPanel);

var nowUtc = new Date();
var usdaS2DefaultEnd = toYmd(nowUtc);
var usdaS2DefaultStart = toYmd(new Date(nowUtc.getTime() - (30 * 24 * 60 * 60 * 1000)));
var usdaS2StartBox = ui.Textbox({value: usdaS2DefaultStart, style:{width:'110px'}});
var usdaS2EndBox = ui.Textbox({value: usdaS2DefaultEnd, style:{width:'110px'}});
var usdaS2CloudSlider = ui.Slider({min:0,max:100,value:20,step:1,style:{width:'140px'}});
var entropyYearBox = ui.Textbox({value:String(CDL_FALLBACK), style:{width:'80px'}});
var toggleUsdaS2Btn = ui.Button({label:'Toggle Sentinel-2 MSI (USDA style)', style:{color:'#006d77'}});
var toggleEntropyBtn = ui.Button({label:'Toggle Temporal Crop Entropy', style:{color:'#7f5539'}});
var toggleNdtiBtn = ui.Button({label:'Toggle NDTI Overlay', style:{color:'#9c2706'}});
var ndtiEventThreshSlider = ui.Slider({min:-0.2,max:0.3,value:0.05,step:0.01,style:{width:'120px'}});
var ndviEventMaxSlider = ui.Slider({min:0,max:0.5,value:0.25,step:0.01,style:{width:'120px'}});
var ndmiEventMaxSlider = ui.Slider({min:-0.2,max:0.3,value:0.10,step:0.01,style:{width:'120px'}});
var toggleTillageEventBtn = ui.Button({label:'Toggle Likely Tillage Event Mask', style:{color:'#ad1457'}});

var usdaPanel = ui.Panel({layout: ui.Panel.Layout.flow('vertical'),
  style:{border:'1px solid #aaa', padding:'6px', margin:'4px 0', backgroundColor:'#f6fbff'}});
usdaPanel.add(ui.Label('S2 / Sentinel Feature Layers', {fontWeight:'bold', fontSize:'12px', color:'#143a52'}));
usdaPanel.add(ui.Panel(
  [ui.Label('S2 start'), usdaS2StartBox, ui.Label('end'), usdaS2EndBox],
  ui.Panel.Layout.flow('horizontal'), {margin:'2px 0'}));
usdaPanel.add(ui.Panel(
  [ui.Label('S2 cloud <= '), usdaS2CloudSlider, ui.Label('Entropy year'), entropyYearBox],
  ui.Panel.Layout.flow('horizontal'), {margin:'2px 0'}));
usdaPanel.add(ui.Panel([toggleUsdaS2Btn, toggleEntropyBtn], ui.Panel.Layout.flow('horizontal'), {margin:'2px 0'}));
usdaPanel.add(ui.Panel([toggleNdtiBtn, toggleTillageEventBtn], ui.Panel.Layout.flow('horizontal'), {margin:'2px 0'}));
usdaPanel.add(ui.Label('Tillage event sensitivity', {fontWeight:'bold', fontSize:'11px', color:'#444'}));
usdaPanel.add(ui.Panel(
  [ui.Label('NDTI <= '), ndtiEventThreshSlider, ui.Label('NDVI <= '), ndviEventMaxSlider, ui.Label('NDMI <= '), ndmiEventMaxSlider],
  ui.Panel.Layout.flow('horizontal'), {margin:'2px 0'}));
uiPanel.add(usdaPanel);

var statusLabel = ui.Label('Ready. Click "Run / Update".', {color:'#666'});
uiPanel.add(statusLabel);

// Advanced options (collapsible)
var advExpanded = false;
var advToggle = ui.Button({label: 'Advanced options ▸', style:{color:'#444'}});
var advPanel = ui.Panel({layout: ui.Panel.Layout.flow('vertical')});
advPanel.style().set('shown', false);
advToggle.onClick(function(){
  advExpanded = !advExpanded;
  advPanel.style().set('shown', advExpanded);
  advToggle.setLabel(advExpanded ? 'Advanced options ▾' : 'Advanced options ▸');
});
advPanel.add(ui.Label('S2 CLOUDY_PIXEL_PERCENTAGE ≤'));
advPanel.add(cloudSlide);
advPanel.add(sarToggle);
advPanel.add(ui.Panel(
  [ui.Label('Min valid pixels in field (%)'), minValidPct],
  ui.Panel.Layout.flow('horizontal')
));
advPanel.add(ui.Panel([ui.Label('Mask mode'), maskMode], ui.Panel.Layout.flow('horizontal')));

// Overlay controls
var overlayRow   = ui.Panel({layout:ui.Panel.Layout.flow('horizontal')});
var weekSelect   = ui.Select({items:[], placeholder:'Pick a week'});
var indexSelect  = ui.Select({items:['NDVI','EVI','NDTI','NDMI','S2','All'], value:'NDVI'});
var alphaSlider  = ui.Slider({min:0,max:1,value:0.8,step:0.05,style:{width:'120px'}});
overlayRow.add(ui.Label('Week')).add(weekSelect)
          .add(ui.Label('Index')).add(indexSelect)
          .add(ui.Label('Opacity')).add(alphaSlider);
uiPanel.add(overlayRow);

var addOverlayBtn   = ui.Button({label:'Add overlay to map'});
var clearOverlayBtn = ui.Button({label:'Clear overlays (keep fields)'});
var baseDimSlider   = ui.Slider({min:0,max:1,value:0.3,step:0.05,style:{width:'120px'}});
uiPanel.add(ui.Panel([addOverlayBtn, clearOverlayBtn], ui.Panel.Layout.flow('horizontal')));
advPanel.add(ui.Panel([ui.Label('Basemap dim'), baseDimSlider], ui.Panel.Layout.flow('horizontal')));

/* Photo overlay controls */
var photoSourceSel = ui.Select({
  items: ['S2 True Color', 'Landsat-9', 'S2 → Landsat'],
  value: 'S2 True Color',
  style: {width: '220px'}
});
var photoBtn = ui.Button({label:'Add Photo Overlay', style:{color:'#0b7285'}});
var photoRow = ui.Panel({layout: ui.Panel.Layout.flow('horizontal')});
photoRow.add(ui.Label('Photo source order')).add(photoSourceSel).add(photoBtn);
advPanel.add(photoRow);

function updateWeekSelect(items, selectedValue) {
  var widgets = overlayRow.widgets();
  for (var i = 0; i < widgets.length(); i++) {
    var widget = widgets.get(i);
    if (widget === weekSelect) { overlayRow.remove(widget); break; }
  }
  weekSelect = ui.Select({items: items || [], value: selectedValue, placeholder: 'Pick a week'});
  overlayRow.insert(1, weekSelect);
}

/* ---------- Fields (with optional CSBID) ---------- */
function choosePolyId(f){
  var names = f.propertyNames();
  var pid = ee.Algorithms.If(names.contains('field_id'),    f.get('field_id'),
           ee.Algorithms.If(names.contains('Field_ID'),    f.get('Field_ID'),
           ee.Algorithms.If(names.contains('mrv_field_id'), f.get('mrv_field_id'),
           ee.Algorithms.If(names.contains('ID'),          f.get('ID'),
           ee.Algorithms.If(names.contains('id'),          f.get('id'),
           f.id())))));
  return ee.String(pid);
}

var fields = ee.FeatureCollection(FIELD_ASSET)
  .map(function(f){ return f.set('poly_id', choosePolyId(f)); });

if (CSB_ASSET && CSB_ASSET.length > 0) {
  var csb = ee.FeatureCollection(CSB_ASSET);
  fields = fields.map(function(f){
    var hit = csb.filterBounds(f.geometry()).first();
    return ee.Feature(ee.Algorithms.If(
      hit,
      ee.Feature(f).set('CSBID', ee.Feature(hit).get('CSBID')),
      f
    ));
  });
}

Map.centerObject(fields, 8);
Map.addLayer(fields.style({color:'cyan', width:2, fillColor:'00000000'}), {}, 'Fields');
refreshEucropLayer(new Date().getFullYear().toString()); // load CDL-colored crop map; uses most recent available EUCROPMAP year

/* ---------- Helpers ---------- */
function validateDateRange(start, end) {
  try {
    var s = ee.Date(start); var e = ee.Date(end);
    var ok = e.difference(s,'day').gt(0);
    return {valid: ok, s: s, e: e};
  } catch (err) {
    return {valid: false};
  }
}
function isValidIsoDate(text){
  if (!/^\d{4}-\d{2}-\d{2}$/.test((text || '').trim())) { return false; }
  var d = new Date(text + 'T00:00:00Z');
  return !isNaN(d.getTime());
}
function toYmd(dateObj){
  var y = dateObj.getUTCFullYear();
  var m = ('0' + (dateObj.getUTCMonth() + 1)).slice(-2);
  var d = ('0' + dateObj.getUTCDate()).slice(-2);
  return y + '-' + m + '-' + d;
}
function weeklySequence(start, end){
  var s = ee.Date(start), e = ee.Date(end);
  var days = e.difference(s,'day');
  var weeks = days.divide(7).floor().max(1);
  return ee.List.sequence(0, weeks.subtract(1))
           .map(function(i){ return s.advance(ee.Number(i).multiply(7),'day'); });
}
function maskS2clouds(img){
  var scl = img.select('SCL');
  var mode = maskMode.getValue();
  var bad = null;
  if (mode === 'Strict') {
    bad = scl.eq(0).or(scl.eq(1)).or(scl.eq(2)).or(scl.eq(3))
      .or(scl.eq(8)).or(scl.eq(9)).or(scl.eq(10)).or(scl.eq(11));
  } else if (mode === 'Standard') {
    bad = scl.eq(0).or(scl.eq(1)).or(scl.eq(2)).or(scl.eq(3))
      .or(scl.eq(8)).or(scl.eq(9)).or(scl.eq(10));
  } else if (mode === 'Relaxed') {
    bad = scl.eq(0).or(scl.eq(1)).or(scl.eq(2)).or(scl.eq(3))
      .or(scl.eq(9)).or(scl.eq(10));
  } else {
    bad = scl.eq(0).or(scl.eq(1)).or(scl.eq(2))
      .or(scl.eq(9));
  }
  return img.updateMask(bad.not());
}
function addIndices(img){
  var nir=img.select('B8'), red=img.select('B4'), blue=img.select('B2');
  var sw1=img.select('B11'), sw2=img.select('B12');
  var ndvi = nir.subtract(red).divide(nir.add(red)).rename('NDVI');
  var evi  = nir.subtract(red).multiply(2.5)
               .divide(nir.add(red.multiply(6)).subtract(blue.multiply(7.5)).add(1)).rename('EVI');
  var bsi  = sw1.add(red).subtract(nir.add(blue))
               .divide(sw1.add(red).add(nir.add(blue))).rename('BSI');
  // NDTI = Normalized Difference Tillage Index (van Deventer 1997): (SWIR1 - SWIR2) / (SWIR1 + SWIR2)
  // High NDTI (~0.2-0.5) = retained crop residue; Low NDTI (<0) = bare/tilled soil
  // NOTE: only meaningful when NDVI < ~0.35 (bare/low-veg surfaces). Over closed canopy
  // both SWIR bands respond similarly to canopy water, making NDTI a near-neutral signal.
  var ndti = sw1.subtract(sw2).divide(sw1.add(sw2)).rename('NDTI');
  var ndmi = nir.subtract(sw1).divide(nir.add(sw1)).rename('NDMI');
  var brightness = img.select(['B2','B3','B4','B8','B11','B12']).reduce(ee.Reducer.mean()).rename('brightness');
  return img.addBands([ndvi,evi,bsi,ndti,ndmi,brightness]);
}
function emptyBands(names){
  var z = ee.Image.constant(ee.List.repeat(0, names.length)).toFloat().rename(names);
  return z.updateMask(ee.Image.constant(0));
}

function composeWeek(ws){
  var we  = ee.Date(ws).advance(1,'week');
  var raw = state.s2Base.filterDate(ws, we).select(['B2','B3','B4','B8','B11','B12']);
  var med = ee.Image(ee.Algorithms.If(raw.size().gt(0), raw.median(), emptyBands(['B2','B3','B4','B8','B11','B12'])));
  var out = addIndices(med).select(['NDVI','EVI','BSI','NDTI','NDMI','brightness']).clipToCollection(fields);

  if (state.s1Base) {
    var s1w = state.s1Base.filterDate(ws, we);
    var s1m = ee.Image(ee.Algorithms.If(s1w.size().gt(0), s1w.median().select(['VV','VH']), emptyBands(['VV','VH'])));
    function toDb(x){ return x.max(1e-6).log10().multiply(10); }
    out = out.addBands(toDb(s1m.select('VV')).rename('VV_dB'))
             .addBands(toDb(s1m.select('VH')).rename('VH_dB'))
             .addBands(s1m.select('VH').divide(s1m.select('VV').max(1e-6)).rename('VH_VV'));
  }
  return out.set('week_start', ee.Date(ws).format('YYYY-MM_dd'));
}

// Fraction of valid pixels for a week inside a geometry (0..1).
// Uses the composed NDVI mask as the validity proxy (same behavior as the original timeline script).
function validFrac(ws, geom, scale){
  var nd = composeWeek(ws).select('NDVI'); // any index’s mask works
  var v  = nd.mask().gt(0).rename('v');
  return ee.Number(v.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geom, scale: scale || 20, tileScale:8,
    bestEffort:true, maxPixels: 2e9
  }).get('v'));
}

/* ======================================================================================
 *  PHASE 2 � DETECTION ENGINE (S2/MODIS � globally portable)
 * ====================================================================================== */

/* ---------- Bare mask helper ---------- */
function addBareMask(img){
  var bare = img.select('NDVI').lt(0.25).and(img.select('NDMI').lt(0.1)).rename('bare_mask');
  return img.addBands(bare);
}

/* ---------- Seasonal S2 + MODIS composites ---------- */
function seasonalCollection(year, mmddStart, mmddEnd, geom){
  var start = ee.Date.parse('YYYY-MM-dd', ee.String(year).cat('-').cat(mmddStart));
  var end = ee.Date.parse('YYYY-MM-dd', ee.String(year).cat('-').cat(mmddEnd)).advance(1, 'day');
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geom)
    .filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', cloudSlide.getValue()))
    .map(maskS2clouds)
    .map(addIndices)
    .map(addBareMask);
}
function seasonalComposite(year, mmddStart, mmddEnd, bands, geom){
  var comp = seasonalCollection(year, mmddStart, mmddEnd, geom).median().clip(geom);
  return ee.Image(comp).select(bands);
}
function seasonalSceneCount(year, mmddStart, mmddEnd, geom){
  return ee.Number(seasonalCollection(year, mmddStart, mmddEnd, geom).size());
}
function modisNdviMergedCollection(startDate, endDate, geom){
  function prep(ic){
    return ic.select('NDVI').map(function(img){
      return img.multiply(0.0001).updateMask(img.neq(-3000)).copyProperties(img, img.propertyNames());
    });
  }
  var terra = prep(ee.ImageCollection('MODIS/061/MOD13Q1').filterBounds(geom).filterDate(startDate, endDate));
  var aqua  = prep(ee.ImageCollection('MODIS/061/MYD13Q1').filterBounds(geom).filterDate(startDate, endDate));
  return terra.merge(aqua);
}
function seasonalModisNdvi(year, mmddStart, mmddEnd, geom){
  var start = ee.Date.parse('YYYY-MM-dd', ee.String(year).cat('-').cat(mmddStart));
  var end   = ee.Date.parse('YYYY-MM-dd', ee.String(year).cat('-').cat(mmddEnd)).advance(1, 'day');
  var merged = modisNdviMergedCollection(start, end, geom);
  return ee.Image(ee.Algorithms.If(
    merged.size().gt(0),
    merged.mean().rename('modis_ndvi').clip(geom),
    emptyBands(['modis_ndvi']).clip(geom)
  ));
}

/* ---------- S2 feature layer composites ---------- */
function usdaSentinel2Rgb(startDateText, endDateText, cloudFilter, geom){
  var start  = ee.Date(startDateText);
  var end    = ee.Date(endDateText).advance(1, 'day');
  var imgCol = ee.ImageCollection('COPERNICUS/S2_HARMONIZED')
    .filterBounds(geom).filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', cloudFilter));
  return ee.Image(ee.Algorithms.If(
    imgCol.size().gt(0),
    imgCol.select(['B8','B4','B3']).median().divide(10000).rename(['N','R','G']).clip(geom),
    emptyBands(['N','R','G']).clip(geom)
  ));
}

// EU STUB: CDL temporal entropy requires USDA/NASS/CDL (US-only). Phase 3 target.
function usdaTemporalEntropy(endYear, geom){
  return emptyBands(['entropy']).clip(geom).rename('entropy');
}

function ndtiComposite(startDateText, endDateText, cloudPct, geom){
  var start = ee.Date(startDateText);
  var end   = ee.Date(endDateText).advance(1, 'day');
  var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geom).filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', cloudPct))
    .map(maskS2clouds).map(addIndices);
  return ee.Image(ee.Algorithms.If(s2.size().gt(0), s2.median().select('NDTI'), emptyBands(['NDTI'])))
    .rename('NDTI').clip(geom);
}

function tillageEventMaskComposite(startDateText, endDateText, cloudPct, geom, ndtiMax, ndviMax, ndmiMax){
  var start = ee.Date(startDateText);
  var end   = ee.Date(endDateText).advance(1, 'day');
  var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geom).filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', cloudPct))
    .map(maskS2clouds).map(addIndices);
  var comp = ee.Image(ee.Algorithms.If(
    s2.size().gt(0), s2.median().select(['NDTI','NDVI','NDMI']), emptyBands(['NDTI','NDVI','NDMI'])
  )).clip(geom);
  return comp.select('NDTI').lte(ndtiMax)
    .and(comp.select('NDVI').lte(ndviMax))
    .and(comp.select('NDMI').lte(ndmiMax))
    .rename('likely_tillage_event');
}

/* ---------- Utility helpers ---------- */
function numOrNaN(raw){
  if (raw === null || raw === undefined) { return NaN; }
  var n = Number(raw); return isFinite(n) ? n : NaN;
}
function proxyFmt(x, digits){
  var d = digits || 3;
  if (x === null || x === undefined || isNaN(x)) { return 'NA'; }
  return (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toString();
}
function scoreClass(score){ if (score >= 0.60) { return 'likely'; } if (score >= 0.35) { return 'possible'; } return 'unlikely'; }
function coverClassLabel(klass){ return klass === 'unlikely' ? 'No Cover Crop' : klass; }
function confidenceFromMidpoint(score, midpoint){ return Math.round(Math.min(0.99, Math.abs(score - midpoint) / 0.5) * 100); }
function eeCoverClassFromScore(score){
  var s = ee.Number(score);
  return ee.String(ee.Algorithms.If(s.gte(0.60), 'likely', ee.Algorithms.If(s.gte(0.35), 'possible', 'No Cover Crop')));
}
function eeTillageClassFromNorm(norm, reducedThresh, noTillThresh){
  var n = ee.Number(norm);
  return ee.String(ee.Algorithms.If(n.gte(noTillThresh), 'NO-TILL', ee.Algorithms.If(n.gte(reducedThresh), 'REDUCED TILL', 'INTENSIVE TILL')));
}
function sanitizeTaskToken(text){ return String(text || '').replace(/[^0-9A-Za-z_]/g, ''); }
function analysisYearsFromDateRange(){
  var years = state.mgmtYears || [];
  if (!years.length) { return []; }
  var startText = (startBox.getValue() || '').trim();
  var endText   = (endBox.getValue()   || '').trim();
  if (!isValidIsoDate(startText) || !isValidIsoDate(endText)) { return years.slice(); }
  var sy = new Date(startText + 'T00:00:00Z').getUTCFullYear();
  var ey = new Date(endText   + 'T00:00:00Z').getUTCFullYear();
  if (ey < sy) { var t = sy; sy = ey; ey = t; }
  return years.filter(function(y){ return y >= sy && y <= ey; });
}
function yearSpanLabel(years){
  if (!years || !years.length) { return 'none'; }
  if (years.length === 1) { return String(years[0]); }
  return String(years[0]) + '-' + String(years[years.length - 1]);
}
function meanFromBandStats(stats, bands){
  var s = 0, n = 0;
  (bands || []).forEach(function(b){ var raw = stats ? stats[b] : null; if (raw !== null && raw !== undefined){ var v = Number(raw); if (isFinite(v)){ s += v; n++; } } });
  return n ? (s / n) : NaN;
}
function medianFromBandStats(stats, bands){
  var vals = [];
  (bands || []).forEach(function(b){ var raw = stats ? stats[b] : null; if (raw !== null && raw !== undefined){ var v = Number(raw); if (isFinite(v)) { vals.push(v); } } });
  if (!vals.length) { return NaN; }
  vals.sort(function(a,b){ return a - b; });
  var mid = Math.floor(vals.length / 2);
  if (vals.length % 2) { return vals[mid]; }
  return (vals[mid - 1] + vals[mid]) / 2;
}
function lastPidText(){
  if (typeof state.lastPid === 'string') { return state.lastPid; }
  if (state.lastPid && state.lastPid.getInfo) { try { return String(state.lastPid.getInfo()); } catch(e){} }
  return 'unknown';
}

/* ---------- Threshold accessors ---------- */
function normalizedMmDd(text, fallback){
  var t = String(text || '').trim();
  var m = t.match(/^(\d{1,2})-(\d{1,2})$/);
  if (!m) { return fallback; }
  var mm = Number(m[1]), dd = Number(m[2]);
  if (!isFinite(mm)||!isFinite(dd)||mm<1||mm>12||dd<1||dd>31){ return fallback; }
  return ('0'+mm).slice(-2)+'-'+('0'+dd).slice(-2);
}
function FALL_START()   { return normalizedMmDd(fallStartBox.getValue(),   '09-01'); }
function FALL_END()     { return normalizedMmDd(fallEndBox.getValue(),     '11-30'); }
function SPRING_START() { return normalizedMmDd(springStartBox.getValue(), '02-01'); }
function SPRING_END()   { return normalizedMmDd(springEndBox.getValue(),   '05-15'); }
function USE_FALL_WINDOW()    { return includeFallCoverChk.getValue(); }
function USE_SPRING_WINDOW()  { return includeSpringCoverChk.getValue(); }
function COVER_NDVI_SOURCE()  { return String(coverNdviSourceSel.getValue() || 'Sentinel-2 NDVI'); }
function USE_MODIS_FOR_COVER(){ return COVER_NDVI_SOURCE().indexOf('MODIS') === 0; }
function CC_FALL_THRESH()     { return ccFallNdviSlider.getValue()   || 0.30; }
function CC_SPRING_THRESH()   { return ccSpringNdviSlider.getValue() || 0.35; }
function TILL_NDTI_LOW()      { return tillNdtiLowSlider.getValue(); }
function TILL_NDTI_HIGH()     { return tillNdtiHighSlider.getValue(); }
function TILL_REDUCED_NORM_THRESH() { return tillReducedNormSlider.getValue(); }
function TILL_NOTILL_NORM_THRESH()  { return tillNoTillNormSlider.getValue(); }
function tillNormBounds(){
  var low  = Number(TILL_NDTI_LOW()),  high = Number(TILL_NDTI_HIGH());
  if (!isFinite(low))  { low = -0.2; }
  if (!isFinite(high)) { high = 0.4; }
  if (high <= low + 0.01) { high = low + 0.01; }
  return {low: low, high: high};
}
function tillClassThresholds(){
  var reduced = Number(TILL_REDUCED_NORM_THRESH()), noTill = Number(TILL_NOTILL_NORM_THRESH());
  if (!isFinite(reduced)) { reduced = 0.30; }
  if (!isFinite(noTill))  { noTill  = 0.60; }
  reduced = Math.max(0.0, Math.min(1.0, reduced));
  noTill  = Math.max(0.0, Math.min(1.0, noTill));
  if (reduced >= noTill) { reduced = Math.max(0.0, noTill - 0.01); }
  return {reduced: reduced, noTill: noTill};
}
function ndtiNormImage(ndtiImage){ var b = tillNormBounds(); return ndtiImage.unitScale(b.low, b.high).max(0).min(1); }
function ndtiNormFromValue(ndtiValue){
  var v = numOrNaN(ndtiValue); if (!isFinite(v)) { return NaN; }
  var b = tillNormBounds(); return Math.min(1, Math.max(0, (v - b.low) / (b.high - b.low)));
}
function tillageClassFromNorm(norm){
  if (!isFinite(norm)) { return 'UNAVAILABLE'; }
  var t = tillClassThresholds();
  if (norm >= t.noTill) { return 'NO-TILL'; } if (norm >= t.reduced) { return 'REDUCED TILL'; } return 'INTENSIVE TILL';
}
function tillageResidueLabelFromNorm(norm){
  if (!isFinite(norm)) { return 'insufficient data'; }
  var t = tillClassThresholds();
  var ntp = Math.round(t.noTill * 100), rp = Math.round(t.reduced * 100);
  if (norm >= t.noTill) { return '>=' + ntp + '% residue cover'; }
  if (norm >= t.reduced) { return rp + '% to <' + ntp + '% residue cover'; }
  return '<' + rp + '% residue cover';
}
var SAR_BLEND_WEIGHT = 0.20;

/* ---------- Per-year composite engine ---------- */
function annualMgmtForYear(year, includeSar, geom){
  var y = ee.Number(year).int();
  var useFall = USE_FALL_WINDOW(), useSpring = USE_SPRING_WINDOW(), useModisForCover = USE_MODIS_FOR_COVER();
  var fall   = seasonalComposite(y, FALL_START(),   FALL_END(),   ['NDVI','NDTI','NDMI','BSI','brightness','bare_mask'], geom);
  var spring = seasonalComposite(y, SPRING_START(), SPRING_END(), ['NDVI','NDTI','NDMI','BSI','brightness','bare_mask'], geom);
  var fallModis   = seasonalModisNdvi(y, FALL_START(),   FALL_END(),   geom);
  var springModis = seasonalModisNdvi(y, SPRING_START(), SPRING_END(), geom);
  var fallSceneCount   = ee.Image.constant(seasonalSceneCount(y, FALL_START(),   FALL_END(),   geom)).toFloat();
  var springSceneCount = ee.Image.constant(seasonalSceneCount(y, SPRING_START(), SPRING_END(), geom)).toFloat();
  var minSeasonValidFrac = ee.Number(minValidPct.getValue()).divide(100.0);
  var fallValidFracRaw   = fall.select('NDVI').mask().gt(0).rename('v').reduceRegion({reducer:ee.Reducer.mean(),geometry:geom,scale:20,tileScale:4,maxPixels:1e9,bestEffort:true}).get('v');
  var springValidFracRaw = spring.select('NDVI').mask().gt(0).rename('v').reduceRegion({reducer:ee.Reducer.mean(),geometry:geom,scale:20,tileScale:4,maxPixels:1e9,bestEffort:true}).get('v');
  var fallValidFrac   = ee.Number(ee.Algorithms.If(fallValidFracRaw,   fallValidFracRaw,   0));
  var springValidFrac = ee.Number(ee.Algorithms.If(springValidFracRaw, springValidFracRaw, 0));
  var fallEnabledMask   = ee.Image.constant(useFall   ? 1 : 0);
  var springEnabledMask = ee.Image.constant(useSpring ? 1 : 0);
  var fallValidMask     = ee.Image.constant(fallValidFrac.gte(minSeasonValidFrac));
  var springValidMask   = ee.Image.constant(springValidFrac.gte(minSeasonValidFrac));
  var fallNdviGated   = fall.select('NDVI').updateMask(fallValidMask).updateMask(fallEnabledMask).rename('fall_ndvi');
  var springNdviGated = spring.select('NDVI').updateMask(springValidMask).updateMask(springEnabledMask).rename('spring_ndvi');
  var fallModisBand   = fallModis.select('modis_ndvi').updateMask(fallEnabledMask).rename('fall_modis_ndvi');
  var springModisBand = springModis.select('modis_ndvi').updateMask(springEnabledMask).rename('spring_modis_ndvi');
  var fallCoverNdvi   = useModisForCover ? fallModisBand   : fallNdviGated;
  var springCoverNdvi = useModisForCover ? springModisBand : springNdviGated;
  var fallLikely   = fallCoverNdvi.gt(CC_FALL_THRESH()).rename('cover_crop_likely');
  var springLikely = springCoverNdvi.gt(CC_SPRING_THRESH()).rename('cover_crop_likely');
  var coverLikely  = emptyBands(['cover_crop_likely']);
  if (useFall && useSpring) { coverLikely = fallLikely.or(springLikely).rename('cover_crop_likely'); }
  else if (useFall)   { coverLikely = fallLikely; }
  else if (useSpring) { coverLikely = springLikely; }
  var fallSceneCountBand   = fallSceneCount.updateMask(fallEnabledMask).rename('fall_scene_count');
  var springSceneCountBand = springSceneCount.updateMask(springEnabledMask).rename('spring_scene_count');
  var fallValidFracBand    = ee.Image.constant(fallValidFrac).toFloat().updateMask(fallEnabledMask).rename('fall_valid_frac');
  var springValidFracBand  = ee.Image.constant(springValidFrac).toFloat().updateMask(springEnabledMask).rename('spring_valid_frac');
  var base = ee.Image.cat([
    coverLikely, fallNdviGated, springNdviGated, fallModisBand, springModisBand,
    spring.select('NDTI').rename('spring_ndti'), spring.select('BSI').rename('spring_bsi'),
    fallSceneCountBand, springSceneCountBand, fallValidFracBand, springValidFracBand,
    spring.select('brightness').rename('spring_residue_contrast'),
    spring.select('bare_mask').rename('spring_bare_mask')
  ]);
  if (!includeSar) { return base; }
  var sarStart = ee.Date.parse('YYYY-MM-dd', y.format().cat('-').cat(SPRING_START()));
  var sarEnd   = ee.Date.parse('YYYY-MM-dd', y.format().cat('-').cat(SPRING_END())).advance(1, 'day');
  var s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
    .filterBounds(geom).filterDate(sarStart, sarEnd)
    .filter(ee.Filter.eq('instrumentMode','IW'))
    .filter(ee.Filter.eq('resolution_meters',10))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation','VV'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation','VH'));
  var s1Med = ee.Image(ee.Algorithms.If(s1.size().gt(0), s1.median().select(['VV','VH']), emptyBands(['VV','VH'])));
  function toDb(x){ return x.max(1e-6).log10().multiply(10); }
  var vvDb  = toDb(s1Med.select('VV')).rename('VV_dB');
  var vhDb  = toDb(s1Med.select('VH')).rename('VH_dB');
  var vhvv  = s1Med.select('VH').divide(s1Med.select('VV').max(1e-6)).rename('VHVV_ratio');
  var vvByte    = vvDb.unitScale(-25, 5).multiply(255).toUint8().rename('VV_dB');
  var vvTexture = vvByte.glcmTexture({size: 3});
  var vvContrast = vvTexture.select('VV_dB_contrast').rename('glcm_contrast_VV');
  var vvEntropy  = vvTexture.select('VV_dB_entropy').rename('glcm_entropy_VV');
  var sarReduced = vhvv.multiply(0.6).add(vvContrast.unitScale(0,150).multiply(-0.2)).add(vvEntropy.unitScale(0,8).multiply(0.2)).rename('sar_reduced_score');
  return base.addBands([vvDb, vhDb, vhvv, vvContrast, vvEntropy, sarReduced]);
}

function buildAnnualMgmtBandImage(years, includeSar, geom){
  var out = ee.Image(ee.List(years).iterate(function(y, prev){
    y = ee.Number(y).int();
    var suffix = ee.String('_').cat(y.format());
    var annual = annualMgmtForYear(y, includeSar, geom);
    var renamed = ee.Image.cat([
      annual.select('cover_crop_likely').rename(ee.String('cover_crop_likely').cat(suffix)),
      annual.select('fall_ndvi').rename(ee.String('fall_ndvi').cat(suffix)),
      annual.select('spring_ndvi').rename(ee.String('spring_ndvi').cat(suffix)),
      annual.select('fall_modis_ndvi').rename(ee.String('fall_modis_ndvi').cat(suffix)),
      annual.select('spring_modis_ndvi').rename(ee.String('spring_modis_ndvi').cat(suffix)),
      annual.select('fall_scene_count').rename(ee.String('fall_scene_count').cat(suffix)),
      annual.select('spring_scene_count').rename(ee.String('spring_scene_count').cat(suffix)),
      annual.select('fall_valid_frac').rename(ee.String('fall_valid_frac').cat(suffix)),
      annual.select('spring_valid_frac').rename(ee.String('spring_valid_frac').cat(suffix)),
      annual.select('spring_residue_contrast').rename(ee.String('spring_residue_contrast').cat(suffix)),
      annual.select('spring_ndti').rename(ee.String('spring_ndti').cat(suffix)),
      annual.select('spring_bsi').rename(ee.String('spring_bsi').cat(suffix)),
      annual.select('spring_bare_mask').rename(ee.String('spring_bare_mask').cat(suffix))
    ]);
    return ee.Image(prev).addBands(renamed);
  }, ee.Image([])));
  return out.clip(geom);
}

function buildMgmtProxyImage(years, includeSar, geom){
  var annualCollection = ee.ImageCollection(ee.List(years).map(function(y){
    return annualMgmtForYear(ee.Number(y).int(), includeSar, geom).set('year', ee.Number(y).int());
  }));
  var coverCropFreq       = annualCollection.select('cover_crop_likely').mean().rename('cover_crop_freq_proxy');
  var fallNdviMean        = annualCollection.select('fall_ndvi').mean().rename('fall_ndvi_mean');
  var springNdviMean      = annualCollection.select('spring_ndvi').mean().rename('spring_ndvi_mean');
  var fallModisNdviMean   = annualCollection.select('fall_modis_ndvi').mean().rename('fall_modis_ndvi_mean');
  var springModisNdviMean = annualCollection.select('spring_modis_ndvi').mean().rename('spring_modis_ndvi_mean');
  var fallSceneCountMean  = annualCollection.select('fall_scene_count').mean().rename('fall_scene_count_mean');
  var springSceneCountMean= annualCollection.select('spring_scene_count').mean().rename('spring_scene_count_mean');
  var fallValidFracMean   = annualCollection.select('fall_valid_frac').mean().rename('fall_valid_frac_mean');
  var springValidFracMean = annualCollection.select('spring_valid_frac').mean().rename('spring_valid_frac_mean');
  var fallSpringNdviSumMean = annualCollection.map(function(img){
    var i = ee.Image(img); return i.select('fall_ndvi').add(i.select('spring_ndvi')).rename('fall_spring_ndvi_sum');
  }).mean().rename('fall_spring_ndvi_sum_mean');
  var springBareFreq = annualCollection.select('spring_bare_mask').mean().rename('spring_bare_freq');
  var springNdtiMed  = annualCollection.select('spring_ndti').median().rename('spring_ndti_med');
  var springBsiMed   = annualCollection.select('spring_bsi').median().rename('spring_bsi_med');
  var ndtiNorm      = ndtiNormImage(springNdtiMed);
  var reducedTill   = ndtiNorm.multiply(springBareFreq).rename('reduced_till_likelihood_proxy');
  var intensiveTill = ee.Image(1).subtract(ndtiNorm).multiply(springBareFreq).rename('intensive_till_likelihood_proxy');
  if (includeSar){
    var sarReduced = annualCollection.select('sar_reduced_score').mean().rename('sar_reduced_score_mean');
    reducedTill   = reducedTill.multiply(1-SAR_BLEND_WEIGHT).add(sarReduced.multiply(SAR_BLEND_WEIGHT)).rename('reduced_till_likelihood_proxy');
    intensiveTill = ee.Image(1).subtract(ndtiNorm).multiply(springBareFreq).multiply(1-SAR_BLEND_WEIGHT)
      .add(ee.Image(1).subtract(sarReduced).multiply(springBareFreq).multiply(SAR_BLEND_WEIGHT)).rename('intensive_till_likelihood_proxy');
    return ee.Image.cat([coverCropFreq,fallNdviMean,springNdviMean,fallModisNdviMean,springModisNdviMean,
      fallSceneCountMean,springSceneCountMean,fallValidFracMean,springValidFracMean,
      fallSpringNdviSumMean,springBareFreq,springNdtiMed,springBsiMed,reducedTill,intensiveTill,sarReduced]).clip(geom);
  }
  return ee.Image.cat([coverCropFreq,fallNdviMean,springNdviMean,fallModisNdviMean,springModisNdviMean,
    fallSceneCountMean,springSceneCountMean,fallValidFracMean,springValidFracMean,
    fallSpringNdviSumMean,springBareFreq,springNdtiMed,springBsiMed,reducedTill,intensiveTill]).clip(geom);
}




/* ======================================================================================
 *  STATIC COVARIATES (Terrain/CopDEM + ERA5-Land Climate + SoilGrids ISRIC)
 * ====================================================================================== */

/* ---------- Overlay Color Legend Help ---------- */
(function(){
  var legendPopup = null;

  // Each entry: [label, hex swatches low→high, low description, high description]
  var entries = [
    {
      name: 'NDVI  (Normalized Difference Vegetation Index)',
      stops: [
        {color:'#a59d95', label:'≈ 0  — bare soil / rock / urban'},
        {color:'#e4ffaf', label:'≈ 0.2 — sparse / stressed vegetation'},
        {color:'#00e400', label:'≈ 0.5 — healthy crop canopy'},
        {color:'#016c0e', label:'≈ 0.8 — dense green biomass'}
      ],
      note: 'Fresh bare fields read 0–0.15; growing crops rise to 0.6+; senescent/harvested crop falls back toward 0.2.'
    },
    {
      name: 'EVI  (Enhanced Vegetation Index)',
      stops: [
        {color:'#30123b', label:'low  — bare / fallow'},
        {color:'#3c5aa8', label:''},
        {color:'#56c18d', label:''},
        {color:'#74d14c', label:'moderate green'},
        {color:'#b7ef1a', label:'high  — dense canopy'}
      ],
      note: 'Less sky-saturation than NDVI over dense crops. Useful for tracking canopy closure in summer.'
    },
    {
      name: 'NDTI  (Normalized Difference Tillage Index)',
      stops: [
        {color:'#d73027', label:'< −0.1 — freshly tilled / bare soil'},
        {color:'#fee090', label:'≈ 0    — mixed / transition'},
        {color:'#e0f3f8', label:''},
        {color:'#74add1', label:'≈ 0.2  — residue-covered surface'},
        {color:'#313695', label:'> 0.3  — dense crop residue / green crop'}
      ],
      note: 'Red = tilled/bare field. Blue = residue or cover (no-till signal).\n' +
            'VALID SEASONS: post-harvest (late Jul–Oct for winter cereals) and spring (Feb–May). ' +
            'Spring no-till fields correctly show blue even with moderate NDVI (0.35–0.55) ' +
            'because wheat/cover crop grows through the residue. ' +
            'The overlay only masks dense closed-canopy pixels (NDVI > 0.65) to avoid peak-summer confusion.'
    },
    {
      name: 'NDMI  (Normalized Difference Moisture Index)',
      stops: [
        {color:'#8c510a', label:'< −0.1 — dry / drought stress'},
        {color:'#d8b365', label:''},
        {color:'#f6e8c3', label:''},
        {color:'#c7eae5', label:''},
        {color:'#5ab4ac', label:''},
        {color:'#01665e', label:'> 0.3  — high canopy water content'}
      ],
      note: 'Brown = dry crop or bare soil. Teal/green = well-watered canopy. Sudden drop can indicate drought or harvest.'
    },
    {
      name: 'S2  (Sentinel-2 false-colour CIR:  NIR → Red channel, Red → Green, Green → Blue)',
      stops: [
        {color:'#cc4400', label:'Bright red/orange — vigorous green vegetation (high NIR)'},
        {color:'#886633', label:'Tan/brown — bare soil or harvested / senescent crop'},
        {color:'#4488aa', label:'Blue/grey — water, cloud shadow, or very dark surface'},
        {color:'#ffffff', label:'White/pale — clouds'}
      ],
      note: 'Healthy crops appear vivid red-magenta. Bare fields are tan-brown. ' +
            'Snow is very bright white. Water is dark or steel-blue.'
    },
    {
      name: 'Cover Crop Frequency Proxy  (0 – 1, fraction of years with detected cover)',
      stops: [
        {color:'#8c510a', label:'0  — never detected (bare soil overwinter every year)'},
        {color:'#f6e8c3', label:'~0.3 — occasional cover crop'},
        {color:'#c7eae5', label:'~0.6 — frequent cover cropping'},
        {color:'#01665e', label:'1  — cover crop detected every year'}
      ],
      note: 'Brown = consistently no winter cover. Teal/green = regular cover cropping detected. ' +
            'Based on fall and/or spring NDVI thresholds over the selected date range.'
    },
    {
      name: 'Reduced Tillage Likelihood Proxy  (−0.5 to 0.7)',
      stops: [
        {color:'#8b0000', label:'−0.5 — strong signal for intensive tillage'},
        {color:'#fdbb84', label:'~0   — mixed / uncertain'},
        {color:'#ffffbf', label:'~0.2 — slight reduced-till lean'},
        {color:'#91bfdb', label:'~0.5 — likely reduced tillage'},
        {color:'#2166ac', label:'0.7  — strong reduced / no-till signal'}
      ],
      note: 'Red = conventional/intensive tillage (low NDTI, bare soil signal). Blue = reduced or no-till ' +
            '(high residue cover). The proxy combines spring NDTI, bare frequency, and inter-annual stability.'
    },
    {
      name: 'Likely Tillage Event Mask',
      stops: [
        {color:'#ff00ff', label:'Magenta pixel — abrupt NDVI + NDTI drop flagged as a tillage event'}
      ],
      note: 'Displayed only where the combined NDVI ≤ threshold AND NDTI ≤ threshold AND NDMI ≤ threshold ' +
            'condition is met for the selected week. Single-colour binary mask — pixel is either flagged (magenta) or masked out (transparent).'
    }
  ];

  function buildSwatch(hex){
    return ui.Label('', {
      backgroundColor: hex,
      width: '24px',
      height: '14px',
      border: '1px solid #999',
      margin: '2px 2px 2px 0',
      padding: '0'
    });
  }

  function showLegend(){
    if (legendPopup){ Map.remove(legendPopup); legendPopup = null; }

    var outer = ui.Panel({
      style: {position:'top-right', width:'370px', backgroundColor:'rgba(0,0,0,0)', border:'0px', padding:'0', margin:'0'}
    });
    outer.add(ui.Panel({style:{height:'55px', backgroundColor:'rgba(0,0,0,0)', border:'0px', padding:'0', margin:'0'}}));

    var inner = ui.Panel({
      style: {
        width:'100%',
        backgroundColor:'rgba(255,255,255,0.97)',
        border:'2px solid #555',
        padding:'8px',
        margin:'0'
      }
    });

    var headerRow = ui.Panel({layout:ui.Panel.Layout.flow('horizontal'), style:{stretch:'horizontal', margin:'0 0 6px 0'}});
    headerRow.add(ui.Label('Overlay colour guide', {fontWeight:'bold', fontSize:'13px', stretch:'horizontal'}));
    var closeBtn = ui.Button({label:'✕', style:{color:'red', padding:'2px 6px', margin:'0'}});
    closeBtn.onClick(function(){ Map.remove(outer); legendPopup = null; });
    headerRow.add(closeBtn);
    inner.add(headerRow);

    for (var i = 0; i < entries.length; i++){
      var e = entries[i];
      inner.add(ui.Label(e.name, {fontWeight:'bold', fontSize:'11px', margin:'6px 0 2px 0', color:'#1a1a2e'}));
      var swatchRow = ui.Panel({layout:ui.Panel.Layout.flow('horizontal'), style:{margin:'0 0 2px 0'}});
      for (var j = 0; j < e.stops.length; j++){
        var stop = e.stops[j];
        var cell = ui.Panel({layout:ui.Panel.Layout.flow('vertical'), style:{margin:'0 6px 0 0'}});
        cell.add(buildSwatch(stop.color));
        if (stop.label){
          cell.add(ui.Label(stop.label, {fontSize:'9px', color:'#333', margin:'0', whiteSpace:'pre'}));
        }
        swatchRow.add(cell);
      }
      inner.add(swatchRow);
      inner.add(ui.Label(e.note, {fontSize:'10px', color:'#555', margin:'0 0 4px 0', whiteSpace:'pre-wrap'}));
    }

    outer.add(inner);
    Map.add(outer);
    legendPopup = outer;
  }

  var legendBtn = ui.Button({
    label: '🎨 Overlay colour guide',
    style: {margin:'6px 0 0 0', color:'#0b5394'}
  });
  legendBtn.onClick(showLegend);
  advPanel.add(legendBtn);
})();

/* ---------- Threshold & Sensitivity Guide ---------- */
(function(){
  var threshPopup = null;

  var sections = [
    {
      title: 'Cover crop thresholds',
      color: '#155724',
      rows: [
        {
          label: 'Fall NDVI threshold  (default 0.30)',
          dir:   'LOWER value → more fields detected as cover crop  |  HIGHER → fewer / stricter',
          note:  'A pixel in the fall window must exceed this NDVI to count as a winter cover crop. ' +
                 'Bare soil NDVI is typically 0.1–0.2; a healthy cover crop reads 0.3–0.5.'
        },
        {
          label: 'Spring NDVI threshold  (default 0.35)',
          dir:   'LOWER value → more fields detected as cover crop  |  HIGHER → fewer / stricter',
          note:  'Same logic applied to the spring scouting window. Spring cover crops may be more ' +
                 'vigorous so the default is slightly higher than fall.'
        }
      ]
    },
    {
      title: 'Tillage event sensitivity  (ALL three conditions must be met simultaneously)',
      color: '#842029',
      rows: [
        {
          label: 'NDTI ≤ max  (default 0.05)',
          dir:   'LOWER max → stricter / fewer events flagged  |  HIGHER max → more events flagged',
          note:  'Low NDTI (~−0.1 to 0.05) indicates a freshly tilled or bare surface. ' +
                 'Only pixels below this ceiling pass the NDTI test.'
        },
        {
          label: 'NDVI ≤ max  (default 0.25)',
          dir:   'LOWER max → stricter (only very bare fields pass)  |  HIGHER max → more permissive',
          note:  'Ensures only lightly-vegetated or bare surfaces are flagged. ' +
                 'Raise to catch events on fields with some residue or weeds.'
        },
        {
          label: 'NDMI ≤ max  (default 0.10)',
          dir:   'LOWER max → stricter (dry bare surfaces only)  |  HIGHER max → includes wetter surfaces',
          note:  'Guards against false positives from flooded or irrigated fields. ' +
                 'A recently tilled field is usually dry so NDMI is typically low.'
        }
      ]
    },
    {
      title: 'Tillage NDTI normalisation  (scales raw NDTI to a 0–1 score)',
      color: '#0c3547',
      rows: [
        {
          label: 'Low bound  (default −0.20)',
          dir:   'Raw NDTI at or below this value maps to score 0  (intensive tillage end of scale)',
          note:  'Decrease (more negative) if your region has very low bare-soil NDTI; ' +
                 'increase if tilled fields in your area rarely go below −0.10.'
        },
        {
          label: 'High bound  (default 0.40)',
          dir:   'Raw NDTI at or above this value maps to score 1  (residue / no-till end of scale)',
          note:  'Increase if fields with heavy straw residue push above 0.50; ' +
                 'decrease if your highest residue values only reach ~0.30.'
        }
      ]
    },
    {
      title: 'Tillage class cutoffs  (applied to the normalised 0–1 score)',
      color: '#3d1a78',
      rows: [
        {
          label: 'Reduced Till ≥  (default 0.30)',
          dir:   'LOWER cutoff → more fields classified as Reduced Till  |  HIGHER → fewer',
          note:  'Any pixel with a normalised NDTI score ≥ this value (but below the No-till cutoff) ' +
                 'is classified as Reduced Tillage.'
        },
        {
          label: 'No-Till ≥  (default 0.60)',
          dir:   'LOWER cutoff → more fields classified as No-Till  |  HIGHER → stricter No-till',
          note:  'Pixels at or above this score are classified as No-Till / high residue. ' +
                 'The two cutoffs must satisfy: Reduced < No-Till.'
        }
      ]
    }
  ];

  function showGuide(){
    if (threshPopup){ Map.remove(threshPopup); threshPopup = null; }

    var outer = ui.Panel({
      style: {position:'top-right', width:'400px', backgroundColor:'rgba(0,0,0,0)', border:'0px', padding:'0', margin:'0'}
    });
    outer.add(ui.Panel({style:{height:'55px', backgroundColor:'rgba(0,0,0,0)', border:'0px', padding:'0', margin:'0'}}));

    var inner = ui.Panel({
      style: {
        width:'100%',
        backgroundColor:'rgba(255,255,255,0.97)',
        border:'2px solid #555',
        padding:'8px',
        margin:'0'
      }
    });

    var headerRow = ui.Panel({layout:ui.Panel.Layout.flow('horizontal'), style:{stretch:'horizontal', margin:'0 0 6px 0'}});
    headerRow.add(ui.Label('Threshold & sensitivity guide', {fontWeight:'bold', fontSize:'13px', stretch:'horizontal'}));
    var closeBtn = ui.Button({label:'✕', style:{color:'red', padding:'2px 6px', margin:'0'}});
    closeBtn.onClick(function(){ Map.remove(outer); threshPopup = null; });
    headerRow.add(closeBtn);
    inner.add(headerRow);

    for (var s = 0; s < sections.length; s++){
      var sec = sections[s];
      inner.add(ui.Label(sec.title, {
        fontWeight:'bold', fontSize:'11px', margin:'8px 0 3px 0', color: sec.color
      }));
      for (var r = 0; r < sec.rows.length; r++){
        var row = sec.rows[r];
        inner.add(ui.Label(row.label, {fontSize:'10px', fontWeight:'bold', color:'#222', margin:'3px 0 1px 0'}));
        inner.add(ui.Label(row.dir,   {fontSize:'10px', color:'#1a6b3c', margin:'0 0 1px 4px', whiteSpace:'pre-wrap'}));
        inner.add(ui.Label(row.note,  {fontSize:'9px',  color:'#555',    margin:'0 0 4px 4px', whiteSpace:'pre-wrap'}));
      }
    }

    outer.add(inner);
    Map.add(outer);
    threshPopup = outer;
  }

  var threshBtn = ui.Button({
    label: '❓ Threshold & sensitivity guide',
    style: {margin:'4px 0 0 0', color:'#6a1a7a'}
  });
  threshBtn.onClick(showGuide);
  advPanel.add(threshBtn);
})();

/* ---------- IACS Crop Type Legend ---------- */
(function(){
  var cropLegendPopup = null;

  // Build entries from IACS_HCAT_TO_IDX — group by palette index so each crop
  // color appears once, with all matching crop names listed beneath it.
  var idxToNames = {};
  for (var ck in IACS_HCAT_TO_IDX) {
    if (!IACS_HCAT_TO_IDX.hasOwnProperty(ck)) continue;
    var idx = IACS_HCAT_TO_IDX[ck];
    if (!idxToNames[idx]) idxToNames[idx] = [];
    idxToNames[idx].push(ck.replace(/_/g, ' '));
  }
  // Friendly display names for each palette index (matching EUCROPMAP labels).
  var idxLabel = {
    1:'Wheat', 2:'Durum wheat', 3:'Barley', 4:'Rye / Millet / Sorghum',
    5:'Oats', 6:'Maize', 8:'Triticale', 9:'Other cereals',
    10:'Potatoes', 12:'Legumes / Vegetables', 13:'Industrial crops',
    14:'Sunflower', 15:'Rapeseed / Flax / Hemp', 16:'Soya',
    17:'Dry pulses / Peas', 18:'Fodder / Cover crops',
    19:'Fallow land', 21:'Grassland / Pasture'
  };

  function showCropLegend() {
    if (cropLegendPopup) { Map.remove(cropLegendPopup); cropLegendPopup = null; return; }

    var outer = ui.Panel({
      style: {position:'top-right', width:'360px', backgroundColor:'rgba(0,0,0,0)', border:'0px', padding:'0', margin:'0'}
    });
    outer.add(ui.Panel({style:{height:'55px', backgroundColor:'rgba(0,0,0,0)', border:'0px', padding:'0', margin:'0'}}));

    var inner = ui.Panel({
      style: {
        width:'100%',
        backgroundColor:'rgba(255,255,255,0.97)',
        border:'2px solid #555',
        padding:'8px',
        margin:'0'
      }
    });

    var headerRow = ui.Panel({layout:ui.Panel.Layout.flow('horizontal'), style:{stretch:'horizontal', margin:'0 0 6px 0'}});
    headerRow.add(ui.Label('IACS Crop Type Legend (HIACS v1.3)', {fontWeight:'bold', fontSize:'13px', stretch:'horizontal'}));
    var closeBtn = ui.Button({label:'✕', style:{color:'red', padding:'2px 6px', margin:'0'}});
    closeBtn.onClick(function(){ Map.remove(outer); cropLegendPopup = null; });
    headerRow.add(closeBtn);
    inner.add(headerRow);

    inner.add(ui.Label('Colors match the IACS Crop Types layer on the map.', {
      fontSize:'10px', color:'#555', margin:'0 0 8px 0', whiteSpace:'pre-wrap'
    }));

    // Sort by palette index for a logical ordering.
    var sortedIdxs = Object.keys(idxToNames).map(Number).sort(function(a,b){return a-b;});
    for (var si = 0; si < sortedIdxs.length; si++) {
      var idx = sortedIdxs[si];
      var hex = '#' + EUCROPMAP_PALETTE[idx];
      var label = idxLabel[idx] || ('Crop group ' + idx);
      var names = idxToNames[idx].sort();

      var row = ui.Panel({layout:ui.Panel.Layout.flow('horizontal'), style:{margin:'2px 0', stretch:'horizontal'}});

      // Color swatch
      var swatch = ui.Label('', {
        backgroundColor: hex,
        width: '20px',
        height: '14px',
        margin: '2px 6px 0 0',
        border: '1px solid #ccc'
      });
      row.add(swatch);

      // Group name + individual crop names
      var textCol = ui.Panel({layout:ui.Panel.Layout.flow('vertical'), style:{stretch:'horizontal'}});
      textCol.add(ui.Label(label, {fontWeight:'bold', fontSize:'11px', color:'#1a1a2e', margin:'0'}));
      textCol.add(ui.Label(names.join(', '), {fontSize:'9px', color:'#555', margin:'0 0 1px 0', whiteSpace:'pre-wrap'}));
      row.add(textCol);
      inner.add(row);
    }

    // Note about EUCROPMAP fallback
    inner.add(ui.Label('Fields without IACS data fall back to JRC EUCROPMAP colors.', {
      fontSize:'9px', color:'#888', margin:'8px 0 0 0', whiteSpace:'pre-wrap'
    }));

    outer.add(inner);
    Map.add(outer);
    cropLegendPopup = outer;
  }

  var cropLegendBtn = ui.Button({
    label: '\uD83C\uDF3E IACS crop type legend',
    style: {margin:'4px 0 0 0', color:'#2e6b2e'}
  });
  cropLegendBtn.onClick(showCropLegend);
  advPanel.add(cropLegendBtn);
})();




/* ---------- Covariates UI (Advanced) ---------- */
var covYearBox = ui.Textbox({value: '2024', style:{width:'80px'}});
var soilDepthSel = ui.Select({
  items: ['0-5','5-15','15-30','30-60','60-100','100-200'],
  value: '15-30',
  style:{width:'90px'}
});
advPanel.add(ui.Label('Covariates'));
advPanel.add(ui.Panel(
  [ui.Label('ERA5 year'), covYearBox, ui.Label('Depth (cm)'), soilDepthSel],
  ui.Panel.Layout.flow('horizontal')
));

/* ---------- Covariate image builders ---------- */
function terrainStack(){
  // Copernicus DEM GLO-30: global 30m, replaces US-only 3DEP
  var dem = ee.ImageCollection('COPERNICUS/DEM/GLO30').select('DEM').mosaic().rename('dem_m');
  var slope = ee.Terrain.slope(dem).rename('slope_deg');
  var aspect = ee.Terrain.aspect(dem).rename('aspect_deg');
  var hillshade = ee.Terrain.hillshade(dem).rename('hillshade');
  return dem.addBands([slope, aspect, hillshade]);
}

// ERA5-Land Daily Aggregated replaces US-only Daymet — global coverage at ~9km
function era5LandStack(yearStr){
  var y = ee.Number.parse(yearStr);

  function stackForYear(yearNum){
    var daily = ee.ImageCollection('ECMWF/ERA5_LAND/DAILY_AGGR')
      .filter(ee.Filter.calendarRange(yearNum, yearNum, 'year'));
    // temperature_2m is in Kelvin — subtract 273.15 for Celsius
    var t2m = daily.select('temperature_2m');
    var tMean = t2m.mean().subtract(273.15).rename('era5_tmean_C');
    var tMin  = t2m.min().subtract(273.15).rename('era5_tmin_C');
    var tMax  = t2m.max().subtract(273.15).rename('era5_tmax_C');
    // total_precipitation_sum is in m/day — multiply by 1000 for mm, sum for annual total
    var prcpSum = daily.select('total_precipitation_sum').sum()
      .multiply(1000).rename('era5_prcp_sum_mm');
    return ee.Image.cat([tMean, tMin, tMax, prcpSum])
      .set('era5_year_used', yearNum)
      .set('era5_n_images', daily.size());
  }

  var s0 = stackForYear(y);
  var s1 = stackForYear(y.subtract(1));
  var s2 = stackForYear(y.subtract(2));

  return ee.Image(ee.Algorithms.If(
    ee.Number(s0.get('era5_n_images')).gt(0), s0,
    ee.Algorithms.If(ee.Number(s1.get('era5_n_images')).gt(0), s1, s2)
  ));
}

// SoilGrids ISRIC texture stack — global, replaces US-only POLARIS
// Band naming convention: <var>_<depth>cm_mean  e.g. clay_0-5cm_mean
var ISRIC_TEXTURE = {
  clay:  'projects/soilgrids-isric/clay_mean',   // g/kg*10 -> div 10 = %
  sand:  'projects/soilgrids-isric/sand_mean',   // g/kg*10 -> div 10 = %
  silt:  'projects/soilgrids-isric/silt_mean',   // g/kg*10 -> div 10 = %
  phh2o: 'projects/soilgrids-isric/phh2o_mean',  // pH*10   -> div 10
  nitrogen: 'projects/soilgrids-isric/nitrogen_mean', // cg/kg -> div 100 = g/kg
  cec:   'projects/soilgrids-isric/cec_mean',    // mmolc/kg*10 -> div 10 = cmol/kg
  cfvo:  'projects/soilgrids-isric/cfvo_mean'    // cm3/dm3*10 -> div 10 = vol%
};

var ISRIC_TEXTURE_SCALE = {
  clay: 0.1, sand: 0.1, silt: 0.1, phh2o: 0.1, nitrogen: 0.01, cec: 0.1, cfvo: 0.1
};

function soilTextureSoilGridsStack(depthStr){
  var keys = Object.keys(ISRIC_TEXTURE);
  var imgOut = ee.Image([]);
  keys.forEach(function(k){
    var bandName = k + '_' + depthStr + 'cm_mean';
    var raw = ee.Image(ISRIC_TEXTURE[k]).select([bandName]);
    var scaled = raw.multiply(ISRIC_TEXTURE_SCALE[k]).rename('sg_' + k);
    imgOut = imgOut.addBands(scaled);
  });
  return imgOut;
}

/* ---------- SoilGrids (ISRIC) ---------- */
var ISRIC = {
  bdod_mean: ee.Image('projects/soilgrids-isric/bdod_mean'),
  soc_mean:  ee.Image('projects/soilgrids-isric/soc_mean'),
  ocs_mean:  ee.Image('projects/soilgrids-isric/ocs_mean')
};

function soilgridsBandName(prefix, depthStr){
  return prefix + '_' + depthStr + 'cm_mean';
}

function soilgridsStack(depthStr){
  var bd_band  = soilgridsBandName('bdod', depthStr);
  var soc_band = soilgridsBandName('soc',  depthStr);

  var bd_raw  = ISRIC.bdod_mean.select([bd_band]).rename('isric_bdod_raw');
  var soc_raw = ISRIC.soc_mean.select([soc_band]).rename('isric_soc_raw');

  // OCS is 0–30 only in this asset (per your bandNames)
  var ocs_raw = ISRIC.ocs_mean.select(['ocs_0-30cm_mean']).rename('isric_ocs0_30_raw');

  // Conversions:
  // bdod: cg/cm^3 -> g/cm^3 : *0.01
  var bd_gcm3 = bd_raw.multiply(0.01).rename('isric_bdod_gcm3');
  // soc: dg/kg -> % : *0.01
  var soc_pct = soc_raw.multiply(0.01).rename('isric_soc_pct');

  // ocs: treat as tC/ha. also compute tC/ac
  var HA_TO_AC = 2.4710538147;
  var ocs_t_ha = ocs_raw.rename('isric_ocs0_30_t_ha');
  var ocs_t_ac = ocs_t_ha.divide(HA_TO_AC).rename('isric_ocs0_30_t_ac');

  return ee.Image.cat([bd_gcm3, soc_pct, ocs_t_ha, ocs_t_ac]);
}

// gNATSGO removed — US-only (CONUS SSURGO-derived). SoilGrids ISRIC OCS covers EMEA.

/* ---------- Formatting helpers ---------- */
function fmtNum(x, digits){
  digits = digits || 4;
  return (x === null || x === undefined) ? 'NA' : (Math.round(x * Math.pow(10,digits)) / Math.pow(10,digits));
}

/* ---------- SOC conversion constants ---------- */
var HA_TO_AC = 2.4710538147;
var GPM2_TO_THA = 0.01;              // g/m² -> t/ha
var GPM2_TO_TAC = 0.01 / HA_TO_AC;   // g/m² -> t/ac  (≈ 0.004046856)

/* Put ALL covariates into a single panel so nothing gets inserted mid-block */
function addCovariatesToPanel(covPanel, geom){
  covPanel.clear();

  var requestedYear = covYearBox.getValue();
  var depth = soilDepthSel.getValue();

  covPanel.add(ui.Label('--- STATIC COVARIATES (field mean) ---', {fontWeight:'bold', margin:'8px 0 4px 0'}));
  covPanel.add(ui.Label('ERA5 year (requested): ' + requestedYear + ' | Depth: ' + depth + ' cm', {fontSize:'11px', color:'#666'}));

  var terr = terrainStack().reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geom,
    scale: 10,
    tileScale: 4,
    maxPixels: 1e9
  });

  var climImg = era5LandStack(requestedYear);
  var clim = climImg.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geom,
    scale: 1000,
    tileScale: 4,
    maxPixels: 1e9
  });

  var pol  = soilTextureSoilGridsStack(depth).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geom,
    scale: 30,
    tileScale: 4,
    maxPixels: 1e9
  });

  var isricImg = soilgridsStack(depth);
  var isric = isricImg.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geom,
    scale: 250,
    tileScale: 4,
    maxPixels: 1e9
  });

  var climYearUsed = climImg.get('era5_year_used');

  ee.Dictionary(terr)
    .combine(ee.Dictionary(clim), true)
    .combine(ee.Dictionary(pol), true)
    .combine(ee.Dictionary(isric), true)
    .set('era5_year_used', climYearUsed)
    .evaluate(function(d, err){
      if (err || !d){
        covPanel.add(ui.Label('Covariate error: ' + (err || 'No data'), {color:'red'}));
        return;
      }

      covPanel.add(ui.Label('Terrain', {fontWeight:'bold', margin:'6px 0 0 0'}));
      covPanel.add(ui.Label(
        'DEM(m): ' + fmtNum(d.dem_m) +
        ' | Slope(deg): ' + fmtNum(d.slope_deg) +
        ' | Aspect(deg): ' + fmtNum(d.aspect_deg) +
        ' | Hillshade: ' + fmtNum(d.hillshade)
      ));

      covPanel.add(ui.Label('ERA5-Land Climate (~9 km, annual)', {fontWeight:'bold', margin:'6px 0 0 0'}));
      covPanel.add(ui.Label('ERA5 year used: ' + d.era5_year_used, {fontSize:'11px', color:'#666'}));
      covPanel.add(ui.Label(
        'tmean(\u00b0C): ' + fmtNum(d.era5_tmean_C) +
        ' | tmin(\u00b0C): ' + fmtNum(d.era5_tmin_C) +
        ' | tmax(\u00b0C): ' + fmtNum(d.era5_tmax_C) +
        ' | prcp_sum(mm): ' + fmtNum(d.era5_prcp_sum_mm)
      ));

      covPanel.add(ui.Label('SoilGrids Texture (field mean)', {fontWeight:'bold', margin:'6px 0 0 0'}));
      var pkeys = Object.keys(d).filter(function(k){ return k.indexOf('sg_') === 0; }).sort();
      var line = [];
      pkeys.forEach(function(k, i){
        line.push(k.replace('sg_','') + ': ' + fmtNum(d[k]));
        if (line.length === 4 || i === pkeys.length - 1){
          covPanel.add(ui.Label(line.join(' | '), {fontSize:'11px'}));
          line = [];
        }
      });

      covPanel.add(ui.Label('Soil carbon + bulk density (SoilGrids ISRIC)', {fontWeight:'bold', margin:'8px 0 0 0'}));

      // SoilGrids
      var sg_soc_pct  = d.isric_soc_pct;
      var sg_bd_gcm3  = d.isric_bdod_gcm3;
      var sg_ocs_t_ha = d.isric_ocs0_30_t_ha;
      var sg_ocs_t_ac = d.isric_ocs0_30_t_ac;

      covPanel.add(ui.Label(
        'SoilGrids SOC% (' + depth + '): ' + fmtNum(sg_soc_pct, 3) + ' %' +
        ' | SoilGrids BD (' + depth + '): ' + fmtNum(sg_bd_gcm3, 3) + ' g/cm³',
        {fontSize:'11px'}
      ));
      covPanel.add(ui.Label(
        'SoilGrids SOC stock (0–30cm): ' + fmtNum(sg_ocs_t_ha, 2) + ' tC/ha | ' + fmtNum(sg_ocs_t_ac, 2) + ' tC/ac',
        {fontSize:'11px'}
      ));
    });
}


/* ---------- Layer helpers ---------- */
function removeLayerByName(name){
  var layers = Map.layers();
  for (var i = layers.length() - 1; i >= 0; i--) {
    var layer = layers.get(i);
    if (layer.getName() === name) { Map.remove(layer); }
  }
}

function selectedGeomForUsdaLayers(){
  if (!state.lastGeom) { statusLabel.setValue('Click a field first.'); return null; }
  return state.lastGeom;
}

/* ---------- Results panel infrastructure ---------- */
function resetSelectedClassificationPanelRefs(){
  state.selectedClassPanel = null;
  state.selectedClassByTitle = {};
}
function ensureSelectedClassificationPanel(){
  if (state.selectedClassPanel) { return; }
  state.selectedClassPanel = ui.Panel({
    style: {margin:'8px 0 0 0', padding:'6px', border:'1px solid #d5e0ef', backgroundColor:'#f8fbff'}
  });
  pop.add(state.selectedClassPanel);
  state.selectedClassByTitle = {};
  state.selectedClassPanel.add(ui.Label('Selected timeframe classification - field ' + lastPidText(), {
    fontWeight:'bold', fontSize:'11px', color:'#355070'
  }));
}
function clearSelectedClassificationOutput(){
  if (!state.selectedClassPanel) { return; }
  state.selectedClassPanel.clear();
  state.selectedClassPanel.add(ui.Label('Selected timeframe classification - field ' + lastPidText(), {
    fontWeight:'bold', fontSize:'11px', color:'#355070'
  }));
  state.selectedClassByTitle = {};
}
function addSelectedClassificationPanel(title, lines){
  ensureSelectedClassificationPanel();
  var key = String(title);
  var panel = ui.Panel({
    style: {margin:'6px 0 2px 0', padding:'4px', border:'1px solid #c9d7ea', backgroundColor:'#ffffff'}
  });
  panel.add(ui.Label(title, {fontWeight:'bold', color:'#003366', margin:'0 0 2px 0'}));
  for (var i = 0; i < lines.length; i++) {
    panel.add(ui.Label(lines[i], {fontSize:'11px', whiteSpace:'normal'}));
  }
  if (state.selectedClassByTitle[key]) { state.selectedClassPanel.remove(state.selectedClassByTitle[key]); }
  state.selectedClassPanel.add(panel);
  state.selectedClassByTitle[key] = panel;
}
function resetManagementAnalysisPanelRefs(){
  state.mgmtResultsPanel = null;
  state.mgmtResultByTitle = {};
}
function ensureManagementResultsPanel(){
  if (state.mgmtResultsPanel) { return; }
  state.mgmtResultsPanel = ui.Panel({
    style: {margin:'8px 0 0 0', padding:'6px', border:'1px solid #d5e0ef', backgroundColor:'#f8fbff'}
  });
  pop.add(state.mgmtResultsPanel);
  state.mgmtResultByTitle = {};
  state.mgmtResultsPanel.add(ui.Label('Management analysis results - field ' + lastPidText(), {
    fontWeight:'bold', fontSize:'11px', color:'#355070'
  }));
}
function clearManagementAnalysisOutput(){
  if (!state.mgmtResultsPanel) { return; }
  state.mgmtResultsPanel.clear();
  state.mgmtResultsPanel.add(ui.Label('Management analysis results - field ' + lastPidText(), {
    fontWeight:'bold', fontSize:'11px', color:'#355070'
  }));
  state.mgmtResultByTitle = {};
}
function addAnalysisPanel(title, lines){
  ensureManagementResultsPanel();
  var key = String(title);
  var panel = ui.Panel({
    style: {margin:'6px 0 2px 0', padding:'4px', border:'1px solid #c9d7ea', backgroundColor:'#ffffff'}
  });
  panel.add(ui.Label(title, {fontWeight:'bold', color:'#003366', margin:'0 0 2px 0'}));
  for (var i = 0; i < lines.length; i++) {
    panel.add(ui.Label(lines[i], {fontSize:'11px', whiteSpace:'normal'}));
  }
  if (state.mgmtResultByTitle[key]) { state.mgmtResultsPanel.remove(state.mgmtResultByTitle[key]); }
  state.mgmtResultsPanel.add(panel);
  state.mgmtResultByTitle[key] = panel;
}

/* ---------- Field proxy builder (lazy, cached) ---------- */
function buildProxiesForField(geom, onDone){
  var cacheKey = String(state.lastPid) + '|' +
    sarToggle.getValue() + '|' + cloudSlide.getValue() + '|' + maskMode.getValue() + '|' + minValidPct.getValue() + '|' +
    FALL_START() + FALL_END() + SPRING_START() + SPRING_END() + '|' +
    (USE_FALL_WINDOW() ? 'fall1' : 'fall0') + (USE_SPRING_WINDOW() ? 'spring1' : 'spring0') + '|' +
    (USE_MODIS_FOR_COVER() ? 'ndvi_modis' : 'ndvi_s2') + '|' +
    CC_FALL_THRESH() + CC_SPRING_THRESH() + '|' + TILL_NDTI_LOW() + TILL_NDTI_HIGH();
  if (state.lastMgmtGeomHash === cacheKey && state.mgmtProxyImage && state.annualMgmtImage){ onDone(); return; }
  statusLabel.setValue('Building management proxy for this field (~20-40s)...');
  var years = ee.List(state.mgmtYears);
  var includeSar = sarToggle.getValue();
  state.mgmtProxyImage = buildMgmtProxyImage(years, includeSar, geom);
  state.annualMgmtImage = buildAnnualMgmtBandImage(years, includeSar, geom);
  state.lastMgmtGeomHash = cacheKey;
  onDone();
}

/* ---------- Analysis runners ---------- */
function runCoverCropAnalysis(opts){
  opts = opts || {};
  var onComplete = (typeof opts.onComplete === 'function') ? opts.onComplete : function(){};
  if (opts.clearExisting !== false){ clearManagementAnalysisOutput(); clearSelectedClassificationOutput(); }
  if (!state.lastGeom){ statusLabel.setValue('Click a field first.'); onComplete(false); return; }
  if (!state.s2Base){ statusLabel.setValue('Run / Update first.'); onComplete(false); return; }
  var geom = state.lastGeom;
  var allYears = state.mgmtYears || [];
  var periodYears = analysisYearsFromDateRange();
  var useFall = USE_FALL_WINDOW(), useSpring = USE_SPRING_WINDOW(), useModisForCover = USE_MODIS_FOR_COVER();
  var primaryNdviLabel = useModisForCover ? 'MODIS NDVI (Terra + Aqua)' : 'Sentinel-2 NDVI';
  var checkNdviLabel = useModisForCover ? 'Sentinel-2 NDVI check' : 'MODIS NDVI check';
  var fallIncludedText = useFall ? 'included' : 'excluded';
  var springIncludedText = useSpring ? 'included' : 'excluded';
  var periodCoverBands = periodYears.map(function(y){ return 'cover_crop_likely_' + y; });
  var periodFallBands = periodYears.map(function(y){ return 'fall_ndvi_' + y; });
  var periodSpringBands = periodYears.map(function(y){ return 'spring_ndvi_' + y; });
  var periodFallModisBands = periodYears.map(function(y){ return 'fall_modis_ndvi_' + y; });
  var periodSpringModisBands = periodYears.map(function(y){ return 'spring_modis_ndvi_' + y; });
  var periodFallCountBands = periodYears.map(function(y){ return 'fall_scene_count_' + y; });
  var periodSpringCountBands = periodYears.map(function(y){ return 'spring_scene_count_' + y; });
  var periodFallValidBands = periodYears.map(function(y){ return 'fall_valid_frac_' + y; });
  var periodSpringValidBands = periodYears.map(function(y){ return 'spring_valid_frac_' + y; });
  buildProxiesForField(geom, function(){
    var reducerParams = {reducer: ee.Reducer.mean(), geometry: geom, scale: 20, tileScale: 4, maxPixels: 1e9, bestEffort: true};
    var proxyStats = state.mgmtProxyImage.select([
      'cover_crop_freq_proxy','fall_ndvi_mean','spring_ndvi_mean','fall_modis_ndvi_mean','spring_modis_ndvi_mean',
      'fall_scene_count_mean','spring_scene_count_mean','fall_valid_frac_mean','spring_valid_frac_mean','fall_spring_ndvi_sum_mean'
    ]).reduceRegion(reducerParams);
    var trendBands = allYears.map(function(y){ return 'cover_crop_likely_' + y; });
    var trendStats = state.annualMgmtImage.select(trendBands).reduceRegion(reducerParams);
    var periodBandList = periodCoverBands.concat(periodFallBands).concat(periodSpringBands)
      .concat(periodFallModisBands).concat(periodSpringModisBands)
      .concat(periodFallCountBands).concat(periodSpringCountBands)
      .concat(periodFallValidBands).concat(periodSpringValidBands);
    var periodStats = ee.Dictionary(ee.Algorithms.If(
      periodBandList.length > 0,
      state.annualMgmtImage.select(periodBandList).reduceRegion(reducerParams),
      ee.Dictionary({})
    ));
    var merged = ee.Dictionary(proxyStats).combine(ee.Dictionary(trendStats), true).combine(periodStats, true);
    statusLabel.setValue('Running cover crop analysis...');
    merged.evaluate(function(stats, error){
      if (error || !stats){
        statusLabel.setValue('Cover crop analysis failed.');
        addSelectedClassificationPanel('Cover Crop (Selected Timeframe)', ['Unable to compute selected-timeframe classification.']);
        addAnalysisPanel('Cover Crop Analysis', ['Unable to compute cover crop proxy stats for this field.']);
        onComplete(false); return;
      }
      var histFreq = numOrNaN(stats.cover_crop_freq_proxy);
      var histFall = numOrNaN(stats.fall_ndvi_mean);
      var histSpring = numOrNaN(stats.spring_ndvi_mean);
      var histFallModis = numOrNaN(stats.fall_modis_ndvi_mean);
      var histSpringModis = numOrNaN(stats.spring_modis_ndvi_mean);
      var histFallCount = numOrNaN(stats.fall_scene_count_mean);
      var histSpringCount = numOrNaN(stats.spring_scene_count_mean);
      var histFallValid = numOrNaN(stats.fall_valid_frac_mean);
      var histSpringValid = numOrNaN(stats.spring_valid_frac_mean);
      var histPrimaryFall = useModisForCover ? histFallModis : histFall;
      var histPrimarySpring = useModisForCover ? histSpringModis : histSpring;
      var histCheckFall = useModisForCover ? histFall : histFallModis;
      var histCheckSpring = useModisForCover ? histSpring : histSpringModis;
      var histPrimaryNdviMean = (isNaN(histPrimaryFall) || isNaN(histPrimarySpring)) ? NaN : ((histPrimaryFall + histPrimarySpring) / 2);
      var histScore = histFreq;
      var histClass = isNaN(histScore) ? null : scoreClass(histScore);
      var histConf = isNaN(histScore) ? null : confidenceFromMidpoint(histScore, 0.5);
      var perFreq = NaN, perFall = NaN, perSpring = NaN, perFallModis = NaN, perSpringModis = NaN;
      var perScore = NaN, perFallCount = NaN, perSpringCount = NaN, perFallValid = NaN, perSpringValid = NaN;
      var lines = [];
      lines.push('Selected timeframe: ' + yearSpanLabel(periodYears) + ' (' + startBox.getValue() + ' to ' + endBox.getValue() + ')');
      lines.push('Windows used: fall ' + FALL_START() + ' to ' + FALL_END() + ' | spring ' + SPRING_START() + ' to ' + SPRING_END());
      lines.push('NDVI source for detection/scoring: ' + primaryNdviLabel);
      lines.push('Window inclusion: fall=' + fallIncludedText + ' | spring=' + springIncludedText);
      if (useFall || useSpring) {
        var yearlyPassTerms = [];
        if (useFall) { yearlyPassTerms.push('fall_' + (useModisForCover ? 'modis' : 's2') + '_ndvi > ' + proxyFmt(CC_FALL_THRESH(), 2)); }
        if (useSpring) { yearlyPassTerms.push('spring_' + (useModisForCover ? 'modis' : 's2') + '_ndvi > ' + proxyFmt(CC_SPRING_THRESH(), 2)); }
        lines.push('Yearly cover pass rule: ' + yearlyPassTerms.join(' OR '));
        lines.push('Class score = fraction of years that pass this rule.');
      }
      if (!useFall && !useSpring) {
        lines.push('Timeframe class: unavailable (both windows are disabled).');
      } else if (periodYears.length === 0) {
        lines.push('Timeframe class: unavailable (selected dates outside available management years).');
      } else {
        perFreq = meanFromBandStats(stats, periodCoverBands);
        perFall = meanFromBandStats(stats, periodFallBands);
        perSpring = meanFromBandStats(stats, periodSpringBands);
        perFallModis = meanFromBandStats(stats, periodFallModisBands);
        perSpringModis = meanFromBandStats(stats, periodSpringModisBands);
        perFallCount = meanFromBandStats(stats, periodFallCountBands);
        perSpringCount = meanFromBandStats(stats, periodSpringCountBands);
        perFallValid = meanFromBandStats(stats, periodFallValidBands);
        perSpringValid = meanFromBandStats(stats, periodSpringValidBands);
        var perPrimaryFall = useModisForCover ? perFallModis : perFall;
        var perPrimarySpring = useModisForCover ? perSpringModis : perSpring;
        var perCheckFall = useModisForCover ? perFall : perFallModis;
        var perCheckSpring = useModisForCover ? perSpring : perSpringModis;
        var perPrimaryNdviMean = (isNaN(perPrimaryFall) || isNaN(perPrimarySpring)) ? NaN : ((perPrimaryFall + perPrimarySpring) / 2);
        perScore = perFreq;
        if (isNaN(perScore)) {
          lines.push('Timeframe class: unavailable (insufficient data within selected years).');
        } else {
          lines.push('Timeframe class: ' + coverClassLabel(scoreClass(perScore)));
          lines.push('Timeframe frequency score: ' + proxyFmt(perScore, 3) + ' | confidence: ' + confidenceFromMidpoint(perScore, 0.5) + '%');
          lines.push('Timeframe source NDVI mean: fall=' + (useFall ? proxyFmt(perPrimaryFall, 3) : 'excluded') + ' | spring=' + (useSpring ? proxyFmt(perPrimarySpring, 3) : 'excluded'));
          lines.push(checkNdviLabel + ': fall=' + (useFall ? proxyFmt(perCheckFall, 3) : 'excluded') + ' | spring=' + (useSpring ? proxyFmt(perCheckSpring, 3) : 'excluded'));
          lines.push('Timeframe scene count (avg/yr): fall=' + (useFall ? proxyFmt(perFallCount, 2) : 'excluded') + ' | spring=' + (useSpring ? proxyFmt(perSpringCount, 2) : 'excluded'));
          lines.push('Timeframe valid-pixel frac (avg): fall=' + (useFall ? proxyFmt(perFallValid, 3) : 'excluded') + ' | spring=' + (useSpring ? proxyFmt(perSpringValid, 3) : 'excluded') + ' | min required=' + proxyFmt(minValidPct.getValue() / 100.0, 2));
          lines.push('Diagnostic NDVI mean (fall+spring): ' + ((useFall && useSpring) ? proxyFmt(perPrimaryNdviMean, 3) : 'excluded'));
        }
      }
      var selectedLines = [];
      selectedLines.push('Years: ' + yearSpanLabel(periodYears) + ' (' + startBox.getValue() + ' to ' + endBox.getValue() + ')');
      selectedLines.push('NDVI source: ' + primaryNdviLabel);
      selectedLines.push('Window inclusion: fall=' + fallIncludedText + ' | spring=' + springIncludedText);
      if (!useFall && !useSpring) { selectedLines.push('Class: unavailable (both windows are disabled).'); }
      else if (periodYears.length === 0) { selectedLines.push('Class: unavailable (selected dates outside available management years).'); }
      else if (isNaN(perScore)) { selectedLines.push('Class: unavailable (insufficient data within selected years).'); }
      else {
        selectedLines.push('Class: ' + coverClassLabel(scoreClass(perScore)));
        selectedLines.push('Frequency score: ' + proxyFmt(perScore, 3) + ' | confidence: ' + confidenceFromMidpoint(perScore, 0.5) + '%');
      }
      addSelectedClassificationPanel('Cover Crop (Selected Timeframe)', selectedLines);
      lines.push('');
      if (!useFall && !useSpring) { lines.push('Historical baseline (' + yearSpanLabel(allYears) + '): unavailable (both windows disabled).'); }
      else if (isNaN(histScore)) { lines.push('Historical baseline (' + yearSpanLabel(allYears) + '): unavailable (insufficient data).'); }
      else {
        lines.push('Historical baseline (' + yearSpanLabel(allYears) + '): ' + coverClassLabel(histClass));
        lines.push('Historical frequency score: ' + proxyFmt(histScore, 3) + ' | confidence: ' + histConf + '%');
      }
      lines.push('cover_crop_freq_proxy: ' + proxyFmt(histFreq, 3));
      lines.push('Historical source NDVI: fall=' + (useFall ? proxyFmt(histPrimaryFall, 3) : 'excluded') + ' | spring=' + (useSpring ? proxyFmt(histPrimarySpring, 3) : 'excluded'));
      lines.push(checkNdviLabel + ' (historical): fall=' + (useFall ? proxyFmt(histCheckFall, 3) : 'excluded') + ' | spring=' + (useSpring ? proxyFmt(histCheckSpring, 3) : 'excluded'));
      lines.push('Scene count mean (historical): fall=' + (useFall ? proxyFmt(histFallCount, 2) : 'excluded') + ' | spring=' + (useSpring ? proxyFmt(histSpringCount, 2) : 'excluded'));
      lines.push('Valid-pixel frac mean (historical): fall=' + (useFall ? proxyFmt(histFallValid, 3) : 'excluded') + ' | spring=' + (useSpring ? proxyFmt(histSpringValid, 3) : 'excluded'));
      lines.push('Historical NDVI mean (fall+spring): ' + ((useFall && useSpring) ? proxyFmt(histPrimaryNdviMean, 3) : 'excluded'));
      lines.push('Trend (# = cover crop present, . = absent):');
      lines.push(allYears.map(function(y){ var v = numOrNaN(stats['cover_crop_likely_' + y]); return y + ':' + (isNaN(v) ? '?' : (v >= 0.5 ? '#' : '.')); }).join('  '));
      addAnalysisPanel('Cover Crop Analysis', lines);
      statusLabel.setValue('Cover crop analysis complete.');
      onComplete(true);
    });
  });
}

function runTillageAnalysis(opts){
  opts = opts || {};
  var onComplete = (typeof opts.onComplete === 'function') ? opts.onComplete : function(){};
  if (opts.clearExisting !== false){ clearManagementAnalysisOutput(); clearSelectedClassificationOutput(); }
  if (!state.lastGeom){ statusLabel.setValue('Click a field first.'); onComplete(false); return; }
  if (!state.s2Base){ statusLabel.setValue('Run / Update first.'); onComplete(false); return; }
  var geom = state.lastGeom;
  var years = state.mgmtYears || [];
  var periodYears = analysisYearsFromDateRange();
  var ndtiBands = years.map(function(y){ return 'spring_ndti_' + y; });
  var periodNdtiBands = periodYears.map(function(y){ return 'spring_ndti_' + y; });
  var periodBareBands = periodYears.map(function(y){ return 'spring_bare_mask_' + y; });
  buildProxiesForField(geom, function(){
    var reducerParams = {reducer: ee.Reducer.mean(), geometry: geom, scale: 20, tileScale: 4, maxPixels: 1e9, bestEffort: true};
    var tillageBands = ['reduced_till_likelihood_proxy','intensive_till_likelihood_proxy','spring_bare_freq','spring_ndti_med'];
    if (sarToggle.getValue()) { tillageBands.push('sar_reduced_score_mean'); }
    var aggStats = state.mgmtProxyImage.select(tillageBands).reduceRegion(reducerParams);
    var yearlyStats = state.annualMgmtImage.select(ndtiBands).reduceRegion(reducerParams);
    var periodBandList = periodNdtiBands.concat(periodBareBands);
    var periodStats = ee.Dictionary(ee.Algorithms.If(
      periodBandList.length > 0,
      state.annualMgmtImage.select(periodBandList).reduceRegion(reducerParams),
      ee.Dictionary({})
    ));
    var mergedStats = ee.Dictionary(aggStats).combine(ee.Dictionary(yearlyStats), true).combine(periodStats, true);
    statusLabel.setValue('Running tillage analysis...');
    mergedStats.evaluate(function(stats, err){
      if (err || !stats){
        statusLabel.setValue('Tillage analysis failed.');
        addSelectedClassificationPanel('Tillage (Selected Timeframe)', ['Unable to compute selected-timeframe classification.']);
        addAnalysisPanel('Tillage Detection', ['Unable to compute tillage proxy stats for this field.']);
        onComplete(false); return;
      }
      var ndtiBounds = tillNormBounds(), classThresholds = tillClassThresholds();
      var histSpringNdtiMed = numOrNaN(stats.spring_ndti_med);
      var histNorm = ndtiNormFromValue(histSpringNdtiMed);
      var histClass = tillageClassFromNorm(histNorm);
      var histDesc = tillageResidueLabelFromNorm(histNorm);
      var histResidue = isNaN(histNorm) ? NaN : Math.round(histNorm * 100);
      var histReduced = numOrNaN(stats.reduced_till_likelihood_proxy);
      var histIntensive = numOrNaN(stats.intensive_till_likelihood_proxy);
      var histMargin = (isNaN(histReduced) || isNaN(histIntensive)) ? NaN : (histReduced - histIntensive);
      var histConfidenceMid = (classThresholds.noTill + classThresholds.reduced) / 2;
      var histConfidence = isNaN(histNorm) ? NaN : Math.min(99, Math.round((Math.abs(histNorm - histConfidenceMid) / 0.5) * 100));
      var perNdtiMed = NaN, perBareFreq = NaN, perNorm = NaN, perClass = null, perDesc = null, perResidue = NaN, perReduced = NaN, perIntensive = NaN;
      var lines = [];
      lines.push('-- SELECTED TIMEFRAME CLASSIFICATION --');
      lines.push('Years: ' + yearSpanLabel(periodYears) + ' (' + startBox.getValue() + ' to ' + endBox.getValue() + ')');
      if (!periodYears.length) {
        lines.push('Class: unavailable (selected dates outside available management years).');
      } else {
        perNdtiMed = medianFromBandStats(stats, periodNdtiBands);
        perBareFreq = meanFromBandStats(stats, periodBareBands);
        perNorm = ndtiNormFromValue(perNdtiMed);
        perClass = tillageClassFromNorm(perNorm);
        perDesc = tillageResidueLabelFromNorm(perNorm);
        perResidue = Math.round(perNorm * 100);
        perReduced = perNorm * perBareFreq;
        perIntensive = (1 - perNorm) * perBareFreq;
        if (isNaN(perNdtiMed) || isNaN(perBareFreq)) {
          lines.push('Class: unavailable (insufficient data inside selected years).');
        } else {
          lines.push('Class: ' + perClass);
          lines.push('Residue estimate: ~' + perResidue + '% (' + perDesc + ')');
          lines.push('Timeframe spring NDTI (median): ' + proxyFmt(perNdtiMed, 3) + ' -> norm: ' + proxyFmt(perNorm, 2) + '/1.00');
          lines.push('Timeframe reduced proxy: ' + proxyFmt(perReduced, 3) + ' | intensive proxy: ' + proxyFmt(perIntensive, 3));
        }
      }
      var selectedLines = [];
      selectedLines.push('Years: ' + yearSpanLabel(periodYears) + ' (' + startBox.getValue() + ' to ' + endBox.getValue() + ')');
      if (!periodYears.length) { selectedLines.push('Class: unavailable (selected dates outside available management years).'); }
      else if (isNaN(perNdtiMed) || isNaN(perBareFreq)) { selectedLines.push('Class: unavailable (insufficient data inside selected years).'); }
      else {
        selectedLines.push('Class: ' + perClass);
        selectedLines.push('Residue estimate: ~' + perResidue + '% (' + perDesc + ')');
      }
      addSelectedClassificationPanel('Tillage (Selected Timeframe)', selectedLines);
      lines.push('');
      lines.push('-- HISTORICAL BASELINE CLASSIFICATION --');
      lines.push('Years: ' + yearSpanLabel(years));
      if (isNaN(histNorm)) { lines.push('Class: unavailable (insufficient historical NDTI data).'); }
      else {
        lines.push('Class: ' + histClass);
        lines.push('Residue estimate: ~' + histResidue + '% (' + histDesc + ')');
        lines.push('Multi-year spring NDTI (median): ' + proxyFmt(histSpringNdtiMed, 3) + ' -> norm: ' + proxyFmt(histNorm, 2) + '/1.00');
      }
      lines.push('Reduced proxy: ' + proxyFmt(histReduced, 3) + ' | intensive proxy: ' + proxyFmt(histIntensive, 3));
      lines.push('Margin: ' + proxyFmt(histMargin, 3) + ' | confidence: ' + proxyFmt(histConfidence, 0) + '%');
      lines.push('Thresholds: No-till NDTI_norm>=' + proxyFmt(classThresholds.noTill, 2) + ' | Reduced>=' + proxyFmt(classThresholds.reduced, 2) + ' | Intensive<' + proxyFmt(classThresholds.reduced, 2));
      lines.push('NDTI->norm anchors: low=' + proxyFmt(ndtiBounds.low, 2) + ' | high=' + proxyFmt(ndtiBounds.high, 2));
      if (sarToggle.getValue()) { lines.push('SAR blended (weight=' + SAR_BLEND_WEIGHT + ')' + (stats.sar_reduced_score_mean !== undefined ? ' | sar_score=' + proxyFmt(stats.sar_reduced_score_mean, 3) : '')); }
      lines.push('');
      lines.push('-- HISTORICAL EVENT HISTORY --');
      lines.push('Year  Spring NDTI  Residue%  Event Likelihood    Intensity');
      lines.push('----  -----------  --------  ------------------  ---------');
      var EVENT_THRESHOLD = Math.min(classThresholds.noTill, classThresholds.reduced + 0.05);
      var eventYears = [];
      years.forEach(function(yr){
        var yrNdti = numOrNaN(stats['spring_ndti_' + yr]);
        if (isNaN(yrNdti)) { lines.push(yr + '  no data'); return; }
        var yrNorm = ndtiNormFromValue(yrNdti);
        if (isNaN(yrNorm)) { lines.push(yr + '  no data'); return; }
        var resEst = Math.round(yrNorm * 100);
        var eventLabel, intensLabel;
        if (yrNorm >= classThresholds.noTill) { eventLabel = 'no event'; intensLabel = '-'; }
        else if (yrNorm >= EVENT_THRESHOLD) { eventLabel = 'possible event'; intensLabel = 'light'; eventYears.push(yr); }
        else if (yrNorm >= 0.15) { eventLabel = 'LIKELY EVENT'; intensLabel = 'moderate'; eventYears.push(yr); }
        else { eventLabel = 'LIKELY EVENT'; intensLabel = 'heavy'; eventYears.push(yr); }
        lines.push(String(yr) + '  ' + proxyFmt(yrNdti, 3) + '        ' + resEst + '%      ' + eventLabel + '   ' + intensLabel);
      });
      lines.push('');
      if (eventYears.length === 0) { lines.push('Summary: No tillage events detected (' + years.length + ' years of data)'); }
      else { lines.push('Summary: ' + eventYears.length + ' event year(s) detected: ' + eventYears.join(', ')); }
      lines.push('(Event threshold: NDTI_norm < ' + EVENT_THRESHOLD + ')');
      addAnalysisPanel('Tillage Detection', lines);
      statusLabel.setValue('Tillage analysis complete.');
      onComplete(true);
    });
  });
}

function addCoverProxyLayer(){
  var name = 'Cover Crop Frequency Proxy';
  removeLayerByName(name);
  Map.addLayer(state.mgmtProxyImage.select('cover_crop_freq_proxy'), {min:0, max:1, palette:['8c510a','f6e8c3','c7eae5','01665e']}, name, true, 0.85);
  state.showCoverLayer = true;
}
function addTillageProxyLayer(){
  var name = 'Reduced Tillage Likelihood Proxy';
  removeLayerByName(name);
  Map.addLayer(state.mgmtProxyImage.select('reduced_till_likelihood_proxy'), {min:-0.5, max:0.7, palette:['8b0000','fdbb84','ffffbf','91bfdb','2166ac']}, name, true, 0.85);
  state.showTillageLayer = true;
}
function runAutoManagementSuite(){
  if (!state.lastGeom || !state.s2Base) { return; }
  clearManagementAnalysisOutput();
  clearSelectedClassificationOutput();
  addSelectedClassificationPanel('Cover Crop (Selected Timeframe)', ['Running...']);
  addSelectedClassificationPanel('Tillage (Selected Timeframe)', ['Running...']);
  statusLabel.setValue('Auto-running cover crop + tillage analyses...');
  buildProxiesForField(state.lastGeom, function(){
    addCoverProxyLayer();
    addTillageProxyLayer();
    runCoverCropAnalysis({clearExisting: false, onComplete: function(){ runTillageAnalysis({clearExisting: false}); }});
  });
}
function toggleCoverProxyLayer(){
  if (!state.lastGeom){ statusLabel.setValue('Click a field first.'); return; }
  if (!state.s2Base){ statusLabel.setValue('Run / Update first.'); return; }
  var name = 'Cover Crop Frequency Proxy';
  if (state.showCoverLayer){ removeLayerByName(name); state.showCoverLayer = false; return; }
  buildProxiesForField(state.lastGeom, function(){ addCoverProxyLayer(); });
}
function toggleTillageProxyLayer(){
  if (!state.lastGeom){ statusLabel.setValue('Click a field first.'); return; }
  if (!state.s2Base){ statusLabel.setValue('Run / Update first.'); return; }
  var name = 'Reduced Tillage Likelihood Proxy';
  if (state.showTillageLayer){ removeLayerByName(name); state.showTillageLayer = false; return; }
  buildProxiesForField(state.lastGeom, function(){ addTillageProxyLayer(); });
}
function exportFieldClasses(){
  if (!state.s2Base){ statusLabel.setValue('Run / Update first so export uses current settings.'); return; }
  var startText = (startBox.getValue() || '').trim(), endText = (endBox.getValue() || '').trim();
  if (!isValidIsoDate(startText) || !isValidIsoDate(endText)){ statusLabel.setValue('Use YYYY-MM-DD start/end before exporting.'); return; }
  var yearsClient = analysisYearsFromDateRange();
  if (!yearsClient.length) { statusLabel.setValue('No analysis years available for export. Check that your date range covers at least one calendar year.'); return; }
  var yearsEe = ee.List(yearsClient);
  var useModisForCover = USE_MODIS_FOR_COVER(), useFall = USE_FALL_WINDOW(), useSpring = USE_SPRING_WINDOW();
  var fallThresh = Number(CC_FALL_THRESH()), springThresh = Number(CC_SPRING_THRESH());
  var ndtiBounds = tillNormBounds(), tillThresholds = tillClassThresholds();
  var noTillNorm = Number(tillThresholds.noTill), reducedNorm = Number(tillThresholds.reduced);
  var tillConfMid = (noTillNorm + reducedNorm) / 2;
  var yearsLabel = yearSpanLabel(yearsClient);
  var coverSource = useModisForCover ? 'MODIS NDVI (Terra + Aqua)' : 'Sentinel-2 NDVI';
  statusLabel.setValue('Preparing export collection (one row per field)...');
  var outFc = fields.map(function(f){
    var geom = ee.Feature(f).geometry();
    var annualCollection = ee.ImageCollection(yearsEe.map(function(y){
      return annualMgmtForYear(ee.Number(y).int(), false, geom).set('year', ee.Number(y).int());
    }));
    var reducerParams = {reducer: ee.Reducer.mean(), geometry: geom, scale: 20, tileScale: 4, maxPixels: 1e9, bestEffort: true};
    var coverFreqRaw = annualCollection.select('cover_crop_likely').mean().reduceRegion(reducerParams).get('cover_crop_likely');
    var ndtiMedRaw = annualCollection.select('spring_ndti').median().reduceRegion(reducerParams).get('spring_ndti');
    var bareFreqRaw = annualCollection.select('spring_bare_mask').mean().reduceRegion(reducerParams).get('spring_bare_mask');
    var hasCover = ee.Boolean(ee.Algorithms.IsEqual(coverFreqRaw, null)).not();
    var hasNdti = ee.Boolean(ee.Algorithms.IsEqual(ndtiMedRaw, null)).not();
    var hasBare = ee.Boolean(ee.Algorithms.IsEqual(bareFreqRaw, null)).not();
    var coverFreq = ee.Number(ee.Algorithms.If(hasCover, coverFreqRaw, -9999));
    var ndtiMed = ee.Number(ee.Algorithms.If(hasNdti, ndtiMedRaw, -9999));
    var bareFreq = ee.Number(ee.Algorithms.If(hasBare, bareFreqRaw, -9999));
    var ndtiNorm = ndtiMed.subtract(ndtiBounds.low).divide(ndtiBounds.high - ndtiBounds.low).max(0).min(1);
    var coverClass = ee.String(ee.Algorithms.If(hasCover, eeCoverClassFromScore(coverFreq), 'UNAVAILABLE'));
    var tillageClass = ee.String(ee.Algorithms.If(hasNdti, eeTillageClassFromNorm(ndtiNorm, reducedNorm, noTillNorm), 'UNAVAILABLE'));
    var coverConf = ee.Number(ee.Algorithms.If(hasCover, coverFreq.subtract(0.5).abs().divide(0.5).min(0.99).multiply(100).round(), -9999));
    var tillConf = ee.Number(ee.Algorithms.If(hasNdti, ndtiNorm.subtract(tillConfMid).abs().divide(0.5).min(0.99).multiply(100).round(), -9999));
    return ee.Feature(f).set({
      poly_id: ee.Feature(f).get('poly_id'),
      export_start_date: startText, export_end_date: endText, export_year_span: yearsLabel,
      cover_ndvi_source: coverSource, cover_fall_enabled: useFall, cover_spring_enabled: useSpring,
      cover_fall_thresh: fallThresh, cover_spring_thresh: springThresh,
      cover_freq_score: ee.Algorithms.If(hasCover, coverFreq, null),
      cover_class: coverClass,
      cover_confidence_pct: ee.Algorithms.If(hasCover, coverConf, null),
      till_ndti_low: ndtiBounds.low, till_ndti_high: ndtiBounds.high,
      till_reduced_thresh: reducedNorm, till_notill_thresh: noTillNorm,
      till_ndti_med: ee.Algorithms.If(hasNdti, ndtiMed, null),
      till_ndti_norm: ee.Algorithms.If(hasNdti, ndtiNorm, null),
      spring_bare_freq: ee.Algorithms.If(hasBare, bareFreq, null),
      tillage_class: tillageClass,
      tillage_confidence_pct: ee.Algorithms.If(hasNdti, tillConf, null)
    });
  });
  var taskName = 'field_classes_' + sanitizeTaskToken(startText) + '_' + sanitizeTaskToken(endText) + '_' + (useModisForCover ? 'modis' : 's2');
  Export.table.toDrive({
    collection: outFc, description: taskName, fileNamePrefix: taskName, fileFormat: 'CSV',
    selectors: ['poly_id','cover_class','cover_freq_score','cover_confidence_pct','tillage_class',
      'till_ndti_med','till_ndti_norm','tillage_confidence_pct','spring_bare_freq',
      'export_year_span','export_start_date','export_end_date','cover_ndvi_source',
      'cover_fall_enabled','cover_spring_enabled','cover_fall_thresh','cover_spring_thresh',
      'till_ndti_low','till_ndti_high','till_reduced_thresh','till_notill_thresh']
  });
  statusLabel.setValue('Export task created: ' + taskName + '. Open the Tasks tab and click Run.');
}
/* ---------- Run / Update (fast) ---------- */
function fillWeeksFast(onDone){
  function finish(ok, err){
    if (typeof onDone === 'function') { onDone(ok, err || null); }
  }
  var weeks = weeklySequence(startBox.getValue(), endBox.getValue());
  var fc = ee.FeatureCollection(weeks.map(function(ws){
    var we = ee.Date(ws).advance(1,'week');
    var n  = state.s2Base.filterDate(ws, we).size();
    return ee.Feature(null, {w: ee.Date(ws).format('YYYY-MM_dd'), n: n});
  }));

  fc.aggregate_array('w').evaluate(function(ws, error){
    if (error) {
      statusLabel.setValue('Error loading weeks: ' + error);
      finish(false, error);
      return;
    }
    state.allWeeksWithScenes = ws || [];
    if (state.allWeeksWithScenes.length > 0) {
      updateWeekSelect(state.allWeeksWithScenes, state.allWeeksWithScenes[0]);
      statusLabel.setValue('Ready. Pick a week or click a field.');
      finish(true, null);
    } else {
      statusLabel.setValue('No weeks found with S2 data.');
      finish(false, null);
    }
  });
}

function applyBasemapDimmer(){
  var name = 'Basemap Dimmer';
  var layers = Map.layers();
  for (var i = layers.length()-1; i >= 0; i--) {
    var L = layers.get(i);
    if (L.getName() === name) { Map.remove(L); }
  }
  var op = baseDimSlider.getValue();
  if (op > 0){
    var dim = ee.Image.constant(0).visualize({palette:['000000'], min:0, max:1});
    var dimLayer = ui.Map.Layer(dim, {}, name, true, op);
    Map.layers().insert(0, dimLayer);
  }
}
baseDimSlider.onChange(applyBasemapDimmer);

function update(){
  statusLabel.setValue('Filtering collections…');
  updateWeekSelect([], null);

  var v = validateDateRange(startBox.getValue(), endBox.getValue());
  if (!v.valid) { statusLabel.setValue('Invalid date range.'); return; }

  var bounds = fields.geometry().bounds();

  state.s2Base = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(bounds)
    .filterDate(startBox.getValue(), endBox.getValue())
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', cloudSlide.getValue()))
    .map(maskS2clouds);

  state.s1Base = sarToggle.getValue() ? ee.ImageCollection('COPERNICUS/S1_GRD')
    .filterBounds(bounds)
    .filterDate(startBox.getValue(), endBox.getValue())
    .filter(ee.Filter.eq('instrumentMode','IW'))
    .filter(ee.Filter.eq('resolution_meters',10))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation','VV'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation','VH')) : null;

  // Build management years list: always 2020 → max(CDL_LAST, date-range end year).
  // Historical baseline always starts at 2020; the upper cap is extended to include
  // whatever year the user has entered (e.g. 2025) so current-year analysis works.
  // analysisYearsFromDateRange() then filters this list to the selected period.
  var yearsClient = [];
  var _rangeEndYr = new Date((endBox.getValue() || new Date().toISOString().slice(0,10)) + 'T00:00:00Z').getUTCFullYear();
  var _upperYr = Math.max(CDL_LAST, isFinite(_rangeEndYr) ? _rangeEndYr : CDL_LAST);
  for (var y = 2020; y <= _upperYr; y++) { yearsClient.push(y); }
  state.mgmtYears = yearsClient;
  state.mgmtProxyImage = null;
  state.annualMgmtImage = null;
  state.lastMgmtGeomHash = null;
  state.showCoverLayer = false;
  state.showTillageLayer = false;
  state.showUsdaS2Layer = false;
  state.showEntropyLayer = false;
  state.showNdtiLayer = false;
  state.showTillageEventLayer = false;
  removeLayerByName(USDA_S2_LAYER_NAME);
  removeLayerByName(USDA_ENTROPY_LAYER_NAME);
  removeLayerByName(NDTI_LAYER_NAME);
  removeLayerByName(TILL_EVENT_LAYER_NAME);

  applyBasemapDimmer();

  // Refresh EUCROPMAP layer using the most recent available year not after the end of the date range.
  var _endYrNum = parseInt((endBox.getValue() || new Date().getFullYear().toString()).substring(0, 4), 10);
  refreshEucropLayer(String(_endYrNum));

  statusLabel.setValue('Building week list…');
  fillWeeksFast(function(hasWeeks){
    runAutoManagementSuite();
  });
}
runBtn.onClick(update);

/* ---------- Management button handlers (Phase 2) ---------- */
coverCropBtn.onClick(function(){ runCoverCropAnalysis({clearExisting: true}); });
tillageBtn.onClick(function(){ runTillageAnalysis({clearExisting: true}); });
toggleCoverLayerBtn.onClick(toggleCoverProxyLayer);
toggleTillageLayerBtn.onClick(toggleTillageProxyLayer);
exportFieldClassesBtn.onClick(exportFieldClasses);

toggleUsdaS2Btn.onClick(function(){
  var geom = selectedGeomForUsdaLayers();
  if (!geom) { return; }
  if (state.showUsdaS2Layer){ removeLayerByName(USDA_S2_LAYER_NAME); state.showUsdaS2Layer = false; statusLabel.setValue('S2 feature layer removed.'); return; }
  var startText = (usdaS2StartBox.getValue() || '').trim();
  var endText = (usdaS2EndBox.getValue() || '').trim();
  if (!isValidIsoDate(startText) || !isValidIsoDate(endText)){ statusLabel.setValue('Use YYYY-MM-DD for Sentinel-2 start/end.'); return; }
  if (new Date(startText + 'T00:00:00Z').getTime() > new Date(endText + 'T00:00:00Z').getTime()){ statusLabel.setValue('Sentinel-2 date range invalid: start must be <= end.'); return; }
  var cloudPct = Number(usdaS2CloudSlider.getValue());
  Map.addLayer(usdaSentinel2Rgb(startText, endText, cloudPct, geom), {bands:['N','R','G'], min:0.01, max:0.5}, USDA_S2_LAYER_NAME, true, 1.0);
  state.showUsdaS2Layer = true;
  statusLabel.setValue('S2 false-color NIR layer added (' + startText + ' to ' + endText + ').');
});

toggleEntropyBtn.onClick(function(){
  statusLabel.setValue('CDL Temporal Entropy is not available in the EMEA region (USDA/NASS/CDL is US-only). This feature is planned for Phase 3 using alternative EU land-use data.');
});

toggleNdtiBtn.onClick(function(){
  var geom = selectedGeomForUsdaLayers();
  if (!geom) { return; }
  if (state.showNdtiLayer){ removeLayerByName(NDTI_LAYER_NAME); state.showNdtiLayer = false; statusLabel.setValue('NDTI overlay removed.'); return; }
  var startText = (usdaS2StartBox.getValue() || '').trim();
  var endText = (usdaS2EndBox.getValue() || '').trim();
  if (!isValidIsoDate(startText) || !isValidIsoDate(endText)){ statusLabel.setValue('Use YYYY-MM-DD for NDTI start/end.'); return; }
  if (new Date(startText + 'T00:00:00Z').getTime() > new Date(endText + 'T00:00:00Z').getTime()){ statusLabel.setValue('NDTI date range invalid: start must be <= end.'); return; }
  var cloudPct = Number(usdaS2CloudSlider.getValue());
  // Mask only dense closed-canopy pixels (NDVI > 0.65) where NDTI reflects canopy
  // water not soil. Threshold is deliberately high: spring no-till fields have residue
  // (high NDTI, blue) AND greening wheat/cover crop (NDVI 0.35-0.55) simultaneously —
  // a low threshold would blank out the residue signal that confirms no-till practice.
  var ndtiImg = ndtiComposite(startText, endText, cloudPct, geom);
  var ndviForMask = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterDate(startText, endText)
    .filterBounds(geom)
    .filter(ee.Filter.lte('CLOUDY_PIXEL_PERCENTAGE', cloudPct))
    .map(function(img){ var n=img.select('B8'), r=img.select('B4'); return n.subtract(r).divide(n.add(r)).rename('NDVI').copyProperties(img,['system:time_start']); });
  var ndviMask = ee.Image(ee.Algorithms.If(
    ndviForMask.size().gt(0),
    ndviForMask.median().lte(0.65),
    ee.Image.constant(1).rename('NDVI')
  ));
  var ndtiMasked = ndtiImg.updateMask(ndviMask.rename('NDTI'));
  Map.addLayer(ndtiMasked, {min:-0.2, max:0.4, palette:['#d73027','#fee090','#e0f3f8','#74add1','#313695']}, NDTI_LAYER_NAME, true, 0.9);
  state.showNdtiLayer = true;
  statusLabel.setValue('NDTI overlay added (' + startText + ' to ' + endText + ').');
});

toggleTillageEventBtn.onClick(function(){
  var geom = selectedGeomForUsdaLayers();
  if (!geom) { return; }
  if (state.showTillageEventLayer){ removeLayerByName(TILL_EVENT_LAYER_NAME); state.showTillageEventLayer = false; statusLabel.setValue('Likely tillage event mask removed.'); return; }
  var startText = (usdaS2StartBox.getValue() || '').trim();
  var endText = (usdaS2EndBox.getValue() || '').trim();
  if (!isValidIsoDate(startText) || !isValidIsoDate(endText)){ statusLabel.setValue('Use YYYY-MM-DD for tillage-event start/end.'); return; }
  if (new Date(startText + 'T00:00:00Z').getTime() > new Date(endText + 'T00:00:00Z').getTime()){ statusLabel.setValue('Tillage-event date range invalid: start must be <= end.'); return; }
  var cloudPct = Number(usdaS2CloudSlider.getValue());
  var ndtiMax = Number(ndtiEventThreshSlider.getValue());
  var ndviMax = Number(ndviEventMaxSlider.getValue());
  var ndmiMax = Number(ndmiEventMaxSlider.getValue());
  var eventMask = tillageEventMaskComposite(startText, endText, cloudPct, geom, ndtiMax, ndviMax, ndmiMax);
  Map.addLayer(eventMask.updateMask(eventMask), {palette:['#ff00ff']}, TILL_EVENT_LAYER_NAME, true, 0.95);
  state.showTillageEventLayer = true;
  statusLabel.setValue('Likely tillage event mask added. NDTI<=' + proxyFmt(ndtiMax, 2) + ', NDVI<=' + proxyFmt(ndviMax, 2) + ', NDMI<=' + proxyFmt(ndmiMax, 2) + '.');
});

/* ---------- Overlays ---------- */
function visFor(which){
  if (which === 'NDVI') {
    return {min:0, max:0.8, palette:['a59d95','e4ffaf','00e400','016c0e']};
  }
  if (which === 'NDTI') {
    return {min:-0.2, max:0.4, palette:['#d73027','#fee090','#e0f3f8','#74add1','#313695']};
  }
  if (which === 'NDMI') {
    return {min:-0.2, max:0.4, palette:['#8c510a','#d8b365','#f6e8c3','#c7eae5','#5ab4ac','#01665e']};
  }
  return {min:0.1, max:0.9, palette:['#30123b','#3c5aa8','#56c18d','#74d14c','#b7ef1a']};
}
function addOverlay(){
  var wk = weekSelect.getValue();
  if (!wk){ return; }
  var which = indexSelect.getValue();
  var op    = alphaSlider.getValue();
  var img   = composeWeek(ee.Date.parse('YYYY-MM_dd', wk));

  function addOne(band){
    Map.addLayer(img.select(band), visFor(band), band + ' \u2022 ' + wk, true, op);
  }

  function addS2(){
    var geom = selectedGeomForUsdaLayers();
    if (!geom){ return; }
    var ws = ee.Date.parse('YYYY-MM_dd', wk);
    var cloudPct = Number(usdaS2CloudSlider.getValue());
    var s2 = usdaSentinel2Rgb(ws.format('YYYY-MM-dd'), ws.advance(7, 'day').format('YYYY-MM-dd'), cloudPct, geom);
    Map.addLayer(s2, {bands:['N','R','G'], min:0.01, max:0.5}, 'S2 \u2022 ' + wk, true, op);
  }

  if (which === 'All'){
    // Add bottom-to-top so NDVI ends up highest in the layer panel.
    addS2(); addOne('NDMI'); addOne('NDTI'); addOne('EVI'); addOne('NDVI');
  } else if (which === 'S2'){
    addS2();
  } else {
    addOne(which);
  }
}
function clearOverlays(){
  var keep = {'Fields': true, 'EUCROPMAP Crop Types': true};
  var layers = Map.layers();
  for (var i = layers.length()-1; i >= 0; i--){
    var L = layers.get(i);
    var layerName = L.getName();
    if (!keep[layerName]) { Map.remove(L); }
  }
  state.showCoverLayer = false;
  state.showTillageLayer = false;
  state.showUsdaS2Layer = false;
  state.showEntropyLayer = false;
  state.showNdtiLayer = false;
  state.showTillageEventLayer = false;
  removeLayerByName(USDA_S2_LAYER_NAME);
  removeLayerByName(USDA_ENTROPY_LAYER_NAME);
  removeLayerByName(NDTI_LAYER_NAME);
  removeLayerByName(TILL_EVENT_LAYER_NAME);
}
addOverlayBtn.onClick(addOverlay);
clearOverlayBtn.onClick(clearOverlays);

/* ---------- Photo overlay (unchanged) ---------- */
function addPhotoOverlay(){
  var wk = weekSelect.getValue();
  if (!wk){ statusLabel.setValue('Pick a week first for Photo.'); return; }
  if (!state.lastGeom){ statusLabel.setValue('Click a field first.'); return; }

  var geom = state.lastGeom;
  var ws = ee.Date.parse('YYYY-MM_dd', wk);
  var we = ws.advance(1,'week');

  var srcPref = photoSourceSel.getValue();
  var landsatCol = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
    .filterBounds(geom)
    .filterDate(ws.advance(-lsMaxDeltaDays, 'day'), we.advance(lsMaxDeltaDays, 'day'))
    .sort('system:time_start');
  var s2Col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geom)
    .filterDate(ws.advance(-lsMaxDeltaDays, 'day'), we.advance(lsMaxDeltaDays, 'day'))
    .sort('system:time_start');

  function pickClosest(col){
    var withDiff = col.map(function(img){
      var t = ee.Number(img.get('system:time_start'));
      var diff = t.subtract(ws.millis()).abs();
      return img.set('date_diff', diff);
    }).sort('date_diff');
    return ee.Image(withDiff.first());
  }

  // EMEA: S2 True Color | Landsat-9 | S2 → Landsat
  var order = srcPref === 'S2 True Color' ? ['S2','LS']
            : srcPref === 'Landsat-9' ? ['LS','S2']
            : ['S2','LS'];  // S2 → Landsat

  var choice = ee.Dictionary({src: 'NONE', img: null});
  choice = ee.Dictionary(ee.Algorithms.If(order[0] === 'LS',
    ee.Algorithms.If(landsatCol.size().gt(0), {src:'LS', img: pickClosest(landsatCol)}, choice),
    choice));
  choice = ee.Dictionary(ee.Algorithms.If(order[0] === 'S2',
    ee.Algorithms.If(s2Col.size().gt(0), {src:'S2', img: pickClosest(s2Col)}, choice),
    choice));

  choice = ee.Dictionary(ee.Algorithms.If(ee.Algorithms.IsEqual(choice.get('src'), 'NONE'),
    ee.Algorithms.If(order.indexOf('LS') > 0,
      ee.Algorithms.If(landsatCol.size().gt(0), {src:'LS', img: pickClosest(landsatCol)}, choice),
      choice),
    choice));
  choice = ee.Dictionary(ee.Algorithms.If(ee.Algorithms.IsEqual(choice.get('src'), 'NONE'),
    ee.Algorithms.If(order.indexOf('S2') > 0,
      ee.Algorithms.If(s2Col.size().gt(0), {src:'S2', img: pickClosest(s2Col)}, choice),
      choice),
    choice));

  var src = ee.String(choice.get('src'));
  var img = ee.Image(choice.get('img'));

  src.evaluate(function(s){
    if (!s || s === 'NONE') { statusLabel.setValue('No photo available near this week.'); return; }
    img.get('system:time_start').evaluate(function(ts){
      var dateStr = new Date(ts).toISOString().split('T')[0];
      var layerName = 'Photo • ' + s + ' • ' + dateStr;

      if (s === 'LS'){
        var ls = img.select(['SR_B4','SR_B3','SR_B2']).multiply(2.75e-05).add(-0.2);
        var qa = img.select('QA_PIXEL');
        var clear = qa.bitwiseAnd(1<<3).eq(0).and(qa.bitwiseAnd(1<<4).eq(0));
        ls = ls.updateMask(clear).rename(['B4','B3','B2']);
        Map.addLayer(ls.clip(geom), {bands:['B4','B3','B2'], min: 0.0, max: 0.35, gamma: 1.05}, layerName, true, alphaSlider.getValue());
        statusLabel.setValue(layerName + ' added.');
        return;
      }

      if (s === 'S2'){
        var s2 = img.select(['B4','B3','B2']).divide(10000);
        var scl = img.select('SCL');
        var clear2 = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11));
        s2 = s2.updateMask(clear2);
        Map.addLayer(s2.clip(geom), {bands:['B4','B3','B2'], min: 0.0, max: 0.35, gamma: 1.05}, layerName, true, alphaSlider.getValue());
        statusLabel.setValue(layerName + ' added.');
      }
    });
  });
}
photoBtn.onClick(addPhotoOverlay);

/* ---------- Popup ---------- */
var pop = ui.Panel({
  style:{position:'bottom-left', width:'480px', maxHeight:'55%', padding:'8px',
         backgroundColor:'rgba(255,255,255,0.92)'}
});
Map.add(pop);

/* MODIS chart */
function chartMODIS(geom){
  function prep(ic){
    return ic.select('NDVI').map(function(img){
      var scaled = img.multiply(0.0001).updateMask(img.neq(-3000))
        .copyProperties(img, img.propertyNames());
      return scaled;
    });
  }
  var terra = prep(ee.ImageCollection('MODIS/061/MOD13Q1')
    .filterBounds(geom).filterDate(startBox.getValue(), endBox.getValue()));
  var aqua  = prep(ee.ImageCollection('MODIS/061/MYD13Q1')
    .filterBounds(geom).filterDate(startBox.getValue(), endBox.getValue()));
  var merged = terra.merge(aqua);
  return ui.Chart.image.seriesByRegion({
    imageCollection: merged,
    regions: ee.FeatureCollection([ee.Feature(geom)]),
    reducer: ee.Reducer.mean(), band: 'NDVI', scale: 250,
    xProperty: 'system:time_start'
  }).setOptions({title:'MODIS NDVI (Terra + Aqua, 16-day)',
    hAxis:{title:'Date'}, vAxis:{title:'NDVI'}, lineWidth:2, pointSize:1});
}

/* S2 NDTI time-series chart */
function chartNDTI(geom){
  var b = tillNormBounds();
  var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geom)
    .filterDate(startBox.getValue(), endBox.getValue())
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', cloudSlide.getValue()))
    .map(maskS2clouds)
    .map(function(img){
      var sw1 = img.select('B11'), sw2 = img.select('B12');
      return sw1.subtract(sw2).divide(sw1.add(sw2)).rename('NDTI')
        .copyProperties(img, ['system:time_start']);
    });
  return ui.Chart.image.seriesByRegion({
    imageCollection: s2,
    regions: ee.FeatureCollection([ee.Feature(geom)]),
    reducer: ee.Reducer.mean(), band: 'NDTI', scale: 20,
    xProperty: 'system:time_start'
  }).setOptions({
    title: 'S2 NDTI  (B11\u2212B12)/(B11+B12)  |  norm low: ' + b.low.toFixed(2) + '  high: ' + b.high.toFixed(2),
    hAxis: {title: 'Date'},
    vAxis: {title: 'NDTI', viewWindow: {min: -0.5, max: 0.6}, gridlines: {count: 6}},
    lineWidth: 2, pointSize: 3,
    interpolateNulls: true,
    series: {0: {color: '#9c2706'}}
  });
}


/* Search functionality */
function searchField() {
  var searchId = searchBox.getValue().trim();
  if (!searchId) { statusLabel.setValue('Enter a field id to search'); return; }

  statusLabel.setValue('Searching for field ' + searchId + '...');

  // Convert the UI string to a number so it matches numeric mrv_field_id
  var searchNum = Number(searchId);
  if (isNaN(searchNum)) {
    statusLabel.setValue('Field id must be a number: ' + searchId);
    return;
  }

  var targetField = fields.filter(ee.Filter.eq('mrv_field_id', searchNum));

  targetField.size().evaluate(function(count, error) {
    if (error) { statusLabel.setValue('Search error: ' + error); return; }
    if (count === 0) { statusLabel.setValue('Field ' + searchId + ' not found'); return; }

    Map.centerObject(targetField, 12);
    statusLabel.setValue('Found field ' + searchId);
    state.lastGeom = targetField.first().geometry();
    state.lastPid = searchId;
    Map.addLayer(targetField.style({color:'red', width:4, fillColor:'00000000'}), {}, 'Search Result', true);
  });
}
searchBtn.onClick(searchField);


/* Click handler */
Map.onClick(function(coords){
  pop.clear();
  resetSelectedClassificationPanelRefs();
  resetManagementAnalysisPanelRefs();
  if (!state.s2Base){ pop.add(ui.Label('Run the tool first.')); return; }

  var pt  = ee.Geometry.Point([coords.lon, coords.lat]);
  var hitCollection = fields.filterBounds(pt);
  if (hitCollection.size().getInfo() === 0){ pop.add(ui.Label('Click inside a field.')); return; }
  var hit = hitCollection.first();

  var pid  = ee.String(ee.Feature(hit).get('poly_id'));
  var pidText = pid.getInfo();
  var geom = ee.Feature(hit).geometry();
  state.lastGeom = geom; state.lastPid = pidText;

  // Header
  var analysisHeader = ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {stretch: 'horizontal', backgroundColor: '#f0f8ff', padding: '6px', margin: '0 0 8px 0', border: '1px solid #4a90e2'}
  });
  var fieldLabel = ui.Label('Field Analysis - Field ID: ' + pidText,
    {fontWeight:'bold', fontSize:'12px', stretch: 'horizontal'});
  var analysisCloseBtn = ui.Button({label: 'X', style: {color: 'red', padding: '2px 6px', fontSize: '12px'}});
  analysisCloseBtn.onClick(function(){
    pop.clear();
    resetSelectedClassificationPanelRefs();
    resetManagementAnalysisPanelRefs();
    pop.add(ui.Label('Analysis popup closed.', {color: 'gray', fontSize: '11px'}));
  });
  analysisHeader.add(fieldLabel).add(analysisCloseBtn);
  pop.add(analysisHeader);

  // Click coords
  var coordsPanel = ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {backgroundColor: '#f9f9f9', padding: '4px', margin: '4px 0', border: '1px solid #ddd'}
  });
  coordsPanel.add(ui.Label('Click Location: ' + coords.lon.toFixed(6) + ', ' + coords.lat.toFixed(6),
    {fontSize:'11px', color:'#0066cc', fontWeight:'bold', stretch: 'horizontal'}));
  pop.add(coordsPanel);

  // ---- Placeholders added NOW so they stay at the top ----
  var farmMetaLabel = ui.Label('Field: (loading...)', {fontWeight:'bold', color:'#333'});
  var iacsCropLabel = ui.Label('IACS Crop: (loading...)', {fontWeight:'bold', color:'#0052cc'});
  var lcLabel  = ui.Label('ESA WorldCover (land cover context): (loading...)', {fontSize:'11px', color:'brown'});
  var pixLabel = ui.Label('Pixel @ click - NDVI: (loading...), EVI: (loading...)');
  var fldLabel = ui.Label('Field mean - NDVI: (loading...), EVI: (loading...), BSI: (loading...)');
  var wkLabel  = ui.Label('Week: (loading...)', {margin:'8px 0 4px 0'});
  pop.add(farmMetaLabel);
  pop.add(iacsCropLabel);
  pop.add(lcLabel);
  pop.add(pixLabel);
  pop.add(fldLabel);
  pop.add(wkLabel);
  // --------------------------------------------------------

  // --- Farm metadata from EMEA_1127 (field_name, farm_name, area, ID) ---
  // EMEA_1127 is a farm-management boundary asset — these are the real columns.
  ee.Feature(hit).toDictionary(
    ['field_name','farm_name','field_area_ha','mrv_field_id']
  ).evaluate(function(meta, metaErr) {
    if (metaErr || !meta) { farmMetaLabel.setValue('Field: (error reading metadata)'); return; }
    var parts = [];
    if (meta.field_name) parts.push(meta.field_name);
    if (meta.farm_name && meta.farm_name !== meta.field_name) parts.push('\u2014 ' + meta.farm_name);
    if (meta.field_area_ha) parts.push(parseFloat(meta.field_area_ha).toFixed(1) + ' ha');
    if (meta.mrv_field_id) parts.push('ID: ' + meta.mrv_field_id);
    farmMetaLabel.setValue('Field: ' + (parts.length ? parts.join(' | ') : '(unnamed)'));
  });

  // --- Crop type from JRC EUCROPMAP (GEE public catalog, no upload needed) ---
  // JRC/D5/EUCROPMAP/V1 — 10m EU crop type map derived from Sentinel-1/2 + LUCAS.
  // Uses the most recent available year not after the selected week year (dynamically picked).
  // Upgrade path: set IACS_ASSET at the top to use field-declared crop types instead
  // (requires ingesting DE_LSA_years_2023-2025.zip from https://zenodo.org/records/18670815).
  var EUCROPMAP_CLASSES = {
    100: 'Artificial',
    211: 'Common wheat',   212: 'Durum wheat',    213: 'Barley',
    214: 'Rye',            215: 'Oats',            216: 'Maize',
    217: 'Rice',           218: 'Triticale',       219: 'Other cereals',
    221: 'Potatoes',       222: 'Sugar beet',      223: 'Other root crops',
    230: 'Other non-permanent industrial crops',
    231: 'Sunflower',      232: 'Rapeseed / turnip rapeseed', 233: 'Soya',
    240: 'Dry pulses',     250: 'Fodder crops (cereals & leguminous)',
    290: 'Bare arable land',
    300: 'Woodland / Shrubland (incl. permanent crops)',
    500: 'Grasslands',     600: 'Bare land / lichens / moss',
    700: 'Water',          800: 'Wetlands'
  };
  // Color lookup for the popup label — built from the same EUCROPMAP_FROM / EUCROPMAP_PALETTE
  // arrays defined at top-level so the map layer and popup always use identical colors.
  var _eucropColorMap = {};
  for (var _ci = 0; _ci < EUCROPMAP_FROM.length; _ci++) {
    _eucropColorMap[EUCROPMAP_FROM[_ci]] = '#' + EUCROPMAP_PALETTE[_ci];
  }

  if (IACS_ASSET) {
    // Prefer declared IACS per-field data when available.
    // Check count first — .first() on an empty collection returns null and
    // calling .toDictionary() on null throws "element is required and may not be null".
    var iacsFC  = ee.FeatureCollection(IACS_ASSET);
    var iacsHits = iacsFC.filterBounds(geom).limit(1);
    iacsHits.size().evaluate(function(n, sizeErr) {
      if (sizeErr) { iacsCropLabel.setValue('IACS: error checking asset \u2014 ' + sizeErr); return; }
      if (n === 0) {
        iacsCropLabel.setValue('IACS Crop: no parcel match \u2014 location outside clipped area');
        return;
      }
      iacsHits.first().toDictionary(['EC_hcat_n','EC_hcat_c','crop_name','year','organic']).evaluate(function(ia, iaErr){
        if (iaErr) { iacsCropLabel.setValue('Crop type: error \u2014 ' + iaErr); return; }
        if (!ia || !ia.EC_hcat_n) { iacsCropLabel.setValue('IACS Crop: no crop name on matched parcel'); return; }
        var parts = [ia.EC_hcat_n];
        if (ia.EC_hcat_c) parts.push('(' + ia.EC_hcat_c + ')');
        if (ia.crop_name && ia.crop_name !== ia.EC_hcat_n) parts.push('/ ' + ia.crop_name);
        if (ia.year) parts.push('yr:' + ia.year);
        if (ia.organic === 1 || ia.organic === '1') parts.push('| organic \u2713');
        iacsCropLabel.setValue('IACS Crop (declared): ' + parts.join(' '));
      });
    });
  } else {
    // Fall back to JRC EUCROPMAP — directly from GEE catalog, no ingestion needed.
    // Dynamically picks the most recent image whose year is <= the selected week year,
    // so any future collection releases (e.g. 2025) are used automatically.
    var _selWk = weekSelect.getValue();
    var _selYr = _selWk ? parseInt(_selWk.substring(0, 4), 10) : new Date().getFullYear();
    var eucropImg = ee.ImageCollection('JRC/D5/EUCROPMAP/V1')
      .filter(ee.Filter.lte('system:time_start', ee.Date(String(_selYr) + '-12-31').millis()))
      .sort('system:time_start', false)
      .first();
    // Bundle year and classification into one server-side evaluate call.
    ee.Dictionary({
      year: eucropImg.date().get('year'),
      code: eucropImg.select('classification').reduceRegion({
        reducer: ee.Reducer.mode(),
        geometry: geom,
        scale: 10,
        maxPixels: 1e6,
        tileScale: 2,
        bestEffort: true
      }).get('classification')
    }).evaluate(function(d, err) {
      if (err || !d || d.code === null || d.code === undefined) {
        iacsCropLabel.setValue('EUCROPMAP crop type: error \u2014 ' + (err || 'no data at location'));
        return;
      }
      var cls      = Math.round(Number(d.code));
      var name     = EUCROPMAP_CLASSES[cls] || ('Class ' + d.code);
      var color    = _eucropColorMap[cls] || '#555555';
      var eucropYr = d.year ? String(d.year) : String(_selYr);
      iacsCropLabel.style().set('color', color);
      // Note "nearest available" when the collection year differs from the selected year.
      var yearNote = (d.year && d.year !== _selYr) ? eucropYr + ', nearest available' : eucropYr;
      iacsCropLabel.setValue('Crop type (EUCROPMAP ' + yearNote + '): ' + name);
    });
  }

  // ESA WorldCover 2021 land cover at click location
  var esa = ee.ImageCollection('ESA/WorldCover/v200').first();
  var lcMode = esa.reduceRegion({
    reducer: ee.Reducer.mode(), geometry: geom, scale: 10,
    maxPixels: 1e6, tileScale: 2, bestEffort: true
  }).get('Map');
  lcMode.evaluate(function(lcCode, error1){
    if (error1 || lcCode === null || lcCode === undefined) {
    lcLabel.setValue('ESA WorldCover: Error - ' + (error1 || 'No data'));
      return;
    }
    var wcNames = {
      10:  'Tree cover (closed/open forest canopy)',
      20:  'Shrubland (woody shrubs <5m)',
      30:  'Grassland (natural/semi-natural herbaceous)',
      40:  'Cropland (arable & cultivated land — annual crops, orchards, fallow)',
      50:  'Built-up (urban / impervious surfaces)',
      60:  'Bare / sparse vegetation (rock, sand, deserts)',
      70:  'Snow and ice (permanent)',
      80:  'Permanent water bodies (lakes, rivers)',
      90:  'Herbaceous wetland (marsh, bog, fen)',
      95:  'Mangroves',
      100: 'Moss and lichen'
    };
    var lcInt = Math.round(Number(lcCode));
    var lcName = wcNames[lcInt] || ('Unknown class (code: ' + lcInt + ')');
    lcLabel.setValue('ESA WorldCover context: ' + lcName + ' (code ' + lcInt + ')');
  });

  // Week selection
  var wk = weekSelect.getValue();
  if (!wk && state.allWeeksWithScenes.length) wk = state.allWeeksWithScenes[0];
  wkLabel.setValue('Week: ' + (wk || 'None'));

  // Pixel + field stats for selected week (async: update placeholders)
  if (wk){
    var img = composeWeek(ee.Date.parse('YYYY-MM_dd', wk));
    var pix = img.reduceRegion({reducer: ee.Reducer.first(), geometry: pt, scale:10, maxPixels:1e9});
    var mean = img.reduceRegion({reducer: ee.Reducer.mean(), geometry: geom, scale:20, tileScale:8, maxPixels:1e9});

    ee.Dictionary({
      p_ndvi: pix.get('NDVI'),
      p_evi:  pix.get('EVI'),
      f_ndvi: mean.get('NDVI'),
      f_evi:  mean.get('EVI'),
      f_bsi:  mean.get('BSI')
    }).evaluate(function(s, error){
      function fmt(x){ return (x===null || x===undefined) ? 'NA' : (Math.round(x*1000)/1000); }
      if (error || !s) {
        pixLabel.setValue('Pixel @ click - error: ' + (error || 'No data'));
        fldLabel.setValue('Field mean - error: ' + (error || 'No data'));
        return;
      }
      pixLabel.setValue('Pixel @ click - NDVI: ' + fmt(s.p_ndvi) + ', EVI: ' + fmt(s.p_evi));
      fldLabel.setValue('Field mean - NDVI: ' + fmt(s.f_ndvi) + ', EVI: ' + fmt(s.f_evi) + ', BSI: ' + fmt(s.f_bsi));
    });
  } else {
    wkLabel.setValue('Week: None (no valid weeks)');
    pixLabel.setValue('Pixel @ click - NA');
    fldLabel.setValue('Field mean - NA');
  }

  // Keep selected-timeframe classifications directly under pixel/field stats.
  ensureSelectedClassificationPanel();
  addSelectedClassificationPanel('Cover Crop (Selected Timeframe)', ['Waiting for analysis...']);
  addSelectedClassificationPanel('Tillage (Selected Timeframe)', ['Waiting for analysis...']);

  // MODIS chart
  try { pop.add(chartMODIS(geom)); } catch (modisError) { pop.add(ui.Label('MODIS chart error: ' + modisError.message, {color:'red'})); }

  // S2 NDTI chart — shows raw NDTI values with current norm bounds in title for slider calibration
  try { pop.add(chartNDTI(geom)); } catch (ndtiChartError) { pop.add(ui.Label('NDTI chart error: ' + ndtiChartError.message, {color:'red'})); }

  // Analysis options
  pop.add(ui.Label('--- ANALYSIS OPTIONS ---', {fontWeight:'bold', color:'blue', margin:'10px 0 4px 0'}));
  pop.add(ui.Label('Use buttons above to run analyses separately:', {fontSize:'11px', color:'#444'}));
  pop.add(ui.Label('- Cover Crop Analysis  - Tillage Detection  - Sentinel-2 Chart', {fontSize:'11px', color:'gray'}));

  // STATIC COVARIATES BLOCK
  var covPanel = ui.Panel({style:{margin:'6px 0 6px 0'}});
  pop.add(covPanel);
  addCovariatesToPanel(covPanel, geom);

  // Auto-run both management analyses whenever a field is clicked.
  runAutoManagementSuite();
});

/* ---------- Contact sheet timeline (horizontal popup at top of map) ---------- */
showSheet.onClick(function(){
  if (!state.s2Base || !state.lastGeom){
    statusLabel.setValue('Click a field first before showing the visual timeline.');
    return;
  }

  var geom = state.lastGeom;
  var idx  = sheetIdx.getValue();
  var maxN = sheetN.getValue();

  // If "Hide invalid S2 weeks" is enabled, load more candidates so we can still fill N frames
  var loadCount = hideInvalid.getValue() ? Math.min(maxN * 3, 52) : maxN;
  var baseWeeks = (state.refinedWeeks && state.refinedWeeks.length >= loadCount)
    ? state.refinedWeeks
    : state.allWeeksWithScenes;

  var candidateWeeks = (baseWeeks || []).slice(0, loadCount);
  if (!candidateWeeks.length){
    statusLabel.setValue('No weeks available. Try Run / Update or widen the date range.');
    return;
  }

  // Helper to proceed once we have the weeks list (already filtered or not)
  function proceedWithTimeline(weeks){
    if (!weeks || !weeks.length){
      statusLabel.setValue('No weeks available for visual timeline.');
      return;
    }

    // Adaptive thumbnail sizing (supports up to 52 frames).
    // Override with the timeline size slider if it is set above 0.
    var thumbSize, cellWidth, gridMaxHeight, popupMaxHeight;
    var _sliderOverride = timelineSizeSlider.getValue();
    if (weeks.length <= 8) {
      thumbSize = 120; cellWidth = '130px'; gridMaxHeight = '180px'; popupMaxHeight = '220px';
    } else if (weeks.length <= 12) {
      thumbSize = 100; cellWidth = '110px'; gridMaxHeight = '220px'; popupMaxHeight = '280px';
    } else if (weeks.length <= 16) {
      thumbSize = 90; cellWidth = '100px'; gridMaxHeight = '240px'; popupMaxHeight = '300px';
    } else if (weeks.length <= 24) {
      thumbSize = 80; cellWidth = '90px'; gridMaxHeight = '260px'; popupMaxHeight = '320px';
    } else if (weeks.length <= 36) {
      thumbSize = 70; cellWidth = '80px'; gridMaxHeight = '280px'; popupMaxHeight = '340px';
    } else {
      thumbSize = 60; cellWidth = '70px'; gridMaxHeight = '300px'; popupMaxHeight = '360px';
    }
    if (_sliderOverride > 0) {
      thumbSize  = _sliderOverride;
      cellWidth  = (_sliderOverride + 10) + 'px';
      var _rows    = (idx === 'ALL') ? 5 : 1; // ALL shows 5 thumbs per cell
      gridMaxHeight  = Math.min((_sliderOverride * _rows) + 80, 600) + 'px';
      popupMaxHeight = Math.min((_sliderOverride * _rows) + 120, 700) + 'px';
    }
    // Height slider independently overrides grid and popup max-height.
    var _heightOverride = timelineHeightSlider.getValue();
    if (_heightOverride > 0) {
      gridMaxHeight  = _heightOverride + 'px';
      popupMaxHeight = (_heightOverride + 60) + 'px';
    }

    // Remove existing popup
    if (state.contactSheetPopup){
      Map.remove(state.contactSheetPopup);
      state.contactSheetPopup = null;
    }

    // Outer wrapper: transparent, positioned. A spacer panel inside pushes the
    // visible box down below the GEE navigation buttons — margin-top on a
    // Map.add() panel is applied as inner spacing in GEE, not as an outer offset.
    state.contactSheetPopup = ui.Panel({
      style: {
        position: 'top-center',
        width: '95%',
        backgroundColor: 'rgba(0,0,0,0)',
        border: '0px',
        padding: '0',
        margin: '0'
      }
    });
    // Spacer: invisible 60px block that pushes the actual box below the nav buttons.
    state.contactSheetPopup.add(ui.Panel({
      style: {height: '60px', backgroundColor: 'rgba(0,0,0,0)', border: '0px', padding: '0', margin: '0'}
    }));
    // Inner panel: the actual visible white box with the blue border.
    var innerPopup = ui.Panel({
      style: {
        width: '100%',
        maxHeight: popupMaxHeight,
        backgroundColor: 'rgba(255,255,255,0.95)',
        border: '2px solid #0078d4',
        padding: '8px',
        margin: '0'
      }
    });
    state.contactSheetPopup.add(innerPopup);

    // Header row
    var topHeader = ui.Panel({
      layout: ui.Panel.Layout.flow('horizontal'),
      style: {stretch: 'horizontal', margin: '0 0 8px 0'}
    });

    var titleText = (idx === 'ALL') ? 'NDVI + EVI + NDTI + NDMI Timeline' : (idx + ' Timeline');
    var pidText = (typeof state.lastPid === 'string')
      ? state.lastPid
      : (state.lastPid && state.lastPid.getInfo ? state.lastPid.getInfo() : 'unknown');

    var topTitle = ui.Label(titleText + ' - Field ' + pidText + ' (' + weeks.length + ' of ' + maxN + ' weeks)', {
      fontWeight: 'bold',
      fontSize: '14px',
      stretch: 'horizontal'
    });

    var topCloseBtn = ui.Button({label: '✕', style: {color: 'red', padding: '4px 8px'}});
    topCloseBtn.onClick(function(){
      if (state.contactSheetPopup){
        Map.remove(state.contactSheetPopup);
        state.contactSheetPopup = null;
      }
      statusLabel.setValue('Visual timeline closed.');
    });

    topHeader.add(topTitle).add(topCloseBtn);
    innerPopup.add(topHeader);

    // Thumbnails grid — force height when height slider is active so the box
    // actually grows rather than just capping at maxHeight.
    var _gridStyle = {
      stretch: 'horizontal',
      maxHeight: gridMaxHeight,
      backgroundColor: '#f8f9fa',
      border: '1px solid #ddd',
      padding: '4px'
    };
    if (_heightOverride > 0) { _gridStyle.height = gridMaxHeight; }
    var timelineGrid = ui.Panel({
      layout: ui.Panel.Layout.flow('horizontal'),
      style: _gridStyle
    });

    var smallSize = Math.floor(thumbSize * 0.6);

    weeks.forEach(function(w){
      var dateLbl = ui.Label(w, {fontSize: '9px', margin: '0 0 2px 0', textAlign: 'center'});
      var reasonLbl = ui.Label('', {fontSize:'9px', color:'red', textAlign:'center', margin:'2px 0 0 0'});

      try {
        if (idx === 'NAIP') {
          // NAIP thumbnail for week (with Landsat fallback)
          var ws = ee.Date.parse('YYYY-MM_dd', w);

          var naip = ee.ImageCollection('USDA/NAIP/DOQQ')
            .filterBounds(geom)
            .filterDate(ws.advance(-naipMaxAgeDays, 'day'), ws.advance(naipMaxAgeDays, 'day'))
            .sort('system:time_start');

          var ls9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
            .filterBounds(geom)
            .filterDate(ws.advance(-lsMaxDeltaDays, 'day'), ws.advance(lsMaxDeltaDays, 'day'))
            .sort('system:time_start');

          function pickClosest(col){
            var withDiff = col.map(function(img){
              var t = ee.Number(img.get('system:time_start'));
              var diff = t.subtract(ws.millis()).abs();
              return img.set('date_diff', diff);
            }).sort('date_diff');
            return ee.Image(withDiff.first());
          }

          // Prefer Landsat if it's close enough; else NAIP if available
          var lsBest  = pickClosest(ls9);
          var naipBest= pickClosest(naip);

          var lsIsFresh = ls9.size().gt(0).and(ee.Number(lsBest.get('date_diff')).lte(ee.Number(lsMaxDeltaDays).multiply(24*60*60*1000)));
          var useLs = lsIsFresh;

          var rgb = ee.Image(ee.Algorithms.If(useLs,
            // Landsat SR -> reflectance + cloud mask
            ee.Image(lsBest).select(['SR_B4','SR_B3','SR_B2']).multiply(2.75e-05).add(-0.2)
              .updateMask(ee.Image(lsBest).select('QA_PIXEL').bitwiseAnd(1<<3).eq(0)
                .and(ee.Image(lsBest).select('QA_PIXEL').bitwiseAnd(1<<4).eq(0)))
              .rename(['B4','B3','B2']),
            // NAIP
            ee.Image(naipBest)
          ));

          var vis = ee.Dictionary(ee.Algorithms.If(useLs,
            {bands:['B4','B3','B2'], min: 0.02, max: 0.3, gamma: 1.1},
            {bands:['R','G','B'], min:0, max:255}
          ));

          var th = ui.Thumbnail({
            image: rgb.clip(geom).visualize(vis),
            params: {region: geom, dimensions: thumbSize},
            style: {margin: '2px', border: '1px solid #444'}
          });

          timelineGrid.add(ui.Panel([dateLbl, th, reasonLbl], ui.Panel.Layout.flow('vertical'), {width: cellWidth}));

        } else if (idx === 'ALL') {
          // NDVI + EVI + NDTI + NDMI stack in one cell
          var im = composeWeek(ee.Date.parse('YYYY-MM_dd', w));
          var ndviTh = ui.Thumbnail({
            image: im.select('NDVI').visualize(visFor('NDVI')),
            params: {region: geom, dimensions: smallSize},
            style: {margin: '1px', border: '1px solid #444'}
          });

          var eviTh = ui.Thumbnail({
            image: im.select('EVI').visualize(visFor('EVI')),
            params: {region: geom, dimensions: smallSize},
            style: {margin: '1px', border: '1px solid #444'}
          });

          var ndtiTh = ui.Thumbnail({
            image: im.select('NDTI').visualize(visFor('NDTI')),
            params: {region: geom, dimensions: smallSize},
            style: {margin: '1px', border: '1px solid #444'}
          });

          var ndmiTh = ui.Thumbnail({
            image: im.select('NDMI').visualize(visFor('NDMI')),
            params: {region: geom, dimensions: smallSize},
            style: {margin: '1px', border: '1px solid #444'}
          });

          var ws_all = ee.Date.parse('YYYY-MM_dd', w);
          var s2allImg = usdaSentinel2Rgb(
            ws_all.format('YYYY-MM-dd'), ws_all.advance(7,'day').format('YYYY-MM-dd'),
            Number(usdaS2CloudSlider.getValue()), geom
          );
          var s2allTh = ui.Thumbnail({
            image: s2allImg.visualize({bands:['N','R','G'], min:0.01, max:0.5}),
            params: {region: geom, dimensions: smallSize},
            style: {margin: '1px', border: '1px solid #444'}
          });
          var thumbsPanel = ui.Panel([
            ui.Label('NDVI', {fontSize:'8px', textAlign:'center'}), ndviTh,
            ui.Label('EVI',  {fontSize:'8px', textAlign:'center'}), eviTh,
            ui.Label('NDTI', {fontSize:'8px', textAlign:'center'}), ndtiTh,
            ui.Label('NDMI', {fontSize:'8px', textAlign:'center'}), ndmiTh,
            ui.Label('S2',   {fontSize:'8px', textAlign:'center'}), s2allTh
          ], ui.Panel.Layout.flow('vertical'), {width: cellWidth});

          timelineGrid.add(ui.Panel([dateLbl, thumbsPanel, reasonLbl], ui.Panel.Layout.flow('vertical'), {width: cellWidth}));

        } else if (idx === 'S2') {
          // False-colour CIR (NIR→R, Red→G, Green→B) — matches 'Add overlay → S2'
          var ws_s2 = ee.Date.parse('YYYY-MM_dd', w);
          var s2th_img = usdaSentinel2Rgb(
            ws_s2.format('YYYY-MM-dd'), ws_s2.advance(7,'day').format('YYYY-MM-dd'),
            Number(usdaS2CloudSlider.getValue()), geom
          );
          var th = ui.Thumbnail({
            image: s2th_img.visualize({bands:['N','R','G'], min:0.01, max:0.5}),
            params: {region: geom, dimensions: thumbSize},
            style: {margin: '2px', border: '1px solid #444'}
          });
          timelineGrid.add(ui.Panel([dateLbl, th, reasonLbl], ui.Panel.Layout.flow('vertical'), {width: cellWidth}));

        } else {
          // NDVI / EVI / NDTI / NDMI single-index thumbnail
          var im = composeWeek(ee.Date.parse('YYYY-MM_dd', w));
          var th = ui.Thumbnail({
            image: im.select(idx).visualize(visFor(idx)),
            params: {region: geom, dimensions: thumbSize},
            style: {margin: '2px', border: '1px solid #444'}
          });
          timelineGrid.add(ui.Panel([dateLbl, th, reasonLbl], ui.Panel.Layout.flow('vertical'), {width: cellWidth}));
        }

        // If "Hide invalid" is off, still annotate invalid weeks (helps debugging)
        var ws2 = ee.Date.parse('YYYY-MM_dd', w);
        validFrac(ws2, geom, 20).evaluate(function(frac){
          var thr = minValidPct.getValue() / 100.0;
          if (frac === null || frac < thr) {
            reasonLbl.setValue('No valid S2 — try NAIP');
          }
        });

      } catch (e) {
        timelineGrid.add(ui.Panel([
          ui.Label(w + ' (thumb error)', {fontSize:'9px', color:'red', textAlign:'center'})
        ], ui.Panel.Layout.flow('vertical'), {width: cellWidth}));
      }
    });

    innerPopup.add(timelineGrid);

    var instrText = '💡 Timeline shows ' + (idx === 'ALL' ? 'NDVI + EVI + NDTI + NDMI + S2' : idx === 'NAIP' ? 'NAIP (or Landsat fallback)' : idx === 'S2' ? 'S2 false-colour CIR (NIR/Red/Green)' : idx) +
      ' over ' + weeks.length + ' weeks (max ' + maxN + '). Scroll horizontally to see all frames.';
    innerPopup.add(ui.Label(instrText, {
      fontSize: '10px', color: '#666', margin: '4px 0 0 0', textAlign: 'center'
    }));

    Map.add(state.contactSheetPopup);
    statusLabel.setValue('Visual timeline displayed with ' + weeks.length + ' weeks.');
  }

  // If filtering invalid weeks, do per-week validFrac checks (async)
  if (hideInvalid.getValue()){
    statusLabel.setValue('Filtering invalid S2 weeks for visual timeline…');
    var thr = minValidPct.getValue() / 100.0;
    var validFlags = [];
    for (var i = 0; i < candidateWeeks.length; i++) validFlags.push(false);

    var done = 0;
    candidateWeeks.forEach(function(w, i){
      var ws = ee.Date.parse('YYYY-MM_dd', w);
      validFrac(ws, geom, 20).evaluate(function(frac){
        done++;
        if (frac !== null && frac >= thr) validFlags[i] = true;

        if (done === candidateWeeks.length){
          var ordered = [];
          for (var j = 0; j < candidateWeeks.length; j++){
            if (validFlags[j]) ordered.push(candidateWeeks[j]);
          }
          proceedWithTimeline(ordered.slice(0, maxN));
        }
      });
    });
  } else {
    proceedWithTimeline(candidateWeeks.slice(0, maxN));
  }
});



/* ---------- initial run ---------- */
uiPanel.add(advToggle);
uiPanel.add(advPanel);
update();
