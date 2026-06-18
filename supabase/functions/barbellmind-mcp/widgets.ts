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

// Onboarding MCP App — guided, tap-through wizard (4 steps, auto-advance).
// Centerpiece: an interactive macro setter (live ring + steppers + goal-based
// suggest) and a split picker with a real week + exercise preview. On save it
// calls set_profile, set_macro_targets, and setup_default_plan through the host.
// Self-contained: inline CSS/JS, no CDN, no fetch. No backticks, no ${...}.
export const ONBOARD_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>BarbellMind setup</title>
<style>
  *{box-sizing:border-box}html,body{margin:0;padding:0;background:#000}
  body{font-family:-apple-system,system-ui,"Segoe UI",Roboto,sans-serif;color:#fafafa}
  #root{padding:6px}
  .card{background:#161618;border:1px solid #232327;border-radius:20px;padding:18px;max-width:460px;margin:0 auto}
  .hd{display:flex;align-items:center;gap:8px;margin-bottom:6px}
  .dot{width:9px;height:9px;border-radius:99px;background:#34d399;flex:none}
  .ttl{font-size:17px;font-weight:850;letter-spacing:-.02em}
  .sub{font-size:11.5px;color:#8b8b92;margin-left:auto;font-weight:700}
  .bar{height:4px;background:#26262b;border-radius:99px;overflow:hidden;margin:2px 0 16px}
  .barfill{height:100%;background:#34d399;border-radius:99px;transition:width .25s ease}
  .lab{display:block;font-size:12px;font-weight:700;color:#a1a1aa;margin:13px 0 6px}
  input,textarea{width:100%;background:#0f0f11;border:1px solid #2a2a2e;border-radius:11px;padding:11px;color:#fafafa;font-size:15px;font-family:inherit}
  input:focus,textarea:focus{outline:none;border-color:#34d399}
  .row{display:flex;gap:9px}.row>div{flex:1}
  .chips{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .chip{padding:12px;border-radius:12px;border:1px solid #2a2a2e;background:#0f0f11;font-size:13px;font-weight:700;cursor:pointer;text-align:center;color:#c4c4c8}
  .chip.on{border-color:#34d399;background:rgba(52,211,153,.12);color:#fafafa}
  .nav{display:flex;gap:10px;margin-top:18px}
  .btn{flex:1;border:0;border-radius:13px;padding:13px;font-size:15px;font-weight:800;cursor:pointer;background:#34d399;color:#06291d}
  .btn.ghost{flex:0 0 auto;background:#222226;color:#c4c4c8;padding:13px 16px}
  .btn:disabled{opacity:.55}
  .ringwrap{display:flex;align-items:center;gap:16px;margin:6px 0 14px}
  .ring{width:104px;height:104px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center}
  .ring .in{width:80px;height:80px;border-radius:50%;background:#161618;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .ring .v{font-size:21px;font-weight:850;line-height:1}.ring .l{font-size:9px;color:#8b8b92;margin-top:2px}
  .ringside{flex:1}
  .hint{font-size:11px;font-weight:700;margin-top:6px}
  .mrow{display:flex;align-items:center;gap:10px;margin:9px 0}
  .mrow .nm{flex:1;font-size:13px;font-weight:700}
  .mrow .nm .d{width:8px;height:8px;border-radius:99px;display:inline-block;margin-right:6px;vertical-align:middle}
  .step{display:flex;align-items:center;gap:7px}
  .sb{width:30px;height:30px;border-radius:9px;border:1px solid #2a2a2e;background:#0f0f11;color:#fafafa;font-size:17px;font-weight:800;cursor:pointer;line-height:1}
  .sv{min-width:58px;text-align:center;font-weight:800;font-size:15px}.sv small{font-size:10px;color:#8b8b92;font-weight:600}
  .suggest{width:100%;margin:4px 0 12px;border:1px dashed #34d399;background:rgba(52,211,153,.08);color:#34d399;border-radius:11px;padding:10px;font-size:12.5px;font-weight:800;cursor:pointer}
  .split{border:1px solid #2a2a2e;background:#0f0f11;border-radius:14px;padding:12px;margin-bottom:9px;cursor:pointer}
  .split.on{border-color:#34d399;background:rgba(52,211,153,.08)}
  .split .t{display:flex;justify-content:space-between;align-items:center;font-size:13.5px;font-weight:850}
  .split .wk{font-size:9px;color:#6b6b72;font-weight:800}
  .split .dd{display:flex;gap:3px;margin-top:9px}
  .split .dc{flex:1;text-align:center;font-size:7.5px;font-weight:800;padding:4px 0;border-radius:5px;color:#06291d}
  .preview{font-size:11px;color:#8b8b92;margin-top:8px;line-height:1.4}
  .okbox{background:#10311f;border:1px solid #1f5f3f;color:#34d399;border-radius:14px;padding:15px}
  .okbox h3{margin:0 0 9px;font-size:15px}
  .okbox .ln{display:flex;justify-content:space-between;gap:12px;font-size:13px;padding:5px 0;border-top:1px solid #1f5f3f}
  .okbox .ln:first-of-type{border-top:0}.okbox .k{color:#9fe7c8}.okbox .v{font-weight:700;text-align:right}
</style></head>
<body><div id="root"><div class="card"><div class="sub">Loading...</div></div></div>
<script>
(function(){"use strict";
 var PV="2026-01-26",TO="*",nid=1,pend={},init=false,buf=null,lw=0,lh=0;
 function post(m){window.parent.postMessage(m,TO)}
 function req(method,params){var id=nid++;return new Promise(function(res,rej){pend[id]={res:res,rej:rej};post({jsonrpc:"2.0",id:id,method:method,params:params})})}
 function note(method,params){post({jsonrpc:"2.0",method:method,params:params})}
 function deliver(c){if(typeof window.__or==="function"){try{window.__or(c)}catch(e){}}else buf=c}
 function size(){try{var h=document.documentElement;var p=h.style.height;h.style.height="max-content";var ht=Math.ceil(h.getBoundingClientRect().height);h.style.height=p;var w=Math.ceil(window.innerWidth);if(w!==lw||ht!==lh){lw=w;lh=ht;note("ui/notifications/size-changed",{width:w,height:ht})}}catch(e){}}
 window.__sz=size;
 function setupResize(){size();try{if(typeof ResizeObserver!=="undefined"){var ro=new ResizeObserver(function(){window.requestAnimationFrame?requestAnimationFrame(size):size()});ro.observe(document.documentElement);ro.observe(document.body)}window.addEventListener("resize",size)}catch(e){}}
 window.addEventListener("message",function(ev){var m=ev.data;if(!m||m.jsonrpc!=="2.0")return;if(m.id!==undefined&&m.id!==null&&pend[m.id]){var p=pend[m.id];delete pend[m.id];m.error?p.rej(new Error((m.error&&m.error.message)||"err")):p.res(m.result);return}if(typeof m.method==="string"&&m.method==="ui/notifications/tool-result")deliver(m.params)});
 window.__call=function(n,a){if(!init)return Promise.reject(new Error("not ready"));return req("tools/call",{name:n,arguments:a||{}})};
 if(!Object.prototype.hasOwnProperty.call(window,"__or")){var st;Object.defineProperty(window,"__or",{configurable:true,get:function(){return st},set:function(fn){st=fn;if(typeof fn==="function"&&buf!==null){var r=buf;buf=null;try{fn(r)}catch(e){}}}})}
 req("ui/initialize",{appCapabilities:{},appInfo:{name:"BarbellMind setup",version:"2.0.0"},protocolVersion:PV}).then(function(){note("ui/notifications/initialized",{});init=true;setupResize()}).catch(function(){});
})();

var root=document.getElementById("root");
function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
function val(id){var e=document.getElementById(id);return e?e.value:""}
function num(v){if(v===""||v==null)return null;var n=Number(v);return isNaN(n)?null:n}

var GOALS=[["build_muscle","Build muscle"],["lose_weight","Lose weight"],["gain_strength","Gain strength"],["maintain","Maintain"],["general_fitness","General fitness"]];
var MULT={lose_weight:11,maintain:15,build_muscle:16,gain_strength:16,general_fitness:14};
var SLOTC={push:"#fb7185",pull:"#a78bfa",legs:"#34d399",upper:"#fb7185",lower:"#a78bfa",full:"#fbbf24",rest:"#3a3a40",cardio:"#22d3ee",custom:"#8b8b92"};
var SPLITS=[
 ["ppl","Push / Pull / Legs","6 days/wk",["rest","push","pull","legs","push","pull","legs"]],
 ["upper_lower","Upper / Lower","4 days/wk",["rest","upper","lower","rest","upper","lower","rest"]],
 ["full_body","Full Body","3 days/wk",["rest","full","rest","full","rest","full","rest"]],
 ["custom","Build your own","flexible",["rest","push","pull","legs","push","pull","legs"]]
];
var PREVIEW={push:"Bench Press, Overhead Press, Lateral Raise…",pull:"Barbell Row, Pull-ups, Barbell Curl…",legs:"Back Squat, Romanian Deadlift, Leg Press…",upper:"Bench Press, Barbell Row, Overhead Press…",lower:"Back Squat, RDL, Leg Curl…",full:"Squat, Bench, Row, Overhead Press…"};

var D={name:"",height_ft:"",height_in:"",weight_lbs:"",goal:"maintain",kcal:2200,protein:170,carbs:230,fat:65,split:"ppl"};
var step=0,TOTAL=4,TITLES=["About you","Your nutrition","Your training","Review"];

function suggest(){
 var w=Number(D.weight_lbs)||180;
 var k=Math.round(w*(MULT[D.goal]||15)/10)*10;
 var p=Math.round(w*1.0/5)*5;
 var f=Math.round(w*0.4/5)*5;
 var c=Math.max(0,Math.round((k-p*4-f*9)/4/5)*5);
 D.kcal=k;D.protein=p;D.fat=f;D.carbs=c;
}
function macroKcal(){return (D.protein||0)*4+(D.carbs||0)*4+(D.fat||0)*9}

function header(){
 return '<div class="hd"><span class="dot"></span><span class="ttl">'+TITLES[step]+'</span><span class="sub">Step '+(step+1)+' of '+TOTAL+'</span></div>'
  +'<div class="bar"><div class="barfill" style="width:'+(((step+1)/TOTAL)*100).toFixed(0)+'%"></div></div>';
}

function stepAbout(){
 var g=GOALS.map(function(o){return '<div class="chip'+(D.goal===o[0]?' on':'')+'" data-goal="'+o[0]+'">'+o[1]+'</div>'}).join("");
 return '<label class="lab">Name</label><input id="f_name" placeholder="Your name" value="'+esc(D.name)+'" />'
  +'<label class="lab">Height</label><div class="row"><div><input id="f_ft" type="number" placeholder="ft" value="'+esc(D.height_ft)+'" /></div><div><input id="f_in" type="number" placeholder="in" value="'+esc(D.height_in)+'" /></div></div>'
  +'<label class="lab">Current weight (lbs)</label><input id="f_wt" type="number" placeholder="e.g. 180" value="'+esc(D.weight_lbs)+'" />'
  +'<label class="lab">Goal</label><div class="chips">'+g+'</div>';
}

function macroRow(k,label,color,unit){
 return '<div class="mrow"><div class="nm"><span class="d" style="background:'+color+'"></span>'+label+'</div><div class="step"><button class="sb" data-k="'+k+'" data-d="-5">&minus;</button><div class="sv"><span id="v_'+k+'">'+D[k]+'</span><small>'+unit+'</small></div><button class="sb" data-k="'+k+'" data-d="5">+</button></div></div>';
}
function stepMacros(){
 return '<div class="ringwrap"><div class="ring" id="mring"><div class="in"><div class="v" id="v_kcal">'+D.kcal+'</div><div class="l">kcal / day</div></div></div>'
  +'<div class="ringside"><div class="step"><button class="sb" data-k="kcal" data-d="-50">&minus;</button><div class="sv" style="min-width:74px"><span id="v_kcal2">'+D.kcal+'</span><small> kcal</small></div><button class="sb" data-k="kcal" data-d="50">+</button></div><div class="hint" id="mhint"></div></div></div>'
  +'<button class="suggest" id="f_suggest">&#10022; Suggest from my goal</button>'
  +macroRow("protein","Protein","#fb7185","g")
  +macroRow("carbs","Carbs","#60a5fa","g")
  +macroRow("fat","Fat","#a78bfa","g");
}

function weekStrip(t){return '<div class="dd">'+t.map(function(sl){var lab=sl==="rest"?"":sl[0].toUpperCase();return '<div class="dc" style="background:'+(sl==="rest"?"#26262b":SLOTC[sl])+';color:'+(sl==="rest"?"#6b6b72":"#06291d")+'">'+(sl==="rest"?"·":lab)+'</div>'}).join("")+'</div>'}
function stepTraining(){
 var cards=SPLITS.map(function(s){
  var on=D.split===s[0];
  var firstSlot=s[3].filter(function(x){return x!=="rest"})[0];
  return '<div class="split'+(on?' on':'')+'" data-split="'+s[0]+'"><div class="t">'+s[1]+' <span class="wk">'+s[2]+'</span></div>'+weekStrip(s[3])+'<div class="preview">'+(PREVIEW[firstSlot]||"Your own exercises")+'</div></div>';
 }).join("");
 return '<div style="font-size:12px;color:#8b8b92;margin-bottom:10px">Pick a split. We build the week and exercises for you, edit anything later.</div>'+cards;
}

function ln(k,v){if(v==null||v==="")return "";return '<div class="ln"><span class="k">'+esc(k)+'</span><span class="v">'+esc(v)+'</span></div>'}
function stepReview(){
 var gm={build_muscle:"Build muscle",lose_weight:"Lose weight",gain_strength:"Gain strength",maintain:"Maintain",general_fitness:"General fitness"};
 var sm={ppl:"Push / Pull / Legs",upper_lower:"Upper / Lower",full_body:"Full Body",custom:"Build your own"};
 var ht=(D.height_ft!==""&&D.height_ft!=null)?(D.height_ft+" ft "+(D.height_in||0)+" in"):"";
 return '<div style="font-size:12px;color:#8b8b92;margin-bottom:12px">Looks good? We will save your profile, macros, and build your plan.</div>'
  +'<div style="background:#0f0f11;border:1px solid #2a2a2e;border-radius:14px;padding:13px">'
  +ln("Name",D.name)+ln("Height",ht)+ln("Weight",D.weight_lbs?D.weight_lbs+" lbs":"")+ln("Goal",gm[D.goal])
  +ln("Calories",D.kcal+" kcal")+ln("Protein",D.protein+" g")+ln("Carbs",D.carbs+" g")+ln("Fat",D.fat+" g")+ln("Split",sm[D.split])
  +'</div>';
}

function updateMacros(){
 ["kcal","protein","carbs","fat"].forEach(function(k){var e=document.getElementById("v_"+k);if(e)e.textContent=D[k]||0});
 var e2=document.getElementById("v_kcal2");if(e2)e2.textContent=D.kcal||0;
 var pc=(D.protein||0)*4,cc=(D.carbs||0)*4,fc=(D.fat||0)*9,tot=pc+cc+fc||1;
 var pD=pc/tot*360,cD=cc/tot*360,r=document.getElementById("mring");
 if(r)r.style.background="conic-gradient(#fb7185 0 "+pD.toFixed(1)+"deg,#60a5fa "+pD.toFixed(1)+"deg "+(pD+cD).toFixed(1)+"deg,#a78bfa "+(pD+cD).toFixed(1)+"deg 360deg)";
 var h=document.getElementById("mhint");
 if(h){var diff=Math.abs(macroKcal()-(D.kcal||0));if(diff<=90){h.style.color="#34d399";h.textContent="Macros ≈ "+macroKcal()+" kcal · balanced";}else{h.style.color="#fbbf24";h.textContent="Macros add to "+macroKcal()+" kcal vs "+(D.kcal||0)+" target";}}
}

function collect(){
 if(document.getElementById("f_name"))D.name=val("f_name").trim();
 if(document.getElementById("f_ft"))D.height_ft=num(val("f_ft"));
 if(document.getElementById("f_in"))D.height_in=num(val("f_in"));
 if(document.getElementById("f_wt"))D.weight_lbs=num(val("f_wt"));
}

function render(){
 var last=step===TOTAL-1,body=[stepAbout,stepMacros,stepTraining,stepReview][step]();
 root.innerHTML='<div class="card">'+header()+body
  +'<div class="nav">'+(step>0?'<button class="btn ghost" id="b_back">Back</button>':'')+'<button class="btn" id="b_next">'+(last?"Save & build my plan":"Continue")+'</button></div>'
  +'<div class="hint" id="b_msg" style="color:#fb7185;text-align:center"></div></div>';
 if(document.getElementById("b_back"))document.getElementById("b_back").onclick=function(){collect();step--;render()};
 document.getElementById("b_next").onclick=function(){collect();if(last)save();else{step++;render()}};
 document.querySelectorAll("[data-goal]").forEach(function(el){el.onclick=function(){D.goal=el.getAttribute("data-goal");render()}});
 document.querySelectorAll("[data-split]").forEach(function(el){el.onclick=function(){D.split=el.getAttribute("data-split");render()}});
 document.querySelectorAll(".sb").forEach(function(b){b.onclick=function(){var k=b.getAttribute("data-k"),d=parseInt(b.getAttribute("data-d"),10);D[k]=Math.max(0,(D[k]||0)+d);updateMacros()}});
 if(document.getElementById("f_suggest"))document.getElementById("f_suggest").onclick=function(){suggest();render()};
 if(step===1)updateMacros();
 if(window.__sz)window.__sz();
}

function save(){
 var btn=document.getElementById("b_next"),msg=document.getElementById("b_msg");msg.textContent="";
 if(typeof window.__call!=="function"){msg.textContent="Not connected to the app host.";return}
 btn.disabled=true;btn.textContent="Saving…";
 var prof={goal:D.goal};
 if(D.name)prof.name=D.name; if(D.height_ft!=null&&D.height_ft!=="")prof.height_ft=D.height_ft; if(D.height_in!=null&&D.height_in!=="")prof.height_in=D.height_in; if(D.weight_lbs!=null&&D.weight_lbs!=="")prof.weight_lbs=D.weight_lbs;
 window.__call("set_profile",prof)
  .then(function(){return window.__call("set_macro_targets",{kcal_target:D.kcal,protein_target_g:D.protein,carbs_target_g:D.carbs,fat_target_g:D.fat})})
  .then(function(){return window.__call("setup_default_plan",{split_type:D.split})})
  .then(function(pr){var plan=(pr&&pr.structuredContent)||(pr&&pr._meta&&pr._meta.render)||null;confirm(plan)})
  .catch(function(e){btn.disabled=false;btn.textContent="Save & build my plan";msg.textContent=(e&&e.message)?e.message:"Could not save. Try again."});
}

function confirm(planRes){
 var gm={build_muscle:"Build muscle",lose_weight:"Lose weight",gain_strength:"Gain strength",maintain:"Maintain",general_fitness:"General fitness"};
 var sm={ppl:"Push / Pull / Legs",upper_lower:"Upper / Lower",full_body:"Full Body",custom:"Build your own"};
 var pl="";if(planRes&&planRes.plan){var p=planRes.plan;pl=planRes.created===false?(sm[p.split_type]||p.split_type||"Plan")+" (kept existing)":(sm[p.split_type]||"Plan")+(p.training_days!=null?" · "+p.training_days+" days, "+p.exercises+" exercises":"")}
 root.innerHTML='<div class="card"><div class="okbox"><h3>You are all set</h3>'
  +ln("Goal",gm[D.goal])+ln("Calories",D.kcal+" kcal")+ln("Protein",D.protein+" g")+ln("Carbs",D.carbs+" g")+ln("Fat",D.fat+" g")+ln("Plan",pl)
  +'</div></div>';
 if(window.__sz)window.__sz();
}

function start(prefill){
 if(prefill)for(var k in prefill){if(prefill[k]!=null&&prefill[k]!=="")D[k]=prefill[k]}
 step=0;render();
}
window.__or=function(c){var d=(c&&(c.structuredContent||(c._meta&&c._meta.render)))||null;start(d&&d.prefill?d.prefill:null)};
setTimeout(function(){if(root.textContent.indexOf("Loading")!==-1)start(null)},400);
</script></body></html>`;
