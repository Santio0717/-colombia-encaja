// ===================== CONFIG =====================
const SVG_SOURCE = "./Colombia.svg";

// Escala base del SVG dentro del viewBox (el responsive lo manejan viewBox + CSS).
const SCALE = 0.65;

// Puntuación
const GOOD = 200, BAD = -100;

// Columna de “spawn” (posición inicial de piezas)
const PANEL_WORLD_W   = 460;
const SPAWN_COL_X_PAD = 28;
const SPAWN_ANCHOR_Y_FRAC = 0.45;
const SPAWN_JITTER_PX = 0;

// Etiqueta en piezas (opcional)
const SHOW_LABELS_ON_PIECES = false;

// Snap base dinámica (ajustada por dispositivo)
const SNAP_PX_BASE_DESKTOP = 16;
const SNAP_PX_BASE_MOBILE  = 22;

// Nombre especial (bloquea hasta completarlo)
const EXAMPLE_TITLE = "Ejemplo.";

// ====== OVERRIDES OPCIONALES (forzar una bandera de Commons) ======
const FLAG_BY_TITLE = {
  // "Bogotá, D.C.": commons("Flag of Bogotá.svg"),
};

// ====== ORDEN FIJO DEL PANEL ======
const FIXED_ORDER = [
  "Ejemplo.",
  "San Andrés y Providencia",
  "Cauca","Nariño","Chocó","Guainía","Tolima","Caquetá","Huila","Putumayo","Amazonas",
  "Bolívar","Valle del Cauca","Sucre","Atlántico","Cesar","La Guajira","Magdalena",
  "Arauca","Norte de Santander","Casanare","Guaviare","Meta","Vaupés","Vichada",
  "Antioquia","Córdoba","Boyacá","Santander","Caldas","Cundinamarca","Bogotá, D.C.","Risaralda"
];

// ====== TABLA OFICIAL (1..33) + 34 Ejemplo ======
const DEPT_BY_NUMBER = {
  1:"San Andrés y Providencia",
  2:"Cauca",
  3:"Nariño",
  4:"Chocó",
  5:"Tolima",
  6:"Caquetá",
  7:"Huila",
  8:"Putumayo",
  9:"Amazonas",
  10:"Bolívar",
  11:"Valle del Cauca",
  12:"Sucre",
  13:"Atlántico",
  14:"Cesar",
  15:"La Guajira",
  16:"Magdalena",
  17:"Arauca",
  18:"Norte de Santander",
  19:"Casanare",
  20:"Guaviare",
  21:"Meta",
  22:"Vaupés",
  23:"Vichada",
  24:"Antioquia",
  25:"Córdoba",
  26:"Boyacá",
  27:"Santander",
  28:"Caldas",
  29:"Cundinamarca",
  30:"Bogotá, D.C.",
  31:"Risaralda",
  32:"Quindío",
  33:"Guainía",
  34:"Ejemplo.",
};

// ===== Alias → nombre canónico =====
const ALIAS_TO_CANON = (() => {
  const m = new Map();
  const add = (a,c)=> m.set(
    a.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu,""),
    c
  );
  [
    ["bogota","Bogotá, D.C."],["bogotá","Bogotá, D.C."],["bogota d.c.","Bogotá, D.C."],
    ["distrito capital","Bogotá, D.C."],["bogota dc","Bogotá, D.C."],
    ["san andres","San Andrés y Providencia"],["san andrés","San Andrés y Providencia"],
    ["archipielago de san andres","San Andrés y Providencia"],
    ["atlantico","Atlántico"],["bolivar","Bolívar"],["cordoba","Córdoba"],
    ["boyaca","Boyacá"],["quindio","Quindío"],["guajira","La Guajira"],
    ["norte santander","Norte de Santander"],["nsantander","Norte de Santander"],
    ["vaupes","Vaupés"],["guainia","Guainía"],["valle del cauca","Valle del Cauca"],["valle","Valle del Cauca"],
  ].forEach(([a,c])=>add(a,c));
  for (let n=1;n<=34;n++){
    if (DEPT_BY_NUMBER[n]) {
      add(`departamento ${n}`, DEPT_BY_NUMBER[n]);
      add(`depto ${n}`,        DEPT_BY_NUMBER[n]);
      add(`dpto ${n}`,         DEPT_BY_NUMBER[n]);
      add(`${n}`,              DEPT_BY_NUMBER[n]);
    }
  }
  return m;
})();

// ===================== ESTADO =====================
const state = {
  items: [], svg: null, bg: null, score: 0, vb: null, world: null,
  listOrder: [], tileByTitle: new Map(),
  howtoShown: false,
  correctCount: 0,
  errorCount: 0,
  completedShown: false,
  sndGood: null,
  sndBad: null,
};

const $ = s => document.querySelector(s);

// ===================== HUD =====================
function totalPlayable(){ return state.items.length; }
function placedCount(){ return state.items.filter(it => it.placed).length; }

function updateTopHud(){
  const placed = placedCount();
  const total  = totalPlayable();
  const max    = total * GOOD;
  const hud = document.getElementById('hud');
  if (hud) hud.textContent = `Fichas: ${placed} / ${total} — Puntuación: ${state.score} / ${max}`;
}
const addScore = v => { state.score += v; updateTopHud(); };

function showResults(){
  const total = totalPlayable();
  const msg =
    `Resultados\n\n` +
    `Puntuación: ${state.score} / ${total * GOOD}\n` +
    `Aciertos: ${state.correctCount}\n` +
    `Errores: ${state.errorCount}`;
  showAlert(msg);
}

// ===================== HELPERS =====================
const prettifyName = raw => (raw||'').replace(/_/g,' ').replace(/\s+/g,' ')
  .trim().toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
const normalizeKey = s => (s||"").trim().toLowerCase()
  .normalize("NFD").replace(/\p{Diacritic}/gu,"");

function canonicalName(txt){
  const t = (txt||"").trim();
  const m = /^(?:(?:depto|dpto|departamento)\s*\.?\s*)?(\d{1,2})$/i.exec(t);
  if (m) {
    const n = Number(m[1]);
    if (DEPT_BY_NUMBER[n]) return DEPT_BY_NUMBER[n];
  }
  const k = normalizeKey(t);
  if (ALIAS_TO_CANON.has(k)) return ALIAS_TO_CANON.get(k);
  return prettifyName(t||"");
}

function safeGetBBox(el){ try{ return el.getBBox(); } catch(_){ return {x:0,y:0,width:0,height:0}; } }
function nameFrom(el){
  if(!el) return "";
  for (const k of ['title','data-name','name','aria-label','inkscape:label','id']){
    const v = el.getAttribute?.(k); if (v) return v;
  }
  return "";
}
function nearestNamedAncestor(path){
  let n = path;
  while(n && n.tagName && n.tagName.toLowerCase()!=='svg'){
    const nm = nameFrom(n);
    if (nm) return nm;
    n = n.parentElement;
  }
  return "";
}

function colorFromName(name){
  const palette=["#84cc16","#f59e0b","#60a5fa","#a78bfa","#f43f5e","#10b981","#f97316",
                 "#22d3ee","#f87171","#8b5cf6","#34d399","#fb7185","#a3e635","#93c5fd",
                 "#fbbf24","#86efac","#7dd3fc","#fca5a5","#c4b5fd","#99f6e4"];
  let h=0; for(let i=0;i<name.length;i++) h=(h*31+name.charCodeAt(i))|0;
  return palette[Math.abs(h)%palette.length];
}

function _pt(x,y){ const p=state.svg.createSVGPoint(); p.x=x; p.y=y; return p; }
function worldPointToScreen(x,y){ const m=state.world.getScreenCTM(); const s=_pt(x,y).matrixTransform(m); return {x:s.x,y:s.y}; }
function screenDeltaToWorldDelta(dx,dy){
  const inv=state.world.getScreenCTM().inverse();
  const p0=_pt(0,0).matrixTransform(inv), p1=_pt(dx,dy).matrixTransform(inv);
  return {dx:p1.x-p0.x, dy:p1.y-p0.y};
}
function getPieceCenterScreen(it){
  const rs=it.nodes.map(n=>n.getBoundingClientRect());
  const L=Math.min(...rs.map(r=>r.left)), T=Math.min(...rs.map(r=>r.top));
  const R=Math.max(...rs.map(r=>r.right)),B=Math.max(...rs.map(r=>r.bottom));
  return {x:(L+R)/2,y:(T+B)/2};
}
function getPieceScreenRect(it){
  const rs=it.nodes.map(n=>n.getBoundingClientRect());
  const L=Math.min(...rs.map(r=>r.left)), T=Math.min(...rs.map(r=>r.top));
  const R=Math.max(...rs.map(r=>r.right)),B=Math.max(...rs.map(r=>r.bottom));
  return {left:L, top:T, right:R, bottom:B, width:R-L, height:B-T};
}
function getTargetScreenRect(it){
  const b=it.targetBBox;
  const p1=worldPointToScreen(b.x,b.y);
  const p2=worldPointToScreen(b.x+b.width, b.y+b.height);
  const left=Math.min(p1.x,p2.x), right=Math.max(p1.x,p2.x);
  const top=Math.min(p1.y,p2.y), bottom=Math.max(p1.y,p2.y);
  return {left, top, right, bottom, width:right-left, height:bottom-top};
}
function rectsIntersectionArea(a,b){
  const L=Math.max(a.left,b.left);
  const R=Math.min(a.right,b.right);
  const T=Math.max(a.top,b.top);
  const B=Math.min(a.bottom,b.bottom);
  const w=Math.max(0, R-L);
  const h=Math.max(0, B-T);
  return w*h;
}

// ---------- Helpers para EJEMPLO ----------
function getExampleItem(){ return state.items.find(it=>it.title === EXAMPLE_TITLE); }
function isExamplePlaced(){ const ex=getExampleItem(); return ex ? !!ex.placed : true; }
/** Bloquea todo menos el Ejemplo si el Ejemplo no está aún colocado */
function blockIfExamplePending(candidateIt){
  if (candidateIt && candidateIt.title === EXAMPLE_TITLE) return false;
  if (isExamplePlaced()) return false;
  return true;
}

// ===================== ALERTAS =====================
function showAlert(message){
  setTimeout(()=>{ try{ window.alert(message); }catch(_){ console.log("[ALERT]", message); } }, 30);
}

// ===================== FIN DE JUEGO =====================
function maybeShowCompletion(){
  if (state.completedShown) return;
  const total = totalPlayable();
  if (placedCount() === total) {
    state.completedShown = true;
    const resultsBtn = document.querySelector('#resultsBtn');
    if (resultsBtn) resultsBtn.disabled = false;

    const msg =
      `Gracias por jugar Colombia Encaja.\n\n` +
      `Tu puntuación final es: ${state.score} / ${total * GOOD}\n` +
      `Aciertos: ${state.correctCount}\n` +
      `Errores: ${state.errorCount}`;
    showAlert(msg);
  }
}

// ===================== CARGA DEL SVG =====================
async function loadSVG(){
  try{
    const txt = await (await fetch(SVG_SOURCE, {cache:"no-store"})).text();
    const src = new DOMParser().parseFromString(txt,'image/svg+xml');
    src.querySelectorAll('text').forEach(t=>t.remove());

    const vbAttr=src.documentElement.getAttribute('viewBox');
    const vb = vbAttr ? vbAttr.split(/\s+/).map(Number) : [
      0,0,
      parseFloat(src.documentElement.getAttribute('width'))||800,
      parseFloat(src.documentElement.getAttribute('height'))||600
    ];
    state.vb = {x:vb[0],y:vb[1],w:vb[2],h:vb[3]};

    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox', vb.join(' '));
    state.svg=svg;

    const world=document.createElementNS('http://www.w3.org/2000/svg','g');
    world.setAttribute('transform',`translate(${vb[0]},${vb[1]}) scale(${SCALE}) translate(${-vb[0]},${-vb[1]})`);
    state.world=world;

    const bg=document.createElementNS('http://www.w3.org/2000/svg','g');
    bg.setAttribute('class','bg-outline'); state.bg=bg;

    const allPaths=[...src.querySelectorAll('path')];
    if(!allPaths.length) throw new Error("El SVG no contiene <path>.");

    const tmp=document.createElementNS('http://www.w3.org/2000/svg','svg');
    tmp.setAttribute('viewBox', vb.join(' ')); document.body.appendChild(tmp);

    const info = allPaths.map(p=>{
      const c=p.cloneNode(); tmp.appendChild(c); const b=safeGetBBox(c); tmp.removeChild(c);
      return { p, b, a:b.width*b.height };
    });

    const groups=new Map();
    info.filter(x=>x.a>1).forEach(rec=>{
      const raw=nearestNamedAncestor(rec.p)||nameFrom(rec.p)||`Departamento ${groups.size+1}`;
      const title=canonicalName(raw);
      if(!groups.has(title)) groups.set(title,{title,ds:[],color:null,srcPaths:[],area:0});
      const g=groups.get(title);
      g.ds.push(rec.p.getAttribute('d')); g.srcPaths.push(rec.p); g.area+=rec.a;
      const col=rec.p.getAttribute('fill')||rec.p.style?.fill; if(!g.color&&col&&col!=='none') g.color=col;
    });

    // Centro objetivo y bbox
    const tmp2=document.createElementNS('http://www.w3.org/2000/svg','svg');
    tmp2.setAttribute('viewBox', vb.join(' ')); document.body.appendChild(tmp2);
    let arr=[...groups.values()];
    arr.forEach(g=>{
      if(!g.color) g.color=colorFromName(g.title);
      const G=document.createElementNS('http://www.w3.org/2000/svg','g');
      g.srcPaths.forEach(sp=>G.appendChild(sp.cloneNode())); tmp2.appendChild(G);
      const b=safeGetBBox(G); tmp2.removeChild(G);
      g.targetCX=b.x+b.width/2; g.targetCY=b.y+b.height/2; g.targetBBox=b;
      g.nodes=[]; g.label=null; g.placed=false;
    });
    document.body.removeChild(tmp2); document.body.removeChild(tmp);

    // Inserta “Ejemplo.” si no existe (como pieza normal)
    if (!arr.some(x=>x.title===EXAMPLE_TITLE)) {
      arr.unshift({
        title: EXAMPLE_TITLE,
        ds: ["M10,10 h80 v60 h-80 z"],
        color: "#fca5a5",
        srcPaths: [],
        area: 1,
        targetCX: state.vb.x + state.vb.w*0.75,
        targetCY: state.vb.y + state.vb.h*0.5,
        targetBBox: {x:10,y:10,width:80,height:60},
        nodes: [], label: null, placed: false
      });
    }

    // Orden fijo
    const orderIdx = new Map(FIXED_ORDER.map((n,i)=>[n,i]));
    arr.sort((a,b)=>{
      const ia = orderIdx.has(a.title)?orderIdx.get(a.title):Infinity;
      const ib = orderIdx.has(b.title)?orderIdx.get(b.title):Infinity;
      if (ia!==ib) return ia-ib;
      return a.title.localeCompare(b.title,'es',{sensitivity:'base'});
    });
    state.items=arr;

    // Fondo (sólo contornos)
    state.items.forEach(g=>{
      g.srcPaths.forEach(p=>{ const c=p.cloneNode(); c.setAttribute('fill','none'); state.bg.appendChild(c); });
    });

    world.appendChild(bg); svg.appendChild(world);
    $('#board').innerHTML=''; $('#board').appendChild(svg);

    renderSidebar();
    enableDrag();
    updateTopHud();
  }catch(err){
    console.error(err);
    $('#board').innerHTML='<div class="error">No se pudo cargar el mapa.\n\n'+(err?.message||err)+'</div>';
  }
}

// ===== Mini preview =====
function renderMiniPreview(svgMini, it){
  const W=28,H=22,PAD=2;
  svgMini.setAttribute('viewBox',`0 0 ${W} ${H}`);
  svgMini.setAttribute('width',W);
  svgMini.setAttribute('height',H);
  if (!it.ds.length) return;
  const temp=document.createElementNS('http://www.w3.org/2000/svg','svg');
  temp.setAttribute('viewBox','0 0 100 100'); document.body.appendChild(temp);
  const G=document.createElementNS('http://www.w3.org/2000/svg','g');
  it.ds.forEach(d=>{ const p=document.createElementNS('http://www.w3.org/2000/svg','path'); p.setAttribute('d',d); G.appendChild(p); });
  temp.appendChild(G); const b=safeGetBBox(G); document.body.removeChild(temp);
  const sx=(W-PAD*2)/(b.width||1), sy=(H-PAD*2)/(b.height||1), s=Math.min(sx,sy);
  const tx=PAD-(b.x*s)+(W-PAD*2-b.width*s)/2, ty=PAD-(b.y*s)+(H-PAD*2-b.height*s)/2;
  const GT=document.createElementNS('http://www.w3.org/2000/svg','g');
  GT.setAttribute('transform',`matrix(${s} 0 0 ${s} ${tx} ${ty})`);
  it.ds.forEach(d=>{
    const p=document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d',d);
    p.setAttribute('fill',it.color);
    p.setAttribute('stroke','#000');
    p.setAttribute('stroke-width','0.7');
    p.setAttribute('vector-effect','non-scaling-stroke');
    GT.appendChild(p);
  });
  svgMini.innerHTML=''; svgMini.appendChild(GT);
}

// ===================== Wikimedia Commons (banderas remotas) =====================
function commons(filename){
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`;
}
function stripDiacritics(s){
  return (s||"").normalize("NFD").replace(/\p{Diacritic}/gu,"");
}
function titleVariations(title){
  const base = (title||"").replace(/,/g,"").trim();
  const noDia = stripDiacritics(base);
  const variants = new Set([base, noDia]);

  if (title === "Bogotá, D.C.") {
    ["Bogotá","Bogota","Bogotá DC","Bogota DC","Distrito Capital"].forEach(v=>variants.add(v));
  }
  if (title === "San Andrés, Providencia y Santa Catalina") {
    [
      "San Andrés y Providencia",
      "San Andres y Providencia",
      "San Andrés, Providencia y Santa Catalina",
      "San Andres, Providencia y Santa Catalina"
    ].forEach(v=>variants.add(v));
  }
  return [...variants];
}
function filenameCandidates(title){
  const vs = titleVariations(title);
  const cand = [];
  vs.forEach(v=>{
    cand.push(`Flag of ${v}.svg`);
    cand.push(`Flag of ${v} Department.svg`);
    cand.push(`Bandera de ${v}.svg`);
    cand.push(`${v} flag.svg`);
  });
  return [...new Set(cand)];
}
function applyFlagBackground(div, title){
  const override = FLAG_BY_TITLE[title];
  if (override){
    div.style.setProperty('--flag', `url("${override}")`);
    return;
  }
  const cands = filenameCandidates(title);
  let i = 0;
  const tryNext = ()=>{
    if (i >= cands.length) return;
    const fname = cands[i++];
    const url = commons(fname);
    const img = new Image();
    img.onload = ()=>{ div.style.setProperty('--flag', `url("${url}")`); };
    img.onerror = tryNext;
    img.src = url;
  };
  tryNext();
}

// ===================== SIDEBAR (lista) =====================
function renderSidebar(){
  const box=$('#tiles'); if (!box) return;
  box.innerHTML=''; state.tileByTitle.clear();

  const orderIdx = new Map(FIXED_ORDER.map((n,i)=>[n,i]));
  state.items.sort((a,b)=>{
    const ia = orderIdx.has(a.title)?orderIdx.get(a.title):Infinity;
    const ib = orderIdx.has(b.title)?orderIdx.get(b.title):Infinity;
    if (ia!==ib) return ia-ib;
    return a.title.localeCompare(b.title,'es',{sensitivity:'base'});
  });
  state.listOrder=state.items.map(i=>i.title);

  state.items.forEach((it, idx)=>{
    const div=document.createElement('div'); div.className='tile';
    const sw=document.createElement('div'); sw.className='swatch';
    const preview=document.createElementNS('http://www.w3.org/2000/svg','svg'); renderMiniPreview(preview,it); sw.appendChild(preview);
    const nm=document.createElement('div'); nm.className='name'; nm.textContent=it.title;

    const btn=document.createElement('button');
    btn.textContent=it.nodes.length?'Enfocar':'Colocar';
    btn.onclick=()=>{
      // Bloqueo si el ejemplo no está completo (salvo que sea el propio Ejemplo)
      if (blockIfExamplePending(it)) {
        showAlert("Primero completa el Ejemplo para poder continuar con los demás departamentos.");
        return;
      }
      if(!it.nodes.length){ spawnPiece(it, idx); btn.textContent='Enfocar'; }
      focusPiece(it);
    };

    const left=document.createElement('div'); left.style.display='flex'; left.style.alignItems='center'; left.style.gap='10px';
    left.appendChild(sw); left.appendChild(nm);
    div.appendChild(left); div.appendChild(btn); box.appendChild(div);
    state.tileByTitle.set(it.title, div);

    applyFlagBackground(div, it.title);
  });

  updateTopHud();
}

function focusPiece(it){
  it.nodes.forEach(n=>n.parentNode && n.parentNode.appendChild(n));
  if(it.label) it.label.parentNode && it.label.parentNode.appendChild(it.label);
}

// ===================== FICHAS =====================
function spawnPiece(it, listIndex){
  it.nodes = it.ds.map(d=>{
    const p=document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d', d);
    p.setAttribute('class','piece leaflet-interactive leaflet-path-draggable');
    p.setAttribute('stroke','black'); p.setAttribute('stroke-opacity','1');
    p.setAttribute('stroke-width','2'); p.setAttribute('stroke-linecap','round');
    p.setAttribute('stroke-linejoin','round'); p.setAttribute('stroke-dasharray','3');
    p.setAttribute('fill', it.color); p.setAttribute('fill-opacity','1'); p.setAttribute('fill-rule','evenodd');
    state.world.appendChild(p); return p;
  });
  if (SHOW_LABELS_ON_PIECES) {
    const label=document.createElementNS('http://www.w3.org/2000/svg','text');
    label.setAttribute('class','label'); label.textContent=it.title; label.setAttribute('pointer-events','none'); label.style.userSelect='none';
    state.world.appendChild(label); it.label=label;
  } else it.label=null;
  placeInSpawnColumn(it, listIndex); updateLabel(it);
}

function getPieceBBox(it){
  const bbs=it.nodes.map(n=>n.getBBox());
  const minX=Math.min(...bbs.map(b=>b.x)), minY=Math.min(...bbs.map(b=>b.y));
  const maxX=Math.max(...bbs.map(b=>b.x+b.width)), maxY=Math.max(...bbs.map(b=>b.y+b.height));
  return {x:minX,y:minY,width:maxX-minX,height:maxY-minY};
}
function setTransform(n,tx,ty){ n.setAttribute('transform',`matrix(1 0 0 1 ${tx} ${ty})`); }
function placeInSpawnColumn(it, listIndex){
  const vb=state.vb;
  const isNarrow = window.matchMedia("(max-width: 720px)").matches;
  // En móviles, spawnear a ~80% del ancho del mapa (no dependemos de sidebar)
  const panelX = isNarrow ? (vb.x + vb.w*0.80) : (vb.x+vb.w-PANEL_WORLD_W+SPAWN_COL_X_PAD);
  const anchorY=vb.y+vb.h*SPAWN_ANCHOR_Y_FRAC;
  const jitter=(typeof listIndex==='number'?listIndex:0)*SPAWN_JITTER_PX;
  const bb=getPieceBBox(it); const curCX=bb.x+bb.width/2, curCY=bb.y+bb.height/2;
  const tx=panelX-curCX, ty=(anchorY+jitter)-curCY; it.nodes.forEach(n=>setTransform(n,tx,ty));
}
function updateLabel(it){
  if(!it.label) return; const bb=getPieceBBox(it);
  it.label.setAttribute('x', bb.x+bb.width/2); it.label.setAttribute('y', bb.y+bb.height/2);
}

function deviceSnapBase(){
  const isNarrow = window.matchMedia("(max-width: 720px)").matches;
  return isNarrow ? SNAP_PX_BASE_MOBILE : SNAP_PX_BASE_DESKTOP;
}

// Tamaño objetivo (diagonal en px de pantalla) para calibrar tolerancias
function targetDiagScreen(it){
  const b=it.targetBBox, s1=worldPointToScreen(b.x,b.y), s2=worldPointToScreen(b.x+b.width,b.y+b.height);
  return Math.hypot(s2.x-s1.x, s2.y-s1.y);
}
// Radio de snap adaptativo por tamaño de pieza
function snapRadiusFor(it){
  const base = deviceSnapBase();
  const d = targetDiagScreen(it);
  let k;
  if(d<60) k = base + 40;
  else if(d<100) k = base + 28;
  else if(d<160) k = base + 18;
  else k = base + 12;
  // Ajuste por densidad de pixeles
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  return Math.round(k * Math.min(1.25, dpr));
}

/**
 * ¿Cubre el área objetivo?
 * - Rejilla de puntos en la caja objetivo (pantalla).
 * - Si algún punto cae dentro del relleno de la pieza → true.
 * - Fallback: intersección de rectángulos en pantalla > umbral.
 */
function coversTargetArea(current){
  const tgtRect = getTargetScreenRect(current);
  const pieceRect = getPieceScreenRect(current);

  // 1) Rejilla de muestreo
  const diag = Math.hypot(tgtRect.width, tgtRect.height);
  const step = Math.max(6, Math.min(20, Math.round(diag / 8)));
  const cols = Math.max(3, Math.min(8, Math.round(tgtRect.width / step)));
  const rows = Math.max(3, Math.min(8, Math.round(tgtRect.height / step)));
  const offX = tgtRect.width/(cols+1);
  const offY = tgtRect.height/(rows+1);

  for(let i=1;i<=cols;i++){
    for(let j=1;j<=rows;j++){
      const sx = tgtRect.left + i*offX;
      const sy = tgtRect.top  + j*offY;
      for(const n of current.nodes){
        if(!n.isPointInFill) continue;
        const inv=n.getScreenCTM().inverse();
        const p=_pt(sx,sy).matrixTransform(inv);
        if(n.isPointInFill(p)) { return true; }
      }
    }
  }

  // 2) Fallback: intersección de rectángulos en pantalla
  const inter = rectsIntersectionArea(tgtRect, pieceRect);
  const tgtArea = Math.max(1, tgtRect.width * tgtRect.height);
  const ratio = inter / tgtArea;
  if (ratio >= 0.12) return true;

  return false;
}

// ===================== DRAG =====================
function enableDrag(){
  let current=null, start=null, base=null;
  const toSVG=e=>_pt(e.clientX,e.clientY).matrixTransform(state.world.getScreenCTM().inverse());

  state.world.addEventListener('pointerdown', e=>{
    const path=e.target.closest('path.leaflet-path-draggable'); if(!path) return;

    // Evita scroll accidental en móviles al iniciar arrastre
    e.preventDefault();

    const rec=state.items.find(it=>it.nodes.includes(path)); if(!rec||rec.placed) return;

    // Bloqueo si el Ejemplo no está completo (salvo el propio Ejemplo)
    if (blockIfExamplePending(rec)) {
      showAlert("Primero completa el Ejemplo para poder continuar con los demás departamentos.");
      return;
    }

    current=rec; start=toSVG(e);
    base=rec.nodes.map(n=>{
      const m=n.transform.baseVal.consolidate();
      return m?m.matrix:state.world.createSVGMatrix();
    });

    try{ rec.nodes.forEach(n=>n.setPointerCapture?.(e.pointerId)); }catch(_){}
    focusPiece(rec);
  }, {passive:false});

  state.world.addEventListener('pointermove', e=>{
    if(!current) return;
    const p=toSVG(e), dx=p.x-start.x, dy=p.y-start.y;
    current.nodes.forEach((n,i)=>{
      const m=base[i];
      n.setAttribute('transform',`matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e+dx} ${m.f+dy})`);
    });
    updateLabel(current);
  }, {passive:true});

  state.world.addEventListener('pointerup', e=>{
    if(!current) return;
    try{ current.nodes.forEach(n=>n.releasePointerCapture?.(e.pointerId)); }catch(_){}

    const curS=getPieceCenterScreen(current);
    const tgtS=worldPointToScreen(current.targetCX,current.targetCY);

    const dxS=tgtS.x-curS.x, dyS=tgtS.y-curS.y;

    const tol = snapRadiusFor(current);
    const near = Math.hypot(dxS,dyS) < tol;

    // Comprobación robusta de cobertura
    const overlap = coversTargetArea(current);

    if(near && overlap){
      // Alinear con el centro objetivo (en espacio mundo)
      const {dx,dy}=screenDeltaToWorldDelta(dxS,dyS);
      current.nodes.forEach(n=>{
        const m=n.transform.baseVal.consolidate();
        const baseM=m?m.matrix:state.world.createSVGMatrix();
        n.setAttribute('transform',`matrix(${baseM.a} ${baseM.b} ${baseM.c} ${baseM.d} ${baseM.e+dx} ${baseM.f+dy})`);
        n.setAttribute('class','piece placed');
      });
      current.placed=true;
      state.correctCount += 1;
      addScore(GOOD);

      try{ state.sndGood && (state.sndGood.currentTime=0, state.sndGood.play()); }catch(_){}
       // >>> ALERTA ESPECIAL PARA Ejemplo. <<<
      if (current.title === "Ejemplo.") {
        showAlert("¡Completaste el ejemplo con éxito! Así deben quedar todas las fichas en el mapa. ¡Vamos, tú puedes completarlo con éxito!");
      }

      // >>> ALERTA ESPECIAL PARA BOGOTÁ <<<
      if (current.title === "Bogotá, D.C.") {
        showAlert("Bogotá, D.C. no es un departamento; es la capital de Colombia (Distrito Capital).");
      }

      const card = state.tileByTitle.get(current.title);
      if (card) card.classList.add('done');

      maybeShowCompletion();
      const resultsBtn = document.querySelector('#resultsBtn');
      if (resultsBtn && placedCount() === totalPlayable()) resultsBtn.disabled = false;

    }else{
      state.errorCount += 1;
      addScore(BAD);
      current.placed=false;
      current.nodes.forEach(n=>n.setAttribute('class','piece leaflet-interactive leaflet-path-draggable'));
      placeInSpawnColumn(current);
      try{ state.sndBad && (state.sndBad.currentTime=0, state.sndBad.play()); }catch(_){}
    }

    updateTopHud();
    updateLabel(current);
    current=null; start=null; base=null;
  }, {passive:true});
}
// ===================== FILTRO DE LISTA =====================
function onFilterChange(e){
  const q = normalizeKey(e.target.value || "");
  state.tileByTitle.forEach((div, title)=>{
    const visible = normalizeKey(title).includes(q);
    div.style.display = visible ? '' : 'none';
  });
}

// ===================== BOTONES / INICIO =====================
window.addEventListener('DOMContentLoaded', ()=>{
  const howBtn = $('#howBtn');
  if (howBtn) howBtn.onclick = ()=>{
    if (state.howtoShown) return;
    const msg =
      "¿Cómo funciona?\n\n" +
      "1) Pulsa 'Colocar' para crear una ficha por departamento.\n" +
      "2) Arrástrala sobre el mapa.\n" +
      "3) Suelta para validar el encaje.\n\n" +
      "✔ Correcto   →  +200 y se bloquea\n" +
      "✘ Incorrecto →  −100 y vuelve a su columna.\n\n" +
      "Nota: Debes completar primero 'Ejemplo.' para desbloquear los demás.";
    showAlert(msg);
    state.howtoShown = true;
  };

  const listWrap = document.querySelector('.list');
  if (listWrap) { [...listWrap.querySelectorAll('.hint')].forEach(n => n.remove()); }

  const resetBtn = $('#resetBtn');
  if (resetBtn) resetBtn.onclick = ()=>location.reload();

  const resultsBtn = $('#resultsBtn');
  if (resultsBtn) resultsBtn.onclick = showResults;

  const filterInput = $('#filterInput');
  if (filterInput) filterInput.addEventListener('input', onFilterChange, {passive:true});

  state.sndGood = document.getElementById('soundGood');
  state.sndBad  = document.getElementById('soundBad');

  loadSVG();
});


