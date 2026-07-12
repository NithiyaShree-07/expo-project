// Back navigation: return to the page that opened the simulator when possible,
// otherwise fall back to the platform home page.
function goBackHome(){
  if (window.history.length > 1 && document.referrer && document.referrer.indexOf(window.location.host) !== -1) {
    window.history.back();
  } else {
    window.location.href = "/";
  }
}

(function(){
"use strict";

/* ============================================================
   0. SHARED STATE
   ============================================================ */
const state = {
  running: true,
  speed: 1.4,          // px/frame-ish multiplier
  spawnRate: 1.2,       // items per second (average)
  mode: "industrial",   // industrial | lowcost
  model: "rf",           // rf | xgb | dt | nn
  counts: { metal:0, plastic:0, paper:0, organic:0, glass:0, reject:0 },
  itemsInFlight: 0,
  spawnedTotal: 0,
  startTime: Date.now(),
  lastSpawnAt: 0,
};

/* ============================================================
   1. NODE COORDINATES (mirrors the SVG schematic in index.html)
   ============================================================ */
const P = {
  hopper:        [500, 55],
  magTop:        [500, 132],
  magCenter:     [500, 178],
  magBottom:     [500, 224],
  turn1:         [500, 240],
  turn2:         [650, 240],
  airBlower:     [650, 268],
  metalTurn:     [270, 178],
  metalBin:      [270, 268],
  heavyDown:     [650, 356],
  moistureSensor:[650, 436],
  moistureDiamond:[650, 520],
  organicTurn:   [560, 520],
  organicBin:    [560, 608],
  glassTurn:     [770, 520],
  glassDetector: [770, 608],
  hardnessModel: [770, 690],
  servoB:        [770, 772],
  glassBinTurn:  [680, 772],
  glassBin:      [680, 868],
  rejectTurn:    [870, 772],
  rejectBin:     [870, 868],
  lightTurn1:    [565, 268],
  lightTurn2:    [190, 268],
  convA:         [190, 356],
  modeSelector:  [190, 436],
  aiClassifier:  [190, 600],
  servoA:        [190, 680],
  plasticTurn:   [110, 680],
  plasticBin:    [110, 780],
  paperTurn:     [280, 680],
  paperBin:      [280, 780],
};

// Physical conveyor segments (same coordinates as the routes below) — each one
// gets rendered as a real belt band with a steel trough, moving tread and end rollers.
const SEGMENTS = [
  // ---- decorative side-branch belts showing the two sensor options at the
  //      mode selector (illustrative only — the item itself always travels
  //      the direct center line covered by the segments below) ----
  {d:"M130,436 L90,436 L90,490",      cls:"c-industrial"},
  {d:"M250,436 L300,436 L300,490",    cls:"c-lowcost"},
  {d:"M90,542 L90,562 L190,562 L190,581", cls:"c-neutral"},
  {d:"M300,542 L300,562 L200,562 L200,581", cls:"c-neutral"},

  // ---- main line: every edge below matches an edge items actually travel
  //      (built from the same ROUTES coordinates), so the belt runs
  //      continuously under every item, start to finish ----
  {d:"M500,55 L500,132",   cls:"c-neutral"}, // hopper -> magTop
  {d:"M500,132 L500,158",  cls:"c-neutral"}, // magTop -> magCenter
  {d:"M480,178 L270,178",  cls:"c-metal"},   // magCenter -> metalTurn
  {d:"M270,178 L270,248",  cls:"c-metal"},   // metalTurn -> metalBin
  {d:"M500,198 L500,240",  cls:"c-neutral"}, // magCenter -> turn1
  {d:"M500,240 L650,240",  cls:"c-neutral"}, // turn1 -> turn2
  {d:"M650,240 L650,248",  cls:"c-neutral"}, // turn2 -> airBlower
  {d:"M620,268 L565,268",  cls:"c-cyan"},    // airBlower -> lightTurn1
  {d:"M565,268 L190,268",  cls:"c-cyan"},    // lightTurn1 -> lightTurn2
  {d:"M190,268 L190,356",  cls:"c-cyan"},    // lightTurn2 -> convA
  {d:"M190,356 L190,416",  cls:"c-cyan"},    // convA -> modeSelector
  {d:"M190,456 L190,580",  cls:"c-cyan"},    // modeSelector -> aiClassifier
  {d:"M190,620 L190,646",  cls:"c-cyan"},    // aiClassifier -> servoA
  {d:"M156,680 L110,680",  cls:"c-cyan"},    // servoA -> plasticTurn
  {d:"M110,680 L110,760",  cls:"c-cyan"},    // plasticTurn -> plasticBin
  {d:"M224,680 L280,680",  cls:"c-cyan"},    // servoA -> paperTurn
  {d:"M280,680 L280,760",  cls:"c-cyan"},    // paperTurn -> paperBin
  {d:"M650,298 L650,356",  cls:"c-violet"},  // airBlower -> heavyDown
  {d:"M650,356 L650,418",  cls:"c-violet"},  // heavyDown -> moistureSensor
  {d:"M650,454 L650,486",  cls:"c-violet"},  // moistureSensor -> moistureDiamond
  {d:"M616,520 L560,520",  cls:"c-green"},   // moistureDiamond -> organicTurn
  {d:"M560,520 L560,588",  cls:"c-green"},   // organicTurn -> organicBin
  {d:"M684,520 L770,520",  cls:"c-violet"},  // moistureDiamond -> glassTurn
  {d:"M770,520 L770,590",  cls:"c-violet"},  // glassTurn -> glassDetector
  {d:"M770,626 L770,670",  cls:"c-violet"},  // glassDetector -> hardnessModel
  {d:"M770,710 L770,738",  cls:"c-violet"},  // hardnessModel -> servoB
  {d:"M736,772 L680,772",  cls:"c-violet"},  // servoB -> glassBinTurn
  {d:"M680,772 L680,848",  cls:"c-violet"},  // glassBinTurn -> glassBin
  {d:"M804,772 L870,772",  cls:"c-reject"},  // servoB -> rejectTurn
  {d:"M870,772 L870,848",  cls:"c-reject"},  // rejectTurn -> rejectBin
];

const SVGNS = "http://www.w3.org/2000/svg";

function renderBelts(){
  const layer = document.getElementById("belts-layer");
  if(!layer) return;
  const vertices = new Map();

  const mk = (tag, cls, d) => {
    const el = document.createElementNS(SVGNS, tag);
    if(cls) el.setAttribute("class", cls);
    if(d) el.setAttribute("d", d);
    return el;
  };

  SEGMENTS.forEach(seg=>{
    // 1. contact shadow - grounds the belt against the floor plate
    layer.appendChild(mk("path","belt-shadow", seg.d));
    // 2. steel trough / side skirt the belt rides inside
    layer.appendChild(mk("path","belt-frame", seg.d));
    // 3. rubber belt bed - lit gradient gives it a rounded, physical surface
    layer.appendChild(mk("path","belt-bed", seg.d));
    // 4. moving tread ridges: a shadow pass + a lit pass, offset from one
    //    another so each cleat reads as a raised 3D rib rather than a dash
    layer.appendChild(mk("path","belt-cleat cleat-shadow", seg.d));
    layer.appendChild(mk("path","belt-cleat cleat-light "+seg.cls, seg.d));
    // 5. thin center wear-line, like a worn strip on real belting
    layer.appendChild(mk("path","belt-centerline", seg.d));

    const nums = seg.d.match(/-?\d+(\.\d+)?/g).map(Number);
    for(let i=0;i<nums.length;i+=2){
      const key = nums[i]+","+nums[i+1];
      vertices.set(key, [nums[i], nums[i+1]]);
    }
  });

  vertices.forEach(([x,y])=>{
    const g = document.createElementNS(SVGNS,"g");
    g.setAttribute("class","roller");
    g.setAttribute("transform", `translate(${x},${y})`);

    // mounting bracket the roller/pulley is bolted to
    const bracket = document.createElementNS(SVGNS,"rect");
    bracket.setAttribute("class","roller-bracket");
    bracket.setAttribute("x","-4"); bracket.setAttribute("y","6");
    bracket.setAttribute("width","8"); bracket.setAttribute("height","9");
    g.appendChild(bracket);

    // drum body - cylindrical shading via radial gradient + rim highlight
    const drum = document.createElementNS(SVGNS,"circle");
    drum.setAttribute("class","roller-drum");
    drum.setAttribute("r","9");
    g.appendChild(drum);

    const rim = document.createElementNS(SVGNS,"circle");
    rim.setAttribute("class","roller-rim");
    rim.setAttribute("r","9");
    g.appendChild(rim);

    // spinning hub/spokes to sell the rotation
    const hub = document.createElementNS(SVGNS,"g");
    hub.setAttribute("class","roller-hub");
    const c = document.createElementNS(SVGNS,"circle");
    c.setAttribute("class","hub-center"); c.setAttribute("r","3.2");
    const l1 = document.createElementNS(SVGNS,"line");
    l1.setAttribute("class","spoke"); l1.setAttribute("x1","-6.5"); l1.setAttribute("x2","6.5");
    const l2 = document.createElementNS(SVGNS,"line");
    l2.setAttribute("class","spoke"); l2.setAttribute("y1","-6.5"); l2.setAttribute("y2","6.5");
    hub.appendChild(l1); hub.appendChild(l2); hub.appendChild(c);
    g.appendChild(hub);

    layer.appendChild(g);
  });
}

// Each route: ordered list of {pt:[x,y], node:"svg-node-id"(optional), event:"key"(optional)}
const ROUTES = {
  metal: [
    {pt:P.hopper}, {pt:P.magTop, node:"node-mainbelt"},
    {pt:P.magCenter, node:"node-electromagnet", event:"electromagnet-true"},
    {pt:P.metalTurn}, {pt:P.metalBin, node:"node-metalbin", event:"sorted"},
  ],
  plastic: [
    {pt:P.hopper}, {pt:P.magTop, node:"node-mainbelt"},
    {pt:P.magCenter, node:"node-electromagnet", event:"electromagnet-false"},
    {pt:P.turn1}, {pt:P.turn2}, {pt:P.airBlower, node:"node-airblower", event:"airblower-light"},
    {pt:P.lightTurn1}, {pt:P.lightTurn2}, {pt:P.convA, node:"node-convA"},
    {pt:P.modeSelector, node:"node-modeselector", event:"mode-select"},
    {pt:P.aiClassifier, node:"node-classifier", event:"classify"},
    {pt:P.servoA, node:"node-servoA", event:"servoA-plastic"},
    {pt:P.plasticTurn}, {pt:P.plasticBin, node:"node-plasticbin", event:"sorted"},
  ],
  paper: [
    {pt:P.hopper}, {pt:P.magTop, node:"node-mainbelt"},
    {pt:P.magCenter, node:"node-electromagnet", event:"electromagnet-false"},
    {pt:P.turn1}, {pt:P.turn2}, {pt:P.airBlower, node:"node-airblower", event:"airblower-light"},
    {pt:P.lightTurn1}, {pt:P.lightTurn2}, {pt:P.convA, node:"node-convA"},
    {pt:P.modeSelector, node:"node-modeselector", event:"mode-select"},
    {pt:P.aiClassifier, node:"node-classifier", event:"classify"},
    {pt:P.servoA, node:"node-servoA", event:"servoA-paper"},
    {pt:P.paperTurn}, {pt:P.paperBin, node:"node-paperbin", event:"sorted"},
  ],
  organic: [
    {pt:P.hopper}, {pt:P.magTop, node:"node-mainbelt"},
    {pt:P.magCenter, node:"node-electromagnet", event:"electromagnet-false"},
    {pt:P.turn1}, {pt:P.turn2}, {pt:P.airBlower, node:"node-airblower", event:"airblower-heavy"},
    {pt:P.heavyDown}, {pt:P.moistureSensor, node:"node-moisture", event:"moisture-read"},
    {pt:P.moistureDiamond, node:"node-moisturecheck", event:"moisture-high"},
    {pt:P.organicTurn}, {pt:P.organicBin, node:"node-organicbin", event:"sorted"},
  ],
  glass: [
    {pt:P.hopper}, {pt:P.magTop, node:"node-mainbelt"},
    {pt:P.magCenter, node:"node-electromagnet", event:"electromagnet-false"},
    {pt:P.turn1}, {pt:P.turn2}, {pt:P.airBlower, node:"node-airblower", event:"airblower-heavy"},
    {pt:P.heavyDown}, {pt:P.moistureSensor, node:"node-moisture", event:"moisture-read"},
    {pt:P.moistureDiamond, node:"node-moisturecheck", event:"moisture-low"},
    {pt:P.glassTurn}, {pt:P.glassDetector, node:"node-glassdetector", event:"nonmag-detect"},
    {pt:P.hardnessModel, node:"node-hardness", event:"hardness-classify"},
    {pt:P.servoB, node:"node-servoB", event:"servoB-glass"},
    {pt:P.glassBinTurn}, {pt:P.glassBin, node:"node-glassbin", event:"sorted"},
  ],
  reject: [
    {pt:P.hopper}, {pt:P.magTop, node:"node-mainbelt"},
    {pt:P.magCenter, node:"node-electromagnet", event:"electromagnet-false"},
    {pt:P.turn1}, {pt:P.turn2}, {pt:P.airBlower, node:"node-airblower", event:"airblower-heavy"},
    {pt:P.heavyDown}, {pt:P.moistureSensor, node:"node-moisture", event:"moisture-read"},
    {pt:P.moistureDiamond, node:"node-moisturecheck", event:"moisture-low"},
    {pt:P.glassTurn}, {pt:P.glassDetector, node:"node-glassdetector", event:"nonmag-detect"},
    {pt:P.hardnessModel, node:"node-hardness", event:"hardness-classify"},
    {pt:P.servoB, node:"node-servoB", event:"servoB-reject"},
    {pt:P.rejectTurn}, {pt:P.rejectBin, node:"node-rejectbin", event:"sorted"},
  ],
};

const MATERIALS = {
  metal:   { label:"Steel Can",     short:"FE",  color:"#ffb02e", route:"metal",   weight:0.14, magnetic:true },
  plastic: { label:"PET Bottle",    short:"PL",  color:"#34d6ff", route:"plastic", weight:0.24 },
  paper:   { label:"Cardboard",     short:"PA",  color:"#eef2f5", route:"paper",   weight:0.20 },
  organic: { label:"Food Waste",    short:"OR",  color:"#4ee08a", route:"organic", weight:0.20 },
  glass:   { label:"Glass Jar",     short:"GL",  color:"#b48cff", route:"glass",   weight:0.14 },
  aluminum:{ label:"Aluminum Can",  short:"AL",  color:"#ff5d5d", route:"reject",  weight:0.08 },
};

function pickMaterial(){
  const r = Math.random();
  let acc = 0;
  for(const key in MATERIALS){
    acc += MATERIALS[key].weight;
    if(r <= acc) return key;
  }
  return "plastic";
}

/* ============================================================
   2. MODEL PRESETS (for dashboard + XAI feature bars)
   ============================================================ */
const MODEL_PRESETS = {
  rf:  { name:"Random Forest",  acc:96.4, latency:"14ms" },
  xgb: { name:"XGBoost",        acc:97.8, latency:"9ms"  },
  dt:  { name:"Decision Tree",  acc:89.1, latency:"2ms"  },
  nn:  { name:"Neural Net",     acc:98.3, latency:"22ms" },
};

const FEATURES_LIGHT_INDUSTRIAL = ["NIR reflectance","Polymer ID band","Density","Surface gloss","Shape ratio"];
const FEATURES_LIGHT_LOWCOST    = ["Capacitance","Load-cell weight","Color hue","Texture roughness","Deformation"];
const FEATURES_HEAVY            = ["Hardness (impact)","Density","Acoustic ping","Reflectivity","Moisture residue"];

function randomFeatureWeights(n){
  let vals = Array.from({length:n}, ()=> Math.random());
  const sum = vals.reduce((a,b)=>a+b,0);
  vals = vals.map(v => v/sum);
  vals.sort((a,b)=>b-a);
  return vals;
}

/* ============================================================
   3. DOM REFERENCES
   ============================================================ */
const svg = document.getElementById("plant-svg");
const itemsLayer = document.getElementById("items-layer");
const xaiContent = document.getElementById("xai-content");
const fbarsDash = document.getElementById("fbars-dash");
const fbarsSourceTag = document.getElementById("fbars-source-tag");

/* ============================================================
   4. ITEM / ANIMATION ENGINE
   ============================================================ */
let activeItems = [];
let idCounter = 0;

function segLength(a,b){
  return Math.hypot(b[0]-a[0], b[1]-a[1]);
}

function buildItem(materialKey){
  const mat = MATERIALS[materialKey];
  const route = ROUTES[mat.route];
  const id = "it" + (++idCounter);

  const g = document.createElementNS("http://www.w3.org/2000/svg","g");
  g.setAttribute("class","item-token");
  const shadow = document.createElementNS("http://www.w3.org/2000/svg","ellipse");
  shadow.setAttribute("class","item-shadow");
  shadow.setAttribute("cy","8"); shadow.setAttribute("rx","11"); shadow.setAttribute("ry","3.5");
  const body = document.createElementNS("http://www.w3.org/2000/svg","rect");
  body.setAttribute("class","item-body");
  body.setAttribute("x","-10"); body.setAttribute("y","-9");
  body.setAttribute("width","20"); body.setAttribute("height","18"); body.setAttribute("rx","4");
  body.setAttribute("fill", mat.color);
  const text = document.createElementNS("http://www.w3.org/2000/svg","text");
  text.setAttribute("y","3.5");
  text.textContent = mat.short;
  g.appendChild(shadow);
  g.appendChild(body);
  g.appendChild(text);
  itemsLayer.appendChild(g);

  return {
    id, materialKey, mat, route, g,
    segIndex: 0,
    segProgress: 0,
    done: false,
  };
}

function flashNode(nodeId, colorClass){
  const el = document.getElementById(nodeId);
  if(!el) return;
  const classes = colorClass.trim().split(/\s+/);
  el.classList.add("active", ...classes);
  setTimeout(()=>{ el.classList.remove("active", ...classes); }, 650);
}

const FLASH_COLOR = {
  metal:"flash-metal", plastic:"flash-cyan", paper:"flash-cyan",
  organic:"flash-green", glass:"flash-violet", reject:"flash-red",
};

function stepItems(dtMs){
  const pxPerMs = 0.14 * state.speed;
  activeItems.forEach(item=>{
    if(item.done) return;
    const route = item.route;
    let remaining = pxPerMs * dtMs;

    while(remaining > 0 && item.segIndex < route.length - 1){
      const a = route[item.segIndex].pt;
      const b = route[item.segIndex+1].pt;
      const segLen = segLength(a,b) || 1;
      const remInSeg = segLen * (1 - item.segProgress);

      if(remaining < remInSeg){
        item.segProgress += remaining / segLen;
        remaining = 0;
      } else {
        remaining -= remInSeg;
        item.segIndex += 1;
        item.segProgress = 0;
        const node = route[item.segIndex];
        if(node.event){
          onItemEvent(item, node.event);
        }
        if(item.segIndex === route.length - 1){
          finishItem(item);
          break;
        }
      }
    }

    if(!item.done){
      const a = route[item.segIndex].pt;
      const b = route[Math.min(item.segIndex+1, route.length-1)].pt;
      const x = a[0] + (b[0]-a[0]) * item.segProgress;
      const y = a[1] + (b[1]-a[1]) * item.segProgress;
      item.g.setAttribute("transform", `translate(${x},${y})`);
    }
  });

  activeItems = activeItems.filter(it => !it.done);
  document.getElementById("items-inflight").textContent = activeItems.length + " IN TRANSIT";
}

function finishItem(item){
  item.done = true;
  item.g.remove();
  const binKey = item.mat.route === "reject" ? "reject" : item.mat.route;
  state.counts[binKey] = (state.counts[binKey]||0) + 1;
  const el = document.getElementById("count-" + binKey);
  if(el) el.textContent = state.counts[binKey];
  flashNode(routeToBinNode(item.mat.route), FLASH_COLOR[binKeyForFlash(item.materialKey)]);
}

function binKeyForFlash(materialKey){
  if(materialKey === "aluminum") return "reject";
  if(materialKey === "metal") return "metal";
  if(materialKey === "plastic" || materialKey === "paper") return materialKey==="plastic"?"plastic":"paper";
  return materialKey;
}

function routeToBinNode(routeKey){
  return {
    metal:"node-metalbin", plastic:"node-plasticbin", paper:"node-paperbin",
    organic:"node-organicbin", glass:"node-glassbin", reject:"node-rejectbin",
  }[routeKey];
}

/* ============================================================
   5. DECISION EVENTS -> flash nodes + XAI card
   ============================================================ */
function onItemEvent(item, eventKey){
  const mat = item.mat;
  switch(eventKey){
    case "electromagnet-true":
      flashNode("node-electromagnet","flash-metal");
      renderXAI(item, [
        {label:"Electromagnet field", value:"ON", ok:true},
        {label:"Induced eddy signal", value:"MAGNETIC = TRUE", ok:true},
      ], "Diverted to Metal Collection Bin — ferrous object detected by induction coil.", "final");
      break;
    case "electromagnet-false":
      flashNode("node-electromagnet","flash-cyan");
      renderXAI(item, [
        {label:"Electromagnet field", value:"OFF / no pull", ok:false},
        {label:"Induced eddy signal", value:"MAGNETIC = FALSE", ok:false},
      ], "Non-ferrous — continuing to Air Blower Chamber for weight separation.", "step");
      break;
    case "airblower-light":
      flashNode("node-airblower","flash-cyan");
      renderXAI(item, [
        {label:"Terminal velocity", value:"Low (light)", ok:true},
        {label:"Air lift force", value:"> gravity", ok:true},
      ], "Lifted by airflow into Conveyor A (plastics / paper stream).", "step");
      break;
    case "airblower-heavy":
      flashNode("node-airblower","flash-violet");
      renderXAI(item, [
        {label:"Terminal velocity", value:"High (heavy)", ok:true},
        {label:"Air lift force", value:"< gravity", ok:false},
      ], "Falls through to Conveyor B (glass / organics / metals stream).", "step");
      break;
    case "mode-select":
      flashNode("node-modeselector","flash-cyan");
      break;
    case "classify": {
      flashNode("node-classifier","flash-cyan");
      const industrial = state.mode === "industrial";
      const feats = industrial ? FEATURES_LIGHT_INDUSTRIAL : FEATURES_LIGHT_LOWCOST;
      const weights = randomFeatureWeights(feats.length);
      const preset = MODEL_PRESETS[state.model];
      const confidence = clamp(preset.acc/100 + (Math.random()*0.04 - 0.02), 0.7, 0.995);
      const isPlastic = mat.route === "plastic";
      updateFeatureBars(feats, weights, `${preset.name.toUpperCase()} · ${industrial? "INDUSTRIAL NIR":"LOW-COST FUSION"}`);
      renderXAI(item, feats.map((f,i)=>({label:f, value:(weights[i]*100).toFixed(1)+"%", ok:i===0})),
        `${preset.name} classifies as ${isPlastic? "PLASTIC":"PAPER"} — confidence ${(confidence*100).toFixed(1)}%. Sensing mode: ${industrial?"Industrial NIR spectroscopy":"Low-cost capacitive/load-cell fusion"}.`,
        confidence > 0.9 ? "final" : "step", confidence);
      break;
    }
    case "servoA-plastic":
      flashNode("node-servoA","flash-cyan gate-left");
      break;
    case "servoA-paper":
      flashNode("node-servoA","flash-cyan gate-right");
      break;
    case "moisture-read": {
      flashNode("node-moisture","flash-green");
      const moisture = mat.route === "organic" ? (40 + Math.random()*30) : (5 + Math.random()*25);
      item._moisture = moisture;
      break;
    }
    case "moisture-high":
      flashNode("node-moisturecheck","flash-green gate-left");
      renderXAI(item, [
        {label:"Moisture reading", value:(item._moisture||45).toFixed(1)+"%", ok:true},
        {label:"Threshold", value:"35%", ok:true},
      ], "Moisture above threshold — routed directly to Organic Bin.", "final");
      break;
    case "moisture-low":
      flashNode("node-moisturecheck","flash-violet gate-right");
      renderXAI(item, [
        {label:"Moisture reading", value:(item._moisture||14).toFixed(1)+"%", ok:false},
        {label:"Threshold", value:"35%", ok:false},
      ], "Moisture below threshold — sent to Glass & Non-Mag Detector for material ID.", "step");
      break;
    case "nonmag-detect":
      flashNode("node-glassdetector","flash-violet");
      break;
    case "hardness-classify": {
      flashNode("node-hardness","flash-violet");
      const weights = randomFeatureWeights(FEATURES_HEAVY.length);
      const preset = MODEL_PRESETS[state.model];
      const isGlass = mat.route === "glass";
      const confidence = clamp(preset.acc/100 + (Math.random()*0.04 - 0.02), 0.7, 0.995);
      updateFeatureBars(FEATURES_HEAVY, weights, `${preset.name.toUpperCase()} · HARDNESS/DENSITY MODEL`);
      renderXAI(item, FEATURES_HEAVY.map((f,i)=>({label:f, value:(weights[i]*100).toFixed(1)+"%", ok:i===0})),
        `${preset.name} identifies ${isGlass? "GLASS":"NON-MAGNETIC METAL (aluminum)"} — confidence ${(confidence*100).toFixed(1)}%.`,
        confidence > 0.9 ? "final" : "step", confidence);
      break;
    }
    case "servoB-glass":
      flashNode("node-servoB", "flash-violet gate-left");
      break;
    case "servoB-reject":
      flashNode("node-servoB", "flash-red gate-right");
      break;
  }
}

function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

/* ============================================================
   6. EXPLAINABLE AI CARD RENDERING
   ============================================================ */
function renderXAI(item, rows, verdictText, kind, confidence){
  const mat = item.mat;
  const confPct = confidence ? (confidence*100).toFixed(1)+"%" : null;
  const confClass = confidence ? (confidence > 0.9 ? "high":"med") : "";

  let html = `
    <div class="xai-head">
      <div class="xai-swatch" style="background:${mat.color}22; border:1px solid ${mat.color};">
        <span style="color:${mat.color}">&#9679;</span>
      </div>
      <div>
        <div class="xai-item-name">${mat.label}</div>
        <div class="xai-item-sub">ITEM #${item.id.replace('it','')} &middot; ROUTE: ${mat.route.toUpperCase()}</div>
      </div>
    </div>
    <div class="xai-steps">
      ${rows.map(r=>`<div class="step"><b>${r.label}:</b> ${r.value}</div>`).join("")}
      <div class="step ${kind==='final'?'final':''}">${verdictText}</div>
    </div>
  `;
  if(confPct){
    html += `<div class="confidence-pill ${confClass}">CONFIDENCE ${confPct}</div>`;
  }
  xaiContent.innerHTML = html;
}

function updateFeatureBars(features, weights, sourceLabel){
  fbarsSourceTag.textContent = sourceLabel;
  fbarsDash.innerHTML = features.map((f,i)=>{
    const pct = (weights[i]*100).toFixed(1);
    return `
      <div class="fbar-row">
        <div class="fbar-label">${f}</div>
        <div class="fbar-track"><div class="fbar-fill" style="width:${pct}%"></div></div>
        <div class="fbar-val">${pct}%</div>
      </div>`;
  }).join("");
}

/* ============================================================
   7. SPAWNING LOOP
   ============================================================ */
function maybeSpawn(now){
  if(!state.running) return;
  const intervalMs = 1000 / state.spawnRate;
  if(now - state.lastSpawnAt >= intervalMs){
    state.lastSpawnAt = now;
    spawnItem();
  }
}

function spawnItem(){
  const materialKey = pickMaterial();
  const item = buildItem(materialKey);
  activeItems.push(item);
  state.spawnedTotal++;
}

/* ============================================================
   8. MAIN LOOP
   ============================================================ */
let lastFrame = performance.now();
renderBelts();
function loop(now){
  const dt = Math.min(now - lastFrame, 80);
  lastFrame = now;
  if(state.running){
    maybeSpawn(now);
    stepItems(dt);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ============================================================
   9. HEADER CLOCK / THROUGHPUT
   ============================================================ */
setInterval(()=>{
  const elapsed = (Date.now() - state.startTime)/1000;
  const h = String(Math.floor(elapsed/3600)).padStart(2,"0");
  const m = String(Math.floor((elapsed%3600)/60)).padStart(2,"0");
  const s = String(Math.floor(elapsed%60)).padStart(2,"0");
  document.getElementById("hdr-clock").textContent = `UPTIME ${h}:${m}:${s}`;
  const perMin = elapsed>0 ? (state.spawnedTotal/elapsed*60) : 0;
  document.getElementById("hdr-throughput").textContent = `THROUGHPUT: ${perMin.toFixed(0)} items/min`;
}, 1000);

/* ============================================================
   10. UI CONTROLS — plant floor
   ============================================================ */
document.getElementById("btn-toggle-run").addEventListener("click", (e)=>{
  state.running = !state.running;
  e.target.textContent = state.running ? "Pause Line" : "Resume Line";
  document.getElementById("plant-svg").classList.toggle("paused", !state.running);
});
document.getElementById("btn-spawn").addEventListener("click", spawnItem);
document.getElementById("speed-range").addEventListener("input", (e)=>{
  state.speed = parseFloat(e.target.value);
  document.getElementById("speed-val").textContent = state.speed.toFixed(1)+"x";
  document.getElementById("plant-svg").style.setProperty("--belt-speed", state.speed);
});
document.getElementById("plant-svg").style.setProperty("--belt-speed", state.speed);
document.getElementById("rate-range").addEventListener("input", (e)=>{
  state.spawnRate = parseFloat(e.target.value);
  document.getElementById("rate-val").textContent = state.spawnRate.toFixed(1)+"/s";
});

/* ============================================================
   11. TABS
   ============================================================ */
document.querySelectorAll(".tab-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    const view = btn.dataset.view;
    document.getElementById("view-floor").classList.toggle("active", view==="floor");
    document.getElementById("view-dashboard").classList.toggle("active", view==="dashboard");
  });
});

/* ============================================================
   12. DASHBOARD — mode toggle / model select
   ============================================================ */
document.getElementById("mode-toggle").addEventListener("click",(e)=>{
  const btn = e.target.closest("button");
  if(!btn) return;
  document.querySelectorAll("#mode-toggle button").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  state.mode = btn.dataset.mode;
});

document.getElementById("model-select").addEventListener("change",(e)=>{
  state.model = e.target.value;
  const preset = MODEL_PRESETS[state.model];
  document.getElementById("model-accuracy").textContent = preset.acc.toFixed(1)+"%";
  document.getElementById("model-latency").textContent = preset.latency;
});

/* ============================================================
   13. TELEMETRY SIMULATION (IoT dashboard)
   ============================================================ */
const telemetry = {
  rpm: 1180, temp: 52, power: 12.4, airflow: 260, moisture: 22, servo: 40,
};
function jitter(val, amount, min, max){
  let v = val + (Math.random()*2-1)*amount;
  return clamp(v, min, max);
}
function setGauge(idVal, idFill, value, max, decimals, colorGood){
  document.getElementById(idVal).firstChild.textContent = value.toFixed(decimals);
  const pct = clamp((value/max)*100, 0, 100);
  document.getElementById(idFill).style.width = pct + "%";
}

setInterval(()=>{
  const running = state.running;
  const target = running ? 1 : 0.15;
  telemetry.rpm     = jitter(telemetry.rpm, 18*target, 0, 1500);
  telemetry.temp    = jitter(telemetry.temp, 1.4*target, 20, 92);
  telemetry.power   = jitter(telemetry.power, 0.6*target, 0, 20);
  telemetry.airflow = jitter(telemetry.airflow, 12*target, 0, 420);
  telemetry.moisture= jitter(telemetry.moisture, 2.2*target, 2, 60);
  telemetry.servo   = jitter(telemetry.servo, 10*target, 0, 90);

  setGauge("tm-rpm","tm-rpm-fill", telemetry.rpm, 1500, 0);
  setGauge("tm-temp","tm-temp-fill", telemetry.temp, 100, 1);
  setGauge("tm-power","tm-power-fill", telemetry.power, 20, 1);
  setGauge("tm-airflow","tm-airflow-fill", telemetry.airflow, 420, 0);
  setGauge("tm-moisture","tm-moisture-fill", telemetry.moisture, 60, 1);
  setGauge("tm-servo","tm-servo-fill", telemetry.servo, 90, 0);

  const tempFill = document.getElementById("tm-temp-fill");
  tempFill.style.background = telemetry.temp > 80 ? "var(--red)" : "var(--amber)";
}, 900);

/* init feature bars with a neutral placeholder */
updateFeatureBars(FEATURES_LIGHT_INDUSTRIAL, randomFeatureWeights(FEATURES_LIGHT_INDUSTRIAL.length), "STANDBY");

})();
