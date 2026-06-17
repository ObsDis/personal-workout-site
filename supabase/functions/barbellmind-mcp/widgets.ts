// Single MCP App view for BarbellMind. The log tools and get_today all return a
// `kind: 'today'` payload, so logging shows the freshly updated dashboard.
// The host bridge is hand-rolled inline (raw JSON-RPC 2.0 over window.parent
// postMessage per the MCP Apps spec): ui/initialize handshake, listens for
// ui/notifications/tool-result, and reports height via ui/notifications/size-changed
// so the host grows the frame to fit (no scroll). The template below contains no
// backticks and no ${...} so it is safe inside this TS template literal.
export const WIDGET_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>BarbellMind</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #0b0b0c; }
  body { font-family: var(--font-sans, -apple-system, system-ui, "Segoe UI", Roboto, sans-serif); color: #fafafa; }
  #root { padding: 6px; }
  .card { background: #161618; border: 1px solid #232327; border-radius: 18px; padding: 16px 16px 14px; max-width: 520px; margin: 0 auto; }
  .hd { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
  .dot { width: 9px; height: 9px; border-radius: 99px; flex: none; }
  .ttl { font-size: 15px; font-weight: 800; letter-spacing: -0.01em; text-transform: capitalize; }
  .sub { font-size: 12px; color: #71717a; font-weight: 600; margin-left: auto; }
  .rf { margin-left: 8px; background: #232327; color: #d4d4d8; border: 0; border-radius: 8px; padding: 5px 10px; font-size: 11px; font-weight: 700; cursor: pointer; }
  .rf:active { background: #2c2c31; }
  .row { margin-bottom: 11px; }
  .rowtop { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 5px; }
  .lbl { font-size: 12px; font-weight: 700; color: #a1a1aa; }
  .val { font-size: 12px; font-weight: 700; color: #fafafa; font-variant-numeric: tabular-nums; }
  .track { height: 8px; border-radius: 99px; background: #26262b; overflow: hidden; }
  .fill { height: 100%; border-radius: 99px; transition: width .35s ease; }
  .foot { display: flex; justify-content: space-between; margin-top: 12px; padding-top: 11px; border-top: 1px solid #232327; font-size: 12px; font-weight: 700; color: #71717a; }
  .exrow { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-top: 1px solid #232327; }
  .exrow:first-of-type { border-top: 0; }
  .exname { font-size: 13.5px; font-weight: 700; color: #fafafa; }
  .exsets { font-size: 12.5px; color: #a1a1aa; font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }
  .notes { margin-top: 10px; font-size: 12px; color: #a1a1aa; font-style: italic; }
  .ringwrap { display: flex; justify-content: center; margin: 4px 0 16px; }
  .ring { width: 112px; height: 112px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
  .ringin { width: 88px; height: 88px; border-radius: 50%; background: #161618; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .rv { font-size: 23px; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; line-height: 1; }
  .rl { font-size: 11px; color: #71717a; font-weight: 600; margin-top: 3px; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 14px 0 2px; }
  .st { background: #1c1c1f; border-radius: 12px; padding: 9px 6px; text-align: center; }
  .sv { font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .sl { font-size: 9.5px; color: #71717a; font-weight: 700; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.03em; }
  .plan { margin-top: 14px; padding-top: 12px; border-top: 1px solid #232327; }
  .planhd { font-size: 12px; font-weight: 800; color: #d4d4d8; text-transform: capitalize; margin-bottom: 7px; }
  .plrow { font-size: 13px; color: #e4e4e7; font-weight: 600; padding: 3px 0; }
  .plsub { color: #71717a; font-weight: 600; }
  .empty { text-align: center; color: #71717a; font-size: 13px; padding: 22px 0; }
  .banner { background: #10311f; color: #34d399; border: 1px solid #1f5f3f; border-radius: 10px; padding: 8px 11px; font-size: 12px; font-weight: 700; margin-bottom: 12px; }
</style>
</head>
<body>
<div id="root"><div class="empty">Loading...</div></div>
<script>
(function () {
  "use strict";
  var PROTOCOL_VERSION = "2026-01-26";
  var TARGET_ORIGIN = "*";
  var nextId = 1;
  var pending = {};
  var initialized = false;
  var buffered = null;
  var lastW = 0, lastH = 0;
  function post(m) { window.parent.postMessage(m, TARGET_ORIGIN); }
  function sendRequest(method, params) {
    var id = nextId++;
    return new Promise(function (resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject };
      post({ jsonrpc: "2.0", id: id, method: method, params: params });
    });
  }
  function sendNotification(method, params) { post({ jsonrpc: "2.0", method: method, params: params }); }
  function deliver(ctr) {
    if (typeof window.__onToolResult === "function") { try { window.__onToolResult(ctr); } catch (e) {} }
    else { buffered = ctr; }
  }
  function measureAndSendSize() {
    try {
      var html = document.documentElement;
      var prev = html.style.height;
      html.style.height = "max-content";
      var height = Math.ceil(html.getBoundingClientRect().height);
      html.style.height = prev;
      var width = Math.ceil(window.innerWidth);
      if (width !== lastW || height !== lastH) {
        lastW = width; lastH = height;
        sendNotification("ui/notifications/size-changed", { width: width, height: height });
      }
    } catch (e) {}
  }
  window.__notifySize = measureAndSendSize;
  function setupResize() {
    measureAndSendSize();
    try {
      if (typeof ResizeObserver !== "undefined") {
        var ro = new ResizeObserver(function () {
          if (window.requestAnimationFrame) window.requestAnimationFrame(measureAndSendSize);
          else measureAndSendSize();
        });
        ro.observe(document.documentElement);
        ro.observe(document.body);
      }
      window.addEventListener("resize", measureAndSendSize);
    } catch (e) {}
  }
  window.addEventListener("message", function (event) {
    var msg = event.data;
    if (!msg || msg.jsonrpc !== "2.0") return;
    if (msg.id !== undefined && msg.id !== null && pending[msg.id]) {
      var p = pending[msg.id]; delete pending[msg.id];
      if (msg.error) { p.reject(new Error((msg.error && msg.error.message) || "RPC error")); }
      else { p.resolve(msg.result); }
      return;
    }
    if (typeof msg.method === "string") {
      if (msg.method === "ui/notifications/tool-result") { deliver(msg.params); }
      return;
    }
  });
  window.__callServerTool = function (name, args) {
    if (!initialized) return Promise.reject(new Error("not ready"));
    return sendRequest("tools/call", { name: name, arguments: args || {} });
  };
  if (!Object.prototype.hasOwnProperty.call(window, "__onToolResult")) {
    var stored;
    Object.defineProperty(window, "__onToolResult", {
      configurable: true,
      get: function () { return stored; },
      set: function (fn) {
        stored = fn;
        if (typeof fn === "function" && buffered !== null) { var r = buffered; buffered = null; try { fn(r); } catch (e) {} }
      }
    });
  }
  sendRequest("ui/initialize", { appCapabilities: {}, appInfo: { name: "BarbellMind", version: "1.0.0" }, protocolVersion: PROTOCOL_VERSION })
    .then(function () { sendNotification("ui/notifications/initialized", {}); initialized = true; setupResize(); })
    .catch(function () {});
})();

var root = document.getElementById("root");

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function fmt(n) { var v = Math.round(Number(n) || 0); return v.toLocaleString(); }

function bar(label, val, target, unit, color) {
  var p = target > 0 ? Math.max(0, Math.min(1, (Number(val) || 0) / target)) : ((Number(val) || 0) > 0 ? 1 : 0);
  var u = unit ? (" " + unit) : "";
  var right = target > 0 ? (fmt(val) + " / " + fmt(target) + u) : (fmt(val) + u);
  return '<div class="row"><div class="rowtop"><span class="lbl">' + esc(label) + '</span><span class="val">' + right + '</span></div>'
    + '<div class="track"><div class="fill" style="width:' + (p * 100).toFixed(1) + '%;background:' + color + ';"></div></div></div>';
}

function renderToday(d) {
  var m = d.macros || {};
  var c = m.consumed || {};
  var t = m.target || {};
  var h = d.health || {};
  function hv(k) { return h[k] && h[k].value != null ? fmt(h[k].value) : "--"; }
  var calPct = t.kcal > 0 ? Math.min(1, (Number(c.calories) || 0) / t.kcal) : 0;
  var deg = Math.round(calPct * 360);
  var html = '<div class="card">'
    + '<div class="hd"><span class="dot" style="background:#34d399"></span><span class="ttl">Today</span><span class="sub">' + esc(d.date || "") + '</span><button id="rf" class="rf">Refresh</button></div>'
    + (d.justLogged ? '<div class="banner">' + esc(d.justLogged) + '</div>' : '')
    + '<div class="ringwrap"><div class="ring" style="background:conic-gradient(#34d399 ' + deg + 'deg,#26262b 0)"><div class="ringin"><div class="rv">' + fmt(c.calories) + '</div><div class="rl">of ' + fmt(t.kcal) + ' kcal</div></div></div></div>'
    + bar("Protein", c.protein_g, t.protein_g, "g", "#fb7185")
    + bar("Carbs", c.carbs_g, t.carbs_g, "g", "#fbbf24")
    + bar("Fat", c.fat_g, t.fat_g, "g", "#60a5fa")
    + '<div class="stats">'
    + '<div class="st"><div class="sv">' + hv("steps") + '</div><div class="sl">Steps</div></div>'
    + '<div class="st"><div class="sv">' + hv("active_energy") + '</div><div class="sl">Move</div></div>'
    + '<div class="st"><div class="sv">' + hv("exercise_minutes") + '</div><div class="sl">Exer min</div></div>'
    + '<div class="st"><div class="sv">' + (d.body_weight_lbs != null ? fmt(d.body_weight_lbs) : "--") + '</div><div class="sl">Weight</div></div>'
    + '</div>';
  var w = d.workout || {};
  var wex = w.exercises || [];
  if (w.slot_type && w.slot_type !== "rest") {
    var wl = "";
    for (var k = 0; k < wex.length; k++) {
      wl += '<div class="plrow">' + esc(wex[k].exercise_name) + ' <span class="plsub">' + esc(String(wex[k].target_sets || "")) + "x" + esc(String(wex[k].target_reps || "")) + '</span></div>';
    }
    html += '<div class="plan"><div class="planhd">' + esc(w.custom_name || w.slot_type) + '</div>' + (wl || '<div class="plsub">No exercises</div>') + '</div>';
  } else {
    html += '<div class="plan"><div class="planhd">Rest day</div></div>';
  }
  html += '</div>';
  return html;
}

function renderMacros(d) {
  var m = d.macros || {};
  var c = m.consumed || {};
  var t = m.target || {};
  var calPct = t.kcal > 0 ? Math.min(1, (Number(c.calories) || 0) / t.kcal) : 0;
  var deg = Math.round(calPct * 360);
  return '<div class="card">'
    + '<div class="hd"><span class="dot" style="background:#34d399"></span><span class="ttl">Macros</span><span class="sub">' + esc(d.date || "") + '</span></div>'
    + (d.justLogged ? '<div class="banner">' + esc(d.justLogged) + '</div>' : '')
    + '<div class="ringwrap"><div class="ring" style="background:conic-gradient(#34d399 ' + deg + 'deg,#26262b 0)"><div class="ringin"><div class="rv">' + fmt(c.calories) + '</div><div class="rl">of ' + fmt(t.kcal) + ' kcal</div></div></div></div>'
    + bar("Protein", c.protein_g, t.protein_g, "g", "#fb7185")
    + bar("Carbs", c.carbs_g, t.carbs_g, "g", "#fbbf24")
    + bar("Fat", c.fat_g, t.fat_g, "g", "#60a5fa")
    + '</div>';
}

function renderWorkout(d) {
  var ex = d.exercises || [];
  var rows = "";
  for (var i = 0; i < ex.length; i++) {
    var e = ex[i];
    var sets = e.sets || [];
    var txt = "";
    for (var j = 0; j < sets.length; j++) {
      var s = sets[j];
      if (j) txt += ", ";
      txt += (s.weight_lbs != null ? fmt(s.weight_lbs) + "x" : "") + (s.reps != null ? String(s.reps) : "");
    }
    rows += '<div class="exrow"><div class="exname">' + esc(e.exercise_name) + '</div><div class="exsets">' + esc(txt) + '</div></div>';
  }
  return '<div class="card">'
    + '<div class="hd"><span class="dot" style="background:#f59e0b"></span><span class="ttl">' + esc(d.slot_type || "Workout") + '</span><span class="sub">' + esc(d.date || "") + '</span></div>'
    + (d.justLogged ? '<div class="banner">' + esc(d.justLogged) + '</div>' : '')
    + (rows || '<div class="empty">No sets</div>')
    + '<div class="foot"><span>' + (d.totalSets || 0) + ' sets</span><span>' + fmt(d.totalVolume) + ' lb volume</span></div>'
    + (d.notes ? '<div class="notes">' + esc(d.notes) + '</div>' : "")
    + '</div>';
}

function render(d) {
  if (!d) { root.innerHTML = '<div class="empty">No data</div>'; if (window.__notifySize) window.__notifySize(); return; }
  if (d.kind === "workout") root.innerHTML = renderWorkout(d);
  else if (d.kind === "macros") root.innerHTML = renderMacros(d);
  else root.innerHTML = renderToday(d);
  var b = document.getElementById("rf");
  if (b) b.addEventListener("click", refresh);
  if (window.__notifySize) window.__notifySize();
}

function payloadOf(r) { return r ? (r.structuredContent || (r._meta && r._meta.render)) : null; }

function refresh() {
  if (typeof window.__callServerTool !== "function") return;
  window.__callServerTool("get_today", {}).then(function (ctr) {
    var d = payloadOf(ctr);
    if (d) render(d);
  }).catch(function () {});
}

window.__onToolResult = function (ctr) {
  var d = payloadOf(ctr);
  if (d) render(d);
};
</script>
</body>
</html>`;
// Onboarding MCP App view — multi-step wizard. Self-contained (inline CSS/JS, no
// CDN, no fetch). Same hand-rolled MCP Apps bridge as WIDGET_HTML: ui/initialize,
// size reporting, tools/call back through the host. Steps advance client-side
// (instant, deterministic); the final step writes via set_profile and confirms.
// Goal values use the app's canonical enum. No backticks, no ${...}.
export const ONBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>BarbellMind Onboarding</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #0b0b0c; }
  body { font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; color: #fafafa; }
  #root { padding: 6px; }
  .card { background: #161618; border: 1px solid #232327; border-radius: 18px; padding: 18px; max-width: 520px; margin: 0 auto; }
  .hd { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .dot { width: 9px; height: 9px; border-radius: 99px; background: #34d399; flex: none; }
  .ttl { font-size: 16px; font-weight: 800; letter-spacing: -.01em; }
  .sub2 { margin-left: auto; font-size: 11.5px; color: #8b8b92; font-weight: 700; }
  .bar { height: 4px; background: #26262b; border-radius: 99px; overflow: hidden; margin: 2px 0 16px; }
  .barfill { height: 100%; background: #34d399; border-radius: 99px; transition: width .2s ease; }
  label { display: block; font-size: 12px; font-weight: 700; color: #a1a1aa; margin: 12px 0 5px; }
  input, select, textarea { width: 100%; background: #0f0f11; border: 1px solid #2a2a2e; border-radius: 10px; padding: 10px 11px; color: #fafafa; font-size: 14px; font-family: inherit; }
  input:focus, select:focus, textarea:focus { outline: none; border-color: #34d399; }
  textarea { resize: vertical; min-height: 64px; }
  .row { display: flex; gap: 10px; } .row > div { flex: 1; }
  .nav { display: flex; gap: 10px; margin-top: 18px; }
  .btn { flex: 1; border: 0; border-radius: 12px; padding: 12px; font-size: 15px; font-weight: 800; cursor: pointer; background: #34d399; color: #06291d; }
  .btn.ghost { background: #232327; color: #d4d4d8; }
  .btn:disabled { opacity: .6; cursor: default; }
  .msg { font-size: 12.5px; margin-top: 10px; min-height: 16px; color: #fb7185; }
  .okbox { background: #10311f; border: 1px solid #1f5f3f; color: #34d399; border-radius: 12px; padding: 14px; }
  .okbox h3 { margin: 0 0 8px; font-size: 15px; }
  .okbox .line { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; padding: 5px 0; border-top: 1px solid #1f5f3f; }
  .okbox .line:first-of-type { border-top: 0; }
  .okbox .k { color: #9fe7c8; } .okbox .v { font-weight: 700; text-align: right; }
</style>
</head>
<body>
<div id="root"><div class="card"><div class="sub2">Loading...</div></div></div>
<script>
(function () {
  "use strict";
  var PROTOCOL_VERSION = "2026-01-26";
  var TARGET_ORIGIN = "*";
  var nextId = 1; var pending = {}; var initialized = false; var buffered = null;
  var lastW = 0, lastH = 0;
  function post(m) { window.parent.postMessage(m, TARGET_ORIGIN); }
  function sendRequest(method, params) { var id = nextId++; return new Promise(function (resolve, reject) { pending[id] = { resolve: resolve, reject: reject }; post({ jsonrpc: "2.0", id: id, method: method, params: params }); }); }
  function sendNotification(method, params) { post({ jsonrpc: "2.0", method: method, params: params }); }
  function deliver(ctr) { if (typeof window.__onToolResult === "function") { try { window.__onToolResult(ctr); } catch (e) {} } else { buffered = ctr; } }
  function measureAndSendSize() {
    try {
      var html = document.documentElement; var prev = html.style.height; html.style.height = "max-content";
      var height = Math.ceil(html.getBoundingClientRect().height); html.style.height = prev;
      var width = Math.ceil(window.innerWidth);
      if (width !== lastW || height !== lastH) { lastW = width; lastH = height; sendNotification("ui/notifications/size-changed", { width: width, height: height }); }
    } catch (e) {}
  }
  window.__notifySize = measureAndSendSize;
  function setupResize() {
    measureAndSendSize();
    try {
      if (typeof ResizeObserver !== "undefined") { var ro = new ResizeObserver(function () { if (window.requestAnimationFrame) window.requestAnimationFrame(measureAndSendSize); else measureAndSendSize(); }); ro.observe(document.documentElement); ro.observe(document.body); }
      window.addEventListener("resize", measureAndSendSize);
    } catch (e) {}
  }
  window.addEventListener("message", function (event) {
    var msg = event.data;
    if (!msg || msg.jsonrpc !== "2.0") return;
    if (msg.id !== undefined && msg.id !== null && pending[msg.id]) { var p = pending[msg.id]; delete pending[msg.id]; if (msg.error) { p.reject(new Error((msg.error && msg.error.message) || "RPC error")); } else { p.resolve(msg.result); } return; }
    if (typeof msg.method === "string") { if (msg.method === "ui/notifications/tool-result") { deliver(msg.params); } return; }
  });
  window.__callServerTool = function (name, args) { if (!initialized) return Promise.reject(new Error("not ready")); return sendRequest("tools/call", { name: name, arguments: args || {} }); };
  if (!Object.prototype.hasOwnProperty.call(window, "__onToolResult")) {
    var stored;
    Object.defineProperty(window, "__onToolResult", { configurable: true, get: function () { return stored; }, set: function (fn) { stored = fn; if (typeof fn === "function" && buffered !== null) { var r = buffered; buffered = null; try { fn(r); } catch (e) {} } } });
  }
  sendRequest("ui/initialize", { appCapabilities: {}, appInfo: { name: "BarbellMind Onboarding", version: "1.0.0" }, protocolVersion: PROTOCOL_VERSION })
    .then(function () { sendNotification("ui/notifications/initialized", {}); initialized = true; setupResize(); })
    .catch(function () {});
})();

var root = document.getElementById("root");
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function val(id) { var el = document.getElementById(id); return el ? el.value : ""; }
function numOrNull(v) { if (v === "" || v == null) return null; var n = Number(v); return isNaN(n) ? null : n; }
function opt(pairs, sel) { return pairs.map(function (o) { return '<option value="' + o[0] + '"' + (sel === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join(""); }

var DEFAULTS = { name: "", height_ft: "", height_in: "", weight_lbs: "", goal: "maintain", kcal_target: 2500, protein_target_g: 300, training_split: "ppl", injury_notes: "Lower-back limits, avoid heavy axial loading" };
var GOALS = [["build_muscle", "Build muscle"], ["lose_weight", "Lose weight"], ["gain_strength", "Gain strength"], ["maintain", "Maintain"], ["general_fitness", "General fitness"]];
var SPLITS = [["ppl", "Push / Pull / Legs"], ["upper_lower", "Upper / Lower"], ["full_body", "Full Body"], ["custom", "Custom"]];
var TITLES = ["Your basics", "Your goal", "Your macros", "Training split", "Injuries & constraints"];
var TOTAL = 5;
var data = {}; var step = 0;

function collect() {
  if (document.getElementById("f_name")) data.name = val("f_name").trim();
  if (document.getElementById("f_ft")) data.height_ft = numOrNull(val("f_ft"));
  if (document.getElementById("f_in")) data.height_in = numOrNull(val("f_in"));
  if (document.getElementById("f_weight")) data.weight_lbs = numOrNull(val("f_weight"));
  if (document.getElementById("f_goal")) data.goal = val("f_goal");
  if (document.getElementById("f_kcal")) data.kcal_target = numOrNull(val("f_kcal"));
  if (document.getElementById("f_protein")) data.protein_target_g = numOrNull(val("f_protein"));
  if (document.getElementById("f_split")) data.training_split = val("f_split");
  if (document.getElementById("f_injury")) data.injury_notes = val("f_injury").trim();
}

function stepBody(i) {
  if (i === 0) return '<label>Name</label><input id="f_name" type="text" placeholder="Your name" value="' + esc(data.name) + '" />'
    + '<label>Height</label><div class="row"><div><input id="f_ft" type="number" inputmode="numeric" min="3" max="8" placeholder="ft" value="' + esc(data.height_ft) + '" /></div><div><input id="f_in" type="number" inputmode="numeric" min="0" max="11" placeholder="in" value="' + esc(data.height_in) + '" /></div></div>'
    + '<label>Current weight (lbs)</label><input id="f_weight" type="number" inputmode="decimal" min="50" max="700" placeholder="e.g. 185" value="' + esc(data.weight_lbs) + '" />';
  if (i === 1) return '<label>Goal</label><select id="f_goal">' + opt(GOALS, data.goal) + '</select>';
  if (i === 2) return '<div class="row"><div><label>Daily calories</label><input id="f_kcal" type="number" inputmode="numeric" min="800" max="6000" value="' + esc(data.kcal_target) + '" /></div><div><label>Daily protein (g)</label><input id="f_protein" type="number" inputmode="numeric" min="0" max="500" value="' + esc(data.protein_target_g) + '" /></div></div>';
  if (i === 3) return '<label>Training split</label><select id="f_split">' + opt(SPLITS, data.training_split) + '</select>';
  return '<label>Injury / constraint notes</label><textarea id="f_injury" placeholder="Any limits we should train around">' + esc(data.injury_notes) + '</textarea>';
}

function renderStep() {
  var last = step === TOTAL - 1;
  root.innerHTML = '<div class="card">'
    + '<div class="hd"><span class="dot"></span><span class="ttl">' + esc(TITLES[step]) + '</span><span class="sub2">Step ' + (step + 1) + ' of ' + TOTAL + '</span></div>'
    + '<div class="bar"><div class="barfill" style="width:' + (((step + 1) / TOTAL) * 100).toFixed(0) + '%"></div></div>'
    + stepBody(step)
    + '<div class="nav">' + (step > 0 ? '<button id="f_back" class="btn ghost">Back</button>' : '') + '<button id="f_next" class="btn">' + (last ? 'Save profile' : 'Next') + '</button></div>'
    + '<div class="msg" id="f_msg"></div>'
    + '</div>';
  if (document.getElementById("f_back")) document.getElementById("f_back").addEventListener("click", function () { collect(); step--; renderStep(); });
  document.getElementById("f_next").addEventListener("click", function () { collect(); if (last) save(); else { step++; renderStep(); } });
  if (window.__notifySize) window.__notifySize();
}

function save() {
  var btn = document.getElementById("f_next"); var msg = document.getElementById("f_msg"); msg.textContent = "";
  var args = {};
  ["name", "height_ft", "height_in", "weight_lbs", "goal", "kcal_target", "protein_target_g", "training_split", "injury_notes"].forEach(function (k) { if (data[k] !== null && data[k] !== "" && data[k] !== undefined) args[k] = data[k]; });
  if (typeof window.__callServerTool !== "function") { msg.textContent = "Not connected to the app host."; return; }
  btn.disabled = true; btn.textContent = "Saving...";
  window.__callServerTool("set_profile", args).then(function (ctr) {
    var saved = (ctr && ctr.structuredContent && ctr.structuredContent.saved) || (ctr && ctr._meta && ctr._meta.render && ctr._meta.render.saved) || args;
    window.__callServerTool("setup_default_plan", { split_type: data.training_split }).then(function (pr) {
      var planRes = (pr && pr.structuredContent) || (pr && pr._meta && pr._meta.render) || null;
      renderConfirm(saved, planRes);
    }).catch(function () { renderConfirm(saved, null); });
  }).catch(function (e) { btn.disabled = false; btn.textContent = "Save profile"; msg.textContent = (e && e.message) ? e.message : "Could not save. Try again."; });
}

function line(k, v) { if (v == null || v === "") return ""; return '<div class="line"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + '</span></div>'; }
function planLine(pr) {
  if (!pr || !pr.plan) return "";
  var splitMap = { ppl: "Push / Pull / Legs", upper_lower: "Upper / Lower", full_body: "Full Body", custom: "Custom" };
  var p = pr.plan; var nm = splitMap[p.split_type] || p.name || p.split_type || "Plan";
  if (pr.created === false) return line("Plan", nm + " (kept existing)");
  var det = (p.training_days != null ? p.training_days + " days" : "") + (p.exercises != null ? ", " + p.exercises + " exercises" : "");
  return line("Plan", nm + (det ? " (" + det + ")" : " created"));
}

function renderConfirm(s, planRes) {
  var ht = (s.height_ft != null && s.height_ft !== "") ? (s.height_ft + " ft " + (s.height_in || 0) + " in") : "";
  var goalMap = { build_muscle: "Build muscle", lose_weight: "Lose weight", gain_strength: "Gain strength", maintain: "Maintain", general_fitness: "General fitness" };
  var splitMap = { ppl: "Push / Pull / Legs", upper_lower: "Upper / Lower", full_body: "Full Body", custom: "Custom" };
  root.innerHTML = '<div class="card"><div class="okbox"><h3>Profile saved</h3>'
    + line("Name", s.name || s.username)
    + line("Height", ht)
    + line("Weight", (s.weight_lbs != null && s.weight_lbs !== "" ? s.weight_lbs + " lbs" : ""))
    + line("Goal", goalMap[s.goal] || s.goal)
    + line("Calories", (s.kcal_target != null && s.kcal_target !== "" ? s.kcal_target + " kcal" : ""))
    + line("Protein", (s.protein_target_g != null && s.protein_target_g !== "" ? s.protein_target_g + " g" : ""))
    + line("Split", splitMap[s.training_split] || s.training_split)
    + line("Notes", s.injury_notes)
    + planLine(planRes)
    + '</div></div>';
  if (window.__notifySize) window.__notifySize();
}

function start(prefill) {
  data = {}; for (var k in DEFAULTS) data[k] = DEFAULTS[k];
  if (prefill) for (var k2 in prefill) { if (prefill[k2] != null && prefill[k2] !== "") data[k2] = prefill[k2]; }
  step = 0; renderStep();
}

window.__onToolResult = function (ctr) {
  var d = (ctr && (ctr.structuredContent || (ctr._meta && ctr._meta.render))) || null;
  start(d && d.prefill ? d.prefill : null);
};

setTimeout(function () { if (root.textContent.indexOf("Loading") !== -1) start(null); }, 400);
</script>
</body>
</html>`;
