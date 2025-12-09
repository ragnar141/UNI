import { useEffect, useMemo, useRef, useState, useId } from "react";
import * as d3 from "d3";
import durations from "../data/durations.json";
import "../styles/timeline.css";
import TextCard from "./textCard";
import FatherCard from "./fatherCard";
import SearchBar from "./searchBar";
import TagPanel from "./tagPanel";




/* ===== BCE/CE helpers (no year 0) ===== */
const toAstronomical = (y) => (y <= 0 ? y + 1 : y);
const fromAstronomical = (a) => (a <= 0 ? a - 1 : a);
const formatYear = (y) => (y < 0 ? `${Math.abs(y)} BCE` : y > 0 ? `${y} CE` : "—");

/* ===== Colors for Symbolic Systems ===== */
const SymbolicSystemColorPairs = {
  Persian: "#00BFA6",       /* base */
  "Indo-Iranian": "#2CCB7C",  /* greener jade */
  Zoroastrian: "#FFA319",   /* saffron/fire */
  Elamite: "#2AA6A1",       /* verdigris */
  Achaemenid: "#008E9B",    /* deep royal turquoise */
  Sumerian:  "#000000ff",
  Babylonian:"#1A49D6",
  Assyrian:  "#C1121F",
  Canaanite: "#6F2DBD",
  Akkadian:  "#10B981",
  Aramaic:   "#9E6CFF",
  Yahwistic: "#1E88E5",
  Egyptian: "#E53935",
  Phrygian: "#D22F27",   // Cap Red — Phrygian cap/dyed wool, bold martial/ritual red
  Luwian:   "#D99C4A",   // Limestone Ochre — rock-cut reliefs & hieroglyphs on pale stone
  Hittite:  "#B14D1E",   // Burnt Sienna / Iron Oxide — Hattusa palettes, iron/ochre tones  
  Hurrian:  "#1F9EDC",   // Mitanni Azure — horse/chariot prestige; Indo-Aryan theonyms → cool azure
  Lydian:   "#D4AF37",   // Electrum Gold — famed early coinage (electrum), royal metals
  Mycenaean: "#B36A1B",
  Hellenic:  "#0057D9",
  Hellenistic:"#1BB5AC",
  Orphic:    "#CDA434",
  Hermetic:  "#8EA1B2",
  Gnostic:   "#6E3AA6",
  Berber:     "#0066CC",
  Phoenician: "#9A1B6A",
  Etruscan:    "#C4742C",
  "Oscan-Italic":"#6B8E23",
  Umbrian:     "#1E7A3F",
  Christian:   "#5E2D91",
  Roman: "#C4002F",
  Islamic: "#006A52",
  Iranian: "#1C39BB"
};


/* ===== Label sizing vs zoom ===== */

// Label sizing vs band height (works for hRel or absolute heights)
// Label size as a fraction of the rendered band height (post-zoom)
const LABEL_TO_BAND = 0.7;     // 0.30–0.45 works well
const LABEL_FONT_MIN = 8;       // px clamp (tiny bands)
const LABEL_FONT_MAX_ABS = 160; // px safety cap for extreme zoom
const LABEL_FONT_MAX_REL = 0.9; // never exceed 90% of band height


/* ===== Render + hover constants ===== */
const BASE_OPACITY = 1;
const TEXT_BASE_R = 0.4;       // at k=1
const HOVER_SCALE_DOT = 1.6;   // how much bigger a dot gets on hover
const HOVER_SCALE_FATHER = 1.6; 
const ZOOM_THRESHOLD = 4.0;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// New: boundary between “outest” (duration-only) and “middle” (segment) zoom
const ZOOM_SEGMENT_THRESHOLD = 2.0;

/* --- Opacity/width levels for duration label + border --- */
const DUR_LABEL_OPACITY = { base: 0.5, hover: 0.7, active: 0.7 };
const DUR_STROKE = {
  baseOpacity: 0.08, hoverOpacity: 0.45, activeOpacity: 0.9,
  baseWidth: 1.5,    hoverWidth: 2.0,    activeWidth: 2.5,
};

/* ===== Label visibility policy ===== */
const LABEL_ALLOWLIST = new Set([
  "egyptian-composite", "mesopotamian-composite", "anatolian-composite", "levantine-composite", "persian-composite", 
  "greek-composite", "carthaginian-composite", "customgroup-hellenistic"
]);

const LABEL_BLOCKLIST = new Set([
  
]);

// Which member inside each custom group should provide the label text
// and the vertical anchor for placing that label.
const CUSTOM_GROUP_LABEL_MEMBER = {
  // groupKey : memberDurationId
  hellenistic: "custom-hellenistic-greek-composite",
  // add more like:
  // foogroup: "custom-foogroup-bar-composite",
};

// Which member a custom group's *duration box* should anchor to,
// and (optionally) a max width for that box (px).
const CUSTOM_GROUP_TIP_POLICY = {
  hellenistic: {
    
  }

  // add more groups here:
  // mygroup: { anchorMemberId: "custom-mygroup-some-member-composite", maxWidth: 480 },
};

const MIN_BAND_HEIGHT_FOR_LABEL = 14;  // px
const MIN_BAND_WIDTH_FOR_LABEL  = 48;  // px
const ZOOM_TO_FORCE_LABEL       = 3.0; // non-allowlisted labels show only past this zoom
const FORBIDDEN_TICKS_ASTRO = new Set([toAstronomical(-5500), toAstronomical(2500)]);



/* ===== Tooltip helpers ===== */
const fmtRange = (s, e) => `${formatYear(s)} – ${formatYear(e)}`;
// Now supports an optional third line for "note"
const tipHTML = (title, subtitle, note) => `
  <div class="tl-tip-title">${title ?? ""}</div>
  ${subtitle ? `<div class="tl-tip-sub">${subtitle}</div>` : ""}
  ${note ? `<div class="tl-tip-note">${note}</div>` : ""}
`;

/* ===== Small utils ===== */
const hashString = (str) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < (str || "").length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 2 ** 32;
};
function getTextDate(row) {
  const v = Number(row?.["Dataviz date"]);
  return Number.isFinite(v) ? v : NaN;
}
// put this near getTextDate()
function getDatavizNumber(row) {
  for (const k of ["Dataviz", "Dataviz column", "Dataviz date"]) {
    const v = Number(row?.[k]);
    if (Number.isFinite(v)) return v;
  }
  return NaN;
}


// Stable micro-jitter so fathers don't sit on exactly the same Y
const FATHER_JITTER_PX = 7; // tweak to taste (in band-units = px at k=1)
function fatherJitterU(id, bandId) {
  // stable in-session & across toggles; different per id
  const h = hashString(`${bandId}::${id}`);
  return (h - 0.5) * 2 * FATHER_JITTER_PX; // [-J, +J]
}

// Returns { y, locked } where locked=true means "use this y over author lanes/jitter"
function computeYFromYPos(raw, bandY, bandH, fallbackY) {
  const s = String(raw ?? "").trim();
  if (s === "" || s === "-") return { y: fallbackY, locked: false };

  const v = Number(s);
  if (!Number.isFinite(v)) return { y: fallbackY, locked: false };

  // interpret as percentage of half-height from center (−100..100)
  const vNorm = Math.max(-100, Math.min(100, v)) / 100; // −1..1

  // keep same padding policy you already use
  const pad = Math.min(6, Math.max(2, bandH * 0.15));
  const usable = Math.max(1, bandH - 2 * pad);

  const center = bandY + bandH / 2;
  // positive v → above center; negative v → below center
  const yTarget = center - vNorm * (usable / 2);

  return { y: yTarget, locked: true };
}



function layoutMarksByPixels({ marks, outlines, authorLaneMap, x, y0, innerHeight }) {
  // per-band structures
  const bandById = new Map(outlines.map(o => [o.id, o]));

  // Usable vertical bounds inside each band (in band-units)
  const yBoundsU = new Map(outlines.map(o => {
    const topU = y0(o.y);
    const botU = y0(o.y + o.h);
    const padU = Math.max(1, (botU - topU) * 0.08);
    return [o.id, { yMin: topU + padU, yMax: botU - padU }];
  }));

  // Build a per-band map of items with their screen x-span and band-unit radii
  const perBand = new Map();

  for (const m of marks) {
    if (!bandById.has(m.bandId)) continue;

    // screen x position at k=1 (px)
    const cx = x(toAstronomical(m.when));

   // use base (k=1) draw sizes for spacing; no zoom here
   const rPx = m.kind === "text"
     ? TEXT_BASE_R                     // your base dot radius in px at k=1
     : getFatherBaseR({ foundingFigure: m.foundingFigure }) * 2.2; // match your draw base
   const rRU = rPx; // 1 band-unit == 1px at k=1

    // choose a bin width that scales with the item’s footprint
    const BIN_PAD_PX = 6;
    const binW = Math.max(24, 2 * rPx + BIN_PAD_PX); // diameter + pad

    // put the item into every bin that its diameter touches (edge-safe)
    const b0 = Math.floor((cx - rPx) / binW);
    const b1 = Math.floor((cx + rPx) / binW);

    // stash enriched item
    const enriched = { ...m, _cx: cx, _rPx: rPx, _rRU: rRU, _binW: binW };

    const bandBins = perBand.get(m.bandId) || new Map();
    for (let b = b0; b <= b1; b++) {
      const arr = bandBins.get(b) || [];
      arr.push(enriched);
      bandBins.set(b, arr);
    }
    perBand.set(m.bandId, bandBins);
  }

  // outputs
  const textYMap  = new Map(); // bandId -> Map(textId   -> yU)
  const fatherYMap = new Map(); // bandId -> Map(fatherId -> yU)

  // collision check: two items collide if their vertical distance is too small
  // *and* their horizontal spans overlap on screen.
  function overlapsInX(a, b) {
    return Math.abs(a._cx - b._cx) <= (a._rPx + b._rPx);
  }
  function minSepRU(a, b) {
    const BASE_SEP_RU = 2;            // small constant buffer
    return BASE_SEP_RU + a._rRU + b._rRU;
  }

  // placement
  for (const [bandId, buckets] of perBand.entries()) {
    const bounds = yBoundsU.get(bandId);
    if (!bounds) continue;

    // track already placed marks across all bins (global for the band)
    const placed = []; // [{yU, item}]
    const setY = (m, yU) => {
      if (m.kind === "text") {
        const inner = textYMap.get(bandId) || new Map();
        inner.set(m.id, yU); textYMap.set(bandId, inner);
      } else {
        const inner = fatherYMap.get(bandId) || new Map();
        inner.set(m.id, yU); fatherYMap.set(bandId, inner);
      }
      placed.push({ yU, item: m });
    };

    // deterministic bin order (left → right)
    const binKeys = Array.from(buckets.keys()).sort((a,b)=>a-b);

    for (const key of binKeys) {
      const items = buckets.get(key);

      // split by locked-lane only for texts (authors)
      const locked = [];
      const free   = [];
      for (const m of items) {
        let yLock = null;
        // 1) texts with real authors → lock to their author lane
       if (m.kind === "text" && m.authorKey) {
          const lane = authorLaneMap.get(m.bandId)?.get(m.authorKey);
          if (Number.isFinite(lane)) yLock = lane;
        }
        // 2) otherwise, if baseYU is provided (texts w/o author OR fathers), lock to it
        if (!Number.isFinite(yLock) && Number.isFinite(m.baseYU)) {
          yLock = m.baseYU;
        }
        if (Number.isFinite(yLock)) locked.push({ m, yLock });
        else free.push(m);
      }

      // place locked first — clamp to bounds
      for (const { m, yLock } of locked) {
        const yU = Math.max(bounds.yMin, Math.min(bounds.yMax, yLock));
        setY(m, yU);
      }

      // sort free: priority desc, size desc, kind stable, time then id
      free.sort((a, b) => {
        const pr = (b.priority ?? 0) - (a.priority ?? 0);
        if (pr) return pr;
        if (a._rRU !== b._rRU) return b._rRU - a._rRU;
        if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
        if (a.when !== b.when) return a.when - b.when;
        return String(a.id).localeCompare(String(b.id));
      });

      // anchor: avg of locked lanes if any; else band center
      const anchorU = locked.length
        ? locked.reduce((s, { yLock }) => s + yLock, 0) / locked.length
        : (bounds.yMin + bounds.yMax) / 2;

      // try placing each free mark, nudging until it doesn't collide
      for (let i = 0; i < free.length; i++) {
        const m = free[i];

        // start near anchor; alternate above/below
        const centeredIndex = (j) => (j===0?0:(j%2 ? (j+1)/2 : -j/2));
        let yU = anchorU + centeredIndex(i) * (m._rRU + 6);

        // clamp and then resolve collisions w.r.t. already placed items whose x overlaps
        yU = Math.max(bounds.yMin, Math.min(bounds.yMax, yU));

        let tries = 0;
        const MAX_TRIES = 24;
        while (tries < MAX_TRIES) {
          const badNeighbor = placed.find(p =>
            overlapsInX(m, p.item) && Math.abs(p.yU - yU) < minSepRU(m, p.item)
          );
          if (!badNeighbor) break;

          // nudge up/down in growing steps
          const step = (m._rRU + 6) * (1 + tries * 0.12);
          yU += (tries % 2 ? -1 : 1) * step;
          yU = Math.max(bounds.yMin, Math.min(bounds.yMax, yU));
          tries++;
        }

        setY(m, yU);
      }
    }
  }

  return { textYMap, fatherYMap };
}

  
// Visual “radius” in band-units for spacing (k=1)
function textBaseRU(){ return 8; } // dots are tiny; tweak to taste

// --- Father mark sizing (band-units @ k=1) ---
const FATHER_R_FOUNDING = 0.5;   // or your preferred RU
const FATHER_R_NONFOUND = 0.25;  // keep a single source of truth


function isYesish(v) {
  const s = String(v || "").trim().toLowerCase();
  // be generous about truthy "yes"
  return s === "yes" || s === "y" || s === "true" || s === "1";
}

function hasHistoricTag(tags) {
  return String(tags || "")
    .toLowerCase()
    .split(",")
    .map(s => s.trim())
    .includes("historic");
}



function getFatherBaseR(fatherRow) {
  return isYesish(fatherRow?.foundingFigure) ? FATHER_R_FOUNDING : FATHER_R_NONFOUND;
}


// For father triangles (reduced so it doesn't look so thick)
function fatherBorderStrokeWidth(r) {
  return Math.max(1, r * 0.08); // THINNER, tweak multiplier as needed
}

function computePinHeadGeometry(cx, cy, rHead) {
  const MIN_R = 10;
  const MAX_R = 22;

  const scaled = (rHead || MIN_R) * 3;
  const R = Math.max(MIN_R, Math.min(MAX_R, scaled));

  const OFFSET_Y = R * 1.8;

  // ✅ CONSTANT PIXEL NUDGE: tweak this value
  const OFFSET_X = 0; // negative = left, positive = right

  const cxHead = cx + OFFSET_X;
  const cyHead = cy - OFFSET_Y;

  return { cxHead, cyHead, R };
}




function pinPathD(cx, cy, rHead) {
  const { cxHead, cyHead, R } = computePinHeadGeometry(cx, cy, rHead);

  const topY   = cyHead - R;        // top of head
  const tipY   = cyHead + R * 1.8;  // bottom tip of the drop
  const leftX  = cxHead - R * 0.9;
  const rightX = cxHead + R * 0.9;

  // Simple teardrop-ish shape; the circle/triangle sits in the "head"
  return [
    "M", cxHead, topY,
    "C", rightX, topY, rightX, cyHead, cxHead, tipY,
    "C", leftX,  cyHead, leftX,  topY, cxHead, topY,
    "Z"
  ].join(" ");
}


function buildOverlaySegments(cx, cy, r, colors, showMid) {
  const segs = [];
  const { LT, LB, RM } = triPoints(cx, cy, r);
  const n = colors.length;

  // Internal split lines (between color slices)
  if (n > 1) {
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const P = lerpPt(LT, LB, t);
      segs.push({ type: "split", x1: P.x, y1: P.y, x2: RM.x, y2: RM.y });
    }
  }

  // Vertical midline (historic badge)
  if (showMid) {
    const cap = r * 0.5;
    segs.push({ type: "mid", x1: cx, y1: cy - cap, x2: cx, y2: cy + cap });
  }

  return segs;
}

const __tagColorCache = new Map();
function pickSystemColorsCached(tagsStr) {
  const key = String(tagsStr || "");
  if (__tagColorCache.has(key)) return __tagColorCache.get(key);
  const out = pickSystemColors(key);
  __tagColorCache.set(key, out);
  return out;
}

// Normalize keys once (case-insensitive, spaces/dashes unified, accents stripped)
const _norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")                    // split accents
    .replace(/\p{Diacritic}/gu, "")       // drop accents
    .replace(/[\s_–—-]+/g, "-");          // unify dash/space/underscore

// Build a fast lookup map: normalized key -> color
const SYMBOLIC_COLOR_LOOKUP = (() => {
  const m = new Map();
  for (const [k, v] of Object.entries(SymbolicSystemColorPairs)) {
    m.set(_norm(k), v);
  }
  // Optional: hard aliases if you know them
  if (SymbolicSystemColorPairs["Indo-iranian"]) {
    m.set(_norm("Indo-Iranian"), SymbolicSystemColorPairs["Indo-iranian"]);
    m.set(_norm("Indo Iranian"), SymbolicSystemColorPairs["Indo-iranian"]);
  }
  return m;
})();

function pickSystemColors(tagsStr) {
  const seen = new Set();
  const out = [];
  String(tagsStr)
    .split(/[;,|]/)                 // accept comma/semicolon/pipe
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((tag) => {
      const c = SYMBOLIC_COLOR_LOOKUP.get(_norm(tag));
      if (c && !seen.has(c)) {      // dedupe by color
        seen.add(c);
        out.push(c);
      }
    });
  return out;
}

// keep this helper consistent
function pickSystemColor(tagsStr) {
  const arr = pickSystemColors(tagsStr);
  return arr[0] || "#444";
}



function getLooseField(obj, targetKey) {
  const want = String(targetKey).trim().toLowerCase();
  for (const k of Object.keys(obj || {})) {
    if (k && k.trim().toLowerCase() === want) return obj[k];
  }
  return undefined;
}


// ---- Connection line colors: mix all symbolic-system colors of both ends ----

// Average an array of hex colors like "#RRGGBB"
function averageHexColors(hexes) {
  const arr = (hexes || []).filter(Boolean);
  if (arr.length === 0) return "#888888";
  if (arr.length === 1) return arr[0];

  let r = 0, g = 0, b = 0, n = 0;
  for (const h of arr) {
    const s = String(h || "").trim();
    if (!/^#?[0-9a-fA-F]{6}$/.test(s)) continue;
    const base = s.startsWith("#") ? s.slice(1) : s;

    const rv = parseInt(base.slice(0, 2), 16);
    const gv = parseInt(base.slice(2, 4), 16);
    const bv = parseInt(base.slice(4, 6), 16);

    if (Number.isFinite(rv) && Number.isFinite(gv) && Number.isFinite(bv)) {
      r += rv; g += gv; b += bv; n++;
    }
  }
  if (n === 0) return "#888888";

  const toHex = (v) => v.toString(16).padStart(2, "0");
  return "#" + toHex(Math.round(r / n)) +
               toHex(Math.round(g / n)) +
               toHex(Math.round(b / n));
}

// fields that might contain symbolic-system tags
const CONNECTION_TAG_FIELDS = [
  "Symbolic System Tags",
  "Symbolic Systems Tags",
  "Symbolic System tags",
  "Symbolic Systems tags",
  "symbolicSystems",
];





function connectionColorFromRows(rowA, rowB) {
  // We already computed colors for fathers/texts when building rowsF/rowsT
  const colorsA = Array.isArray(rowA?.colors) ? rowA.colors : [];
  const colorsB = Array.isArray(rowB?.colors) ? rowB.colors : [];

  const all = [...colorsA, ...colorsB].filter(Boolean);
  if (!all.length) return "#999999";

  const uniq = [...new Set(all)];
  return averageHexColors(uniq);
}


const normalizeAuthor = (name) =>
  String(name || "anon").trim().toLowerCase();

/* === NEW: detect placeholder/unknown authors === */
const isPlaceholderAuthor = (name) => {
  const raw = String(name || "").trim();
  if (!raw) return true;
  const lower = raw.toLowerCase();
  return (
    raw === "-" ||
    raw === "—" 
  );
};

/* ===== Custom-group helpers ===== */
// custom ids look like: custom-<groupKey>-<anything>-composite
function parseCustomId(id = "") {
  if (!id.startsWith("custom-")) return null;
  const parts = id.split("-");
  if (parts.length < 3) return null;
  return { groupKey: parts[1] };
}

// Big triangle points (right-pointing)
function triPoints(cx, cy, r) {
  return {
    LT: { x: cx - r, y: cy - r },  // left-top
    LB: { x: cx - r, y: cy + r },  // left-bottom
    RM: { x: cx + r, y: cy },      // right-mid
  };
}
function lerpPt(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Split the *left* edge (LT→LB) into n segments and form n skinny sub-triangles
 * with the right-mid point. Returns an array of { d, fill } for path drawing.
 */
function leftSplitTriangleSlices(cx, cy, r, colors) {
  const n = Math.max(1, (colors || []).length);
  const { LT, LB, RM } = triPoints(cx, cy, r);

  // Single color → single full triangle
  if (n === 1) {
    return [{ d: `M ${LT.x} ${LT.y} L ${LB.x} ${LB.y} L ${RM.x} ${RM.y} Z`, fill: colors?.[0] || "#666" }];
  }

  const slices = [];
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const A = lerpPt(LT, LB, t0); // upper point on left edge
    const B = lerpPt(LT, LB, t1); // lower point on left edge
    slices.push({
      d: `M ${A.x} ${A.y} L ${B.x} ${B.y} L ${RM.x} ${RM.y} Z`,
      fill: colors[i],
    });
  }
  return slices;
}


// Build a vertical envelope along time using all member bars/segments
function buildGroupIntervals(members) {
  // 1) segment-aware time boundaries
  const stops = new Set();
  for (const m of members) {
    if (Array.isArray(m.segments) && m.segments.length) {
      for (const s of m.segments) { stops.add(s.start); stops.add(s.end); }
    } else { stops.add(m.start); stops.add(m.end); }
  }
  const xs = Array.from(stops).sort((a,b)=>a-b);
  if (xs.length < 2) return [];

  const intervals = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i], b = xs[i+1];
    const mid = (a + b) / 2;

    // active-at-mid membership (stable slice body)
    const active = members.filter(m => {
      const m0 = Math.min(m.start, m.end), m1 = Math.max(m.start, m.end);
      return mid >= m0 && mid <= m1;
    });
    if (!active.length) continue;

    // LEFT LADDER: add starters at 'a' in TOP→BOTTOM order
    const startingNow = active.filter(m => Math.min(m.start, m.end) === a);
    if (startingNow.length) {
      let pool = active.filter(m => Math.min(m.start, m.end) !== a);
      const sortedStarting = startingNow.slice().sort((m1, m2) => m1.y - m2.y); // top→bottom
      for (const starter of sortedStarting) {
        pool.push(starter);
        const t = Math.min(...pool.map(m => m.y));
        const btm = Math.max(...pool.map(m => m.y + m.h));
        intervals.push({ start: a, end: a, top: t, bottom: btm }); // vertical rung
      }
    }

    // main slice
    intervals.push({
      start: a, end: b,
      top: Math.min(...active.map(m => m.y)),
      bottom: Math.max(...active.map(m => m.y + m.h)),
    });

    // RIGHT LADDER: remove enders at 'b' in TOP→BOTTOM order
    const endingNow = active.filter(m => Math.max(m.start, m.end) === b);
    if (endingNow.length) {
      const sortedEnding = endingNow.slice().sort((m1, m2) => m1.y - m2.y); // top→bottom
      let pool = active.slice();
      for (const ender of sortedEnding) {
        pool = pool.filter(m => m !== ender);
        if (!pool.length) break;
        intervals.push({
          start: b, end: b,
          top: Math.min(...pool.map(m => m.y)),
          bottom: Math.max(...pool.map(m => m.y + m.h)),
        });
      }
    }
  }
  return intervals;
}



/* ===== Adaptive tick helpers ===== */
const formatTick = (a) => (Math.abs(a - 0.5) < 1e-6 ? "0" : formatYear(fromAstronomical(a)));

function chooseYearStep(visibleSpanYears) {
  if (visibleSpanYears > 8000) return 1000;
  if (visibleSpanYears > 3000) return 500;
  if (visibleSpanYears > 1200) return 250;
  if (visibleSpanYears > 600)  return 100;
  if (visibleSpanYears > 240)  return 50;
  if (visibleSpanYears > 120)  return 20;
  if (visibleSpanYears > 60)   return 10;
  if (visibleSpanYears > 24)   return 5;
  return 2;
}

function makeAdaptiveTicks(zx) {
  const [aMin0, aMax0] = zx.domain();
  let hMin = fromAstronomical(aMin0);
  let hMax = fromAstronomical(aMax0);
  if (hMin > hMax) [hMin, hMax] = [hMax, hMin];

  const span = Math.max(1, Math.abs(hMax - hMin));
  const step = chooseYearStep(span);

  const start = Math.ceil(hMin / step) * step;
  const ticksHuman = [];
  for (let y = start; y <= hMax; y += step) {
    if (y !== 0) ticksHuman.push(y); // skip 0 (no year zero)
  }

  if (hMin < 0 && hMax > 0) ticksHuman.push(0.5); // BCE/CE marker

  const ticksAstro = ticksHuman.map((y) => (y === 0.5 ? 0.5 : toAstronomical(y)));
  ticksAstro.sort((a, b) => a - b);
  // Drop 5500 BCE and 2500 CE ticks (=-5499 and =2500 in astronomical years)
  return ticksAstro.filter(t => !FORBIDDEN_TICKS_ASTRO.has(t));
}

  

// Convert group intervals to a rectilinear (H/V only) envelope path in screen space.
function groupIntervalsToPath(intervals, zx, zy) {
  if (!intervals || intervals.length === 0) return "";




  // Map to screen coords; ensure left<=right; keep chronological order
  const iv = intervals.map((iv) => {
    const xA = zx(toAstronomical(iv.start));
    const xB = zx(toAstronomical(iv.end));
    return {
      xL: Math.min(xA, xB),
      xR: Math.max(xA, xB),
      yT: zy(iv.top),
      yB: zy(iv.bottom),
    };
  });

  

  // Top chain: left -> right with vertical steps at boundaries
  let d = `M ${iv[0].xL} ${iv[0].yT} H ${iv[0].xR}`;
  for (let i = 1; i < iv.length; i++) {
    if (iv[i - 1].yT !== iv[i].yT) d += ` V ${iv[i].yT}`;  // vertical step at shared x
    d += ` H ${iv[i].xR}`;
  }

  // Right edge down to bottom of last interval
  d += ` V ${iv[iv.length - 1].yB}`;

  // Bottom chain: right -> left with vertical steps at boundaries
  for (let i = iv.length - 1; i >= 0; i--) {
    d += ` H ${iv[i].xL}`;
    if (i > 0 && iv[i - 1].yB !== iv[i].yB) d += ` V ${iv[i - 1].yB}`;
  }

  // Close (back to top-left of first interval)
  d += " Z";

 

  return d;
}

// === Geometry helpers (screen-space rectangles & anchors)
function bandRectPx({ start, end, y, h }, zx, zy) {
  const x0 = zx(toAstronomical(start));
  const x1 = zx(toAstronomical(end));

  const y0 = zy(y);
  const y1 = zy(y + h);

  const xPix = Math.min(x0, x1);
  const wPix = Math.max(0, Math.abs(x1 - x0));

  const yPix = Math.min(y0, y1);
  const hPix = Math.max(0, Math.abs(y1 - y0)); // <<< never negative

  return {
    x: xPix,
    y: yPix,
    w: wPix,
    h: hPix,
  };
}






function drawTextDot(circleSel, pieSel, k){
  const r = TEXT_BASE_R * k;
  circleSel.attr("r", r).attr("opacity", BASE_OPACITY);
  if (!pieSel.empty()) drawSlicesAtRadius(pieSel, r);
}

// module-scope (above useEffect)
function drawSlicesAtRadius(selection, r) {
  const ANGLE_OFFSET = -Math.PI / 2;     // 12 o'clock
  const arcGen = d3.arc().innerRadius(0).outerRadius(r);

  selection.each(function (d) {
    const g = d3.select(this);
    const n = Math.max(1, (d.colors || []).length);

    // 1) Color wedges
    g.selectAll("path.slice")
      .attr("d", (_s, i) => {
        const a0 = ANGLE_OFFSET + (i / n) * 2 * Math.PI;
        const a1 = ANGLE_OFFSET + ((i + 1) / n) * 2 * Math.PI;
        return arcGen({ startAngle: a0, endAngle: a1 });
      });

    // 2) White separators (center → rim)
    const boundaryAngles = n > 1
      ? d3.range(n).map(i => ANGLE_OFFSET + (i / n) * 2 * Math.PI)
      : [];

    const sepG = g.selectAll("g.separators")
      .data([0])
      .join("g")
      .attr("class", "separators")
      .raise();

    const show = n > 1;
    const w = Math.max(0.35, Math.min(r * 0.18, 1.5));

    sepG.selectAll("line.sep")
      .data(boundaryAngles, a => a)
      .join(
        e => e.append("line")
              .attr("class", "sep")
              .attr("stroke", "#fff")
              .attr("stroke-linecap", "round")
              .attr("vector-effect", "non-scaling-stroke")
              .attr("shape-rendering", "geometricPrecision")
              .style("pointer-events", "none"),
        u => u,
        x => x.remove()
      )
      .attr("x1", 0).attr("y1", 0)
      .attr("x2", a => d3.pointRadial(a, r)[0])
      .attr("y2", a => d3.pointRadial(a, r)[1])
      .attr("stroke-width", show ? w : 0)
      .attr("opacity", show ? 0.9 : 0);
  });
}


function shouldShowDurationLabel({ d, k, bandW, bandH, labelSel }) {
  // Always show custom group labels unless explicitly blocked
  if (d._hiddenCustom) return false;
  if (d._isCustomGroup && !LABEL_BLOCKLIST.has(d.id)) return true;

  if (LABEL_BLOCKLIST.has(d.id)) return false;
  if (LABEL_ALLOWLIST.has(d.id)) return true;

  // Default: hide unless zoomed in enough and there's space
  if (k < ZOOM_TO_FORCE_LABEL) return false;
  if (bandH < MIN_BAND_HEIGHT_FOR_LABEL || bandW < MIN_BAND_WIDTH_FOR_LABEL) return false;

  // Only show if the rendered text actually fits in the band width
  const node = labelSel.node();
  if (node && node.getComputedTextLength) {
    const tw = node.getComputedTextLength();
    return tw + 8 <= bandW; // ~4px padding on each side
  }
  return true; // fallback if measurement not available
}

function deriveGroupTitles(groupKey, members) {
  const first = members[0] || {};
  const anchorId = CUSTOM_GROUP_LABEL_MEMBER[groupKey];
  const anchor   = members.find(m => m.id === anchorId) || first;

  const shortLabel =
    (anchor.name && anchor.name.trim()) ||
    (first.name && first.name.trim()) ||
    `Custom ${groupKey}`;

  const longTitle =
    (anchor["expanded name"] && anchor["expanded name"].trim()) ||
    (anchor.expandedName && anchor.expandedName.trim()) ||
    shortLabel;

  return { shortLabel, longTitle, anchor };
}

/* ===== Dynamic dataset discovery (TEXTS ONLY) ===== */
function useDiscoveredDatasets() {
  const textModules =
    import.meta.glob("../data/**/*_texts.json", { eager: true, import: "default" }) || {};
  const folderOf = (p) => {
    const m = p.match(/\/data\/([^/]+)\//);
    return m ? m[1] : null;
  };
  const folders = new Set(Object.keys(textModules).map(folderOf));

  const registry = [];
  folders.forEach((folder) => {
    if (!folder) return;
    const durationId = `${folder}-composite`;
    const texts = Object.entries(textModules)
      .filter(([p]) => folderOf(p) === folder)
      .flatMap(([, data]) => (Array.isArray(data) ? data : []));
    registry.push({ folder, durationId, texts });
  });
  return registry;
}

/* ===== FATHERS: discovery for *_fathers.json ===== */
function useDiscoveredFatherSets() {
  const fatherModules =
    import.meta.glob("../data/**/*_fathers.json", { eager: true, import: "default" }) || {};
  const folderOf = (p) => {
    const m = p.match(/\/data\/([^/]+)\//);
    return m ? m[1] : null;
  };
  const folders = new Set(Object.keys(fatherModules).map(folderOf));

  const registry = [];
  folders.forEach((folder) => {
    if (!folder) return;
    const durationId = `${folder}-composite`;
    const fathers = Object.entries(fatherModules)
      .filter(([p]) => folderOf(p) === folder)
      .flatMap(([, data]) => (Array.isArray(data) ? data : []));
    registry.push({ folder, durationId, fathers });
  });
  return registry;
}

/* ===== CONNECTIONS: discovery for *_connections.json ===== */
function useDiscoveredConnectionSets() {
  const modules =
    import.meta.glob("../data/**/*_connections.json", {
      eager: true,
      import: "default",
    }) || {};

  const folderOf = (p) => {
    const m = p.match(/\/data\/([^/]+)\//);
    return m ? m[1] : null;
  };

  // folder → array of *row objects*
  const registryMap = new Map();

  for (const [path, data] of Object.entries(modules)) {
    const folder = folderOf(path);
    if (!folder) continue;

    const arr = Array.isArray(data) ? data : [];
    if (!registryMap.has(folder)) registryMap.set(folder, []);

    // IMPORTANT: flatten all rows from this file into the bucket
    registryMap.get(folder).push(...arr);
  }

  const registry = [];
  for (const [folder, rows] of registryMap.entries()) {
    registry.push({
      folder,
      durationId: `${folder}-composite`,
      connections: rows,
    });
  }

  
  return registry;
}

// === Connection → sentence helpers for cards ===

function joinNames(names) {
  const uniq = Array.from(new Set((names || []).filter(Boolean)));
  if (!uniq.length) return "";
  if (uniq.length === 1) return uniq[0];
  if (uniq.length === 2) return `${uniq[0]} and ${uniq[1]}`;
  return `${uniq.slice(0, -1).join(", ")}, and ${uniq[uniq.length - 1]}`;
}


const SYMBOLIC_SYSTEM_KEYS = Object.keys(SymbolicSystemColorPairs);

/* ===== Tag groups (config-first) ===== */
const TAG_GROUPS = [
  // TEXTS-ONLY
  {
    key: "metaphysical",
    label: "Metaphysical",
    appliesTo: "texts",
    allTags: [ "Apophatic–Aporetic (Unknowable)", "Phenomenology (Experiential)", "Becoming (Process Ontology)", "Pluralism (Multiplicities)", "Grid (Systematic Structuralism)",
      "Dialectics (Conflict)", "Clockwork (Causal Determinism)", "Monism (Single Principle)", "Subversion (Negation)"
    ],
  },
  {
    key: "artsSciences",
    label: "Arts & Sciences",
    appliesTo: "texts",
    allTags: [ "Mathematics", "Logic/Formal Reasoning", "Physics", "Chemistry", "Biology", "Medicine", "Astronomy", "Warfare", "Education", "Public Relations", "Political Science/Law",
     "Economics", "Agriculture", "Sociology", "Linguistics", "Psychology", "Theology", "Literature", "Art/Aesthetics", "History", "Philosophy", "Anthropology"],
  },
  {
    key: "literaryForms",
    label: "Literary Forms",
    appliesTo: "texts",
    allTags: ["Poetry", "Dialogue", "Drama (Play)", "Narrative", "Essay / Argument", "Fiction", "Personal Writings", "Myth", "Doctrine / Treatise", "Record / Chronicle",
       "Commentary / Exegesis", "Parable / Fable", "Proclamation / Decree", "Fragment", "Manual / Instruction", "Glossary / Taxonomy", "Analysis", "Liturgy", "Epic",
        "Rulebook / Code", "Riddle / Aphorism", "Petition / Appeal", "Oral Tradition"],

  },
  {
    key: "literaryContent",
    label: "Literary Themes",
    appliesTo: "texts",
    allTags: ["Ritual / Devotional", "Comic / Satirical", "Adventure / Heroic Journey", "Coming of Age", "Introspective", "Apocalyptic / Eschatological", 
      "Utopian / Dystopian", "Historical Reflection", "Metaphysical", "Epistemological / Hermeneutics", "Political", "Romantic / Erotic", "Tragic / Lamentation",
       "Didactic / Ethical", "Absurd", "Prophetic / Revelation", "Existential", "Feminine", "Cosmological"],
  },

  // SHARED (texts + fathers)
  {
    key: "jungian",
    label: "Jungian Archetypes",
    appliesTo: "both",
    allTags: [
      "Shadow","Anima","Animus","Persona","Self","Hero","Wise Old Man","Wise Old Woman","Trickster","Initiator",
      "Father Archetype","Mother Archetype","Terrible Mother","Terrible Father"
    ],
  },
  {
    key: "neumann",
    label: "Neumann Stages",
    appliesTo: "both",
    allTags: [
      "Uroboric Stage","Separation from World Parents","Battle with the Dragon","Isolation","Divine Intervention",
      "Initiation","Death","Rebirth","Magical Empowerment","Return to the Community","Descent into the Underworld",
      "Mythic Ordering of Reality","Ego Collapse","Ego Transcendence","Coronation of the King"
    ],
  },
  {
    key: "comtean",
    label: "Comtean Framework",
    appliesTo: "both",
    allTags: [
      "Theological/Mythological","Philosophical/Metaphysical","Positive/Empirical","Synthetic Literature"
    ],
  },
  {
    key: "socioPolitical",
    label: "Socio-political",
    appliesTo: "both",
    allTags: ["Priestly / Theocratic", "Bureaucratic / Legal / Scribal", "Merchant / Cosmopolitan", "Warrior / Imperial", "Royal", "Scholarly", "Bohemian / Aesthetic", 
      "Folk / Communal", "Subversive / Revolutionary", "Mystical / Initiatory", "National", "Recluse / Ascetic"],
  },

  {
  key: "symbolicSystems",
  label: "Symbolic Systems",
  appliesTo: "both",
  allTags: SYMBOLIC_SYSTEM_KEYS,
},
];



/* Normalizers */
const canonSetByKey = new Map(
  TAG_GROUPS.map(g => [g.key, new Set(g.allTags.map(s => s.trim()))])
);


function normalizeTagStringToArray(raw, groupKey) {
  const s = String(raw || "").trim();
  if (s === "-") return null; // NA → ignore this group for this item

  const canon = canonSetByKey.get(groupKey) || new Set();
  const arr = s
    .split(",")
    .map(x => x.trim())
    .filter(Boolean)
    .filter(tag => canon.has(tag)); // keep only canonical tags
  return arr; // [] means “no canonical tags present”, not NA
}

// === Connections → structured items for cards ===

function joinNamesList(names) {
  const uniq = Array.from(new Set((names || []).filter(Boolean)));
  if (!uniq.length) return [];
  return uniq;
}

// A "connection item" for cards:
// {
//   textBefore: string,
//   targets: [ { type: "father"|"text", id, name }, ... ],
//   note?: string
// }
function buildFatherConnectionItems(subject, allConnections) {
  if (!subject || !allConnections || !allConnections.length) return [];

  const subjectId = subject.id;
  const subjectName = subject.name || "";

  // Only connections where this father is one of the sides.
  const relevant = allConnections.filter((c) => {
    const isSubjectA = c.aId === subjectId && c.aType === "father";
    const isSubjectB = c.bId === subjectId && c.bType === "father";

    // Drop text-primary / father-secondary rows to avoid duplicates
    if (c.aType === "text" && c.bType === "father") return false;

    return isSubjectA || isSubjectB;
  });

  if (!relevant.length) return [];

  const parentGroups = {};           // father/mother → [{ otherId, otherType, otherName, note }]
  const childGroups = {};            // son/daughter → same
  const siblingGroups = {};          // pure siblings: "sister of X and Y"
  const siblingConsortGroups = {};   // "sister and consort of X and Y"
  const consortGroups = {};          // plain consorts: "consort of X and Y"
  const syncreticEntries = [];       // "was syncretized with A, B, C"
  const customConnectionGroups = {}; // "relates to A, B, C"
  const explicitTextRefs = [];       // "is mentioned in Text1, Text2, Text3"
  const looseItems = [];

  const ensureGroup = (obj, key) => {
    if (!obj[key]) obj[key] = [];
    return obj[key];
  };

  for (const c of relevant) {
    const rawCat = c.category || "";
    const category = String(rawCat).toLowerCase().trim();
    const rawNote = (c.note || "").trim();
    const hasNote = !!rawNote && rawNote !== "-";

    const isSubjectA = c.aId === subjectId;
    const subjectSide = isSubjectA ? "a" : "b";
    const otherSide = isSubjectA ? "b" : "a";

    // Names and ids are already normalized in allConnectionRowsRef
    const subjName = subjectName || c[`${subjectSide}Name`] || subjectName;
    const otherName = c[`${otherSide}Name`] || "";
    const otherId = c[`${otherSide}Id`];
    const otherType = c[`${otherSide}Type`];

    const entry = {
      otherId,
      otherType,
      otherName,
      note: hasNote ? rawNote : "",
    };

    // --- Familial logic ---
    if (category.startsWith("familial:")) {
      const m = category.match(/^familial:\s*([^,]+)/);
      const core = m ? m[1].trim() : "";
      const hasConsorts = category.includes("consorts");

      const isSiblingPair =
        core.includes("brother") || core.includes("sister");

      // Pure siblings (no parents, no consorts)
      if (
        isSiblingPair &&
        !core.includes("father") &&
        !core.includes("mother") &&
        !hasConsorts
      ) {
        // e.g. "sister/brother", "sister/sister", "brother/brother"
        const [roleA, roleB] = core.includes("/")
          ? core.split("/").map((s) => s.trim())
          : [core, core];

        const subjectRole = isSubjectA ? roleA : roleB;
        const g = ensureGroup(siblingGroups, subjectRole);
        g.push(entry);
        continue;
      }

      // sibling + consort: "brother/sister, consorts", etc.
      if (isSiblingPair && hasConsorts) {
        const [roleA, roleB] = core.split("/").map((s) => s.trim());
        const subjectRole = isSubjectA ? roleA : roleB;
        const g = ensureGroup(siblingConsortGroups, subjectRole);
        g.push(entry);
        continue;
      }

      // plain consorts: "familial: consorts"
      if (!isSiblingPair && hasConsorts) {
        const g = ensureGroup(consortGroups, "consort");
        g.push(entry);
        continue;
      }

      // parent / child ("father/son", "mother/daughter", etc.)
      if (core.includes("/")) {
        const [roleA, roleB] = core.split("/").map((s) => s.trim());
        const subjectRole = isSubjectA ? roleA : roleB;
        const parentRoles = ["father", "mother"];
        const childRoles = ["son", "daughter"];

        if (parentRoles.includes(subjectRole)) {
          const g = ensureGroup(parentGroups, subjectRole);
          g.push(entry);
          continue;
        }

        if (childRoles.includes(subjectRole)) {
          const g = ensureGroup(childGroups, subjectRole);
          g.push(entry);
          continue;
        }
      }
    }

    // --- Syncretic ---
    if (category.startsWith("syncretic")) {
      syncreticEntries.push(entry);
      continue;
    }

    // --- Custom connection (grouped like syncretic) ---
    if (category.startsWith("custom connection")) {
      const g = ensureGroup(customConnectionGroups, "custom");
      g.push(entry);
      continue;
    }

    // --- Father ↔ text explicit reference (grouped) ---
    if (
      category === "explicit reference" &&
      ((c.aType === "father" && c.bType === "text") ||
        (c.bType === "father" && c.aType === "text"))
    ) {
      // We only care about the text side as the "other"
      explicitTextRefs.push(entry);
      continue;
    }

    // --- Fallback generic ---
    looseItems.push({
      textBefore: `is related to `,
      targets: [
        {
          type: otherType,
          id: otherId,
          name: otherName,
          note: hasNote ? rawNote : "",
        },
      ],
      note: "",
    });
  }

  const items = [];

  // Helper: make a single grouped item, with per-target notes; NO row-level note
  const makeGroupedItem = (textBefore, entries) => {
    if (!entries || !entries.length) return;

    const targets = entries.map((e) => ({
      type: e.otherType,
      id: e.otherId,
      name: e.otherName,
      note: e.note || "",
    }));

    items.push({
      textBefore,
      targets,
      note: "", // important: keep empty so we don't get one big "i" at the end
    });
  };

  // Parent groups: "father/mother of A, B, C"
  for (const role of Object.keys(parentGroups)) {
    makeGroupedItem(`${role} of `, parentGroups[role]);
  }

  // Child groups: "son/daughter of A, B"
  for (const role of Object.keys(childGroups)) {
    makeGroupedItem(`${role} of `, childGroups[role]);
  }

  // Sibling groups: "sister/brother of A, B"
  for (const role of Object.keys(siblingGroups)) {
    makeGroupedItem(`${role} of `, siblingGroups[role]);
  }

  // Sibling + consort groups: "sister and consort of A, B"
  for (const role of Object.keys(siblingConsortGroups)) {
    makeGroupedItem(
      `${role} and consort of `,
      siblingConsortGroups[role]
    );
  }

  // Plain consorts: "consort of A, B"
  if (consortGroups.consort && consortGroups.consort.length) {
    makeGroupedItem(`consort of `, consortGroups.consort);
  }

  // Syncretic: "was syncretized with A, B, C"
  if (syncreticEntries.length) {
    makeGroupedItem(`was syncretized with `, syncreticEntries);
  }

  // Custom connections: "relates to A, B, C"
  if (customConnectionGroups.custom && customConnectionGroups.custom.length) {
    makeGroupedItem(`relates to `, customConnectionGroups.custom);
  }

  // Explicit text references: "is mentioned in Text1, Text2, Text3"
  if (explicitTextRefs.length) {
    makeGroupedItem(`is mentioned in `, explicitTextRefs);
  }

  // Everything else (generic)
  return items.concat(looseItems);
}




function buildTextConnectionItems(subject, allConnections) {
  if (!subject || !allConnections || !allConnections.length) return [];

  const subjectId = subject.id;
  const subjectName = subject.title || "";

  const items = [];

  // Aggregated textual connections
  const implicitInformedTargets = [];    // "implicitly informed by X, Y"
  const implicitInformsTargets = [];     // "implicitly informs X, Y"
  const explicitInformedByTargets = [];  // "explicitly informed by X, Y"
  const explicitInformsTargets = [];     // "explicitly informs X, Y"
  const comparativeTargets = [];         // "provides an earlier comparative framework for X, Y"
  const textualOther = [];               // fallback explicit/comparative etc. that we don't aggregate

  // father→text explicit references ("Connections with Mythic/Historic Figures")
  const fatherRefs = [];

  for (const c of allConnections) {
    const rawCat = c.category || "";
    const category = String(rawCat).toLowerCase().trim();
    const rawNote = (c.note || "").trim();
    const hasNote = !!rawNote && rawNote !== "-";

    const aIsText = c.aType === "text";
    const bIsText = c.bType === "text";
    const aIsFather = c.aType === "father";
    const bIsFather = c.bType === "father";

    // ===== 1) TEXT ↔ TEXT CONNECTIONS =====
    if (aIsText && bIsText) {
      const isSubjectA = c.aId === subjectId;
      const isSubjectB = c.bId === subjectId;
      if (isSubjectA || isSubjectB) {
        const otherSide = isSubjectA ? "b" : "a";

        const otherName = c[`${otherSide}Name`] || "";
        const otherId   = c[`${otherSide}Id`];
        const otherType = c[`${otherSide}Type`];

        // --- Directional semantics for "indirect connection" ---
        if (category === "indirect connection") {
          if (isSubjectB && !isSubjectA) {
            // Subject is on secondary side -> implicitly informed by primary
            implicitInformedTargets.push({
              type: otherType,
              id: otherId,
              name: otherName,
              note: hasNote ? rawNote : "",
            });
          } else if (isSubjectA && !isSubjectB) {
            // Subject is on primary side -> implicitly informs secondary
            implicitInformsTargets.push({
              type: otherType,
              id: otherId,
              name: otherName,
              note: hasNote ? rawNote : "",
            });
          } else {
            // Fallback (shouldn't normally happen): symmetric wording
            textualOther.push({
              section: "textual",
              textBefore: `${subjectName} is implicitly related to `,
              targets: [
                {
                  type: otherType,
                  id: otherId,
                  name: otherName,
                  note: hasNote ? rawNote : "",
                },
              ],
              note: hasNote ? rawNote : "",
            });
          }

          continue;
        }

        // --- Explicit reference between texts (directional) ---
        if (category === "explicit reference") {
          if (isSubjectB && !isSubjectA) {
            // Subject is on secondary side -> explicitly informed by primary
            explicitInformedByTargets.push({
              type: otherType,
              id: otherId,
              name: otherName,
              note: hasNote ? rawNote : "",
            });
          } else if (isSubjectA && !isSubjectB) {
            // Subject is on primary side -> explicitly informs secondary
            explicitInformsTargets.push({
              type: otherType,
              id: otherId,
              name: otherName,
              note: hasNote ? rawNote : "",
            });
          } else {
            // Fallback (shouldn't normally happen): symmetric wording
            textualOther.push({
              section: "textual",
              textBefore: `${subjectName} is explicitly related to `,
              targets: [
                {
                  type: otherType,
                  id: otherId,
                  name: otherName,
                  note: hasNote ? rawNote : "",
                },
              ],
              note: hasNote ? rawNote : "",
            });
          }

          continue;
        }

        // --- Comparative connections (aggregated into one row) ---
        if (category === "comparative connection") {
          comparativeTargets.push({
            type: otherType,
            id: otherId,
            name: otherName,
            note: hasNote ? rawNote : "",
          });
          continue;
        }

        // Anything else that slips through (unlikely)
        // could be handled here if needed.
      }

      // text↔text handled; skip father logic for this row
      continue;
    }

    // ===== 2) FATHER ↔ TEXT EXPLICIT REFERENCES =====
    // We only care about explicit references where THIS text is the text side.
    if (category === "explicit reference") {
      // Case: father on A, text on B
      if (aIsFather && bIsText && c.bId === subjectId) {
        const otherName = c.aName || c["aName"] || "";
        const otherId = c.aId;
        const otherType = c.aType;

        fatherRefs.push({
          otherId,
          otherType,
          otherName,
          note: hasNote ? rawNote : "",
        });
        continue;
      }

      // Case: text on A, father on B
      if (bIsFather && aIsText && c.aId === subjectId) {
        const otherName = c.bName || c["bName"] || "";
        const otherId = c.bId;
        const otherType = c.bType;

        fatherRefs.push({
          otherId,
          otherType,
          otherName,
          note: hasNote ? rawNote : "",
        });
        continue;
      }
    }

    // Any other categories / shapes are ignored here for now.
  }

  // ===== Assemble textual items in desired order =====

  // 1) implicitly informed by X, Y
  if (implicitInformedTargets.length) {
    items.push({
      section: "textual",
      textBefore: "implicitly informed by ",
      targets: implicitInformedTargets,
      note: "", // per-target notes only
    });
  }

  // 2) explicitly informed by X, Y
  if (explicitInformedByTargets.length) {
    items.push({
      section: "textual",
      textBefore: "explicitly informed by ",
      targets: explicitInformedByTargets,
      note: "",
    });
  }

  // 3) implicitly informs X, Y
  if (implicitInformsTargets.length) {
    items.push({
      section: "textual",
      textBefore: "implicitly informs ",
      targets: implicitInformsTargets,
      note: "",
    });
  }

  // 4) explicitly informs X, Y
  if (explicitInformsTargets.length) {
    items.push({
      section: "textual",
      textBefore: "explicitly informs ",
      targets: explicitInformsTargets,
      note: "",
    });
  }

  // 5) comparative framework for X, Y, Z...
  if (comparativeTargets.length) {
    items.push({
      section: "textual",
      textBefore: "provides an earlier comparative framework for ",
      targets: comparativeTargets,
      note: "",
    });
  }

  // 6) everything else (fallback implicit/explicit, etc.)
  items.push(...textualOther);

  // ===== Mythic/Historic: father ↔ text =====
  if (fatherRefs.length) {
    const targets = fatherRefs.map((e) => ({
      type: e.otherType,
      id: e.otherId,
      name: e.otherName,
      note: e.note || "",
    }));

    items.push({
      section: "mythic", // for "Connections with Mythic/Historic Figures"
      textBefore: "mentions ",
      targets,
      note: "", // notes live on targets for per-name i buttons
    });
  }

  return items;
}




/* Build "all selected" default state: { [groupKey]: Set(allTags) } */
function makeDefaultSelectedByGroup() {
  const out = {};
  for (const g of TAG_GROUPS) out[g.key] = new Set(g.allTags);
  return out;
}

function itemPassesFilters(row, type, selectedByGroup) {
  for (const g of TAG_GROUPS) {
    const applies =
      g.appliesTo === "both" ||
      (g.appliesTo === "texts" && type === "text") ||
      (g.appliesTo === "fathers" && type === "father");
    if (!applies) continue;

    const selected = selectedByGroup[g.key] || new Set();
    const selSize = selected.size;
    const canonSize = g.allTags.length;

    const itemTags = row.tags?.[g.key];
    const isNA = itemTags == null;

    // If user hasn't really narrowed anything (selected >= canon), don't filter
    if (selSize >= canonSize) continue;

    // If user deselected everything and item actually has this group → hide it
    if (selSize === 0) { if (!isNA) return false; continue; }

    if (isNA) continue; // item lacks this group → no constraint

    // Require intersection with the currently selected tags
    if (!itemTags.some(t => selected.has(t))) return false;
  }
  return true;
}





export default function Timeline() {
  
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  
  const axisRef = useRef(null);
  const gridRef = useRef(null);
  const customPolysRef = useRef(null); // NEW: group polygons layer
  const outlinesRef = useRef(null);
  const segmentsRef = useRef(null);
  const textsRef = useRef(null);
  const fathersRef = useRef(null); // FATHERS: new layer ref
  const pinsRef = useRef(null); // NEW: top layer for selected pins

  const connectionsRef = useRef(null);
  const allConnectionRowsRef = useRef([]);

  const hoveredTextIdRef = useRef(null);
  const hoveredFatherIdRef = useRef(null);
  
  
  const prevZoomedInRef = useRef(false);
  const hoveredDurationIdRef = useRef(null);
  const awaitingCloseClickSegRef = useRef(false);
  
  const zoomDraggingRef = useRef(false);
  const clipId = useId();
    function logRenderedCounts() {
    // Count *rendered* marks (current DOM), not dataset sizes
    const textsCount = d3.select(textsRef.current)
      .selectAll("circle.textDot")
      .size();

    const fathersCount = d3.select(fathersRef.current)
      .selectAll("g.fatherMark")
      .size();

    const total = textsCount + fathersCount;

    console.log(
      `[Timeline] Rendered — texts: ${textsCount}, fathers: ${fathersCount}, total: ${total}`
    );
  }


  // NEW: single source of truth for hovered segment
  const hoveredSegIdRef = useRef(null);
  const clearActiveSegmentRef = useRef(() => {});
  const clearActiveDurationRef = useRef(() => {});

  

  // current zoom scale
  const kRef = useRef(1);
  // current rescaled axes for anchoring tooltips
  const zxRef = useRef(null);
  const zyRef = useRef(null);
  // clicked/locked active segment id
  const activeSegIdRef = useRef(null);
  // clicked/locked active duration id (zoomed-out)
  const activeDurationIdRef = useRef(null);
  // brighten label while hovering a segment
  const hoveredSegParentIdRef = useRef(null);
  // One-shot close for duration cards (the next click closes)
  const awaitingCloseClickRef = useRef(false);

  const hoverRaf = useRef(0);

  const zoomRef = useRef(null);
  const svgSelRef = useRef(null);
  const flyToRef = useRef(null);
  const textCardRef = useRef(null);
  const fatherCardRef = useRef(null);

  const [visibleIds, setVisibleIds] = useState(() => new Set());
  const visibleIdsRef = useRef(new Set());
  const visUpdateRaf = useRef(0);



  const SEARCH_FLY = {
  k: 4.5,         // target zoom (>= ZOOM_THRESHOLD so dots/triangles are interactive)
  xFrac: 2/3,     // horizontal position (2/3 = boundary between 2nd and 3rd thirds)
  yFrac: 0.5,     // vertical center
  duration: 700,  // ms
  ease: d3.easeCubicOut
};

/* ---- Responsive sizing ---- */
// Start at 0 so we don't render the SVG with a fake size before ResizeObserver fires.
const [size, setSize] = useState({ width: 0, height: 0 });
  const [selectedText, setSelectedText] = useState(null);
  const [showMore, setShowMore] = useState(false);
  const [cardPos, setCardPos] = useState({ left: 16, top: 16 });
  const [selectedFather, setSelectedFather] = useState(null);
  const [fatherCardPos, setFatherCardPos] = useState({ left: 16, top: 16 });
const closeAllAnimated = () => {
  if (selectedText && textCardRef.current?.startClose) {
    textCardRef.current.startClose();
  }
  if (selectedFather && fatherCardRef.current?.startClose) {
    fatherCardRef.current.startClose();
  }
  // Don't clear state here; each card will call its onClose after animation.
};
  const modalOpen = !!selectedText || !!selectedFather;
  const lastTransformRef = useRef(null);  // remembers latest d3.zoom transform
  const didInitRef = useRef(false);       // tracks first-time init

  // New: Tag filtering state (controlled by TagPanel)
const [selectedByGroup, setSelectedByGroup] = useState(() => makeDefaultSelectedByGroup());



useEffect(() => {
  // When SymbolicSystemColorPairs (and thus TAG_GROUPS) changes, make sure
  // selectedByGroup includes any newly added canonical tags.
  setSelectedByGroup(prev => {
    const next = { ...prev };
    for (const g of TAG_GROUPS) {
      const prevSet = new Set(prev[g.key] || []);
      for (const tag of g.allTags) prevSet.add(tag);
      next[g.key] = prevSet;
    }
    return next;
  });
  // Depend on the actual keys so this runs when you add a new system
}, [JSON.stringify(Object.keys(SymbolicSystemColorPairs))]);


  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width: Math.max(320, width), height: Math.max(240, height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { width, height } = size;

  /* ---- Layout ---- */
const margin = { top: 8, right: 0, bottom: 28, left: 0 };

// Prevent negative inner dimensions during the first render
const innerWidth = Math.max(0, width - margin.left - margin.right);
const innerHeight = Math.max(0, height - margin.top - margin.bottom);

const axisY = innerHeight;
  /* ---- Time domain & base scales ---- */
  const domainHuman = useMemo(() => [-5500, 2500], []);
  const domainAstro = useMemo(() => domainHuman.map(toAstronomical), [domainHuman]);

  const x = useMemo(
    () => d3.scaleLinear().domain(domainAstro).range([0, innerWidth]),
    [domainAstro, innerWidth]
  );
  const y0 = useMemo(
    () => d3.scaleLinear().domain([0, innerHeight]).range([0, innerHeight]),
    [innerHeight]
  );

  /* ---- Prepare composite OUTLINES (with custom groups) ---- */
  const DEFAULT_BAR_PX = 24;
  const outlines = useMemo(() => {
    // 1) Build raw outlines from durations
    const raw = durations
      .filter(
        (d) =>
          d &&
          (Array.isArray(d.segments) ? d.segments.length > 0 : d.start != null && d.end != null)
      )
      .map((d) => {
        let start, end;
        if (Array.isArray(d.segments) && d.segments.length > 0) {
          start = d3.min(d.segments, (s) => s.start);
          end = d3.max(d.segments, (s) => s.end);
        } else {
          start = d.start;
          end = d.end;
        }
        const y = d.yRel != null ? d.yRel * innerHeight : d.y != null ? d.y : 0;
        const h =
          d.hRel != null ? d.hRel * innerHeight : d.height != null ? d.height : DEFAULT_BAR_PX;

        return {
          id: d.id,
          name: d.name,
          color: d.color || "#999",
          start,
          end,
          y,
          h,
          expandedName: d["expanded name"] || d.name || "",
          broadLifespan: d["broad lifespan"] || "",
          broadNote: d["broad note"] || "",
          segments: Array.isArray(d.segments) ? d.segments.map((s) => ({ ...s })) : [],
          _isCustomMember: !!parseCustomId(d.id),
        };
      });

    // 2) Group custom members by groupKey
    const byGroup = new Map();
    for (const row of raw) {
      const parsed = parseCustomId(row.id);
      if (!parsed) continue;
      const arr = byGroup.get(parsed.groupKey) || [];
      arr.push(row);
      byGroup.set(parsed.groupKey, arr);
    }

    // 3) Build group outlines
    const groupOutlines = [];
    for (const [groupKey, members] of byGroup.entries()) {
      const start = d3.min(members, (m) => m.start);
      const end = d3.max(members, (m) => m.end);
      const top = d3.min(members, (m) => m.y);
      const bot = d3.max(members, (m) => m.y + m.h);
      const y = top;
      const h = bot - top;
      const first = members[0] || {};

      // NEW: choose which member anchors the label (via config; fallback to first)
      const { shortLabel, longTitle, anchor } = deriveGroupTitles(groupKey, members);

      // NEW: choose which member anchors the *duration box*
      const tipCfg        = CUSTOM_GROUP_TIP_POLICY[groupKey] || {};
      const tipAnchorId   = tipCfg.anchorMemberId || CUSTOM_GROUP_LABEL_MEMBER[groupKey];
      const tipAnchor     = members.find(m => m.id === tipAnchorId) || anchor || members[0] || {};
      const tipMaxWidthPx = Number.isFinite(tipCfg.maxWidth) ? tipCfg.maxWidth : null;

      groupOutlines.push({
        id: `customgroup-${groupKey}`,
        name: first.name || `Custom ${groupKey}`,
        expandedName: longTitle,
        color: first.color || "#999",
        start, end, y, h,
        broadLifespan: first.broadLifespan || "",
        broadNote: first.broadNote || "",
        _isCustomGroup: true,
        _groupKey: groupKey,

        // keep your existing fields...
        _groupMembers: members.map(m => ({ id: m.id, start: m.start, end: m.end, y: m.y, h: m.h, segments: m.segments })),
        _groupIntervals: buildGroupIntervals(members.map(m => ({ id: m.id, start: m.start, end: m.end, y: m.y, h: m.h, segments: m.segments }))),

        

        // label (unchanged)
        _labelText: shortLabel,
        _labelAnchorY: anchor?.y ?? y,
        _labelAnchorH: anchor?.h ?? h,

        // NEW: duration box anchor + sizing
        _tipAnchorY: tipAnchor?.y ?? y,
        _tipAnchorH: tipAnchor?.h ?? h,
        _tipMaxWidth: tipMaxWidthPx,
      });

      {
  const _o = groupOutlines[groupOutlines.length - 1];
  }

    }
    // Keep everyone; mark custom members hidden so they act as layout bands
    const baseOutlines = raw.map((r) => ({ ...r, _hiddenCustom: !!r._isCustomMember }));

    // 5) Append group outlines (so groups replace their members at zoomed-out levels)
    return [...baseOutlines, ...groupOutlines];
  }, [durations, innerHeight]);

  /* ---- Segment hover rects ---- */
  const segments = useMemo(() => {
    const rows = [];



    // Map custom member id -> group id (for parent remap)
    const customMemberIdToGroupId = new Map();
    outlines.forEach((o) => {
      if (!o._isCustomGroup) return;
      for (const m of o._groupMembers || []) {
        customMemberIdToGroupId.set(m.id, o.id);
      }
    });



    for (const d of durations) {
      if (!Array.isArray(d.segments)) continue;
      const color = d.color || "#999";
      const y = d.yRel != null ? d.yRel * innerHeight : d.y != null ? d.y : 0;
      const h =
        d.hRel != null ? d.hRel * innerHeight : d.height != null ? d.height : DEFAULT_BAR_PX;

      const parsed = parseCustomId(d.id);
      const parentId = parsed ? (customMemberIdToGroupId.get(d.id) || d.id) : d.id;

      d.segments.forEach((s, i) => {
        rows.push({
          id: `${d.id}__seg_${i}`,
          parentId,
          parentColor: color,
          start: s.start,
          end: s.end,
          y,
          h,
          label: s.label,
          note: s.note,
        });
      });
    }
    return rows;
  }, [durations, innerHeight, outlines]);

  /* ---- Datasets (TEXTS ONLY) ---- */
  const datasetRegistry = useDiscoveredDatasets();

  /* ---- FATHERS: registry ---- */
  const fatherRegistry = useDiscoveredFatherSets();

  const connectionRegistry = useDiscoveredConnectionSets();

  /* ---- Texts rows ---- */
  const textRows = useMemo(() => {
    const outlinesById = new Map(outlines.map((o) => [o.id, o]));
    const rowsT = [];




    for (const ds of datasetRegistry) {
      const band = outlinesById.get(ds.durationId);
      if (!band) continue;

      const bandY = band.y;
      const bandH = band.h;
      const pad = Math.min(6, Math.max(2, bandH * 0.15));
      const yForKey = (key) => {
        const r = hashString(`${ds.durationId}::${key || "anon"}`);
        return bandY + pad + r * Math.max(1, bandH - 2 * pad);
      };

      for (const t of ds.texts || []) {
        
        const title = (t["Name"] || "").trim();
        const authorName = (t["Author"] || "").trim();
        const approxDateStr = (t["Approx. Date"] || "").trim();
        const metaphysicalTags = (t["Metaphysical Tags"] || "").trim();
        const artsAndSciencesTags = (t["Arts and Sciences Tags"] || "").trim();
        const accessLevel = (t["Access Level"] || "").trim();
        const shortDescription = (t["Short Description"] || "").trim();
        const jungianArchetypesTags = (t["Jungian Archetypes Tags"] || "").trim();
        const neumannStagesTags = (t["Neumann Stages Tags"] || "").trim();
        const originalGeo = (t["Original Geographical Location"] || "").trim();
        const originalLanguage = (t["Original Language"] || "").trim();
        const comteanFramework = (t["Comtean framework"] || "").trim();
        const category = (t["Category"] || "").trim();
        const socioPoliticalTags = (t["Socio-political Tags"] || "").trim();
        const literaryFormsTags = (t["Literary Forms Tags"] || "").trim();
        const literaryContentTags = (t["Literary Themes Tags"] || t["Literary Content Tags"] || "").trim();
        const symbolicSystemTags = (t["Symbolic System Tags"] || "").trim();
        const textIndex = ((getLooseField(t, "Index") ?? "") + "").trim();

                // Normalized tag arrays for filtering (keeps canonical casing)
const tags = {
  metaphysical:    normalizeTagStringToArray(metaphysicalTags, "metaphysical"),
  artsSciences:    normalizeTagStringToArray(artsAndSciencesTags, "artsSciences"),
  literaryForms:   normalizeTagStringToArray(literaryFormsTags, "literaryForms"),
  literaryContent: normalizeTagStringToArray(literaryContentTags, "literaryContent"),
  jungian:         normalizeTagStringToArray(jungianArchetypesTags, "jungian"),
  neumann:         normalizeTagStringToArray(neumannStagesTags, "neumann"),
  comtean:         normalizeTagStringToArray(comteanFramework, "comtean"),
  socioPolitical:  normalizeTagStringToArray(socioPoliticalTags, "socioPolitical"),
  // ADD THIS:
  symbolicSystems: normalizeTagStringToArray(symbolicSystemTags, "symbolicSystems"),
};





        const when = getTextDate(t);
        if (!Number.isFinite(when)) continue;

        const color = pickSystemColor(symbolicSystemTags);
        const colors = pickSystemColorsCached(symbolicSystemTags);


        const textKey = `${authorName || "anon"}::${title || ""}::${when}`;
        const autoY = yForKey(textKey);

        // NEW: support manual Y-pos; if set, lock Y and ignore author lanes
        const { y, locked: yLocked } = computeYFromYPos(t["Y-pos"], bandY, bandH, autoY);

        const displayDate = approxDateStr || formatYear(when);

        // If Y-pos is set, do not lock to author lanes (authorKey=null)
        const computedAuthorKey = yLocked
        ? null
        : (isPlaceholderAuthor(authorName) ? null : normalizeAuthor(authorName));

       

        rowsT.push({
          id: `${ds.durationId}__text__${title || hashString(JSON.stringify(t))}__${when}`,
          durationId: ds.durationId,
          when,
          y,
          color,
          colors,
          title,
          authorName,
          authorKey: computedAuthorKey,
          displayDate,
          metaphysicalTags,
          artsAndSciencesTags,
          accessLevel,
          shortDescription,
          jungianArchetypesTags,
          neumannStagesTags,
          originalGeographicalLocation: originalGeo,
          originalLanguage,
          comteanFramework,
          category,
          socioPoliticalTags,
          literaryFormsTags,
          literaryContentTags,
          symbolicSystemTags,
          textIndex,
          tags,  
        });
      }
    }

    // Clamp to band extent
    const bandExtent = new Map(
      outlines.map((o) => [o.id, { min: Math.min(o.start, o.end), max: Math.max(o.start, o.end) }])
    );
    const filtT = rowsT.filter((r) => {
      const e = bandExtent.get(r.durationId);
      return e ? r.when >= e.min && r.when <= e.max : true;
    });

    return filtT;
  }, [datasetRegistry, outlines]);

  // FATHERS: rows (right-pointing triangles; no author lanes)
  const fatherRows = useMemo(() => {
  const outlinesById = new Map(outlines.map((o) => [o.id, o]));
  const rowsF = [];

  for (const ds of fatherRegistry) {
    const band = outlinesById.get(ds.durationId);
    if (!band) continue;

    const bandY = band.y;
    const bandH = band.h;
    const pad = Math.min(6, Math.max(2, bandH * 0.15));
    const yForKey = (key) => {
      const r = hashString(`${ds.durationId}::father::${key || "anon"}`);
      return bandY + pad + r * Math.max(1, bandH - 2 * pad);
    };

    for (const f of ds.fathers || []) {
      const name = String(f["Name"] || "").trim();
      const when = getDatavizNumber(f);
      if (!Number.isFinite(when)) continue;

      const index = f["Index"] != null ? f["Index"] : null;
      const dob = (f["D.O.B"] || "").trim();
      const dod = (f["D.O.D"] || "").trim();
      const location = (f["Location"] || "").trim();
      const description = (f["Description"] || "").trim();
      const historicMythicStatusTags = (f["Historic-Mythic Status Tags"] || "").trim();
      const foundingFigure = (f["Founding Figure?"] || "").trim();
      const jungianArchetypesTags = (f["Jungian Archetypes Tags"] || "").trim();
      const neumannStagesTags = (f["Neumann Stages Tags"] || "").trim();
      const category = (f["Category"] || "").trim();

      // Define symbolic system first, then colors + color
      const symbolicSystem = (f["Symbolic System"] || f["Symbolic System Tags"] || "").trim();
      const colors = pickSystemColorsCached(symbolicSystem);
      const color  = colors[0] || "#666";

      // Lane key & base Y (then add stable jitter)
      const keyForLane = String(
        (f["Index"] ?? "").toString().trim() || name || "anon"
      ).trim().toLowerCase();
      const yBase = yForKey(keyForLane);

      // If manual Y-pos given, use it and drop jitter; else keep your old behavior
      const { y: manualY, locked: yLocked } = computeYFromYPos(f["Y-pos"], bandY, bandH, yBase);
      const y = yLocked
        ? manualY
        : (yBase + fatherJitterU(
       `${ds.durationId}__father__${name || hashString(JSON.stringify(f))}__${when}`,
      ds.durationId
    ));


      // Build tag arrays AFTER symbolicSystem is available
      const tags = {
        jungian:          normalizeTagStringToArray(jungianArchetypesTags, "jungian"),
        neumann:          normalizeTagStringToArray(neumannStagesTags, "neumann"),
        symbolicSystems:  normalizeTagStringToArray(symbolicSystem, "symbolicSystems"),
      };

      rowsF.push({
        id: `${ds.durationId}__father__${name || hashString(JSON.stringify(f))}__${when}`,
        durationId: ds.durationId,
        when,
        y,
        laneKey: keyForLane,
        color,
        colors,
        name,
        index,
        dob,
        dod,
        location,
        description,
        historicMythicStatusTags,
        foundingFigure,
        jungianArchetypesTags,
        neumannStagesTags,
        category,
        symbolicSystem,
        tags,
      });
    }
  }

  // Clamp to band extent
  const bandExtent = new Map(
    outlines.map((o) => [o.id, { min: Math.min(o.start, o.end), max: Math.max(o.start, o.end) }])
  );
  return rowsF.filter((r) => {
    const e = bandExtent.get(r.durationId);
    return e ? r.when >= e.min && r.when <= e.max : true;
  });
}, [fatherRegistry, outlines]);


  // New: filtered (visible) rows based on selected tags
const visTextRows = useMemo(
  () => (textRows || []).filter(r => itemPassesFilters(r, "text", selectedByGroup)),
  [textRows, selectedByGroup]
);
const visFatherRows = useMemo(
  () => (fatherRows || []).filter(r => itemPassesFilters(r, "father", selectedByGroup)),
  [fatherRows, selectedByGroup]
);

  const textMarks = useMemo(() => (visTextRows || []).map(t => ({
  id: t.id,
  kind: "text",
  bandId: t.durationId,
  when: t.when,
  // visual “size” in band-units (px at k=1) used for separation
  sizeU: textBaseRU(),
  authorKey: t.authorKey || null,
  baseYU: y0(t.y),
  priority: 0,
})), [visTextRows, y0]);

const fatherMarks = useMemo(() => (visFatherRows || []).map(f => ({
  id: f.id,
  kind: "father",
  bandId: f.durationId,
  when: f.when,
  sizeU: getFatherBaseR(f),
  authorKey: null,
  baseYU: y0(f.y), // lock to y computed above (includes jitter)
  priority: (isYesish(f.foundingFigure) ? 2 : 0) + (hasHistoricTag(f.historicMythicStatusTags) ? 1 : 0),
})), [visFatherRows]);

const allMarks = useMemo(() => [...textMarks, ...fatherMarks], [textMarks, fatherMarks]);

// Map: bandId -> Map(authorKey -> laneY_in_band_units_at_k1)
  const authorLaneMap = useMemo(() => {
    const map = new Map();

    // Group texts by band
    const byBand = new Map();
    for (const t of textRows) {
      const arr = byBand.get(t.durationId) || [];
      arr.push(t);
      byBand.set(t.durationId, arr);
    }

    

    // Fast band lookup
    const bandById = new Map(outlines.map(o => [o.id, o]));

    for (const [bandId, items] of byBand.entries()) {
      const band = bandById.get(bandId);
      if (!band) continue;

      // Band height in "band units" (y0 domain where 1 unit = 1px at k=1)
      const bandTopU = y0(band.y);
      const bandBotU = y0(band.y + band.h);
      const bandHeightU = bandBotU - bandTopU;

      // Unique, non-placeholder authors present in this band (deterministic order)
      const authors = Array.from(
        new Set(items.filter(t => t.authorKey).map(t => t.authorKey))
      ).sort();

      if (authors.length === 0) {            // no real authors in this band
        map.set(bandId, new Map());          // still set an empty map
        continue;
      }

      // Even spacing with padding
      const padU = Math.max(1, bandHeightU * 0.08);
      const usableU = Math.max(1, bandHeightU - 2 * padU);
      const n = Math.max(1, authors.length);
      const stepU = n > 1 ? usableU / (n - 1) : 0;

      const lanes = new Map();
      authors.forEach((ak, i) => {
        const yLaneU = n === 1
          ? bandTopU + bandHeightU / 2
          : bandTopU + padU + i * stepU;
        lanes.set(ak, yLaneU);
      });

      map.set(bandId, lanes);
    }

    return map;
  }, [textRows, outlines, y0]);

const { textYMap, fatherYMap } = useMemo(() => {
  // use the *current* transform if present so positions are stable
  const t = lastTransformRef.current ?? d3.zoomIdentity;
  const zx = t.rescaleX(x);
  const k  = t.k ?? 1;

  return layoutMarksByPixels({
    marks: allMarks,
    outlines,
    authorLaneMap,
    x,               // used for binning by current pixel X
    y0,               // your base Y scale (band units @ k=1)
    innerHeight,      // for bounds/padding
  });
}, [allMarks, outlines, authorLaneMap, x, y0, innerHeight]);

function redrawFatherAtRadius(gFather, d, r) {
  const zx = zxRef.current, zy = zyRef.current;
  if (!zx || !zy) return;

  // Screen-space center of this father
  const cx = zx(toAstronomical(d.when));
  let cyU = y0(d.y);

  const yBandMap = fatherYMap.get(d.durationId);
  const assignedU = yBandMap?.get(d.id);
  if (Number.isFinite(assignedU)) cyU = assignedU;

  const cy = zy(cyU);

  // Colored triangle slices
  const cols = (d.colors && d.colors.length) ? d.colors : [d.color || "#666"];
  const triSlices = leftSplitTriangleSlices(cx, cy, r, cols);

  gFather
    .select("g.slices")
    .selectAll("path.slice")
    .data(triSlices, (_, i) => i)
    .join(
      (e) =>
        e
          .append("path")
          .attr("class", "slice")
          .attr("vector-effect", "non-scaling-stroke")
          .attr("shape-rendering", "geometricPrecision"),
      (u) => u,
      (x) => x.remove()
    )
    .attr("fill", (s) => s.fill)
    .attr("d", (s) => s.d);

  // --- White internal overlays (splits + optional vertical "historic" midline)
  const showMid = hasHistoricTag(d.historicMythicStatusTags) && r >= 3;
  const segs = buildOverlaySegments(cx, cy, r, cols, showMid);
  const gOver = gFather.select("g.overlays");
  const w = fatherBorderStrokeWidth(r);

  gOver
    .selectAll("line.overlay")
    .data(segs, (s, i) => `${s.type}-${i}-${s.x1}-${s.y1}-${s.x2}-${s.y2}`)
    .join(
      (e) =>
        e
          .append("line")
          .attr("class", "overlay")
          .attr("stroke", "#ffffff")
          .attr("stroke-linecap", "round")
          .attr("vector-effect", "non-scaling-stroke")
          .attr("shape-rendering", "geometricPrecision")
          .style("pointer-events", "none"),
      (u) => u,
      (x) => x.remove()
    )
    .attr("x1", (s) => s.x1)
    .attr("y1", (s) => s.y1)
    .attr("x2", (s) => s.x2)
    .attr("y2", (s) => s.y2)
    .attr("stroke-width", w);

  // --- Outer triangle border (white halo) – stroke toggled by hover/selection
  const borderPath = `M ${cx - r} ${cy - r} L ${cx - r} ${cy + r} L ${cx + r} ${cy} Z`;

  gOver
    .selectAll("path.father-border")
    .data([0])
    .join(
      (e) =>
        e
          .append("path")
          .attr("class", "father-border")
          .attr("fill", "none")
          .attr("stroke", "none") // default: borderless; events will turn it on
          .attr("vector-effect", "non-scaling-stroke")
          .attr("shape-rendering", "geometricPrecision")
          .style("pointer-events", "none"),
      (u) => u,
      (x) => x.remove()
    )
    .attr("d", borderPath);

  // Cache screen-space cy for tooltip anchor logic
  gFather.attr("data-cy", cy);
}

  

const searchItems = useMemo(() => {
  const texts = (visTextRows || []).map(t => ({
    id: t.id,
    type: "text",
    title: t.title || "",
    textIndex: t.textIndex ?? null,
    index: t.textIndex ?? null,
    subtitle: t.authorName || "",
    category: t.category || t.comteanFramework || "",
    description: t.shortDescription || "",
    color: t.color || (t.colors?.[0]) || "#666",
    colors: t.colors || null,
    when: t.when,
    durationId: t.durationId,
  }));

  const fathers = (visFatherRows || []).map(f => ({
    id: f.id,
    type: "father",
    title: f.name || "",
    index: f.index ?? null,
    subtitle: f.symbolicSystem || "",
    category: f.category || f.historicMythicStatusTags || "",
    description: f.description || "",
    color: f.color || "#666",
    colors: f.colors || null,
    founding: isYesish(f.foundingFigure),
    historic: hasHistoricTag(f.historicMythicStatusTags),
    when: f.when,
    durationId: f.durationId,
  }));

  return [...texts, ...fathers];
}, [visTextRows, visFatherRows]);


// ---- Selection handler for the SearchBar ----
const handleSearchSelect = (item) => {

  const wrapRect = wrapRef.current?.getBoundingClientRect();
  const CARD_W = 360, CARD_H = 320;
  const left = wrapRect ? Math.round((wrapRect.width - CARD_W) / 2) : 24;
  const top  = wrapRect ? Math.max(8, Math.round(72)) : 24;

  d3.select(wrapRef.current).selectAll(".tl-tooltip")
    .style("opacity", 0).style("display", "none");

  if (item.type === "text") {
    const payload = textRows.find((t) => t.id === item.id);
   
    if (payload) {
      setCardPos({ left, top });
      setSelectedText(payload);
      setSelectedFather(null);
      setShowMore(false);
      flyToRef.current?.(payload, "text");
    }
  } else {
    const payload = fatherRows.find((f) => f.id === item.id);
  
    if (payload) {
      setFatherCardPos({ left, top });
      setSelectedFather(payload);
      setSelectedText(null);
      setShowMore(false);
       flyToRef.current?.(payload, "father");
       const ok = !!flyToRef.current;

       
    }
  }
};

const handleConnectionNavigate = (targetType, targetId) => {
  const wrapRect = wrapRef.current?.getBoundingClientRect();
  const CARD_W = 360, CARD_H = 320;
  const left = wrapRect ? Math.round((wrapRect.width - CARD_W) / 2) : 24;
  const top  = wrapRect ? Math.max(8, Math.round(72)) : 24;

  d3.select(wrapRef.current)
    .selectAll(".tl-tooltip")
    .style("opacity", 0)
    .style("display", "none");

  if (targetType === "text") {
    const payload = textRows.find((t) => t.id === targetId);
    if (payload) {
      setCardPos({ left, top });
      setSelectedText(payload);
      setSelectedFather(null);
      setShowMore(false);
      flyToRef.current?.(payload, "text");
    }
  } else if (targetType === "father") {
    const payload = fatherRows.find((f) => f.id === targetId);
    if (payload) {
      setFatherCardPos({ left, top });
      setSelectedFather(payload);
      setSelectedText(null);
      setShowMore(false);
      flyToRef.current?.(payload, "father");
    }
  }
};


const handleSearchInteract = () => {
  // Do NOT close cards when interacting with the search bar.
  // Just clear transient overlays and hide tiny hover tips.
  clearActiveSegmentRef.current?.();
  clearActiveDurationRef.current?.();
  awaitingCloseClickRef.current = false;

  d3.select(wrapRef.current)
    .selectAll(".tl-tooltip")
    .style("opacity", 0)
    .style("display", "none");
};








  // Close overlays (segment/duration) first, then cards (Text/Father). Ignore while search list is open.
useEffect(() => {
  const onKeyDown = (e) => {
    const key = e.key || e.code;
    if (key !== "Escape" && key !== "Esc") return;

    // If the SearchBar results are open, let SearchBar handle ESC
    if (document.body.classList.contains("sb-open")) return;

    // 1) Close segment/duration first (whichever is open)
    if (activeSegIdRef.current || activeDurationIdRef.current) {
      e.preventDefault();
      e.stopPropagation();

      if (activeSegIdRef.current) {
        clearActiveSegmentRef.current?.();
      }
      if (activeDurationIdRef.current) {
        clearActiveDurationRef.current?.();
        awaitingCloseClickRef.current = false;
      }
      return; // stop here so cards stay open on first ESC
    }

    // 2) If no overlay is open, then close the card
    if (selectedText || selectedFather) {
      e.preventDefault();
      e.stopPropagation();
      closeAllAnimated();
    }
  };

  // capture:true helps if something inside stops propagation
  window.addEventListener("keydown", onKeyDown, { capture: true });
  return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
}, [selectedText, selectedFather]);

  // Hide any tooltips the moment a modal opens
  useEffect(() => {
    if (!modalOpen) return;
    const wrapEl = wrapRef.current;
    if (!wrapEl) return;
    d3.select(wrapEl).selectAll(".tl-tooltip").style("opacity", 0).style("display", "none");
  }, [modalOpen]);

function styleForConnection(category, typeA, typeB, rowA, rowB) {
  const cat = String(category || "").trim().toLowerCase();
  const aIsFather = typeA === "father";
  const bIsFather = typeB === "father";

  const bothFathers = aIsFather && bIsFather;
  const bothTexts   = !aIsFather && !bIsFather;
  const mixed       = !bothFathers && !bothTexts; // father–text

  // "Normal" baseline
  let strokeWidth    = 1.4;
  let strokeDasharray = null;
  const strokeLinecap = "round";

  const isFamilial    = cat.includes("familial") || cat.includes("genealogical");
  const isSyncretic   = cat.includes("syncretic");
  const isExplicit    = cat.includes("explicit");
  const isIndirect    = cat.includes("indirect");
  const isComparative = cat.includes("comparative");
  const isSpeculative = cat.includes("speculative");

  if (bothFathers) {
    // father–father
    if (isFamilial) {
      // normal, solid
      strokeWidth    = 1.4;
      strokeDasharray = null;
    } else if (isSyncretic) {
      // normal, solid
      strokeWidth    = 1.4;
      strokeDasharray = null;
    } else {
      // custom / other father–father → clearly dashed
      strokeWidth    = 2.0;
      strokeDasharray = "6 4";
    }
  } else if (mixed) {
    // father–text or text–father
    if (isExplicit) {
      // explicit reference → thin/normal solid
      strokeWidth    = 1.2;
      strokeDasharray = null;
    } else {
      // non-explicit father↔text (your custom connections) → dashed/dotted
      strokeWidth    = 1.2;
      strokeDasharray = "2 4";
    }
  } else if (bothTexts) {
    // text–text
    if (isExplicit) {
      // explicit reference → normal solid
      strokeWidth    = 1.4;
      strokeDasharray = null;
    } else if (isIndirect) {
      // indirect connection → dashed
      strokeWidth    = 1.4;
      strokeDasharray = "6 4";
    } else if (isComparative) {
      // comparative connection → dotted
      strokeWidth    = 1.4;
      strokeDasharray = "1 6";
    } else if (isSpeculative) {
      // medium, dash-dot (unchanged)
      strokeWidth    = 1.6;
      strokeDasharray = "6 3 1.5 3";
    }
  }

  return {
    strokeWidth,
    strokeDasharray,
    strokeLinecap,
  };
}


const CONNECTION_BASE_OPACITY = 0.05;   // faint default
const CONNECTION_HIGHLIGHT_OPACITY = 0.9; // bright when linked


function renderConnections(zx, zy, k) {
  if (!connectionsRef.current) return;

  // Current selection / hover state
  const selText       = selectedText;
  const selFather     = selectedFather;
  const hoveredTextId = hoveredTextIdRef.current;
  const hoveredFatherId = hoveredFatherIdRef.current;

  const hasSelection = !!(selText || selFather);

  // zoom-dependent factors
  const kVal = k ?? 1;
  const isOutest = !hasSelection && kVal < ZOOM_SEGMENT_THRESHOLD;
  const isMiddle = !hasSelection && kVal >= ZOOM_SEGMENT_THRESHOLD && kVal < ZOOM_THRESHOLD;

  // base/highlight per tier, but selection forces "deepest" values
  const baseOpacity =
    hasSelection ? 0.09 :
    isOutest     ? 0.01 :
    isMiddle     ? 0.05 :
                   0.09;

  const highlightOpacity =
    hasSelection ? 0.90 :
    isOutest     ? 0.40 :
    isMiddle     ? 0.70 :
                   0.90;

  const data = allConnectionRowsRef.current || [];
  const g = d3.select(connectionsRef.current);

  const sel = g
    .selectAll("line.connection")
    .data(data, d => d._key);

  sel.exit().remove();

  const enter = sel.enter()
    .append("line")
    .attr("class", "connection")
    .attr("stroke", "#999")
    .attr("stroke-opacity", baseOpacity)
    .attr("fill", "none");

  const merged = enter.merge(sel)
    .style("pointer-events", "none");

  merged
    .attr("x1", d => zx(toAstronomical(d.ax)))
    .attr("y1", d => zy(d.ay))
    .attr("x2", d => zx(toAstronomical(d.bx)))
    .attr("y2", d => zy(d.by))
    .attr("stroke-width", d => d.style.strokeWidth)
    .attr("stroke-dasharray", d => d.style.strokeDasharray || null)
    .attr("stroke-linecap", d => d.style.strokeLinecap || "round")
    .attr("stroke", d => d.color || "#999999")
    .attr("stroke-opacity", d => {
      const touchesSelected =
        (selText && (
          (d.aType === "text"   && d.aId === selText.id) ||
          (d.bType === "text"   && d.bId === selText.id)
        )) ||
        (selFather && (
          (d.aType === "father" && d.aId === selFather.id) ||
          (d.bType === "father" && d.bId === selFather.id)
        ));

      const touchesHovered =
        (hoveredTextId && (
          (d.aType === "text"   && d.aId === hoveredTextId) ||
          (d.bType === "text"   && d.bId === hoveredTextId)
        )) ||
        (hoveredFatherId && (
          (d.aType === "father" && d.aId === hoveredFatherId) ||
          (d.bType === "father" && d.bId === hoveredFatherId)
        ));

      return (touchesSelected || touchesHovered)
        ? highlightOpacity
        : baseOpacity;
    });
}





  useEffect(() => {
  if (!connectionRegistry.length) {
    allConnectionRowsRef.current = [];
    return;
  }

  const out = [];

  // Helper to parse "index,type" like "12, father"
  const parseEndFactory = (mapByIndexFather, mapByIndexText) => (raw, name) => {
    if (!raw) return null;
    const m = String(raw).match(/(\d+)\s*,\s*(\w+)/);
    if (!m) return null;
    const index = Number(m[1]);
    const type = m[2].toLowerCase();

    let row = null;
    if (type === "father") row = mapByIndexFather.get(index);
    else row = mapByIndexText.get(index);

    if (!row) return null;
    return { type, row };
  };

  for (const ds of connectionRegistry) {
    const bandId = ds.durationId;          // e.g. "egyptian-composite"
    if (!bandId) continue;

    // For this band only, build index→row maps
    const mapByIndexFather = new Map();
    const mapByIndexText   = new Map();

    for (const f of fatherRows) {
      if (f.durationId !== bandId) continue;
      if (f.index == null) continue;
      mapByIndexFather.set(Number(f.index), f);
    }
    for (const t of textRows) {
      if (t.durationId !== bandId) continue;
      if (t.textIndex == null) continue;
      mapByIndexText.set(Number(t.textIndex), t);
    }

    const parseEnd = parseEndFactory(mapByIndexFather, mapByIndexText);

    for (const row of ds.connections) {
      const A = parseEnd(row.Primary, row["Primary Name"]);
      const B = parseEnd(row.Secondary, row["Secondary Name"]);
      if (!A || !B) continue;

      const ax = Number(A.row.when ?? NaN);
      const bx = Number(B.row.when ?? NaN);
      if (!Number.isFinite(ax) || !Number.isFinite(bx)) continue;

      const aYmap = A.type === "father" ? fatherYMap : textYMap;
      const bYmap = B.type === "father" ? fatherYMap : textYMap;

      // NOTE: we use bandId (the composite band) for both ends
      const ay = aYmap.get(bandId)?.get(A.row.id);
      const by = bYmap.get(bandId)?.get(B.row.id);
      if (!Number.isFinite(ay) || !Number.isFinite(by)) continue;

      const style = styleForConnection(
        row["Connection Category"],
        A.type,
        B.type,
        A.row,
        B.row
      );

      const color = connectionColorFromRows(A.row, B.row) ?? "#999999";

      const aName =
        A.type === "father"
          ? (A.row.name || "")
          : (A.row.title || "");
      const bName =
        B.type === "father"
          ? (B.row.name || "")
          : (B.row.title || "");

      out.push({
        _key: `${row.Index ?? row.id ?? "conn"}::${A.row.id}::${B.row.id}`,
        ax,
        ay,
        bx,
        by,

        aId: A.row.id,
        aType: A.type,
        aName,
        bId: B.row.id,
        bType: B.type,
        bName,

        style,
        color,
        note: row.Note || "",
        category: row["Connection Category"] ?? "",
      });



        }
      }

  

  allConnectionRowsRef.current = out;

  const t = lastTransformRef.current ?? d3.zoomIdentity;
  renderConnections(t.rescaleX(x), t.rescaleY(y0), t.k);
}, [
  connectionRegistry,
  fatherRows,
  textRows,
  fatherYMap,
  textYMap,
  x,
  y0,
  renderConnections,
]);

  // Re-apply connection styling when selected text/father changes
  useEffect(() => {
    if (!connectionsRef.current) return;
    const t = lastTransformRef.current ?? d3.zoomIdentity;
    renderConnections(t.rescaleX(x), t.rescaleY(y0), t.k);
  }, [selectedText, selectedFather, x, y0, renderConnections]);



  /* ========= Draw/Update ========= */
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    const gRoot = svg.select("g.chart");
    const gAxis = d3.select(axisRef.current);
    const gGrid = d3.select(gridRef.current);
    const gCustom = d3.select(customPolysRef.current); // NEW
    const gOut = d3.select(outlinesRef.current);
    const gSeg = d3.select(segmentsRef.current);
    const gTexts = d3.select(textsRef.current);
    const gFathers = d3.select(fathersRef.current);   // FATHERS: layer
    const gPins = d3.select(pinsRef.current); 

    

    gRoot.attr("transform", `translate(${margin.left},${margin.top})`);

    const axisFor = (scale, ticks) =>
      d3.axisBottom(scale).tickValues(ticks).tickFormat(formatTick);
    const gridFor = (scale, ticks) =>
      d3.axisBottom(scale).tickValues(ticks).tickSize(-innerHeight).tickFormat(() => "");

    // crisp grid lines
    const DPR = window.devicePixelRatio || 1;
    const HALF_DPR_PX = 0.5 / DPR;
    const snapX = (x) => Math.round(x * DPR) / DPR + HALF_DPR_PX;
    function snapGrid(zx) {
      d3.select(gridRef.current)
        .selectAll(".tick")
        .attr("transform", function (d) {
          const x = zx(d);
          const snapped = snapX(x);
          return `translate(${snapped},0)`;
        });
      d3.select(gridRef.current).select(".domain").attr("display", "none");
    }

    // --- INITIAL TRANSFORM (compute BEFORE joins) ---
    const MIN_ZOOM = 1;
    const MAX_ZOOM = 22;



    // ----- Three tooltip DIVs (no author tip now) -----
    const wrapEl = wrapRef.current;
    function makeTip(className) {
      return d3
        .select(wrapEl)
        .selectAll(`div.${className}`)
        .data([0])
        .join("div")
        .attr("class", `tl-tooltip ${className}`)
        .style("position", "absolute")
        .style("pointer-events", "none")
        .style("opacity", 0)
        .style("display", "none")
        .style("transform", "translate3d(0,0,0)");
    }
    const tipText = makeTip("tl-text");
    const tipSeg = makeTip("tl-seg");
    const tipDur = makeTip("tl-duration");

    const hideTipSel = (sel) => sel.style("opacity", 0).style("display", "none");

    // put these right after showSegAnchored/showDurationAnchored/hideTipSel
function clearActiveSegment() {
  if (!activeSegIdRef.current) return;
  activeSegIdRef.current = null;
  hoveredSegIdRef.current = null;
  hoveredSegParentIdRef.current = null;
  awaitingCloseClickSegRef.current = false;
  hideTipSel(tipSeg);
  updateSegmentPreview();
  updateHoverVisuals();
}

function clearActiveDuration() {
  if (!activeDurationIdRef.current) return;
  activeDurationIdRef.current = null;
  awaitingCloseClickRef.current = false;
  hideTipSel(tipDur);
  updateHoverVisuals();
}

// keep these lines you already have:
clearActiveSegmentRef.current = clearActiveSegment;
clearActiveDurationRef.current = clearActiveDuration;


    function showTip(sel, html, clientX, clientY, accent) {
      const wrapRect = wrapEl.getBoundingClientRect();
      sel
        .html(html)
        .style("display", "block")
        .style("opacity", 1)
        .style("--accent", accent || "");

      const node = sel.node();
      const tw = node.offsetWidth;
      const th = node.offsetHeight;
      const pad = 6;

      // center above cursor if possible; otherwise below
      let x = clientX - wrapRect.left - tw / 2;
      let y = clientY - wrapRect.top - th - pad;
      let below = false;
      if (y < 0) {
        y = clientY - wrapRect.top + pad;
        below = true;
      }

      // clamp horizontally
      const maxX = wrapRect.width - tw - 4;
      x = Math.max(4, Math.min(x, maxX));

      sel.style("left", `${x}px`).style("top", `${y}px`).classed("below", below);
    }

    // ===== SEGMENT ANCHORING helpers =====
    function getSegmentAnchorPx(seg) {
      const zx = zxRef.current;
      const zy = zyRef.current;
      if (!zx || !zy) return null;

      const x0 = zx(toAstronomical(seg.start));
      const x1 = zx(toAstronomical(seg.end));
      const yTop = zy(seg.y);
      const hPix = zy(seg.y + seg.h) - zy(seg.y);

      const left = Math.min(x0, x1);
      const right = Math.max(x0, x1);
      const xMid = (left + right) / 2;

      return { left, right, xMid, yTop, hPix };
    }

    function showSegAnchored(seg) {
      const anchor = getSegmentAnchorPx(seg);
      if (!anchor) return;

      const wrapRect = wrapEl.getBoundingClientRect();

      tipSeg
        .html(tipHTML(seg.label || "", fmtRange(seg.start, seg.end), seg.note || ""))
        .style("display", "block")
        .style("opacity", 1)
        .style("--accent", seg.parentColor || "");

      const node = tipSeg.node();
      const tw = node.offsetWidth;
      const th = node.offsetHeight;
      const pad = 8;

      // Prefer below the segment; flip above if it would overflow
      let x = anchor.xMid - tw / 2;
      let y = anchor.yTop + anchor.hPix + pad;
      let below = true;

      if (y + th > wrapRect.height) {
        y = anchor.yTop - th - pad;
        below = false;
      }

      const maxX = wrapRect.width - tw - 4;
      x = Math.max(4, Math.min(x, maxX));

      tipSeg.style("left", `${x}px`).style("top", `${y}px`).classed("below", below);
    }

    // ===== DURATION ANCHORING helpers =====
    function getDurationAnchorPx(outline) {
      const zx = zxRef.current, zy = zyRef.current;
      if (!zx || !zy) return null;

      // Default to the whole outline
      let yTopData = outline.y;
      let hData    = outline.h;

      // For custom groups, use the per-group tip anchor band if provided
      if (outline._isCustomGroup &&
          Number.isFinite(outline._tipAnchorY) &&
          Number.isFinite(outline._tipAnchorH)) {
        yTopData = outline._tipAnchorY;
        hData    = outline._tipAnchorH;
      }

      const x0 = zx(toAstronomical(outline.start));
      const x1 = zx(toAstronomical(outline.end));
      const y0 = zy(yTopData);
      const y1 = zy(yTopData + hData);
      const yTop = Math.min(y0, y1);
      const hPix = Math.abs(y1 - y0);

      const left  = Math.min(x0, x1);
      const right = Math.max(x0, x1);
      const xMid  = (left + right) / 2;

      return { left, right, xMid, yTop, hPix };
    }

    function showDurationAnchored(outline) {
      const anchor = getDurationAnchorPx(outline);
      if (!anchor) return;

      const wrapRect = wrapRef.current.getBoundingClientRect();

      tipDur
        .html(
          tipHTML(
            outline.expandedName || outline.name || "",
            outline.broadLifespan || fmtRange(outline.start, outline.end),
            outline.broadNote || ""
          )
        )
        .style("display", "block")
        .style("opacity", 1)
        .style("--accent", outline.color || "");

      // NEW: set max-width for custom groups if provided
      if (outline._isCustomGroup && Number.isFinite(outline._tipMaxWidth)) {
        tipDur.style("max-width", `${outline._tipMaxWidth}px`);
      } else {
        tipDur.style("max-width", null);
      }

      const node = tipDur.node();
      const tw = node.offsetWidth;
      const th = node.offsetHeight;
      const pad = 8;

      // Default positioning: centered below the *anchoring band*
      let x = anchor.xMid - tw / 2;
      let y = anchor.yTop + anchor.hPix + pad;
      let below = true;

      if (y + th > wrapRect.height) {
        y = anchor.yTop - th - pad;
        below = false;
      }

      const maxX = wrapRect.width - tw - 4;
      x = Math.max(4, Math.min(x, maxX));

      tipDur.style("left", `${x}px`).style("top", `${y}px`).classed("below", below);
    }

    // ===== Label + border visuals (3 states) =====
    function updateHoverVisuals() {
  const activeDurationId = activeDurationIdRef.current;
  const hoveredDurationId = hoveredDurationIdRef.current;

  const hoveredSegParentId = hoveredSegParentIdRef.current;

  const ignoreHoverBecauseActive = !!activeDurationId;

  const k = kRef.current ?? 1;
  const hasSelection = !!(selectedText || selectedFather);

  // 3-level zoom mode, consistent with updateInteractivity
  let zoomMode;
  if (hasSelection) {
    zoomMode = "deepest";
  } else if (k < ZOOM_SEGMENT_THRESHOLD) {
    zoomMode = "outest";   // durations only
  } else if (k < ZOOM_THRESHOLD) {
    zoomMode = "middle";   // segments only
  } else {
    zoomMode = "deepest";  // fathers/texts only
  }

    

  // Fill strengths for duration bands per zoom tier
  let baseFill, hoverFill, activeFill;
  if (zoomMode === "outest") {
    baseFill = 0.20;
    hoverFill = 0.65;
    activeFill = 0.80;
  } else if (zoomMode === "middle") {
    baseFill = 0.05;
    hoverFill = 0.40;
    activeFill = 0.70;
  } else {
    // deepest: no duration chrome at all
    baseFill = 0.0;
    hoverFill = 0.0;
    activeFill = 0.0;
  }

  // Duration fill opacity based ONLY on duration hover/active
  function durFillOpacity(d) {
    if (zoomMode === "deepest") return 0;

    const id = d.id;
    const isActive = id === activeDurationId;
    const isHoverDuration =
      !ignoreHoverBecauseActive && id === hoveredDurationId;

    if (isActive) return activeFill;
    if (isHoverDuration) return hoverFill;
    return baseFill;
  }

  // Rect-based durations
  d3.select(outlinesRef.current)
    .selectAll("rect.outlineRect")
    .style("fill-opacity", (d) => durFillOpacity(d));

  // Custom polygons
  d3.select(customPolysRef.current)
    .selectAll("path.customGroup")
    .style("fill-opacity", (d) => {
      if (d._hiddenCustom) return 0;

      // On middle level, keep custom durations at the base band opacity
      // so they don't pulse when segments are hovered.
      if (zoomMode === "middle") {
        return baseFill;
      }

      // Outest level still uses full hover/active behavior
      return durFillOpacity(d);
    });

  // Labels: can still brighten when a segment in this duration is hovered
  const outlineRoot = d3.select(outlinesRef.current);

  outlineRoot
    .selectAll("text.durationLabel")
    .attr("opacity", (d) => {
      const id = d.id;
      const isActiveFromDuration = id === activeDurationId;
      const isFromHoveredSeg = id === hoveredSegParentId;
      const isHoverDuration =
        !ignoreHoverBecauseActive && id === hoveredDurationId;

      if (isActiveFromDuration || isFromHoveredSeg) {
        return DUR_LABEL_OPACITY.active;
      }
      if (isHoverDuration) {
        return DUR_LABEL_OPACITY.hover;
      }
      return DUR_LABEL_OPACITY.base;
    });

  // NEW: toggle .hover class on durationOutline so CSS can make label crisp white on OUTEST
  outlineRoot
    .selectAll("g.durationOutline")
    .classed("hover", (d) => {
      const id = d.id;
      const isActiveFromDuration = id === activeDurationId;
      const isFromHoveredSeg = id === hoveredSegParentId;
      const isHoverDuration =
        !ignoreHoverBecauseActive && id === hoveredDurationId;

      // Only care about this visual on OUTEST zoom
      if (zoomMode !== "outest") return false;

      // Treat active / hovered-segment / hovered-duration all as "hover" for label styling
      return isActiveFromDuration || isFromHoveredSeg || isHoverDuration;
    });
}


function updateSegmentPreview() {
  const activeId  = activeSegIdRef.current;
  const hoveredId = hoveredSegIdRef.current;

  const k = kRef.current ?? 1;
  const hasSelection = !!(selectedText || selectedFather);

  const inMiddleZoom =
    !hasSelection &&
    k >= ZOOM_SEGMENT_THRESHOLD &&
    k < ZOOM_THRESHOLD;

  // Segment fill strengths (middle zoom only)
  const baseFill   = inMiddleZoom ? 0.10 : 0.0;
  const hoverFill  = inMiddleZoom ? 0.22 : 0.0;
  const activeFill = inMiddleZoom ? 0.32 : 0.0;

  d3.select(segmentsRef.current)
    .selectAll("rect.segmentHit")
    .style("fill-opacity", (d) => {
      if (!inMiddleZoom) return 0;

      // If a segment is "open" (card out), treat it as active
      if (activeId) {
        return d.id === activeId ? activeFill : baseFill;
      }

      // Otherwise, simple hover sensitivity
      if (hoveredId) {
        return d.id === hoveredId ? hoverFill : baseFill;
      }

      return baseFill;
    });
}



function onAnyClickClose(ev) {
  // Helper: did we click a text dot or father triangle?
  const isInteractiveMarkClick = (() => {
    const t = ev.target;
    if (!t || !t.closest) return false;
    // dot itself
    if (t.closest('circle.textDot')) return true;
    // any child of a father mark group
    if (t.closest('g.fatherMark')) return true;
    return false;
  })();

  // --- Segment box one-shot close ---
  if (activeSegIdRef.current && awaitingCloseClickSegRef.current) {
    // Always clear the segment box
    clearActiveSegment();
    awaitingCloseClickSegRef.current = false;

    // If the click was NOT on an interactive mark, swallow it (old behavior)
    // If it WAS on a dot/triangle, let it bubble so the card opens.
    if (!isInteractiveMarkClick) {
      ev.stopPropagation();
    }
    return;
  }

  // --- Duration box one-shot close (unchanged) ---
  if (activeDurationIdRef.current && awaitingCloseClickRef.current) {
    clearActiveDuration();
    ev.stopPropagation();
  }
}


window.addEventListener("click", onAnyClickClose, { capture: true });


    clearActiveSegmentRef.current = clearActiveSegment;
    clearActiveDurationRef.current = clearActiveDuration;


  function setActiveSegment(seg, { showCard = false } = {}) {
  if (!seg) return clearActiveSegment();
  activeSegIdRef.current = seg.id;
  hoveredSegIdRef.current = null;
  hoveredSegParentIdRef.current = seg.parentId;
  updateSegmentPreview();
  if (showCard) {
    showSegAnchored(seg);
    awaitingCloseClickSegRef.current = true; // NEW: arm one-shot close
  } else {
    hideTipSel(tipSeg);
  }
  updateHoverVisuals();
}

function setActiveDuration(outline, { showCard = false } = {}) {
  if (!outline) return clearActiveDuration();
  activeDurationIdRef.current = outline.id;
  if (showCard) {
    showDurationAnchored(outline);
    awaitingCloseClickRef.current = true;  // <— add this line
  }
  updateHoverVisuals();
}


    // Sync hovered duration from pointer while zooming (zoomed-out mode)
    function syncDurationHoverFromPointer(se) {
      const k = kRef.current ?? 1;
      const hasSelection = !!(selectedText || selectedFather);

      // Only track duration hover on OUTEST level and when nothing is selected
      if (!se || !("clientX" in se) || hasSelection || k >= ZOOM_SEGMENT_THRESHOLD) return;

      const el = document.elementFromPoint(se.clientX, se.clientY);
      let newId = null;

      if (el && el.classList) {
        if (el.classList.contains("outlineRect")) {
          // Rect lives inside a <g.durationOutline> that holds the datum
          const d = d3.select(el.parentNode).datum();
          newId = d?.id ?? null;
        } else if (el.classList.contains("customGroup")) {
          // Polygon path has the datum directly bound
          const d = d3.select(el).datum();
          newId = d?.id ?? null;
        }
      }

      if (hoveredDurationIdRef.current !== newId) {
        hoveredDurationIdRef.current = newId;
        updateHoverVisuals();
      }
    }

    // NEW: Sync hovered segment from pointer while zooming (zoomed-in mode)
    function syncSegmentHoverFromPointer(se) {
        const k = kRef.current ?? 1;
        const hasSelection = !!(selectedText || selectedFather);

        // Only track segment hover on MIDDLE level and when nothing is selected
        if (
          !se ||
          !("clientX" in se) ||
          hasSelection ||
          k < ZOOM_SEGMENT_THRESHOLD ||
          k >= ZOOM_THRESHOLD
          ) {
           return;
          }
      const el = document.elementFromPoint(se.clientX, se.clientY);
      let newId = null, newParentId = null;

      if (el && el.classList && el.classList.contains("segmentHit")) {
        const d = d3.select(el).datum();
        newId = d?.id ?? null;
        newParentId = d?.parentId ?? null;
      }

        // NEW: if a different segment is active, ignore hover updates
      if (activeSegIdRef.current && activeSegIdRef.current !== newId) return;

      if (hoveredSegIdRef.current !== newId) {
        hoveredSegIdRef.current = newId;
        hoveredSegParentIdRef.current = newParentId;
        updateSegmentPreview();
        updateHoverVisuals();
      }
    }

    function syncHoverRaf(srcEvt){
  if (!srcEvt || !('clientX' in srcEvt)) return;
  if (hoverRaf.current) return;
  hoverRaf.current = requestAnimationFrame(() => {
    hoverRaf.current = 0;
    if (kRef.current < ZOOM_THRESHOLD) {
      syncDurationHoverFromPointer(srcEvt);
    } else {
      syncSegmentHoverFromPointer(srcEvt);
    }
  });
}

    // OUTLINES (filled, faint stroke)
const outlineSel = gOut
  .selectAll("g.durationOutline")
  .data(outlines, (d) => d.id)
  .join((enter) => {
    const g = enter
      .append("g")
      .attr("class", "durationOutline")
      .attr("data-id", (d) => d.id)
      // flag custom-group durations so CSS can treat their rects differently
      .classed("isCustomGroup", (d) => !!d._isCustomGroup)
      // expose duration color to CSS (used by zoom-outest / zoom-middle rules)
      .style("--dur-color", (d) => d.color || "#999");

  g.append("rect")
    .attr("class", "outlineRect")
     // let CSS decide the actual fill (via currentColor + zoom-level rules)
    .attr("stroke", "none")
    .attr("vector-effect", "non-scaling-stroke")
    .attr("shape-rendering", "geometricPrecision");
    // NOTE: no .attr("fill", ...) here on purpose


    g.append("text")
      .attr("class", "durationLabel")
      .attr("dy", "0.32em")
      .style("dominant-baseline", "middle")
      .attr("fill", (d) => d.color)
      .attr("opacity", DUR_LABEL_OPACITY.base)
      .style("font-weight", 600)
      .style("pointer-events", "none")
      .text((d) => (d._isCustomGroup && d._labelText) ? d._labelText : d.name);

    return g;
  });


    // Hide the rectangle if this is a custom GROUP (polygon handles visuals)
    outlineSel.select("rect.outlineRect")
      .attr("fill-opacity", (d) => (d._isCustomGroup || d._hiddenCustom) ? 0 : 0.1)
      .attr("stroke-opacity", (d) => (d._isCustomGroup || d._hiddenCustom) ? 0 : DUR_STROKE.baseOpacity)
      .style("pointer-events", d => (d._isCustomGroup || d._hiddenCustom) ? "none" : "all");

    // Whole-duration hover/click (zoomed-out only)
    outlineSel.select("rect.outlineRect")
      .on("mouseenter", function (_ev, d) {
        if (kRef.current >= ZOOM_THRESHOLD) return;
        if (activeDurationIdRef.current) return; // ignore hover while a duration is active
        hoveredDurationIdRef.current = d.id;
        updateHoverVisuals();
      })
      .on("mouseleave", function () {
        if (kRef.current >= ZOOM_THRESHOLD) return;
        if (zoomDraggingRef.current) return;
        if (activeDurationIdRef.current) return; // keep active styles
        hoveredDurationIdRef.current = null;
        updateHoverVisuals();
      })
      .on("click", function (ev, d) {
        if (kRef.current >= ZOOM_THRESHOLD) return;

        if (awaitingCloseClickRef.current) {
          awaitingCloseClickRef.current = false;
          clearActiveDuration();
          ev.stopPropagation();
          return;
        }

        clearActiveSegment();
        setActiveDuration(d, { showCard: true });
        awaitingCloseClickRef.current = true;
        ev.stopPropagation();
      });

// CUSTOM GROUP POLYGONS (drawn under labels)
gCustom
  .selectAll("path.customGroup")
  .data(outlines.filter((o) => o._isCustomGroup), (d) => d.id)
  .join(
    (enter) =>
      enter
        .append("path")
        .attr("class", "customGroup")
        // fill uses the same duration color from durations.json
        .attr("fill", (d) => d.color || "#999")
        // no border stroke – hover feedback will be via fill opacity
        .attr("stroke", "none")
        .attr("vector-effect", "non-scaling-stroke")
        .attr("shape-rendering", "geometricPrecision"),
    (update) => update,
    (exit) => exit.remove()
  );

    // Hover/click on the polygon itself (zoomed-out only)
    gCustom.selectAll("path.customGroup")
      .style("pointer-events", "visibleFill")
      .on("mouseenter", function (_ev, d) {
        if (kRef.current >= ZOOM_THRESHOLD) return;
        if (activeDurationIdRef.current) return;
        hoveredDurationIdRef.current = d.id;
        updateHoverVisuals();
      })
      .on("mouseleave", function () {
        if (kRef.current >= ZOOM_THRESHOLD) return;
        if (zoomDraggingRef.current) return;
        if (activeDurationIdRef.current) return;
        hoveredDurationIdRef.current = null;
        updateHoverVisuals();
      })
      .on("click", function (ev, d) {
        if (kRef.current >= ZOOM_THRESHOLD) return;

        if (awaitingCloseClickRef.current) {
          awaitingCloseClickRef.current = false;
          clearActiveDuration();
          ev.stopPropagation();
          return;
        }

        clearActiveSegment();
        setActiveDuration(d, { showCard: true });
        awaitingCloseClickRef.current = true;
        ev.stopPropagation();
      });

    // TEXTS (dots)
    const textSel = gTexts
  .selectAll("circle.textDot")
  .data(visTextRows, (d) => d.id)
  .join(
    (enter) =>
      enter
        .append("circle")
        .attr("class", "textDot")
        // make multi-color dots "painted" for hit-testing
        .attr("fill", (d) =>
          (d.colors && d.colors.length > 1 ? "transparent" : (d.color || "#444"))
        )
        .attr("opacity", BASE_OPACITY)
        .attr("r", TEXT_BASE_R * kRef.current)
        .style("transition", "r 120ms ease")
        // ensure the circle itself receives events (pies keep pointer-events: none)
        .style("pointer-events", "all")
        .style("cursor", "pointer"),
    (update) =>
      update
        .attr("fill", (d) =>
          (d.colors && d.colors.length > 1 ? "transparent" : (d.color || "#444"))
        )
        .style("pointer-events", "all")
        .style("cursor", "pointer"),
    (exit) => exit.remove()
  );


    // Keep draw order stable to reduce flicker
    gTexts.selectAll("circle.textDot")
      .sort((a, b) => (a.when - b.when) || a.durationId.localeCompare(b.durationId));

    // --- PIE SLICES FOR MULTI-COLOR DOTS ---
    function slicesDataFor(d) {
      return (d.colors || []).map((color, i) => ({ color, i, n: d.colors.length, id: d.id }));
    }

const piesSel = gTexts.selectAll("g.dotSlices");

piesSel
  .data(visTextRows.filter(d => (d.colors || []).length > 1), d => d.id)
  .join(
    enter => {
      const g = enter.append("g")
        .attr("class", "dotSlices")
        .style("pointer-events", "none")
        .style("opacity", BASE_OPACITY);

        g.append("g").attr("class", "separators");

      
      g.selectAll("path.slice")
        .data(d => (d.colors || []).map((color, i) => ({ color, i, n: d.colors.length })))
        .join("path")
        .attr("class", "slice")
        .attr("fill", s => s.color);

      return g;
    },
    update => {
      
      update.selectAll("g.separators").data([0]).join("g").attr("class", "separators");
      
      update.selectAll("path.slice")
        .data(d => (d.colors || []).map((color, i) => ({ color, i, n: d.colors.length })))
        .join(
          e => e.append("path").attr("class", "slice").attr("fill", s => s.color),
          u => u.attr("fill", s => s.color),
          x => x.remove()
        );
      return update;
    },
    exit => exit.remove()
  );



    // Keep draw order stable for pies as well
    gTexts
      .selectAll("g.dotSlices")
      .sort((a, b) => (a.when - b.when) || a.durationId.localeCompare(b.durationId));


    const within = (v, a, b) => v >= Math.min(a, b) && v <= Math.max(a, b);

    const findSegForText = (d) => {
      const ids = new Set([d.durationId]);
      const parsed = parseCustomId(d.durationId);
      if (parsed) ids.add(`customgroup-${parsed.groupKey}`);

       // Use placed Y (lane/base) in band-units
    let yU = textYMap.get(d.durationId)?.get(d.id);
    if (!Number.isFinite(yU)) yU = y0(d.y);
      return segments.find(
        (s) =>
          ids.has(s.parentId) &&
          d.when >= s.start &&
          d.when <= s.end &&
          within(yU, s.y, s.y + s.h)
      );
    };

    // Text dots hover/click (zoomed-in only via pointer-events toggle)
    textSel
  .on("mouseenter", function (_ev, d) {
    // mark hovered text for connection highlighting
    hoveredTextIdRef.current = d.id;
    const zx = zxRef.current, zy = zyRef.current, kNow = kRef.current;
    if (zx && zy) renderConnections(zx, zy, kNow);

const k = kRef.current;
const gPie = piesSel.filter((p) => p.id === d.id).style("opacity", 1);
drawTextDot(d3.select(this), gPie, k * HOVER_SCALE_DOT);

// add white border when hovered/selected
d3.select(this)
  .attr("stroke", "#ffffff")
  .attr("stroke-width", 1.4);
        // NEW: derive segment preview from state (no ad-hoc styling)
        const seg = findSegForText(d);
        if (seg) {
          hoveredSegIdRef.current = seg.id;
          hoveredSegParentIdRef.current = seg.parentId;
          updateSegmentPreview();
          updateHoverVisuals();
        }


const titleLine = d.title || "";
const html = tipHTML(titleLine, d.displayDate || formatYear(d.when));
const a = textAnchorClient(this, d);
if (a) showTip(tipText, html, a.x, a.y, d.color);

      })
      .on("mousemove", function (_ev, d) {

const titleLine = d.title || "";
const html = tipHTML(titleLine, d.displayDate || formatYear(d.when));
const a = textAnchorClient(this, d);
if (a) showTip(tipText, html, a.x, a.y, d.color);

      })
.on("mouseleave", function (_ev, d) {
  // clear hovered text highlight
  hoveredTextIdRef.current = null;
  const zx = zxRef.current, zy = zyRef.current, kNow = kRef.current;
  if (zx && zy) renderConnections(zx, zy, kNow);

  const k = kRef.current;
  const isSelected = selectedText && selectedText.id === d.id;
  const gPie = piesSel.filter((p) => p.id === d.id);

  if (isSelected) {
    // keep it in "hover" size + border when selected
    drawTextDot(d3.select(this), gPie, k * HOVER_SCALE_DOT);
    d3.select(this)
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 1.4)
      .attr("opacity", BASE_OPACITY);

    if (!gPie.empty()) {
      gPie.style("opacity", 1);
      drawSlicesAtRadius(gPie, TEXT_BASE_R * k * HOVER_SCALE_DOT);
    }
  } else {
    const rDraw = TEXT_BASE_R * k;
    d3.select(this)
      .attr("r", rDraw)
      .attr("stroke", "none")
      .attr("stroke-width", 0)
      .attr("opacity", BASE_OPACITY);

    if (!gPie.empty()) {
      gPie.style("opacity", BASE_OPACITY);
      drawSlicesAtRadius(gPie, rDraw);
    }
  }

  hideTipSel(tipText);
        // clear preview if it came from this text
        const seg = findSegForText(d);
        if (seg && hoveredSegIdRef.current === seg.id) {
          hoveredSegIdRef.current = null;
          hoveredSegParentIdRef.current = null;
          updateSegmentPreview();
          updateHoverVisuals();
        }
      })
      .on("click", function (ev, d) {
  // Keep any open segment box visible

  const a = textAnchorClient(this, d);
  const wrapRect = wrapRef.current.getBoundingClientRect();
  const CARD_W = 360, CARD_H = 320, PAD = 12;

  let left = a ? a.x - wrapRect.left + PAD : PAD;
  let top  = a ? a.y - wrapRect.top + PAD : PAD;
  left = Math.max(4, Math.min(left, wrapRect.width - CARD_W - 4));
  top  = Math.max(4, Math.min(top, wrapRect.height - CARD_H - 4));

  hideTipSel(tipText);    // OK to hide the tiny hover tip
  // leave tipSeg visible so the segment box stays up
  // hideTipSel(tipDur);   // optional, keep duration card if desired

  setCardPos({ left, top });
  setSelectedText(d);
  setSelectedFather(null);
  setShowMore(false);

  ev.stopPropagation();
})

      .attr("opacity", BASE_OPACITY);

    function textAnchorClient(el, d) {
      const zx = zxRef.current,
        zy = zyRef.current;
      if (!zx || !zy) return null;
      const svgRect = svgRef.current.getBoundingClientRect();

      const cx = zx(toAstronomical(d.when));
      // Fallback must use band-units -> current zoom
      const cyAttr = el ? parseFloat(d3.select(el).attr("cy")) : zy(y0(d.y));

      return {
        x: svgRect.left + margin.left + cx,
        y: svgRect.top + margin.top + cyAttr,
      };
    }

    function fatherAnchorClient(el, d) {
  const zx = zxRef.current, zy = zyRef.current;
  if (!zx || !zy || !el) return null;

  const svgRect = svgRef.current.getBoundingClientRect();
  const cx = zx(toAstronomical(d.when));               // x from data time
  const cyAttr = parseFloat(d3.select(el).attr("data-cy")); // y from apply()

  if (!Number.isFinite(cyAttr)) return null;

  return {
    x: svgRect.left + margin.left + cx,
    y: svgRect.top  + margin.top  + cyAttr,
  };
}




   

    // Data join for fathers
// In fathersSel join (enter)
const fathersSel = gFathers
  .selectAll("g.fatherMark")
  .data(visFatherRows, d => d.id)
  .join(
    enter => {
      const g = enter.append("g")
        .attr("class", "fatherMark")
        .attr("opacity", BASE_OPACITY)
        .style("transition", "opacity 120ms ease");
      g.append("g").attr("class", "slices");    // colored triangles
      g.append("g").attr("class", "overlays");  // ALL white lines live here
      return g;
    },
    update => update,
    exit => exit.remove()
  );


    // Lightweight hover tooltip for fathers (zoomed-in like texts)
fathersSel
  .on("mouseover", function (_ev, d) {
    if (kRef.current < ZOOM_THRESHOLD) return;

    // mark hovered father for connection highlighting
    hoveredFatherIdRef.current = d.id;
    const zx = zxRef.current, zy = zyRef.current, kNow = kRef.current;
    if (zx && zy) renderConnections(zx, zy, kNow);

    const baseR = getFatherBaseR(d) * kRef.current * 2.2;
    const rHover = baseR * HOVER_SCALE_FATHER;

    // redraw at hover size
    redrawFatherAtRadius(d3.select(this), d, rHover);

    // white border on hover (same idea as text dots)
    d3.select(this)
      .select("path.father-border")
      .attr("stroke", "#ffffff")
      .attr("stroke-width", fatherBorderStrokeWidth(rHover));

    // keep your tooltip code (unchanged)...
    const a = fatherAnchorClient(this, d);
    if (!a) return;
    const title = d.name || "";
    const subtitle = d.dob || "";
    showTip(tipText, tipHTML(title, subtitle, null), a.x, a.y, d.color);
  })
  .on("mousemove", function (_ev, d) {
    if (kRef.current < ZOOM_THRESHOLD) return;
    const a = fatherAnchorClient(this, d);
    if (!a) return;
    const title = d.name || "";
    const subtitle = d.dob || "";
    showTip(tipText, tipHTML(title, subtitle, null), a.x, a.y, d.color);
  })
  .on("mouseout", function (_ev, d) {
    // clear hovered father highlight
    hoveredFatherIdRef.current = null;
    const zx = zxRef.current, zy = zyRef.current, kNow = kRef.current;
    if (zx && zy) renderConnections(zx, zy, kNow);

    hideTipSel(tipText);

    const isSelected = selectedFather && selectedFather.id === d.id;
    const baseR = getFatherBaseR(d) * kRef.current * 2.2;
    const r = isSelected ? baseR * HOVER_SCALE_FATHER : baseR;

    // redraw at base or "selected" size
    redrawFatherAtRadius(d3.select(this), d, r);

    // border logic mirrors the dots:
    const border = d3.select(this).select("path.father-border");
    if (isSelected) {
      // keep border when selected
      border
        .attr("stroke", "#ffffff")
        .attr("stroke-width", fatherBorderStrokeWidth(r));
    } else {
      // plain triangle when not hovered and not selected
      border
        .attr("stroke", "none")
        .attr("stroke-width", 0);
    }
  })
  .on("click", function (ev, d) {
  // Keep any open segment box visible
  // Do NOT clear active segment or duration; do NOT close all

  // anchor near the triangle
  const a = fatherAnchorClient(this, d);
  const wrapRect = wrapRef.current.getBoundingClientRect();
  const CARD_W = 360, CARD_H = 320, PAD = 12;

  let left = a ? a.x - wrapRect.left + PAD : PAD;
  let top  = a ? a.y - wrapRect.top + PAD : PAD;
  left = Math.max(4, Math.min(left, wrapRect.width - CARD_W - 4));
  top  = Math.max(4, Math.min(top, wrapRect.height - CARD_H - 4));

  // Only hide the tiny hover tip; leave the segment box (tipSeg) up
  hideTipSel(tipText);
  // hideTipSel(tipSeg);   // <-- do NOT call this
  // hideTipSel(tipDur);   // optional: keep duration card if it’s open

  setFatherCardPos({ left, top });
  setSelectedFather(d);   // open FatherCard
  setSelectedText(null);  // ensure TextCard is closed
  setShowMore(false);

  ev.stopPropagation();
})



    function apply(zx, zy, k = 1) {
  // cache latest rescaled axes for anchored tooltips
  zxRef.current = zx;
  zyRef.current = zy;

  // axis & grid with adaptive ticks
  const ticks = makeAdaptiveTicks(zx);
  gAxis
    .attr("transform", `translate(${margin.left},${margin.top + axisY})`)
    .call(axisFor(zx, ticks));
  gGrid
    .attr("transform", `translate(0,${axisY})`)
    .call(gridFor(zx, ticks));
  snapGrid(zx);

  // outlines rects
  gOut.selectAll("rect.outlineRect").each(function (d) {
    const r = bandRectPx(d, zx, zy);
    d3.select(this)
      .attr("x", r.x)
      .attr("y", r.y)
      .attr("width", r.w)
      .attr("height", r.h);
  });

  // labels (font scales with the band's rendered height)
  gOut.selectAll("g.durationOutline").each(function (d) {
    const g = d3.select(this);

    const x0 = zx(toAstronomical(d.start));
    const x1 = zx(toAstronomical(d.end));

    // Default: place inside the group's full envelope
    let labelYTop = zy(d.y);
    let labelHPix = zy(d.y + d.h) - zy(d.y);

    // For custom GROUPs, use the configured anchor band (if present)
    if (
      d._isCustomGroup &&
      Number.isFinite(d._labelAnchorY) &&
      Number.isFinite(d._labelAnchorH)
    ) {
      labelYTop = zy(d._labelAnchorY);
      labelHPix = zy(d._labelAnchorY + d._labelAnchorH) - zy(d._labelAnchorY);
    }

    const maxByBand = labelHPix * LABEL_FONT_MAX_REL;
    const fontPx = clamp(
      labelHPix * LABEL_TO_BAND,
      LABEL_FONT_MIN,
      Math.min(LABEL_FONT_MAX_ABS, maxByBand)
    );

    const labelSel = g
      .select("text.durationLabel")
      .attr("x", Math.min(x0, x1) + 4)
      .attr("y", labelYTop + labelHPix / 3)
      .style("font-size", `${fontPx}px`)
      .text((d) =>
        d._isCustomGroup && d._labelText ? d._labelText : d.name ?? ""
      );

    // Decide visibility after sizing
    const bandW = Math.abs(x1 - x0);
    const show = shouldShowDurationLabel({
      d,
      k,
      bandW,
      bandH: labelHPix, // important: use the anchor band height for fit checks
      labelSel,
    });
    labelSel.style("display", show ? null : "none");
  });

  // segment hit rects
  gSeg.selectAll("rect.segmentHit").each(function (d) {
    const r = bandRectPx(d, zx, zy);
    d3.select(this)
      .attr("x", r.x)
      .attr("y", r.y)
      .attr("width", r.w)
      .attr("height", r.h);
  });

  // Draw/update custom group polygons (rectilinear envelope, no diagonals)
  gCustom.selectAll("path.customGroup").each(function (o) {
    const intervals = o._groupIntervals || [];

   

    if (!intervals.length) {
      // Fallback: simple rectangle
      const x0 = zx(toAstronomical(o.start));
      const x1 = zx(toAstronomical(o.end));
      const yTop = zy(o.y);
      const hPix = zy(o.y + o.h) - zy(o.y);
      const d = `M ${Math.min(x0, x1)} ${yTop} H ${Math.max(x0, x1)} V ${
        yTop + hPix
      } H ${Math.min(x0, x1)} Z`;
      d3.select(this).attr("d", d);
      return;
    }
    const dPath = groupIntervalsToPath(intervals, zx, zy);
    d3.select(this).attr("d", dPath);
  });

  // === Author-lane layout (stable across zoom) ===
  // Position circles using per-band author lanes
// === Author-lane layout (stable across zoom) ===
// Position circles using per-band author lanes
gTexts.selectAll("circle.textDot").each(function (d) {
  const cx = zx(toAstronomical(d.when));

  let cyU = textYMap.get(d.durationId)?.get(d.id);
  if (!Number.isFinite(cyU)) {
    cyU = y0(d.y);
  }

  const cy = zy(cyU);

  const isSelected = selectedText && selectedText.id === d.id;
  const rBase = TEXT_BASE_R * k;
  const rDraw = isSelected ? rBase * HOVER_SCALE_DOT : rBase;

  const circle = d3.select(this)
    .attr("cx", cx)
    .attr("cy", cy)
    .attr("r", rDraw)
    .attr("stroke", isSelected ? "#ffffff" : "none")
    .attr("stroke-width", isSelected ? 1.4 : 0);

// When there is a selected text, hide its original icon
const shouldHide = !!selectedText &&
  selectedText.id === d.id;

circle.classed("hidden-icon", shouldHide);
});

// Also hide/show the multi-color pie for the selected text when pinned
gTexts
  .selectAll("g.dotSlices")
  .classed(
    "hidden-icon",
    d => !!selectedText && selectedText.id === d.id
  );

// --- Selected TEXT pin (circle-in-pin) ---
const textPinData =
  selectedText ? [selectedText] : [];


const textPinSel = gPins
  .selectAll("g.textPin")
  .data(textPinData, d => d.id);

textPinSel
  .join(
    enter => {
      const g = enter
        .append("g")
        .attr("class", "textPin tl-pin")
        .style("pointer-events", "none");

      // Teardrop body (styled via CSS: .tl-pin path { ... })
      g.append("path")
        .attr("class", "tl-pin-body")
        .attr("vector-effect", "non-scaling-stroke")
        .attr("shape-rendering", "geometricPrecision");

      // Circle icon in the pin head
      g.append("g")
        .attr("class", "tl-pin-icon")
        .style("pointer-events", "none");

      return g;
    },
    update => update,
    exit => exit.remove()
  )
  .each(function (d) {
    const cx = zx(toAstronomical(d.when));

    let cyU = textYMap.get(d.durationId)?.get(d.id);
    if (!Number.isFinite(cyU)) {
      cyU = y0(d.y);
    }
    const cy = zy(cyU);

    const rBase = TEXT_BASE_R * k;
    const rHead = rBase * HOVER_SCALE_DOT; // match enlarged selected dot

    // Robustly derive the same palette the base dot uses
    let cols = Array.isArray(d.colors) && d.colors.length ? d.colors : null;

    if (!cols || !cols.length) {
      // Try symbolic-system info if available on this row
      const symFromRow =
        (d.symbolicSystemTags && String(d.symbolicSystemTags).trim()) ||
        (d.tags &&
          Array.isArray(d.tags.symbolicSystems) &&
          d.tags.symbolicSystems.join(", "));

      if (symFromRow) {
        const guessed = pickSystemColorsCached(symFromRow);
        if (guessed && guessed.length) cols = guessed;
      }
    }

    if (!cols || !cols.length) {
      cols = [d.color || "#666"];
    }

    const pinColor = cols[0];


    const { cxHead, cyHead, R } = computePinHeadGeometry(cx, cy, rHead);
    const rIcon = R * 0.45;

    const g = d3.select(this);

    // Drive CSS pin border color
    g.style("--pin-color", pinColor);

    // Teardrop body path (white fill + colored border via CSS)
    g.select("path.tl-pin-body")
      .attr("d", pinPathD(cx, cy, rHead));

    // Circle icon in the pin head (solid system color)
    // Icon: mini multi-color pie, reusing the same logic as the base dots
    const iconG = g.select("g.tl-pin-icon")
      .attr(
  "transform",
  `translate(${cxHead}, ${cyHead - rIcon * 0.5})`
);

    // Bind a tiny datum with just colors for drawSlicesAtRadius
    iconG.datum({ colors: cols });

    // Ensure we have the slices bound to the palette
iconG.selectAll("path.slice")
  .data((cols || []).map((color, i) => ({ color, i, n: cols.length })))
  .join(
    e => e.append("path")
          .attr("class", "slice"),
    u => u,
    x => x.remove()
  )
  .attr("fill", s => s.color)     // keep attribute for consistency
  .style("fill", s => s.color);   // inline style wins over CSS

    // Now let the shared helper compute the arc geometry for this radius
    drawSlicesAtRadius(iconG, rIcon);
  });



  // Position pies to match circles (same cy rule)
gTexts.selectAll("g.dotSlices").each(function (d) {
  const cx = zx(toAstronomical(d.when));

  let cyU = textYMap.get(d.durationId)?.get(d.id);
  if (!Number.isFinite(cyU)) cyU = y0(d.y);
  const cy = zy(cyU);

  const isSelected = selectedText && selectedText.id === d.id;
  const rBase = TEXT_BASE_R * k;
  const rDraw = isSelected ? rBase * HOVER_SCALE_DOT : rBase;

  const g = d3.select(this);
  g.attr("transform", `translate(${cx},${cy})`)
    .style("opacity", isSelected ? 1 : BASE_OPACITY);

  drawSlicesAtRadius(g, rDraw);
});


  // Fathers (triangles)
 gFathers.selectAll("g.fatherMark").each(function (d) {
  const cx = zx(toAstronomical(d.when));

  let cyU = y0(d.y);
  const yBandMap = fatherYMap.get(d.durationId);
  const assignedU = yBandMap?.get(d.id);
  if (Number.isFinite(assignedU)) cyU = assignedU;
  const cy = zy(cyU);

  d3.select(this).attr("data-cy", cy);

  const cols = d.colors && d.colors.length ? d.colors : [d.color || "#666"];

  const isSelected = selectedFather && selectedFather.id === d.id;
  const rBase = getFatherBaseR(d) * k * 2.2;
  const r = isSelected ? rBase * HOVER_SCALE_FATHER : rBase;

  // 1) Colored triangle slices
  const triSlices = leftSplitTriangleSlices(cx, cy, r, cols);
  d3.select(this)
    .select("g.slices")
    .selectAll("path.slice")
    .data(triSlices, (_, i) => i)
    .join(
      (e) =>
        e
          .append("path")
          .attr("class", "slice")
          .attr("vector-effect", "non-scaling-stroke")
          .attr("shape-rendering", "geometricPrecision"),
      (u) => u,
      (x) => x.remove()
    )
    .attr("d", (s) => s.d)
    .attr("fill", (s) => s.fill);

  // 2) Unified white overlays (splits + optional midline)
  const showMid = hasHistoricTag(d.historicMythicStatusTags) && r >= 3;
  const overlaySegs = buildOverlaySegments(cx, cy, r, cols, showMid);

  // Use a single consistent stroke width based only on radius
  const w = fatherBorderStrokeWidth(r);
  const showOverlays = r >= 3;

  d3.select(this)
    .select("g.overlays")
    .selectAll("line.overlay")
    .data(overlaySegs, (s, i) => `${s.type}:${i}`)
    .join(
      (e) =>
        e
          .append("line")
          .attr("class", "overlay")
          .attr("stroke", "#fff")
          .attr("stroke-linecap", "round")
          .attr("shape-rendering", "geometricPrecision")
          .style("pointer-events", "none"),
      (u) => u,
      (x) => x.remove()
    )
    .attr("x1", (s) => s.x1)
    .attr("y1", (s) => s.y1)
    .attr("x2", (s) => s.x2)
    .attr("y2", (s) => s.y2)
    .attr("stroke-width", w)
    .style("opacity", showOverlays ? 1 : 0);

        // 3) Outer white triangle border (kept in sync with zoom/selection)
    const borderPath = `M ${cx - r} ${cy - r} L ${cx - r} ${cy + r} L ${cx + r} ${cy} Z`;

    const border = d3.select(this)
      .select("g.overlays")
      .selectAll("path.father-border")
      .data([0])
      .join("path")
      .attr("class", "father-border")
      .attr("fill", "none")
      .attr("vector-effect", "non-scaling-stroke")
      .attr("shape-rendering", "geometricPrecision")
      .style("pointer-events", "none");

    border
      .attr("d", borderPath)
      .attr("stroke", isSelected ? "#ffffff" : "none")
      .attr("stroke-width", isSelected ? fatherBorderStrokeWidth(r) : 0);
});

// --- Selected FATHER pin (triangle-in-pin) ---
// Hide the original father icon whenever it is selected
gFathers
  .selectAll("g.fatherMark")
  .classed(
    "hidden-icon",
    d => !!selectedFather && selectedFather.id === d.id
  );

// --- Selected FATHER pin (triangle-in-pin) ---
const fatherPinData =
  selectedFather ? [selectedFather] : [];


const fatherPinSel = gPins
  .selectAll("g.fatherPin")
  .data(fatherPinData, d => d.id);

fatherPinSel
  .join(
    enter => {
      const g = enter
        .append("g")
        .attr("class", "fatherPin tl-pin")
        .style("pointer-events", "none");

      // Teardrop body (styled via CSS)
      g.append("path")
        .attr("class", "tl-pin-body")
        .attr("vector-effect", "non-scaling-stroke")
        .attr("shape-rendering", "geometricPrecision");

      // Triangle icon in the pin head
      g.append("g")
        .attr("class", "tl-pin-icon")
        .style("pointer-events", "none");

      return g;
    },
    update => update,
    exit => exit.remove()
  )
  .each(function (d) {
    const cx = zx(toAstronomical(d.when));

    let cyU = y0(d.y);
    const yBandMap = fatherYMap.get(d.durationId);
    const assignedU = yBandMap?.get(d.id);
    if (Number.isFinite(assignedU)) cyU = assignedU;
    const cy = zy(cyU);

    const baseR = getFatherBaseR(d) * k * 2.2;
    const rHead = baseR * HOVER_SCALE_FATHER;

    // Derive the same palette as the base father icon / markerIcon
    let cols = Array.isArray(d.colors) && d.colors.length ? d.colors : null;

    if (!cols || !cols.length) {
      // Fathers actually carry symbolicSystem + tags in rowsF
      const symFromRow =
        (d.symbolicSystem && String(d.symbolicSystem).trim()) ||
        (d.symbolicSystemTags && String(d.symbolicSystemTags).trim()) ||
        (d.tags &&
          Array.isArray(d.tags.symbolicSystems) &&
          d.tags.symbolicSystems.join(", "));

      if (symFromRow) {
        const guessed = pickSystemColorsCached(symFromRow);
        if (guessed && guessed.length) cols = guessed;
      }
    }

    if (!cols || !cols.length) {
      cols = [d.color || "#666"];
    }

    const pinColor = cols[0];


    const { cxHead, cyHead, R } = computePinHeadGeometry(cx, cy, rHead);
    const rIcon = R * 0.45;

    // Offset the icon a bit if needed:
    const iconCx = cxHead + rIcon * 0.1;              // left/right tweak here
    const iconCy = cyHead - rIcon * 0.5; // move slightly up

    const g = d3.select(this);

    // Border color from symbolic system (CSS uses --pin-color)
    g.style("--pin-color", pinColor);

    // Teardrop body outline
    g.select("path.tl-pin-body")
      .attr("d", pinPathD(cx, cy, rHead));

    // Simple right-pointing triangle in the head
    const iconG = g.select("g.tl-pin-icon");

    // 1) Colored triangle slices, same helper as main fathers but scaled
    const triSlices = leftSplitTriangleSlices(iconCx, iconCy, rIcon, cols);

    iconG.selectAll("path.slice")
      .data(triSlices, (_, i) => i)
      .join(
        e => e.append("path")
              .attr("class", "slice")
              .attr("vector-effect", "non-scaling-stroke")
              .attr("shape-rendering", "geometricPrecision"),
        u => u,
        x => x.remove()
      )
      .attr("d", (s) => s.d)
      .attr("fill", (s) => s.fill)
      .style("fill", (s) => s.fill); 

    // 2) White overlays: split lines + optional historic midline
    const showMid = hasHistoricTag(d.historicMythicStatusTags) && rIcon >= 3;
    const overlaySegs = buildOverlaySegments(iconCx, iconCy, rIcon, cols, showMid);


    const w = fatherBorderStrokeWidth(rIcon);
    const showOverlays = rIcon >= 3;

    iconG.selectAll("line.overlay")
      .data(overlaySegs, (s, i) => `${s.type}:${i}`)
      .join(
        e => e
          .append("line")
          .attr("class", "overlay")
          .attr("stroke", "#fff")
          .attr("stroke-linecap", "round")
          .attr("shape-rendering", "geometricPrecision")
          .style("pointer-events", "none"),
        u => u,
        x => x.remove()
      )
      .attr("x1", (s) => s.x1)
      .attr("y1", (s) => s.y1)
      .attr("x2", (s) => s.x2)
      .attr("y2", (s) => s.y2)
      .attr("stroke-width", showOverlays ? w : 0)
      .attr("opacity", showOverlays ? 0.9 : 0);
  });



  // ----- Lightweight viewport culling (texts, pies, fathers) -----
  const xMinAstro = zx.invert(0);
  const xMaxAstro = zx.invert(innerWidth);
  const xLo = Math.min(xMinAstro, xMaxAstro);
  const xHi = Math.max(xMinAstro, xMaxAstro);

  // Hide text dots outside visible X
  gTexts.selectAll("circle.textDot").each(function (d) {
    const a = toAstronomical(d.when);
    const on = a >= xLo && a <= xHi;
    d3.select(this).style("display", on ? null : "none");
  });

  // Keep pies in sync with dots
  gTexts.selectAll("g.dotSlices").each(function (d) {
    const a = toAstronomical(d.when);
    const on = a >= xLo && a <= xHi;
    d3.select(this).style("display", on ? null : "none");
  });

  // Hide father triangles outside visible X
  gFathers.selectAll("g.fatherMark").each(function (d) {
    const a = toAstronomical(d.when);
    const on = a >= xLo && a <= xHi;
    d3.select(this).style("display", on ? null : "none");
  });

  // ===== NEW: compute & publish visible ids for SearchBar =====
  const newVisible = new Set();

  // Use the same X-range check we just applied
  gTexts.selectAll("circle.textDot").each(function (d) {
    const a = toAstronomical(d.when);
    if (a >= xLo && a <= xHi) newVisible.add(d.id);
  });
  gFathers.selectAll("g.fatherMark").each(function (d) {
    const a = toAstronomical(d.when);
    if (a >= xLo && a <= xHi) newVisible.add(d.id);
  });

  // Only update state if the set contents actually changed (throttled to rAF)
  const prev = visibleIdsRef.current;
  let changed = newVisible.size !== prev.size;
  if (!changed) {
    for (const id of newVisible) {
      if (!prev.has(id)) { changed = true; break; }
    }
  }
  if (changed) {
    visibleIdsRef.current = newVisible;
    if (!visUpdateRaf.current) {
      visUpdateRaf.current = requestAnimationFrame(() => {
        visUpdateRaf.current = 0;
        setVisibleIds(new Set(visibleIdsRef.current));
      });
    }
  }

  renderConnections(zx, zy, k);
}

function updateInteractivity(k) {
  const hasSelection = !!(selectedText || selectedFather);

  // 3-level zoom mode, with selection forcing "deepest" semantics
  let zoomMode;
  if (hasSelection) {
    zoomMode = "deepest";
  } else if (k < ZOOM_SEGMENT_THRESHOLD) {
    zoomMode = "outest";   // durations only
  } else if (k < ZOOM_THRESHOLD) {
    zoomMode = "middle";   // segments only
  } else {
    zoomMode = "deepest";  // fathers/texts only
  }

  const svgSel = d3.select(svgRef.current);
  svgSel
    // zoom tier classes for CSS
    .classed("zoom-outest",  zoomMode === "outest")
    .classed("zoom-middle",  zoomMode === "middle")
    .classed("zoom-deepest", zoomMode === "deepest")
    // generic flags
    .classed("zoomed-in",    zoomMode !== "outest")
    .classed("has-selection", hasSelection);

      console.log("[UI] updateInteractivity", {
    k,
    hasSelection,
    zoomMode,
    svgClass: svgSel.attr("class"),
  });

  // === Selection override: once a text/father is selected,
  //     durations/segments become inert; texts/fathers stay clickable
  if (hasSelection) {
    gOut.selectAll("rect.outlineRect")
      .style("pointer-events", "none");
    gSeg.selectAll("rect.segmentHit")
      .style("pointer-events", "none");
    gCustom.selectAll("path.customGroup")
      .style("pointer-events", "none");

    gTexts.selectAll("circle.textDot")
      .style("pointer-events", "all");
    gFathers.selectAll("g.fatherMark")
      .style("pointer-events", "all");

    // No active duration/segment boxes while something is selected
    clearActiveSegment();
    clearActiveDuration();
    updateHoverVisuals();
    return;
  }

  // === No selection: pure 3-level model ===
  if (zoomMode === "outest") {
    // OUTEST: durations hot, everything else inert
    gOut.selectAll("rect.outlineRect")
      .style("pointer-events", d =>
        (d._isCustomGroup || d._hiddenCustom) ?
          "none" :
          "all"
      );
    gSeg.selectAll("rect.segmentHit")
      .style("pointer-events", "none");
    gTexts.selectAll("circle.textDot")
      .style("pointer-events", "none");
    gFathers.selectAll("g.fatherMark")
      .style("pointer-events", "none");
    gCustom.selectAll("path.customGroup")
      .style("pointer-events", d =>
        d._hiddenCustom ? "none" : "all"
      );

    // Durations are allowed to stay active; segments cannot be
    clearActiveSegment();

  } else if (zoomMode === "middle") {
    // MIDDLE: segments hot, durations/nodes inert
    gOut.selectAll("rect.outlineRect")
      .style("pointer-events", "none");
    gSeg.selectAll("rect.segmentHit")
      .style("pointer-events", "all");
    gTexts.selectAll("circle.textDot")
      .style("pointer-events", "none");
    gFathers.selectAll("g.fatherMark")
      .style("pointer-events", "none");
    gCustom.selectAll("path.customGroup")
      .style("pointer-events", "none");

    // Only segments should be active at this level
    clearActiveDuration();

  } else {
    // DEEPEST: fathers/texts hot, durations/segments inert
    gOut.selectAll("rect.outlineRect")
      .style("pointer-events", "none");
    gSeg.selectAll("rect.segmentHit")
      .style("pointer-events", "none");
    gTexts.selectAll("circle.textDot")
      .style("pointer-events", "all");
    gFathers.selectAll("g.fatherMark")
      .style("pointer-events", "all");
    gCustom.selectAll("path.customGroup")
      .style("pointer-events", "none");

    // No lingering duration/segment selections at deepest level
    clearActiveDuration();
    clearActiveSegment();
  }

  // Ensure segment fills match current zoom tier + hover/active state
  updateSegmentPreview();
  updateHoverVisuals();
}


    // Build segmentHit rects (with CLICK-to-open behavior)
gSeg
  .selectAll("rect.segmentHit")
  .data(segments, (d) => d.id)
  .join((enter) =>
    enter
      .append("rect")
      .attr("class", "segmentHit")
      // actual fill is controlled in CSS via --seg-color and zoom-* classes
      .attr("fill", "transparent")
      .attr("pointer-events", "all")
      // border is always white; “block color” is the fill
      .attr("stroke", "#ffffff")
      .attr("stroke-opacity", 0.02)
      .attr("stroke-width", 1.5)
      .attr("vector-effect", "non-scaling-stroke")
      .attr("shape-rendering", "geometricPrecision")
      // expose segment color for CSS (middle zoom level)
      .style("--seg-color", (d) => d.parentColor || "#999")
      .style("transition", "stroke-opacity 140ms ease, stroke-width 140ms ease")
      // HOVER: centralized preview + label brightening
      .on("mouseenter", function (_ev, seg) {
        // NEW: if *any* segment is active and it's not THIS one, ignore hover
        if (activeSegIdRef.current && activeSegIdRef.current !== seg.id) return;

        if (activeSegIdRef.current === seg.id) return;
        hoveredSegIdRef.current = seg.id;
        hoveredSegParentIdRef.current = seg.parentId;
        updateSegmentPreview();
        updateHoverVisuals();
      })
      .on("mouseleave", function (_ev, seg) {
        // NEW: if some *other* segment is active, keep ignoring
        if (activeSegIdRef.current && activeSegIdRef.current !== seg.id) return;

        if (activeSegIdRef.current === seg.id) return;
        hoveredSegIdRef.current = null;
        hoveredSegParentIdRef.current = null;
        updateSegmentPreview();
        updateHoverVisuals();
      })
      .on("click", function (_ev, seg) {
        const isSame = activeSegIdRef.current === seg.id;
        if (isSame) {
          clearActiveSegment();
          return;
        }
        clearActiveSegment();
        clearActiveDuration();
        setActiveSegment(seg, { showCard: true });
      })
  );


      // Helper: compute author-lane Y (in "band units" = px at k=1) for a text
function laneYUForText(d) {
  // default to original hashed Y if no author lane
  let yU = y0(d.y);
  if (d.authorKey) {
    const lanes = authorLaneMap.get(d.durationId);
    const laneU = lanes?.get(d.authorKey);
    if (Number.isFinite(laneU)) yU = laneU;
  }
  return yU;
}

// Helper: compute father Y (in "band units") using fatherYMap bin-aware jitter
function laneYUForFather(d) {
  let yU = y0(d.y);
  const yBandMap = fatherYMap.get(d.durationId);
  const assignedU = yBandMap?.get(d.id);
  if (Number.isFinite(assignedU)) yU = assignedU;
  return yU;
}

// Compute a zoom transform that places (xData, yU) at desired screen fractions
function computeTransformForPoint(xDataAstro, yU, kTarget) {
  // base k=1 pixel positions (inner chart space)
  const px0 = x(xDataAstro);   // x: astro -> px
  const py0 = y0(yU);          // y0: band units -> px



  const desiredX = innerWidth  * SEARCH_FLY.xFrac;
  const desiredY = innerHeight * SEARCH_FLY.yFrac;

  const tx = desiredX - kTarget * px0;
  const ty = desiredY - kTarget * py0;

 

  return d3.zoomIdentity.translate(tx, ty).scale(kTarget);
}


// set up zoom (clamped to the data rectangle)
// data-space bounds (astro years on X, band-units (px@k=1) on Y)
const XMIN = domainAstro[0]; // toAstronomical(-5500)
const XMAX = domainAstro[1]; // toAstronomical(2500)

// on-screen ranges at k = 1
const rangeX0 = x(XMIN);      // 0
const rangeX1 = x(XMAX);      // innerWidth
const rangeY0 = 0;
const rangeY1 = innerHeight;

// Track where a potential drag gesture started (screen coords)
let dragStartX = null;
let dragStartY = null;
// Squared pixel threshold before we treat it as a drag (≈2px)
const DRAG_THRESHOLD_SQ = 4;


const zoom = (zoomRef.current ?? d3.zoom())
  .scaleExtent([MIN_ZOOM, MAX_ZOOM])
  .translateExtent([[rangeX0, rangeY0], [rangeX1, rangeY1]]) // hard clamp
  .extent([[0, 0], [innerWidth, innerHeight]])
    .filter((event) => {
    // Never zoom on double-click
    if (event.type === "dblclick") return false;

    const t = event.target;
    if (!t || !t.closest) return true;

    // If the event started on an interactive mark (text dot or father),
    // we want clicks, but NOT drag-panning.
    const onText = t.closest("circle.textDot");
    const onFather = t.closest("g.fatherMark");
    const onMark = onText || onFather;

    if (onMark) {
      // Allow wheel zoom over marks, but block drag/pan starting on them
      return event.type === "wheel";
    }

    // Everything else (background, durations, segments, etc.) behaves normally
    return true;
  })


    .on("start", (event) => {
    const srcType = event.sourceEvent?.type;
    const isWheel = srcType === "wheel";

    // On gesture start, we do NOT yet assume this is a drag.
    // We only flip to "dragging" after we see enough pointer movement in the zoom handler.
    zoomDraggingRef.current = false;

    // Remember where the pointer was when this gesture began (for non-wheel only)
    if (!isWheel && event.sourceEvent && "clientX" in event.sourceEvent) {
      dragStartX = event.sourceEvent.clientX;
      dragStartY = event.sourceEvent.clientY;
    } else {
      dragStartX = null;
      dragStartY = null;
    }

    // hard-reset any stale segment preview at gesture start
    hoveredSegIdRef.current = null;
    hoveredSegParentIdRef.current = null;
    updateSegmentPreview();
    updateHoverVisuals();

    // throttle hover sync to RAF
    syncHoverRaf(event.sourceEvent);
  })

  .on("zoom", (event) => {
    const t = event.transform;
    lastTransformRef.current = t;
    kRef.current = t.k;

    // Decide whether this zoom event corresponds to a real drag-pan
    const srcType = event.sourceEvent?.type;
    const isWheel = srcType === "wheel";

    if (!isWheel && event.sourceEvent && "clientX" in event.sourceEvent) {
      // If we haven't yet decided it's a drag, check how far we've moved
      if (!zoomDraggingRef.current && dragStartX != null && dragStartY != null) {
        const dx = event.sourceEvent.clientX - dragStartX;
        const dy = event.sourceEvent.clientY - dragStartY;
        const distSq = dx * dx + dy * dy;

        if (distSq > DRAG_THRESHOLD_SQ) {
          zoomDraggingRef.current = true;

          if (svgRef.current) {
            d3.select(svgRef.current).classed("is-panning", true);
          }
        }
      }
    }

    const zx = t.rescaleX(x);
    const zy = t.rescaleY(y0);
    apply(zx, zy, t.k);
    renderConnections(zx, zy, t.k);
    updateInteractivity(t.k);

    console.log("[ZOOM] zoom handler", {
      k: t.k,
      hasSelection: !!(selectedText || selectedFather),
    });

    // === Zoom-level “mode” classes for CSS (outest / middle / deepest) ===
    const hasSelection = !!(selectedText || selectedFather);


    let zoomMode;
    if (hasSelection) {
      // Selection overrides: treat as deepest for styling
      zoomMode = "deepest";
    } else if (t.k < ZOOM_SEGMENT_THRESHOLD) {
      zoomMode = "outest";   // durations focus
    } else if (t.k < ZOOM_THRESHOLD) {
      zoomMode = "middle";   // segments focus
    } else {
      zoomMode = "deepest";  // fathers/texts focus
    }

    const svgNode = svgRef.current;
    if (svgNode) {
      const svgSel = d3.select(svgNode);
      svgSel
        .classed("zoom-outest",  zoomMode === "outest")
        .classed("zoom-middle",  zoomMode === "middle")
        .classed("zoom-deepest", zoomMode === "deepest");
    }

    // throttle hover sync to RAF (duration vs segment based on zoom)
    syncHoverRaf(event.sourceEvent);

    // Keep active cards anchored while panning/zooming
    if (activeSegIdRef.current) {
      const seg = segments.find((s) => s.id === activeSegIdRef.current);
      if (seg) showSegAnchored(seg);
    }
    if (activeDurationIdRef.current) {
      const out = outlines.find((o) => o.id === activeDurationIdRef.current);
      if (out) showDurationAnchored(out);
    }

    // Threshold handoff logic
    const zoomedIn = t.k >= ZOOM_THRESHOLD;
    const wasZoomedIn = prevZoomedInRef.current;

    if (zoomedIn && !wasZoomedIn) {
      hoveredDurationIdRef.current = null;
      awaitingCloseClickRef.current = false; // reset one-shot close
      clearActiveDuration();                  // hide duration card when zooming in
      updateHoverVisuals();
    }

    if (!zoomedIn && wasZoomedIn) {
      clearActiveSegment();
      updateHoverVisuals();
    }

    prevZoomedInRef.current = zoomedIn;
  })

  .on("end", (event) => {
    // Always clear dragging state
    zoomDraggingRef.current = false;

    // Remove grabbing cursor if it was set
    if (svgRef.current) {
      d3.select(svgRef.current).classed("is-panning", false);
    }

    // final hover sync after gesture settles (throttled to RAF)
    syncHoverRaf(event.sourceEvent);

    updateHoverVisuals();
    logRenderedCounts();
  });

  // Bind zoom to the <svg> and expose refs/utilities
const svgSel = svgSelRef.current ?? d3.select(svgRef.current);
zoomRef.current = zoom;
svgSelRef.current = svgSel;

function onPointerMove(e){
  if (!e || !('clientX' in e)) return;
  // If a drag gesture is active, zoom's handlers already drive hover sync.
  if (zoomDraggingRef.current) return;
  syncHoverRaf(e);
}
svgSel.on("pointermove.tl-hover", onPointerMove);

// Public fly-to callback used by SearchBar & dev helper
flyToRef.current = function flyToDatum(d, type /* "text" | "father" */) {
  if (!zoomRef.current || !svgSelRef.current || !d) return;

  const kTarget = SEARCH_FLY.k;
  const xAstro  = toAstronomical(d.when);

  // Use the same lane logic you already defined
  const yU = (type === "father") ? laneYUForFather(d) : laneYUForText(d);

  const t = computeTransformForPoint(xAstro, yU, kTarget);

  svgSelRef.current
    .transition()
    .duration(SEARCH_FLY.duration)
    .ease(SEARCH_FLY.ease)
    .call(zoomRef.current.transform, t)
    .on("end", () => {
      lastTransformRef.current = t;
      kRef.current = t.k;
    });
};


 // Dev helper: try window.flyToTest(id) from DevTools
window.flyToTest = (id) => {
  const t = textRows.find(x => x.id === id);
  if (t) { flyToRef.current?.(t, "text"); return; }
  const f = fatherRows.find(x => x.id === id);
  if (f) { flyToRef.current?.(f, "father"); return; }
  // no logs; silently no-op
};

   if (!didInitRef.current) {
   // First time only: bind zoom and set init transform
  const initT = d3.zoomIdentity; // translate(0,0).scale(1)


   apply(initT.rescaleX(x), initT.rescaleY(y0), initT.k);
   svgSel.call(zoom).call(zoom.transform, initT);
   updateInteractivity(initT.k);
   lastTransformRef.current = initT;   // remember
   didInitRef.current = true;
} else {
  // Subsequent runs: DO NOT reset transform.
  // Re-apply the last transform to current scales for a seamless update.
  const t = lastTransformRef.current ?? d3.zoomIdentity;
  kRef.current = t.k;  // make sure hover logic sees the current zoom
  apply(t.rescaleX(x), t.rescaleY(y0), t.k);
  updateInteractivity(t.k);

  console.log("[UI] reapply transform after state change", {
    tK: t.k,
    hasSelection: !!(selectedText || selectedFather),
  });

  logRenderedCounts();
}

    // Hide tooltips if mouse leaves the whole svg area
    svgSel.on("mouseleave.tl-tip", () => {
      hideTipSel(tipText);
      // do not clear active segment/duration on leave; cards stay until click-away/zoom-in
    });

    

    return () => {
        svgSel.on("mouseleave.tl-tip", null);
        svgSel.on("click.clearActive", null);
        svgSel.on("pointermove.tl-hover", null);

        window.removeEventListener("click", onAnyClickClose, true);
    };
}, [
  outlines,
  segments,
  textRows,
  fatherRows,        // FATHERS: ensure updates
  selectedText,
  selectedFather,
  width,
  height,
  innerWidth,
  innerHeight,
  axisY,
  margin.left,
  margin.top,
  x,
  y0,
]);


  const textConnectionsForCard = selectedText
    ? buildTextConnectionItems(
        selectedText,
        allConnectionRowsRef.current || []
      )
    : [];

  const fatherConnectionsForCard = selectedFather
    ? buildFatherConnectionItems(
        selectedFather,
        allConnectionRowsRef.current || []
      )
    : [];


return (
  <div
    ref={wrapRef}
    className="timelineWrap"
    style={{ width: "100%", height: "100%", position: "relative" }}
  >
    {/* Search stays as-is */}
    <SearchBar
      items={searchItems}
      onSelect={handleSearchSelect}
      placeholder="Search"
      onInteract={handleSearchInteract}
    />

    {/* NEW: Tag filter panel (absolute, top-right; lives inside the wrapper so it overlays the SVG) */}
    <TagPanel
      groups={TAG_GROUPS}
      selectedByGroup={selectedByGroup}
      onChange={setSelectedByGroup}
    />

    <svg
      ref={svgRef}
      className={`timelineSvg ${modalOpen ? "isModalOpen" : ""}`}
      width={width}
      height={height}
    >
      {/* 1) Clip path for the charting viewport (instance-safe) */}
      <defs>
        <clipPath id={`${clipId}-clip`} clipPathUnits="userSpaceOnUse">
          {/* coordinates are in the translated chart's local space */}
          <rect x="0" y="0" width={innerWidth} height={innerHeight} />
        </clipPath>
      </defs>

      {/* 2) Apply clipPath to the chart group */}
<g
  className="chart"
  transform={`translate(${margin.left},${margin.top})`}
  clipPath={`url(#${clipId}-clip)`}
>
<g ref={gridRef} className="grid" />
<g ref={customPolysRef} className="customPolys" />
<g ref={outlinesRef} className="durations" />
<g ref={segmentsRef} className="segments" />

{/* lines BELOW nodes */}
<g ref={connectionsRef} className="connections" />

{/* nodes on top */}
<g ref={fathersRef} className="fathers" />
<g ref={textsRef} className="texts" />

{/* pins ABOVE all nodes */}
<g ref={pinsRef} className="pins" />
</g>


      {/* 3) Underfill band beneath the bottom timeline axis (outside clip so it stays visible) */}
      <rect
        className="axisUnderfill"
        x={0}
        y={margin.top + axisY}
        width={width}
        height={margin.bottom}
        rx={0}
      />

      {/* Axis is outside the clipped region so it always sits on top */}
      <g ref={axisRef} className="axis" />
    </svg>

    {/* Backdrop for modal; closes on click */}
    {modalOpen && <div className="modalBackdrop" onClick={closeAllAnimated} />}

    {/* Text modal */}
    {selectedText && (
      <TextCard
        d={selectedText}
        left={cardPos.left}
        top={cardPos.top}
        showMore={showMore}
        setShowMore={setShowMore}
        connections={textConnectionsForCard}
        onNavigate={handleConnectionNavigate}
        onClose={() => {
          setSelectedText(null);
          setShowMore(false);
        }}
      />
    )}

    {selectedFather && (
      <FatherCard
        d={selectedFather}
        left={fatherCardPos.left}
        top={fatherCardPos.top}
        showMore={showMore}
        setShowMore={setShowMore}
        connections={fatherConnectionsForCard}
        onNavigate={handleConnectionNavigate}
        onClose={() => {
          setSelectedFather(null);
          setShowMore(false);
        }}
      />
    )}

  </div>
);



}