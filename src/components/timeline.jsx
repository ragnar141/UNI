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
  Iranian: "#1C39BB",
  Indian:        "#2F2A6D", // Deep Indigo — cosmic depth, cyclic time (base canon)
  Vedic:         "#8C1D18", // Sacrificial Maroon — fire, soma, blood, ritual gravity
  Brahmanical:   "#5A3E1B", // Codex Umber — law, dharma, social ordering
  Upaniṣadic:    "#4B3F72", // Smoked Amethyst — interiority, negation, metaphysics
  Śramaṇa:       "#7A7A7A", // Ash Grey — renunciation, wandering, anti-ritual
  Buddhist:      "#D8A23A", // Muted Gold — middle path, illumination without royalty
  Tamil:         "#1E4F3A", // Deep Teal-Green — Sangam earth, landscape poetics
  Purāṇic:       "#9C1F3B", // Mythic Crimson — narrative, devotion, cosmology
  Yogic:         "#2E6F95", // Breath Blue — discipline, inward ascent, control
  Sāṃkhya:       "#3D3A2A",  // Dualist Olive-Brown — prakṛti / puruṣa tension
  "Shang–Zhou": "#6B5B3E",   // Ritual Bronze-Earth — bronze vessels, ancestral order
  Daoism:       "#2F7D6A",   // Mist-Green — mountain/river naturalness
  Confucianism: "#2B4C7E",   // Scholar Ink-Blue — ethics, learning, administration
  "Bingjia (military strategy)":      "#3A4A5A",   // Gunmetal — disciplined strategy
  "Fa-jia (Legalism)":     "#2E2E38",   // Iron Graphite — impersonal law, coercive bureaucracy
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

const DIM_NODE_OPACITY = 0.12;            // texts/fathers that are NOT relevant during selection
const DIM_CONNECTION_OPACITY = 0.015;     // irrelevant connections when showConnections is ON

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const CIV_TEXT_SCALE = 1.6; // tweak to taste

function hasCivilizationalCodeYes(d) {
  // supports either the raw CSV-ish key or a normalized field if you later add one
  return isYesish(
    getLooseField(d, "Civlizational code?") ||
    getLooseField(d, "Civilizational code?") ||
    d.civilizationalCode
  );
}

function textBaseR(d) {
  return TEXT_BASE_R * (hasCivilizationalCodeYes(d) ? CIV_TEXT_SCALE : 1);
}


// New: boundary between “outest” (duration-only) and “middle” (segment) zoom
const ZOOM_SEGMENT_THRESHOLD = 2.0;

/* --- Opacity/width levels for duration label + border --- */
const DUR_LABEL_OPACITY = { base: 0.7, hover: 1, active: 1 };
const DUR_STROKE = {
  baseOpacity: 0.03, hoverOpacity: 0.45, activeOpacity: 0.9,
  baseWidth: 0.5,    hoverWidth: 2.0,    activeWidth: 2.5,
};

/* ===== Label visibility policy ===== */
const LABEL_ALLOWLIST = new Set([
  "egyptian-composite", "mesopotamian-composite", "anatolian-composite", "levantine-composite", "persian-composite", 
  "greek-composite", "carthaginian-composite", "customgroup-hellenistic", "indian-composite", "chinese-composite"
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
     ? (TEXT_BASE_R * (hasCivilizationalCodeYes(m) ? CIV_TEXT_SCALE : 1)) // your base dot radius in px at k=1
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

function hasConceptTag(tags) {
  return String(tags || "")
    .toLowerCase()
    .split(",")
    .map(s => s.trim())
    .includes("concept");
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

// ---- Connection line colors: duration color (same band) or mean (cross-band) ----

function _hexToRgb(hex) {
  const s = String(hex || "").trim();
  if (!s) return null;

  // support #RGB and #RRGGBB
  const h = s.startsWith("#") ? s.slice(1) : s;
  const full =
    h.length === 3
      ? h.split("").map((ch) => ch + ch).join("")
      : h;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;

  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function _rgbToHex({ r, g, b }) {
  const toHex = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return "#" + toHex(r) + toHex(g) + toHex(b);
}

function _meanHex(a, b) {
  const A = _hexToRgb(a);
  const B = _hexToRgb(b);
  if (!A && !B) return null;
  if (!A) return b;
  if (!B) return a;
  return _rgbToHex({
    r: (A.r + B.r) / 2,
    g: (A.g + B.g) / 2,
    b: (A.b + B.b) / 2,
  });
}

// expects composite ids like "custom-hellenistic-greek-composite"
function connectionColorFromBandIds(bandA, bandB, outlines) {
  const a = outlines?.find((o) => o.id === bandA)?.color;
  const b = outlines?.find((o) => o.id === bandB)?.color;

  if (!a && !b) return "#999999";
  if (bandA === bandB) return a || b || "#999999";
  return _meanHex(a, b) || "#999999";
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

function splitSquareSlices(cx, cy, r, colors) {
  const palette = (colors || []).filter(Boolean);
  const n = Math.max(1, palette.length);

  const xL = cx - r, xR = cx + r;
  const yT = cy - r, yB = cy + r;

  // Single color → one full square
  if (n === 1) {
    return [{
      d: `M ${xL} ${yT} H ${xR} V ${yB} H ${xL} Z`,
      fill: palette[0] || "#666"
    }];
  }

// N colors → N horizontal blocks (top→bottom)
const h = (yB - yT) / n;
const out = [];
for (let i = 0; i < n; i++) {
  const ya = yT + i * h;
  const yb = yT + (i + 1) * h;
  out.push({
    d: `M ${xL} ${ya} H ${xR} V ${yb} H ${xL} Z`,
    fill: palette[i] || "#666"
  });
}
return out;
}

function buildSquareOverlaySegments(cx, cy, r, colors) {
  const palette = (colors || []).filter(Boolean);
  const n = Math.max(1, palette.length);
  const segs = [];

  if (n <= 1) return segs;

  const xL = cx - r, xR = cx + r;
  const yT = cy - r, yB = cy + r;

const h = (yB - yT) / n;

// Internal horizontal split lines between blocks
for (let i = 1; i < n; i++) {
  const y = yT + i * h;
  segs.push({ type: "split", x1: xL, y1: y, x2: xR, y2: y });
}
  return segs;
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






function drawTextDot(circleSel, pieSel, k, d){
  const r = textBaseR(d) * k;
  circleSel.attr("r", r); // do NOT set opacity here
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
const modulesA =
  import.meta.glob("../data/**/*_connections.json", { eager: true, import: "default" }) || {};

const modulesB =
  import.meta.glob("../data/**/supraclusteral_connections.json", { eager: true, import: "default" }) || {};

const modules = { ...modulesA, ...modulesB };

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
     "Economics", "Agriculture", "Sociology", "Linguistics", "Psychology", "Theology", "Literature", "Art/Aesthetics", "History", "Philosophy", "Anthropology", "None Applicable"],
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
      "Father Archetype","Mother Archetype","Terrible Mother","Terrible Father", "None Applicable"
    ],
  },
  {
    key: "neumann",
    label: "Neumann Stages",
    appliesTo: "both",
    allTags: [
      "Uroboric Stage","Separation from World Parents","Battle with the Dragon","Isolation","Divine Intervention",
      "Initiation","Death","Rebirth","Magical Empowerment","Return to the Community","Descent into the Underworld",
      "Mythic Ordering of Reality","Ego Collapse","Ego Transcendence","Coronation of the King", "None Applicable"
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

  const parentGroups = {};           // father/mother → [{ otherId, otherType, otherName, note, x }]
  const childGroups = {};            // son/daughter → same
  const siblingGroups = {};          // pure siblings: "sister of X and Y"
  const siblingConsortGroups = {};   // "sister and consort of X and Y"
  const consortGroups = {};          // plain consorts: "consort of X and Y"
  const syncreticEntries = [];       // "was syncretized with A, B, C"
  const customConnectionGroups = {}; // "relates to A, B, C"
  const explicitTextRefs = [];       // "is mentioned in Text1, Text2, Text3"
  const looseItems = [];
  const cognateEntries = [];         // "is cognate with A, B, C"
  const comparativeEntries = [];     // "shares a comparative framework with A, B, C"


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

    // Chronological position of the "other" side on the timeline
    const otherX = isSubjectA ? c.bx : c.ax;
    const otherPos = Number(otherX ?? NaN);

    const entry = {
      otherId,
      otherType,
      otherName,
      note: hasNote ? rawNote : "",
      // numeric x for chronological sorting (null if unavailable)
      x: Number.isFinite(otherPos) ? otherPos : null,
    };

    // --- Familial logic ---
    if (category.startsWith("familial:")) {
      const m = category.match(/^familial:\s*([^,]+)/);
      const core = m ? m[1].trim() : "";
      const hasConsorts = category.includes("consorts");
      entry._hasConsorts = hasConsorts;

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
      if (!isSiblingPair && hasConsorts && !core.includes("/")) {
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

    // --- Cognate connection ---
    if (category.startsWith("cognate connection")) {
      cognateEntries.push(entry);
      continue;
    }

    // --- Comparative connection ---
    if (category.startsWith("comparative connection")) {
      comparativeEntries.push(entry);
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

    // --- Fallback generic (kept, but sorted chronologically as rows) ---
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
      _sortX: entry.x ?? null, // row-level sort key for generic connections
    });
  }

  const items = [];

  // Helper: chronological comparator on entry.x
  const compareByX = (a, b) => {
    const ax = Number(a.x ?? NaN);
    const bx = Number(b.x ?? NaN);
    const aOk = Number.isFinite(ax);
    const bOk = Number.isFinite(bx);
    if (aOk && bOk) return ax - bx;
    if (aOk) return -1;
    if (bOk) return 1;
    return 0;
  };

  // Helper: make a single grouped item, with per-target notes; NO row-level note,
  // and targets listed in chronological order. Also attach a row-level _sortX
  // so the entire line can be ordered chronologically among others.
  const makeGroupedItem = (textBefore, entries, options = {}) => {
    if (!entries || !entries.length) return;

    const sortedEntries = [...entries].sort(compareByX);

    const targets = sortedEntries.map((e) => ({
      type: e.otherType,
      id: e.otherId,
      name: e.otherName,
      note: e.note || "",
    }));

    // Row-level sort key = earliest finite x among its targets
    let rowSortX = null;
    for (const e of sortedEntries) {
      if (Number.isFinite(e.x)) {
        rowSortX = e.x;
        break;
      }
    }

    items.push({
      textBefore,
      targets,
      note: "", // important: keep empty so we don't get one big "i" at the end
      _sortX: rowSortX,
      _groupType: options.groupType || null,
    });
  };

// Parent groups: "father/mother of A, B, C" (+ optional consort)
for (const role of Object.keys(parentGroups)) {
  const arr = parentGroups[role];
  const withConsort = arr.filter((e) => e._hasConsorts);
  const withoutConsort = arr.filter((e) => !e._hasConsorts);

  if (withoutConsort.length) makeGroupedItem(`${role} of `, withoutConsort);
  if (withConsort.length) makeGroupedItem(`${role} and consort of `, withConsort);
}

// Child groups: "son/daughter of A, B" (+ optional consort)
for (const role of Object.keys(childGroups)) {
  const arr = childGroups[role];
  const withConsort = arr.filter((e) => e._hasConsorts);
  const withoutConsort = arr.filter((e) => !e._hasConsorts);

  if (withoutConsort.length) makeGroupedItem(`${role} of `, withoutConsort);
  if (withConsort.length) makeGroupedItem(`${role} and consort of `, withConsort);
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

  // Custom connections: "relates to A, B, C"
  if (customConnectionGroups.custom && customConnectionGroups.custom.length) {
    makeGroupedItem(`relates to `, customConnectionGroups.custom);
  }

  // Cognates: "is cognate with A, B, C"
  if (cognateEntries.length) {
    makeGroupedItem(`is cognate with `, cognateEntries);
  }

  // Comparative: "shares a comparative framework with A, B, C"
  if (comparativeEntries.length) {
    makeGroupedItem(`shares a comparative framework with `, comparativeEntries);
  }

  // Explicit text references: "is mentioned in Text1, Text2, Text3"
  if (explicitTextRefs.length) {
    makeGroupedItem(`is mentioned in `, explicitTextRefs);
  }

  // Syncretic: "was syncretized with A, B, C"
  // Marked as a special groupType so we can force it to the very end.
  if (syncreticEntries.length) {
    makeGroupedItem(`was syncretized with `, syncreticEntries, {
      groupType: "syncretic",
    });
  }

  // Row-level comparator for both grouped items and loose generic rows.
  // Syncretic rows are always pushed to the end.
  const compareRowsBySortX = (a, b) => {
    const aSyn = a._groupType === "syncretic";
    const bSyn = b._groupType === "syncretic";
    if (aSyn && !bSyn) return 1;   // syncretic after non-syncretic
    if (!aSyn && bSyn) return -1;  // non-syncretic before syncretic

    const ax = Number(a._sortX ?? NaN);
    const bx = Number(b._sortX ?? NaN);
    const aOk = Number.isFinite(ax);
    const bOk = Number.isFinite(bx);
    if (aOk && bOk) return ax - bx;
    if (aOk) return -1;
    if (bOk) return 1;
    return 0;
  };

  // Build final list of rows and sort them chronologically,
  // with syncretic group(s) forced to the very end.
  const combined = [...items, ...looseItems];
  combined.sort(compareRowsBySortX);

  // Strip the internal _sortX / _groupType before returning.
  return combined.map(({ _sortX, _groupType, ...rest }) => rest);
}






function buildTextConnectionItems(subject, allConnections) {
  if (!subject || !allConnections || !allConnections.length) return [];

  const subjectId = subject.id;
  const subjectName = subject.title || "";

  // Aggregated textual connections (store x for chronology)
  const implicitInformedTargets = [];    // subject is secondary: "implicitly informed by X, Y"
  const explicitInformedByTargets = [];  // subject is secondary: "explicitly informed by X, Y"

  const implicitInformsTargets = [];     // subject is primary: "implicitly informs X, Y"
  const explicitInformsTargets = [];     // subject is primary: "explicitly informs X, Y"

  // Comparative split by direction
  const comparativeSecondaryTargets = []; // subject is secondary (B): "shares a comparative framework with an earlier text X, Y"
  const comparativePrimaryTargets = [];   // subject is primary (A): "provides an earlier comparative framework for X, Y"

  const textualOther = [];               // fallback explicit/comparative etc. that we don't aggregate

  // father→text explicit references ("Connections with Mythic/Historic Figures")
  const fatherRefs = [];
  const fatherRelates = [];

  // Helper to turn raw x into a finite number or null
  const normX = (raw) => {
    const v = Number(raw ?? NaN);
    return Number.isFinite(v) ? v : null;
  };

  // Helper for target-level chronological sort
  const compareByX = (a, b) => {
    const ax = normX(a.x);
    const bx = normX(b.x);
    const aOk = ax !== null;
    const bOk = bx !== null;
    if (aOk && bOk) return ax - bx;
    if (aOk) return -1;
    if (bOk) return 1;
    return 0;
  };

  // ===== Scan all connections =====
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

        // Chronological position of the OTHER text on the timeline
        let otherX = null;
        if (isSubjectA && !isSubjectB) {
          // subject is A, other is B
          otherX = normX(c.bx);
        } else if (isSubjectB && !isSubjectA) {
          // subject is B, other is A
          otherX = normX(c.ax);
        } else {
          // weird symmetric case, treat as unknown
          otherX = null;
        }

        // --- Directional semantics for "indirect connection" ---
        if (category === "indirect connection") {
          if (isSubjectB && !isSubjectA) {
            // Subject is on secondary side -> implicitly informed by primary
            implicitInformedTargets.push({
              type: otherType,
              id: otherId,
              name: otherName,
              note: hasNote ? rawNote : "",
              x: otherX,
            });
          } else if (isSubjectA && !isSubjectB) {
            // Subject is on primary side -> implicitly informs secondary
            implicitInformsTargets.push({
              type: otherType,
              id: otherId,
              name: otherName,
              note: hasNote ? rawNote : "",
              x: otherX,
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
              _sortX: otherX,
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
              x: otherX,
            });
          } else if (isSubjectA && !isSubjectB) {
            // Subject is on primary side -> explicitly informs secondary
            explicitInformsTargets.push({
              type: otherType,
              id: otherId,
              name: otherName,
              note: hasNote ? rawNote : "",
              x: otherX,
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
              _sortX: otherX,
            });
          }

          continue;
        }

        // --- Comparative connections (directional aggregation) ---
        if (category === "comparative connection") {
          if (isSubjectB && !isSubjectA) {
            // Subject is the secondary text: later text, pointing back to earlier primary
            comparativeSecondaryTargets.push({
              type: otherType,
              id: otherId,
              name: otherName,
              note: hasNote ? rawNote : "",
              x: otherX,
            });
          } else if (isSubjectA && !isSubjectB) {
            // Subject is the primary text: earlier text, providing a framework for later ones
            comparativePrimaryTargets.push({
              type: otherType,
              id: otherId,
              name: otherName,
              note: hasNote ? rawNote : "",
              x: otherX,
            });
          } else {
            // Fallback symmetric case
            textualOther.push({
              section: "textual",
              textBefore: `${subjectName} is comparatively related to `,
              targets: [
                {
                  type: otherType,
                  id: otherId,
                  name: otherName,
                  note: hasNote ? rawNote : "",
                },
              ],
              note: hasNote ? rawNote : "",
              _sortX: otherX,
            });
          }

          continue;
        }

        // Anything else that slips through (unlikely) could be handled here if needed.
      }

      // text↔text handled; skip father logic for this row
      continue;
    }

        // ===== 2) FATHER ↔ TEXT (explicit reference + custom connection) =====
    // We only care about father↔text rows where THIS text is the text side.
    const isExplicit = category === "explicit reference";
    const isCustom   = category === "custom connection";

    if (isExplicit || isCustom) {
      const bucket = isExplicit ? fatherRefs : fatherRelates;

      // Case: father on A, text on B (subject)
      if (aIsFather && bIsText && c.bId === subjectId) {
        const otherName = c.aName || c["aName"] || "";
        const otherId = c.aId;
        const otherType = c.aType;

        const otherX = normX(c.ax);

        bucket.push({
          otherId,
          otherType,
          otherName,
          note: hasNote ? rawNote : "",
          x: otherX,
        });
        continue;
      }

      // Case: text on A (subject), father on B
      if (bIsFather && aIsText && c.aId === subjectId) {
        const otherName = c.bName || c["bName"] || "";
        const otherId = c.bId;
        const otherType = c.bType;

        const otherX = normX(c.bx);

        bucket.push({
          otherId,
          otherType,
          otherName,
          note: hasNote ? rawNote : "",
          x: otherX,
        });
        continue;
      }
    }

    // Any other categories / shapes are ignored here for now.
  }

  // ===== Assemble textual items, chronologically =====

  const textualItems = [];

  // Helper: build a textual row from an aggregated target list
  const makeTextualRow = (textBefore, targetsWithX) => {
    if (!targetsWithX || !targetsWithX.length) return;

    const sortedTargets = [...targetsWithX].sort(compareByX);

    const targets = sortedTargets.map((t) => ({
      type: t.type,
      id: t.id,
      name: t.name,
      note: t.note || "",
    }));

    let rowSortX = null;
    for (const t of sortedTargets) {
      const v = normX(t.x);
      if (v !== null) {
        rowSortX = v;
        break;
      }
    }

    textualItems.push({
      section: "textual",
      textBefore,
      targets,
      note: "", // per-target notes only
      _sortX: rowSortX,
    });
  };

  // Subject as secondary (B)
  if (implicitInformedTargets.length) {
    makeTextualRow("implicitly informed by ", implicitInformedTargets);
  }

  if (explicitInformedByTargets.length) {
    makeTextualRow("explicitly informed by ", explicitInformedByTargets);
  }

  if (comparativeSecondaryTargets.length) {
    makeTextualRow(
      "shares a comparative framework with an earlier text ",
      comparativeSecondaryTargets
    );
  }

  // Subject as primary (A)
  if (implicitInformsTargets.length) {
    makeTextualRow("implicitly informs ", implicitInformsTargets);
  }

  if (explicitInformsTargets.length) {
    makeTextualRow("explicitly informs ", explicitInformsTargets);
  }

  if (comparativePrimaryTargets.length) {
    makeTextualRow(
      "provides an earlier comparative framework for ",
      comparativePrimaryTargets
    );
  }

  // Fallback textualOther (already have _sortX)
  for (const row of textualOther) {
    textualItems.push(row);
  }

  // Row-level sort for textual items
  const compareRowsBySortX = (a, b) => {
    const ax = normX(a._sortX);
    const bx = normX(b._sortX);
    const aOk = ax !== null;
    const bOk = bx !== null;
    if (aOk && bOk) return ax - bx;
    if (aOk) return -1;
    if (bOk) return 1;
    return 0;
  };

  textualItems.sort(compareRowsBySortX);

  // Strip internal _sortX from textual items
  const finalTextualItems = textualItems.map(({ _sortX, ...rest }) => rest);

// ===== Mythic/Historic: father ↔ text (kept as its own block, but sorted inside) =====
const finalItems = [...finalTextualItems];

// dedupe helper (same father can appear twice if data has duplicates)
const uniqByOtherId = (arr) => {
  const seen = new Set();
  const out = [];
  for (const e of arr || []) {
    const k = String(e?.otherId ?? "");
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
};

// 1) Explicit reference: fatherRefs -> "mentions ..."
if (fatherRefs.length) {
  const sortedFathers = uniqByOtherId(fatherRefs).sort(compareByX);

  const targets = sortedFathers.map((e) => ({
    type: e.otherType,
    id: e.otherId,
    name: e.otherName,
    note: e.note || "",
  }));

  finalItems.push({
    section: "mythic",
    textBefore: "mentions ",
    targets,
    note: "",
  });
}

// 2) Custom connection: fatherRelates -> "relates to ..."
if (fatherRelates.length) {
  const sortedFathers = uniqByOtherId(fatherRelates).sort(compareByX);

  const targets = sortedFathers.map((e) => ({
    type: e.otherType,
    id: e.otherId,
    name: e.otherName,
    note: e.note || "",
  }));

  finalItems.push({
    section: "mythic",
    textBefore: "relates to ",
    targets,
    note: "",
  });
}

return finalItems;

}


/* Build "all selected" default state: { [groupKey]: Set(allTags) } */
function makeDefaultSelectedByGroup() {
  const out = {};
  for (const g of TAG_GROUPS) out[g.key] = new Set(g.allTags);
  return out;
}

function itemPassesFilters(row, type, selectedByGroup) {
  const NON_APPLICABLE = "None Applicable";
  const REQUIRED_GROUPS = new Set(["artsSciences", "jungian", "neumann"]);

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

    // REQUIRED groups behavior (Arts&Sciences + Jungian + Neumann):
    // - if nothing selected => show NOTHING (hard gate)
    // - NA items only show when "None Applicable" is selected
    // - if ONLY "None Applicable" is selected => show ONLY NA items
    if (REQUIRED_GROUPS.has(g.key)) {
      if (selSize === 0) return false; // nothing selected => nothing rendered

      if (isNA) {
        if (selected.has(NON_APPLICABLE)) continue; // allow NA items
        return false; // NA item blocked unless explicitly allowed
      }

      // Non-NA item: if user selected ONLY None Applicable, hide it
      if (selSize === 1 && selected.has(NON_APPLICABLE)) return false;

      // else: fall through to intersection check below
    } else {
      // Default behavior for other groups:
      if (selSize === 0) {
        if (!isNA) return false;
        continue;
      }
      if (isNA) continue; // item lacks this group → no constraint
    }

    // Require intersection with the currently selected tags
    if (!itemTags.some((t) => selected.has(t))) return false;
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

  const relevantTextIdsRef = useRef(new Set());
  const relevantFatherIdsRef = useRef(new Set());

  // PERF: gate expensive bulk style updates (opacity/dimming) so they only rerun when tier/selection changes
  const lastStyleStateRef = useRef({ zoomMode: null, key: "" });


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
  const [layerMode, setLayerMode] = useState("durations");
  const [isReady, setIsReady] = useState(false);


  // Global visibility overrides (panel checkboxes)
  const [showTexts, setShowTexts] = useState(true);
  const [showFathers, setShowFathers] = useState(true);
  const [showConnections, setShowConnections] = useState(false);
  // Keep a ref so RAF/D3 handlers always see the latest mode (no stale closures)
  const layerModeRef = useRef(layerMode);
  useEffect(() => {
  layerModeRef.current = layerMode;
  }, [layerMode]);

  const visibleIdsRef = useRef(new Set());
  const visUpdateRaf = useRef(0);
  // PERF: throttle connection rerenders to 1 per animation frame
  const connUpdateRaf = useRef(0);
  const connArgsRef = useRef(null);

  // PERF: throttle viewport culling + visible-id computation to 1 per animation frame
  const cullUpdateRaf = useRef(0);
  const cullArgsRef = useRef(null);




  const SEARCH_FLY = {
  k: 4.5,         // target zoom (>= ZOOM_THRESHOLD so dots/triangles are interactive)
  xFrac: 0.645,     // horizontal position (2/3 = boundary between 2nd and 3rd thirds)
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


  // O(1) lookups (avoid .find(...) in hot paths like zoom)
  const segmentsById = useMemo(() => new Map(segments.map((s) => [s.id, s])), [segments]);
  const outlinesById = useMemo(() => new Map(outlines.map((o) => [o.id, o])), [outlines]);

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
        // NEW: media/resource columns (texts)
        const originalTextLink = (t["Original text"] || t["Original Text"] || "").trim();
        const articlePostLink  = (t["Article/post"]  || t["Article/Post"]  || "").trim();
        const imageMuseumLink  = (t["Image/museum"]  || t["Image/Museum"]  || "").trim();
        const videoLink        = (t["Video"]         || "").trim();
        const otherLink        = (t["Other"]         || "").trim();


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

        const civCodeRaw =
          (getLooseField(t, "Civlizational code?") ??
          getLooseField(t, "Civilizational code?") ??  // optional fallback
          "").toString().trim();

       

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
          civilizationalCode: civCodeRaw, 
          originalText: originalTextLink,
          articlePost:  articlePostLink,
          imageMuseum:  imageMuseumLink,
          video:        videoLink,
          other:        otherLink,
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
      // NEW: media/resource columns (fathers)
      const articlePostLink = (f["Article/post"] || f["Article/Post"] || "").trim();
      const imageMuseumLink = (f["Image/museum"] || f["Image/Museum"] || "").trim();
      const videoLink       = (f["Video"]        || "").trim();
      const otherLink       = (f["Other"]        || "").trim();

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
        // NEW: media/resource columns (fathers)
        articlePost: articlePostLink,
        imageMuseum: imageMuseumLink,
        video:       videoLink,
        other:       otherLink,
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
const visTextRows = useMemo(() => {
  if (!showTexts) return [];
  return (textRows || []).filter(r => itemPassesFilters(r, "text", selectedByGroup));
}, [textRows, selectedByGroup, showTexts]);

const visFatherRows = useMemo(() => {
  if (!showFathers) return [];
  return (fatherRows || []).filter(r => itemPassesFilters(r, "father", selectedByGroup));
}, [fatherRows, selectedByGroup, showFathers]);


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

  const cx = zx(toAstronomical(d.when));
  let cyU = y0(d.y);

  const yBandMap = fatherYMap.get(d.durationId);
  const assignedU = yBandMap?.get(d.id);
  if (Number.isFinite(assignedU)) cyU = assignedU;

  const cy = zy(cyU);

  const isConcept = hasConceptTag(d.historicMythicStatusTags);

  // Colored slices
  const cols = (d.colors && d.colors.length) ? d.colors : [d.color || "#666"];
  const slices = isConcept
    ? splitSquareSlices(cx, cy, r, cols)          // horizontal blocks version
    : leftSplitTriangleSlices(cx, cy, r, cols);

  gFather
    .select("g.slices")
    .selectAll("path.slice")
    .data(slices, (_, i) => i)
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

  // White internal overlays
  const showMid = !isConcept && hasHistoricTag(d.historicMythicStatusTags) && r >= 3;
  const segs = isConcept
    ? buildSquareOverlaySegments(cx, cy, r, cols) // horizontal split lines version
    : buildOverlaySegments(cx, cy, r, cols, showMid);

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
    .attr("stroke-width", (s) => (s.type === "mid" ? w * 2.0 : w));

  // Outer border path
  const borderPath = isConcept
    ? `M ${cx - r} ${cy - r} H ${cx + r} V ${cy + r} H ${cx - r} Z`
    : `M ${cx - r} ${cy - r} L ${cx - r} ${cy + r} L ${cx + r} ${cy} Z`;

  gOver
    .selectAll("path.father-border")
    .data([0])
    .join(
      (e) =>
        e
          .append("path")
          .attr("class", "father-border")
          .attr("fill", "none")
          .attr("stroke", "none")
          .attr("vector-effect", "non-scaling-stroke")
          .attr("shape-rendering", "geometricPrecision")
          .style("pointer-events", "none"),
      (u) => u,
      (x) => x.remove()
    )
    .attr("d", borderPath);

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
    concept: hasConceptTag(f.historicMythicStatusTags),
  }));

  return [...texts, ...fathers];
}, [visTextRows, visFatherRows]);


// ---- Selection handler for the SearchBar ----
const handleSearchSelect = (item) => {

  const wrapRect = wrapRef.current?.getBoundingClientRect();
  const CARD_W = 430, CARD_H = 320;
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
  const CARD_W = 430, CARD_H = 320;
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

  const baseOpacity = CONNECTION_BASE_OPACITY;
  const highlightOpacity = CONNECTION_HIGHLIGHT_OPACITY;

  const allData = allConnectionRowsRef.current || [];

// If connections are globally hidden, only show those that touch the current selection.
// (Selection overrides the checkbox; hover does NOT.)
const hasSelection = !!(selText || selFather);

const data = showConnections
  ? allData
  : (!hasSelection
      ? []
      : allData.filter(d => (
          (selText && (
            (d.aType === "text" && d.aId === selText.id) ||
            (d.bType === "text" && d.bId === selText.id)
          )) ||
          (selFather && (
            (d.aType === "father" && d.aId === selFather.id) ||
            (d.bType === "father" && d.bId === selFather.id)
          ))
        )));

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

if (touchesSelected || touchesHovered) return highlightOpacity;

// If a selection exists and we're drawing *all* connections (showConnections ON),
// dim non-relevant connections further.
if (hasSelection && showConnections) return DIM_CONNECTION_OPACITY;

return baseOpacity;
    });
}

// PERF: coalesce renderConnections calls (zoom can fire dozens of times per second)
function scheduleRenderConnections(zx, zy, k) {
  connArgsRef.current = { zx, zy, k };
  if (connUpdateRaf.current) return;
  connUpdateRaf.current = requestAnimationFrame(() => {
    connUpdateRaf.current = 0;
    const args = connArgsRef.current;
    if (!args) return;
    renderConnections(args.zx, args.zy, args.k);
  });
}







useEffect(() => {
  if (!connectionRegistry.length) {
    allConnectionRowsRef.current = [];
    return;
  }

  const out = [];

  // Build durationId -> (index -> row) maps for ALL fathers/texts once.
  // This lets supraclusteral rows resolve endpoints across different bands.
  const fatherByBandByIndex = new Map(); // bandId -> Map(index, fatherRow)
  const textByBandByIndex = new Map();   // bandId -> Map(index, textRow)

  for (const f of fatherRows) {
    if (!f) continue;
    if (f.durationId == null) continue;
    if (f.index == null) continue;

    const bandId = f.durationId;
    if (!fatherByBandByIndex.has(bandId)) fatherByBandByIndex.set(bandId, new Map());
    fatherByBandByIndex.get(bandId).set(Number(f.index), f);
  }

  for (const t of textRows) {
    if (!t) continue;
    if (t.durationId == null) continue;
    if (t.textIndex == null) continue;

    const bandId = t.durationId;
    if (!textByBandByIndex.has(bandId)) textByBandByIndex.set(bandId, new Map());
    textByBandByIndex.get(bandId).set(Number(t.textIndex), t);
  }

  // Helper to parse "index,type" like "12, father" BUT now also takes a bandId
  // because supraclusteral endpoints may come from different bands.
  const parseEndFactory =
    (fatherByBandByIndex, textByBandByIndex) =>
    (raw, name, bandId) => {
      if (!raw) return null;
      if (!bandId) return null;

      const m = String(raw).match(/(\d+)\s*,\s*(\w+)/);
      if (!m) return null;

      const index = Number(m[1]);
      const typeRaw = String(m[2] ?? "").toLowerCase();

      // In your legacy data it’s basically father vs text.
      // If the token isn't "father", treat as text.
      if (typeRaw === "father") {
        const row = fatherByBandByIndex.get(bandId)?.get(index) || null;
        if (!row) return null;
        return { type: "father", row, bandId };
      } else {
        const row = textByBandByIndex.get(bandId)?.get(index) || null;
        if (!row) return null;
        return { type: "text", row, bandId };
      }
    };

  const parseEnd = parseEndFactory(fatherByBandByIndex, textByBandByIndex);

  // Helper: supraclusteral stores Duration as folder name like "egyptian"
  // but your timeline bands use "<folder>-composite"
  const toCompositeBandId = (durationVal) => {
    if (durationVal == null) return null;
    const s = String(durationVal).trim();
    if (!s) return null;
    return s.endsWith("-composite") ? s : `${s}-composite`;
  };

  for (const ds of connectionRegistry) {
    const fallbackBandId = ds.durationId; // legacy datasets (per folder)
    if (!fallbackBandId) continue;

    for (const row of ds.connections) {
      // For supraclusteral rows:
      //   Primary Duration / Secondary Duration are present and may differ.
      // For legacy rows:
      //   they're missing -> we fall back to ds.durationId for both ends.
      const aBandId = toCompositeBandId(row["Primary Duration"]) ?? fallbackBandId;
      const bBandId = toCompositeBandId(row["Secondary Duration"]) ?? fallbackBandId;

      const A = parseEnd(row.Primary, row["Primary Name"], aBandId);
      const B = parseEnd(row.Secondary, row["Secondary Name"], bBandId);

      if (!A || !B) continue;

      const ax = Number(A.row.when ?? NaN);
      const bx = Number(B.row.when ?? NaN);
      if (!Number.isFinite(ax) || !Number.isFinite(bx)) continue;

      const aYmap = A.type === "father" ? fatherYMap : textYMap;
      const bYmap = B.type === "father" ? fatherYMap : textYMap;

      // IMPORTANT: use each endpoint's own band id
      const ay = aYmap.get(aBandId)?.get(A.row.id);
      const by = bYmap.get(bBandId)?.get(B.row.id);
      if (!Number.isFinite(ay) || !Number.isFinite(by)) continue;

      const style = styleForConnection(
        row["Connection Category"],
        A.type,
        B.type,
        A.row,
        B.row
      );

      const color = connectionColorFromBandIds(A.row.durationId, B.row.durationId, outlines);
      const aName = A.type === "father" ? (A.row.name || "") : (A.row.title || "");
      const bName = B.type === "father" ? (B.row.name || "") : (B.row.title || "");

      // Key should include bandIds so supraclusteral rows don't collide with per-band keys
      const rowId = row.Index ?? row.id ?? `${row.Primary}__${row.Secondary}`;

      out.push({
        _key: `${aBandId}::${rowId}::${bBandId}::${A.row.id}::${B.row.id}`,

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

        // Optional but useful for debugging / future features
        aBandId,
        bBandId,

        style,
        color,
        note: row.Note || "",
        category: row["Connection Category"] ?? "",
      });
    }
  }

  allConnectionRowsRef.current = out;

  const t = lastTransformRef.current ?? d3.zoomIdentity;
  scheduleRenderConnections(t.rescaleX(x), t.rescaleY(y0), t.k);
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

function computeRelevantIdSets() {
  const relTexts = new Set();
  const relFathers = new Set();

  const selText = selectedText;
  const selFather = selectedFather;
  const hasSel = !!(selText || selFather);

  if (!hasSel) {
    return { relTexts, relFathers };
  }

  const selType = selText ? "text" : "father";
  const selId = selText ? selText.id : selFather.id;

  // Always include the selected node itself
  if (selType === "text") relTexts.add(selId);
  else relFathers.add(selId);

  const allData = allConnectionRowsRef.current || [];
  for (const d of allData) {
    const aHit = d.aType === selType && d.aId === selId;
    const bHit = d.bType === selType && d.bId === selId;
    if (!aHit && !bHit) continue;

    // Add the opposite endpoint as relevant
    const otherType = aHit ? d.bType : d.aType;
    const otherId   = aHit ? d.bId   : d.aId;

    if (otherType === "text") relTexts.add(otherId);
    if (otherType === "father") relFathers.add(otherId);
  }

  return { relTexts, relFathers };
}


  // NEW: compute relevant (1-hop) ids whenever selection changes
useEffect(() => {
  const { relTexts, relFathers } = computeRelevantIdSets();
  relevantTextIdsRef.current = relTexts;
  relevantFatherIdsRef.current = relFathers;

  // Apply dimming immediately (apply() only runs on zoom/pan otherwise)
  if (!textsRef.current || !fathersRef.current) return;

  const hasSel = !!(selectedText || selectedFather);
  const relT = relevantTextIdsRef.current;
  const relF = relevantFatherIdsRef.current;

  const gTexts = d3.select(textsRef.current);
  const gFathers = d3.select(fathersRef.current);

  gTexts.selectAll("circle.textDot")
    .attr("opacity", d => {
      if (!hasSel) return BASE_OPACITY;
      return relT.has(d.id) ? BASE_OPACITY : DIM_NODE_OPACITY;
    }, "important");

  gTexts.selectAll("g.dotSlices")
    .style("opacity", d => {
      if (!hasSel) return BASE_OPACITY;
      return relT.has(d.id) ? BASE_OPACITY : DIM_NODE_OPACITY;
    }, "important");

  gFathers.selectAll("g.fatherMark")
    .attr("opacity", d => {
      if (!hasSel) return BASE_OPACITY;
      return relF.has(d.id) ? BASE_OPACITY : DIM_NODE_OPACITY;
    }, "important");
}, [selectedText, selectedFather]);



  // Re-apply connection styling when selected text/father changes
  useEffect(() => {
    if (!connectionsRef.current) return;
    const t = lastTransformRef.current ?? d3.zoomIdentity;
    scheduleRenderConnections(t.rescaleX(x), t.rescaleY(y0), t.k);
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
    zoomMode = "outest";
  } else if (k < ZOOM_THRESHOLD) {
    zoomMode = "middle";
  } else {
    zoomMode = "deepest";
  }

  const lm = layerModeRef.current;

  const showDurationChrome =
    (lm === "durations") &&
    (zoomMode === "outest") &&
    !hasSelection;

  const showPassiveOutlines =
    !hasSelection && (
      (lm === "none") ||
      (lm === "durations" && (zoomMode === "middle" || zoomMode === "deepest")) ||
      (lm === "segments"  && (zoomMode === "deepest"))
    );

  // tweak this whenever you want
  const OUTLINE_ONLY_STROKE_OPACITY = 0.2;
  const OUTLINE_ONLY_STROKE_WIDTH = 1;

  // Fill strengths for duration bands per zoom tier
  let baseFill, hoverFill, activeFill;
  if (zoomMode === "outest") {
    baseFill = 0.30;
    hoverFill = 0.70;
    activeFill = 0.90;
  } else if (zoomMode === "middle") {
    baseFill = 0.30;
    hoverFill = 0.70;
    activeFill = 0.90;
  } else {
    baseFill = 0.0;
    hoverFill = 0.0;
    activeFill = 0.0;
  }

  // Duration fill opacity based ONLY on duration hover/active
  function durFillOpacity(d) {
    if (zoomMode === "deepest") return 0;

    const id = d.id;
    const isActive = id === activeDurationId;
    const isHoverDuration = !ignoreHoverBecauseActive && id === hoveredDurationId;

    if (isActive) return activeFill;
    if (isHoverDuration) return hoverFill;
    return baseFill;
  }

  const outlineRoot = d3.select(outlinesRef.current);

  // ===== Labels =====
  outlineRoot
    .selectAll("text.durationLabel")
    .style("fill", (d) => {
      const id = d.id;
      const isActiveFromDuration = id === activeDurationId;
      const isFromHoveredSeg = id === hoveredSegParentId;
      const isHoverDuration = !ignoreHoverBecauseActive && id === hoveredDurationId;

      if (isActiveFromDuration || isFromHoveredSeg || isHoverDuration) return "#fff";
      return d.color || "#999";
    })
    .style("opacity", (d) => {
      const id = d.id;
      const isActiveFromDuration = id === activeDurationId;
      const isFromHoveredSeg = id === hoveredSegParentId;
      const isHoverDuration = !ignoreHoverBecauseActive && id === hoveredDurationId;

      if (isActiveFromDuration || isFromHoveredSeg) return DUR_LABEL_OPACITY.active;
      if (isHoverDuration) return DUR_LABEL_OPACITY.hover;
      return DUR_LABEL_OPACITY.base;
    });

  // Only one hover-class toggler (OUTEST only)
  outlineRoot
    .selectAll("g.durationOutline")
    .classed("hover", (d) => {
      if (zoomMode !== "outest") return false;

      const id = d.id;
      const isActiveFromDuration = id === activeDurationId;
      const isFromHoveredSeg = id === hoveredSegParentId;
      const isHoverDuration = !ignoreHoverBecauseActive && id === hoveredDurationId;

      return isActiveFromDuration || isFromHoveredSeg || isHoverDuration;
    });

  // ===== Rect-based durations =====
  outlineRoot
    .selectAll("rect.outlineRect")
    .style("fill-opacity", (d) => {
      if (d._isCustomGroup || d._hiddenCustom) return 0;
      if (showPassiveOutlines) return 0;
      if (!showDurationChrome) return 0;
      return durFillOpacity(d);
    })
  .style("stroke", (d) => {
    if (d._isCustomGroup || d._hiddenCustom) return "none";
    return showPassiveOutlines ? "currentColor" : "none";
  })
  .style("stroke-opacity", (d) => {
    if (d._isCustomGroup || d._hiddenCustom) return 0;
    return showPassiveOutlines ? OUTLINE_ONLY_STROKE_OPACITY : 0;
  })
  .style("stroke-width", showPassiveOutlines ? OUTLINE_ONLY_STROKE_WIDTH : null);

  // ===== Custom polygons =====
  d3.select(customPolysRef.current)
    .selectAll("path.customGroup")
    .style("fill-opacity", (d) => {
      if (d._hiddenCustom) return 0;
      if (showPassiveOutlines) return 0;

      // Keep your existing "middle base fill" behavior
      if (zoomMode === "middle") return baseFill;

      if (!showDurationChrome) return 0;
      return durFillOpacity(d);
    })
    .attr("stroke", (d) => showPassiveOutlines ? (d.color || "#999") : "none")
    .attr("stroke-opacity", showPassiveOutlines ? OUTLINE_ONLY_STROKE_OPACITY : 0)
    .attr("stroke-width", showPassiveOutlines ? OUTLINE_ONLY_STROKE_WIDTH : null);
}



function updateSegmentPreview() {
  const activeId  = activeSegIdRef.current;
  const hoveredId = hoveredSegIdRef.current;

  const k = kRef.current ?? 1;
  const hasSelection = !!(selectedText || selectedFather);

  // Segments should be visible in:
  // - middle zoom (default behavior)
  // - outest zoom ONLY when layerMode === "segments"
  const inSegmentsMode = (layerModeRef.current === "segments");

  const inSegmentsZoomBand =
    !hasSelection &&
    (
      (k >= ZOOM_SEGMENT_THRESHOLD && k < ZOOM_THRESHOLD) || // middle
      (k < ZOOM_SEGMENT_THRESHOLD && inSegmentsMode)          // outest + segments mode
    );

  // Segment fill strengths (enabled for middle, and for outest when segments mode)
  const baseFill   = inSegmentsZoomBand ? 0.30 : 0.0;
  const hoverFill  = inSegmentsZoomBand ? 0.70 : 0.0;
  const activeFill = inSegmentsZoomBand ? 0.90 : 0.0;

  d3.select(segmentsRef.current)
    .selectAll("rect.segmentHit")
    .style("fill-opacity", (d) => {
      if (!inSegmentsZoomBand) return 0;

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

      const mode = layerModeRef.current;

// Track segment hover on:
// - MIDDLE (default)
// - OUTEST only when Segments mode is selected
const allowOutestSegments = (mode === "segments") && (k < ZOOM_SEGMENT_THRESHOLD);
const allowMiddleSegments = (k >= ZOOM_SEGMENT_THRESHOLD) && (k < ZOOM_THRESHOLD);

if (
  !se ||
  !("clientX" in se) ||
  hasSelection ||
  !(allowOutestSegments || allowMiddleSegments)
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

function syncHoverRaf(srcEvt) {
  if (!srcEvt || !("clientX" in srcEvt) || !("clientY" in srcEvt)) return;
  if (hoverRaf.current) return;

  hoverRaf.current = requestAnimationFrame(() => {
    hoverRaf.current = 0;

    const k = kRef.current ?? 1;
    const mode = layerModeRef.current; // <-- requires the ref from step 1

    if (k < ZOOM_SEGMENT_THRESHOLD) {
      // OUTEST:
      // - if Segments mode => segments hover (same feel as middle)
      // - else => durations hover (existing behavior)
      if (mode === "segments") {
        syncSegmentHoverFromPointer(srcEvt);

        // ensure duration hover doesn't linger
        if (hoveredDurationIdRef.current != null) {
          hoveredDurationIdRef.current = null;
          setHoveredDurationId(null);
        }
      } else {
        syncDurationHoverFromPointer(srcEvt);

        // ensure segment hover doesn't linger
        if (hoveredSegIdRef.current != null) {
          hoveredSegIdRef.current = null;
          setHoveredSegmentId(null);
        }
      }
    } else if (k < ZOOM_THRESHOLD) {
      // MIDDLE: segments hover
      syncSegmentHoverFromPointer(srcEvt);

      // ensure duration hover doesn't linger
      if (hoveredDurationIdRef.current != null) {
        hoveredDurationIdRef.current = null;
        setHoveredDurationId(null);
      }
    } else {
      // DEEPEST: clear both to avoid "stuck" hover UI
      if (hoveredDurationIdRef.current != null) {
        hoveredDurationIdRef.current = null;
        setHoveredDurationId(null);
      }
      if (hoveredSegIdRef.current != null) {
        hoveredSegIdRef.current = null;
        setHoveredSegmentId(null);
      }
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
      // flag hidden custom MEMBERS so CSS doesn't accidentally draw their rects in None mode
      .classed("isHiddenCustom", (d) => !!d._hiddenCustom)

      // ✅ expose duration color to CSS; also force currentColor to use it (fixes grey in NONE mode)
      .style(
        "--dur-color",
        (d) => d.color || d.stroke || d.outlineColor || d.fill || "#999999"
      )
      .style("color", "var(--dur-color)");

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
      // (optional but consistent) don't assume d.color exists
      .attr("fill", (d) => d.color || d.stroke || d.outlineColor || d.fill || "#999999")
      .attr("opacity", DUR_LABEL_OPACITY.base)
      .style("font-weight", 600)
      .style("pointer-events", "none")
      .each(function (d) {
        const raw = (d._isCustomGroup && d._labelText) ? d._labelText : d.name;
        const label = String(raw ?? "");
        const lines = label.split("\n");

        const t = d3.select(this);
        t.selectAll("tspan").remove();
        t.text(null);

        // Let tspans inherit the parent's x (do NOT force x=0)
        lines.forEach((line, i) => {
          t.append("tspan")
            .attr("dy", i === 0 ? "0em" : "1.05em")
            .text(line);
        });
      });

    return g;
  });



    // Hide the rectangle if this is a custom GROUP (polygon handles visuals)
    outlineSel.select("rect.outlineRect")
      // Let updateHoverVisuals() own ALL duration fill-opacity.
      // Only custom-group rects stay hidden here.
      .attr("fill-opacity", (d) => (d._isCustomGroup || d._hiddenCustom) ? 0 : null)
      .attr("stroke-opacity", (d) => (d._isCustomGroup || d._hiddenCustom) ? 0 : DUR_STROKE.baseOpacity)
      .style("pointer-events", d => (d._isCustomGroup || d._hiddenCustom) ? "none" : "all");

    // Whole-duration hover/click (zoomed-out only)
    outlineSel.select("rect.outlineRect")
      .on("mouseenter", function (_ev, d) {
        if (kRef.current >= ZOOM_SEGMENT_THRESHOLD) return;
        if (activeDurationIdRef.current) return; // ignore hover while a duration is active
        hoveredDurationIdRef.current = d.id;
        updateHoverVisuals();
      })
      .on("mouseleave", function () {
        if (kRef.current >= ZOOM_SEGMENT_THRESHOLD) return;
        if (zoomDraggingRef.current) return;
        if (activeDurationIdRef.current) return; // keep active styles
        hoveredDurationIdRef.current = null;
        updateHoverVisuals();
      })
      .on("click", function (ev, d) {
        if (kRef.current >= ZOOM_SEGMENT_THRESHOLD) return;

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
        // ✅ let CSS control fill/stroke per zoom + layer mode
        .attr("fill", null)
        .attr("stroke", null)

        // ✅ make sure currentColor resolves correctly even if nesting/inheritance breaks
        .style("--dur-color", (d) => d.color || d.stroke || d.outlineColor || d.fill || "#999999")
        .style("color", "var(--dur-color)")

        .attr("vector-effect", "non-scaling-stroke")
        .attr("shape-rendering", "geometricPrecision"),
    (update) =>
      update
        // keep color in sync on updates too
        .style("--dur-color", (d) => d.color || d.stroke || d.outlineColor || d.fill || "#999999")
        .style("color", "var(--dur-color)"),
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
        .attr("r", d => textBaseR(d) * kRef.current)
        .style("transition", "r 120ms ease")
        // ensure the circle itself receives events (pies keep pointer-events: none)
        .style("pointer-events", "all")
        .style("cursor", "pointer"),
    (update) =>
      update
        .attr("fill", (d) =>
          (d.colors && d.colors.length > 1 ? "transparent" : (d.color || "#444"))
        )
        .attr("r", d => textBaseR(d) * kRef.current)
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
    if (zx && zy) scheduleRenderConnections(zx, zy, kNow);

const k = kRef.current;
const gPie = piesSel.filter((p) => p.id === d.id).style("opacity", 1);
drawTextDot(d3.select(this), gPie, k * HOVER_SCALE_DOT, d);

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


const isSelected = selectedText && selectedText.id === d.id;
if (!isSelected) {
  const titleLine = d.title || "";
  const html = tipHTML(titleLine, d.displayDate || formatYear(d.when));
  const a = textAnchorClient(this, d);
  if (a) showTip(tipText, html, a.x, a.y, d.color);
} else {
  hideTipSel(tipText);
}

      })
      .on("mousemove", function (_ev, d) {

const isSelected = selectedText && selectedText.id === d.id;
if (!isSelected) {
  const titleLine = d.title || "";
  const html = tipHTML(titleLine, d.displayDate || formatYear(d.when));
  const a = textAnchorClient(this, d);
  if (a) showTip(tipText, html, a.x, a.y, d.color);
} else {
  hideTipSel(tipText);
}

      })
.on("mouseleave", function (_ev, d) {
  // clear hovered text highlight
  hoveredTextIdRef.current = null;
  const zx = zxRef.current, zy = zyRef.current, kNow = kRef.current;
  if (zx && zy) scheduleRenderConnections(zx, zy, kNow);

  const k = kRef.current;
  const isSelected = selectedText && selectedText.id === d.id;
  const gPie = piesSel.filter((p) => p.id === d.id);

  if (isSelected) {
    // keep it in "hover" size + border when selected
    drawTextDot(d3.select(this), gPie, k * HOVER_SCALE_DOT, d);
    d3.select(this)
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 1.4)
      .attr("opacity", BASE_OPACITY);

    if (!gPie.empty()) {
      gPie.style("opacity", 1);
      drawSlicesAtRadius(gPie, textBaseR(d) * k * HOVER_SCALE_DOT);
    }
  } else {
    const rDraw = textBaseR(d) * k;
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

        const wrapRect = wrapRef.current?.getBoundingClientRect();
        if (!wrapRect) {
          // Fallback: old behavior if something is weird
          const aFallback = textAnchorClient(this, d);
          const CARD_W = 430, CARD_H = 320, PAD = 12;
          let left = aFallback ? aFallback.x - wrapRect.left + PAD : PAD;
          let top  = aFallback ? aFallback.y - wrapRect.top  + PAD : PAD;
          left = Math.max(4, Math.min(left, wrapRect.width  - CARD_W - 4));
          top  = Math.max(4, Math.min(top,  wrapRect.height - CARD_H - 4));

          hideTipSel(tipText);
          setCardPos({ left, top });
          setSelectedText(d);
          setSelectedFather(null);
          setShowMore(false);
          ev.stopPropagation();
          return;
        }

        const CARD_W = 430, CARD_H = 320, PAD = 12;

        // Where is this dot on screen relative to the wrapper?
        const a = textAnchorClient(this, d);
        const relX = a ? a.x - wrapRect.left : wrapRect.width / 2;
        const relY = a ? a.y - wrapRect.top  : wrapRect.height / 2;

        // Danger zones: left is generous (card width), others modest
        const LEFT_THRESHOLD  = CARD_W + 24;   // ≈ card width + padding
        const EDGE_PAD        = 48;            // top/right/bottom margin

        const tooLeft   = relX < LEFT_THRESHOLD;
        const tooRight  = relX > wrapRect.width  - EDGE_PAD;
        const tooTop    = relY < EDGE_PAD;
        const tooBottom = relY > wrapRect.height - EDGE_PAD;

        const shouldRecenter = (tooLeft || tooRight || tooTop || tooBottom);

        hideTipSel(tipText); // hide small hover tip, keep segment box if any

        if (shouldRecenter && zoomRef.current && svgSelRef.current) {
          // Behave like SearchBar in terms of placement, but DO NOT change zoom
          const centerLeft = Math.round((wrapRect.width - CARD_W) / 2);
          const centerTop  = Math.max(8, Math.round(72));

          setCardPos({ left: centerLeft, top: centerTop });
          setSelectedText(d);
          setSelectedFather(null);
          setShowMore(false);

          const kTarget = kRef.current ?? 1;
          const xAstro  = toAstronomical(d.when);
          const yU      = laneYUForText(d);

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
        } else {
          // Old behavior: card anchored near the dot, no camera move
          let left = a ? a.x - wrapRect.left + PAD : PAD;
          let top  = a ? a.y - wrapRect.top  + PAD : PAD;
          left = Math.max(4, Math.min(left, wrapRect.width  - CARD_W - 4));
          top  = Math.max(4, Math.min(top,  wrapRect.height - CARD_H - 4));

          setCardPos({ left, top });
          setSelectedText(d);
          setSelectedFather(null);
          setShowMore(false);
        }

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

  const allowFatherHover = () => {
  const k = kRef.current;
  const hasSel = !!(selectedText || selectedFather);
  return (k >= ZOOM_THRESHOLD) || (hasSel && k >= ZOOM_SEGMENT_THRESHOLD);
};


    // Lightweight hover tooltip for fathers (zoomed-in like texts)
fathersSel
  .on("mouseover", function (_ev, d) {
    if (!allowFatherHover()) return;
    // mark hovered father for connection highlighting
    hoveredFatherIdRef.current = d.id;
    const zx = zxRef.current, zy = zyRef.current, kNow = kRef.current;
    if (zx && zy) scheduleRenderConnections(zx, zy, kNow);

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
    if (!allowFatherHover()) return;
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
    if (zx && zy) scheduleRenderConnections(zx, zy, kNow);

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

    const wrapRect = wrapRef.current?.getBoundingClientRect();
    if (!wrapRect) {
      // Fallback: old behavior if something is weird
      const aFallback = fatherAnchorClient(this, d);
      const CARD_W = 430, CARD_H = 320, PAD = 12;
      let left = aFallback ? aFallback.x - wrapRect.left + PAD : PAD;
      let top  = aFallback ? aFallback.y - wrapRect.top  + PAD : PAD;
      left = Math.max(4, Math.min(left, wrapRect.width  - CARD_W - 4));
      top  = Math.max(4, Math.min(top,  wrapRect.height - CARD_H - 4));

      hideTipSel(tipText);
      setFatherCardPos({ left, top });
      setSelectedFather(d);
      setSelectedText(null);
      setShowMore(false);
      ev.stopPropagation();
      return;
    }

    const CARD_W = 430, CARD_H = 320, PAD = 12;

    // anchor near the triangle
    const a = fatherAnchorClient(this, d);
    const relX = a ? a.x - wrapRect.left : wrapRect.width / 2;
    const relY = a ? a.y - wrapRect.top  : wrapRect.height / 2;

    // Danger zones (same as for texts)
    const LEFT_THRESHOLD  = CARD_W + 24;
    const EDGE_PAD        = 48;

    const tooLeft   = relX < LEFT_THRESHOLD;
    const tooRight  = relX > wrapRect.width  - EDGE_PAD;
    const tooTop    = relY < EDGE_PAD;
    const tooBottom = relY > wrapRect.height - EDGE_PAD;

    const shouldRecenter = (tooLeft || tooRight || tooTop || tooBottom);

    // Only hide the tiny hover tip; leave the segment box (tipSeg) up
    hideTipSel(tipText);
    // hideTipSel(tipSeg);   // <-- do NOT call this
    // hideTipSel(tipDur);   // optional: keep duration card if it’s open

    if (shouldRecenter && zoomRef.current && svgSelRef.current) {
      // Behave like SearchBar for card placement, but keep current zoom
      const centerLeft = Math.round((wrapRect.width - CARD_W) / 2);
      const centerTop  = Math.max(8, Math.round(72));

      setFatherCardPos({ left: centerLeft, top: centerTop });
      setSelectedFather(d);
      setSelectedText(null);
      setShowMore(false);

      const kTarget = kRef.current ?? 1;
      const xAstro  = toAstronomical(d.when);
      const yU      = laneYUForFather(d);

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
    } else {
      // Old behavior: card anchored near the triangle, no camera move
      let left = a ? a.x - wrapRect.left + PAD : PAD;
      let top  = a ? a.y - wrapRect.top  + PAD : PAD;
      left = Math.max(4, Math.min(left, wrapRect.width  - CARD_W - 4));
      top  = Math.max(4, Math.min(top,  wrapRect.height - CARD_H - 4));

      setFatherCardPos({ left, top });
      setSelectedFather(d);   // open FatherCard
      setSelectedText(null);  // ensure TextCard is closed
      setShowMore(false);
    }

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
    labelHPix =
      zy(d._labelAnchorY + d._labelAnchorH) - zy(d._labelAnchorY);
  }

  const maxByBand = labelHPix * LABEL_FONT_MAX_REL;
  const fontPx = clamp(
    labelHPix * LABEL_TO_BAND,
    LABEL_FONT_MIN,
    Math.min(LABEL_FONT_MAX_ABS, maxByBand)
  );

  // ─────────────────────────────────────────────
  // Mesopotamian-only font scale (TWEAK THIS)
  const isMesopotamian =
    d.name === "Mesopotamian" ||
    String(d.name ?? "").includes("Mesopo");

  const finalFontPx = isMesopotamian
    ? fontPx * 0.5   // ← adjust later
    : fontPx;
  // ─────────────────────────────────────────────

const labelSel = g
  .select("text.durationLabel")
  .attr("x", Math.min(x0, x1) + 4)
  .attr("y", labelYTop + labelHPix / 3)
  .style("font-size", `${finalFontPx}px`);

labelSel.each(function (d) {
  const raw =
    d._isCustomGroup && d._labelText
      ? d._labelText
      : (d.name ?? "");

  const label = String(raw ?? "");
  const lines = label.split("\n");

  const t = d3.select(this);

  // PERF: avoid rebuilding tspans every zoom tick if the label content/layout didn't change.
  // We key by label text + number of lines + current x (multi-line tspans lock x).
  const xAttr = t.attr("x") ?? "";
  const nextKey = `${label}__${lines.length}__${xAttr}`;
  if (this.__durLabelKey === nextKey) return;
  this.__durLabelKey = nextKey;

  // Clear previous content
  t.selectAll("tspan").remove();

  // ✅ If it's a normal single-line label, keep classic behavior (no tspans)
  if (lines.length <= 1) {
    t.text(label);
    return;
  }

  // ✅ Multi-line only: build tspans and lock x per line
  t.text(null);
  const x = xAttr;

  lines.forEach((line, i) => {
    t.append("tspan")
      .attr("x", x)
      .attr("dy", i === 0 ? "0em" : "1.05em")
      .text(line);
  });
});
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
  const rBase = textBaseR(d) * k;
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

// === Relevance dimming (visual only) ===
const hasSel = !!(selectedText || selectedFather);
const relTexts = relevantTextIdsRef.current;
const relFathers = relevantFatherIdsRef.current;

// Perf: these opacity passes touch many nodes; only redo when the zoom tier or selection changes.
const hasSelectionForTier = hasSel;
let zoomMode;
if (hasSelectionForTier) {
  zoomMode = (k < ZOOM_SEGMENT_THRESHOLD) ? "outest" : "deepest";
} else if (k < ZOOM_SEGMENT_THRESHOLD) {
  zoomMode = "outest";
} else if (k < ZOOM_THRESHOLD) {
  zoomMode = "middle";
} else {
  zoomMode = "deepest";
}

const styleKey =
  `${layerMode}|${selectedText ? selectedText.id : ""}|${selectedFather ? selectedFather.id : ""}`;

const last = lastStyleStateRef.current;
const shouldUpdateDimming = (last.zoomMode !== zoomMode) || (last.key !== styleKey);

if (shouldUpdateDimming) {
  lastStyleStateRef.current = { zoomMode, key: styleKey };

  gTexts.selectAll("circle.textDot")
    .style("opacity", d => {
      // hide selected text icon completely
      if (selectedText && selectedText.id === d.id) return 0;

      if (!hasSel) return BASE_OPACITY;
      return relTexts.has(d.id) ? BASE_OPACITY : DIM_NODE_OPACITY;
    }, "important");

  // Stronger dimming for pies: dim wedges + separators directly
  gTexts.selectAll("g.dotSlices").each(function (d) {
    // hide selected text pie completely
    if (selectedText && selectedText.id === d.id) {
      const g = d3.select(this);
      g.selectAll("path.slice").style("fill-opacity", 0, "important");
      g.selectAll("line.sep").style("stroke-opacity", 0, "important");
      return;
    }

    const isRel = !hasSel || relTexts.has(d.id);
    const o = isRel ? BASE_OPACITY : DIM_NODE_OPACITY;

    const g = d3.select(this);

    g.selectAll("path.slice")
      .style("fill-opacity", o, "important");

    g.selectAll("line.sep")
      .style("stroke-opacity", o, "important");
  });

  gFathers.selectAll("g.fatherMark")
    .style("opacity", d => {
      // hide selected father icon completely
      if (selectedFather && selectedFather.id === d.id) return 0;

      if (!hasSel) return BASE_OPACITY;
      return relFathers.has(d.id) ? BASE_OPACITY : DIM_NODE_OPACITY;
    }, "important");
}



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

    const rBase = textBaseR(d) * k;
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
  const rBase = textBaseR(d) * k;
  const rDraw = isSelected ? rBase * HOVER_SCALE_DOT : rBase;

  const g = d3.select(this);
  g.attr("transform", `translate(${cx},${cy})`);
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

const isConcept = hasConceptTag(d.historicMythicStatusTags);

// 1) Colored slices (triangle default, square for Concept)
const slices = isConcept
  ? splitSquareSlices(cx, cy, r, cols)
  : leftSplitTriangleSlices(cx, cy, r, cols);

d3.select(this)
  .select("g.slices")
  .selectAll("path.slice")
  .data(slices, (_, i) => i)
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

// 2) White overlays
const showMid = !isConcept && hasHistoricTag(d.historicMythicStatusTags) && r >= 3;

const overlaySegs = isConcept
  ? buildSquareOverlaySegments(cx, cy, r, cols)
  : buildOverlaySegments(cx, cy, r, cols, showMid);

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
  .attr("stroke-width", (s) => (s.type === "mid" ? w * 2.0 : w))
  .style("opacity", showOverlays ? 1 : 0);

// 3) Outer border (triangle default, square for Concept)
const borderPath = isConcept
  ? `M ${cx - r} ${cy - r} H ${cx + r} V ${cy + r} H ${cx - r} Z`
  : `M ${cx - r} ${cy - r} L ${cx - r} ${cy + r} L ${cx + r} ${cy} Z`;

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
    const isConcept = hasConceptTag(d.historicMythicStatusTags);
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
    const iconCx = cxHead + rIcon * (isConcept ? 0.0 : 0.1);             // left/right tweak here
    const iconCy = cyHead - rIcon * (isConcept ? 0.35 : 0.5); // move slightly up

    const g = d3.select(this);

    // Border color from symbolic system (CSS uses --pin-color)
    g.style("--pin-color", pinColor);

    // Teardrop body outline
    g.select("path.tl-pin-body")
      .attr("d", pinPathD(cx, cy, rHead));

    // Simple right-pointing triangle in the head
    const iconG = g.select("g.tl-pin-icon");

    // 1) Colored triangle slices, same helper as main fathers but scaled
    const iconSlices = isConcept
      ? splitSquareSlices(iconCx, iconCy, rIcon, cols)   // (your horizontal-band version)
      : leftSplitTriangleSlices(iconCx, iconCy, rIcon, cols);

    iconG.selectAll("path.slice")
      .data(iconSlices, (_, i) => i)
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
    const showMid = !isConcept && hasHistoricTag(d.historicMythicStatusTags) && rIcon >= 3;
    const overlaySegs = isConcept
        ? buildSquareOverlaySegments(iconCx, iconCy, rIcon, cols)
        : buildOverlaySegments(iconCx, iconCy, rIcon, cols, showMid);


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
      .attr("stroke-width", showOverlays ? 2*w : 0)
      .attr("opacity", showOverlays ? 1 : 0);
  });

  // ----- Lightweight viewport culling (texts, pies, fathers) -----
  // PERF: this touches lots of DOM nodes; coalesce to 1 per animation frame during zoom/pan
  cullArgsRef.current = { zx, innerWidth };
  if (!cullUpdateRaf.current) {
    cullUpdateRaf.current = requestAnimationFrame(() => {
      cullUpdateRaf.current = 0;
      const args = cullArgsRef.current;
      if (!args) return;

      const xMinAstro = args.zx.invert(0);
      const xMaxAstro = args.zx.invert(args.innerWidth);
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

      // Only update if changed (cheap equality check)
      const prev = visibleIdsRef.current;
      let changed = false;
      if (prev.size !== newVisible.size) {
        changed = true;
      } else {
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
    });
  }

  scheduleRenderConnections(zx, zy, k);
}



function updateInteractivity(k) {
  const hasSelection = !!(selectedText || selectedFather);

  // 3-level zoom mode (do NOT assign tier CSS classes here anymore;
  // the zoom handler is now the single source of truth for zoom-* classes)
  let zoomMode;
  if (hasSelection) {
    // keep your existing behavior: when selected, middle behaves like deepest
    zoomMode = (k < ZOOM_SEGMENT_THRESHOLD) ? "outest" : "deepest";
  } else if (k < ZOOM_SEGMENT_THRESHOLD) {
    zoomMode = "outest";
  } else if (k < ZOOM_THRESHOLD) {
    zoomMode = "middle";
  } else {
    zoomMode = "deepest";
  }

  // only keep generic flag(s) here (zoom tier classes live in zoom handler)
  const svgSel = d3.select(svgRef.current);
  svgSel.classed("has-selection", hasSelection);

  // Keep layer-mode classes on the SVG via D3 so React doesn't wipe zoom-* classes
  svgSel
    .classed("layer-durations", layerMode === "durations")
    .classed("layer-segments",  layerMode === "segments")
    .classed("layer-none",      layerMode === "none");

  // === Radio-controlled layer policy (ONLY affects durations/segments) ===
  const durationsAllowed = (layerMode === "durations");
  const segmentsAllowed  = (layerMode === "segments");

  const showDurationsLayer =
    durationsAllowed && (zoomMode === "outest") && !hasSelection;

  const showSegmentsLayer =
    segmentsAllowed && (zoomMode === "outest" || zoomMode === "middle") && !hasSelection;

const showPassiveOutlines =
  !hasSelection && (
    (layerMode === "none") ||
    (layerMode === "durations" && (zoomMode === "middle" || zoomMode === "deepest")) ||
    (layerMode === "segments"  && (zoomMode === "deepest"))
  );
  // Show/hide whole groups (prevents accidental hit-testing & visual collisions)
  gOut.style("display", null);
  gSeg.style("display", showSegmentsLayer ? null : "none");

  // Ensure duration labels are always above segment rects.
  // Otherwise segment hover (fill-opacity ~0.70) paints over the text.
  gOut.raise();

  // Custom duration polygons: show in Durations mode OR outline-only in None mode
  gCustom.style("display", (showDurationsLayer || showPassiveOutlines) ? null : "none");

  // Kill stale cards when mode/tier doesn't allow that layer
  if (!showDurationsLayer) clearActiveDuration();
  if (!showSegmentsLayer) clearActiveSegment();

  // === Selection override: once a text/father is selected,
  //     durations/segments become inert; texts/fathers stay clickable
  if (hasSelection) {
    const nodesHot = (zoomMode !== "outest"); // <-- key rule

    gOut.selectAll("rect.outlineRect")
      .style("pointer-events", "none");
    gSeg.selectAll("rect.segmentHit")
      .style("pointer-events", "none");
    gCustom.selectAll("path.customGroup")
      .style("pointer-events", "none");

gTexts.selectAll("circle.textDot")
  .style("pointer-events", d => {
    if (!nodesHot) return "none";
    return relevantTextIdsRef.current.has(d.id) ? "all" : "none";
  });

gFathers.selectAll("g.fatherMark")
  .style("pointer-events", d => {
    if (!nodesHot) return "none";
    return relevantFatherIdsRef.current.has(d.id) ? "all" : "none";
  });

    clearActiveSegment();
    clearActiveDuration();
    updateHoverVisuals();
    return;
  }

  // === No selection: radio-aware 3-level model ===
  if (zoomMode === "outest") {
    // OUTEST: either durations hot (Durations mode) or segments hot (Segments mode) or neither
    gOut.selectAll("rect.outlineRect")
      .style("pointer-events", d =>
        showDurationsLayer && !d._isCustomGroup && !d._hiddenCustom ? "all" : "none"
      );

    gSeg.selectAll("rect.segmentHit")
      .style("pointer-events", showSegmentsLayer ? "all" : "none");

    gTexts.selectAll("circle.textDot")
      .style("pointer-events", "none");
    gFathers.selectAll("g.fatherMark")
      .style("pointer-events", "none");

    gCustom.selectAll("path.customGroup")
      .style("pointer-events", showDurationsLayer ? "all" : "none");

    // ensure wrong-layer selection can't persist
    if (!showDurationsLayer) clearActiveDuration();
    if (!showSegmentsLayer) clearActiveSegment();

  } else if (zoomMode === "middle") {
    // MIDDLE: segments can be hot only in Segments mode; durations always inert
    gOut.selectAll("rect.outlineRect")
      .style("pointer-events", "none");

    gSeg.selectAll("rect.segmentHit")
      .style("pointer-events", showSegmentsLayer ? "all" : "none");

    gTexts.selectAll("circle.textDot")
      .style("pointer-events", "none");
    gFathers.selectAll("g.fatherMark")
      .style("pointer-events", "none");

    gCustom.selectAll("path.customGroup")
      .style("pointer-events", "none");

    // durations never active here; segments only if allowed
    clearActiveDuration();
    if (!showSegmentsLayer) clearActiveSegment();

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
      .attr("pointer-events", "none")
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
    scheduleRenderConnections(zx, zy, t.k);
    updateInteractivity(t.k);


 

    // === Zoom-level “mode” classes for CSS (outest / middle / deepest) ===
    const hasSelection = !!(selectedText || selectedFather);


let zoomMode;
if (hasSelection) {
  // When selected: blur only on OUTEST, keep MIDDLE crisp by avoiding zoom-middle
  zoomMode = (t.k < ZOOM_SEGMENT_THRESHOLD) ? "outest" : "deepest";
} else if (t.k < ZOOM_SEGMENT_THRESHOLD) {
  zoomMode = "outest";   // durations focus
} else if (t.k < ZOOM_THRESHOLD) {
  zoomMode = "middle";   // segments focus (existing blur behavior stays)
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
      const seg = segmentsById.get(activeSegIdRef.current);
      if (seg) showSegAnchored(seg);
    }
    if (activeDurationIdRef.current) {
      const out = outlinesById.get(activeDurationIdRef.current);
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
    // logRenderedCounts(); // disable: expensive during zoom end
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


   if (!didInitRef.current) {
   // First time only: bind zoom and set init transform
  const initT = d3.zoomIdentity; // translate(0,0).scale(1)


   apply(initT.rescaleX(x), initT.rescaleY(y0), initT.k);
   svgSel.call(zoom).call(zoom.transform, initT);
   updateInteractivity(initT.k);
   // Ensure zoom tier classes are correct even when state changes without a zoom event
   {
     const hasSelection = !!(selectedText || selectedFather);
     let zoomMode;
     if (hasSelection) {
       zoomMode = (initT.k < ZOOM_SEGMENT_THRESHOLD) ? "outest" : "deepest";
     } else if (initT.k < ZOOM_SEGMENT_THRESHOLD) {
       zoomMode = "outest";
     } else if (initT.k < ZOOM_THRESHOLD) {
       zoomMode = "middle";
     } else {
       zoomMode = "deepest";
     }
     if (svgRef.current) {
       d3.select(svgRef.current)
         .classed("zoom-outest",  zoomMode === "outest")
         .classed("zoom-middle",  zoomMode === "middle")
         .classed("zoom-deepest", zoomMode === "deepest");
     }
   }

   setIsReady(true);

   lastTransformRef.current = initT;   // remember
   didInitRef.current = true;
} else {
  // Subsequent runs: DO NOT reset transform.
  // Re-apply the last transform to current scales for a seamless update.
  const t = lastTransformRef.current ?? d3.zoomIdentity;
  kRef.current = t.k;  // make sure hover logic sees the current zoom
  apply(t.rescaleX(x), t.rescaleY(y0), t.k);
  updateInteractivity(t.k);

   // Ensure zoom tier classes are correct even when state changes without a zoom event
   {
     const hasSelection = !!(selectedText || selectedFather);
     let zoomMode;
     if (hasSelection) {
       zoomMode = (t.k < ZOOM_SEGMENT_THRESHOLD) ? "outest" : "deepest";
     } else if (t.k < ZOOM_SEGMENT_THRESHOLD) {
       zoomMode = "outest";
     } else if (t.k < ZOOM_THRESHOLD) {
       zoomMode = "middle";
     } else {
       zoomMode = "deepest";
     }
     if (svgRef.current) {
       d3.select(svgRef.current)
         .classed("zoom-outest",  zoomMode === "outest")
         .classed("zoom-middle",  zoomMode === "middle")
         .classed("zoom-deepest", zoomMode === "deepest");
     }
   }

  setIsReady(true);

  // console.log("[UI] reapply transform after state change", {
  //   tK: t.k,
  //   hasSelection: !!(selectedText || selectedFather),
  // });

  // logRenderedCounts(); // disable: expensive debug
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
  layerMode,
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
      layerMode={layerMode}
      onLayerModeChange={setLayerMode}
      showTexts={showTexts}
      onShowTextsChange={setShowTexts}
      showFathers={showFathers}
      onShowFathersChange={setShowFathers}
      showConnections={showConnections}
      onShowConnectionsChange={setShowConnections}
    />

    <svg
      ref={svgRef}
      className={`timelineSvg ${modalOpen ? "isModalOpen" : ""}`}
      style={{ opacity: isReady ? 1 : 0 }}
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