import { useCallback, useEffect, useMemo, useRef, useState, useId } from "react";
import { createPortal } from "react-dom";
import * as d3 from "d3";
import durations from "../data/durations.json";
import "../styles/timeline.css";
import TextCard from "./textCard";
import FatherCard from "./fatherCard";
import SearchBar from "./searchBar";
import TagPanel from "./tagPanel";
import TimelineMap from "./timelineMap";
import MarkerIcon from "./markerIcon";

/* ===== Timeline debug helpers (safe) =====
   Toggle DEBUG_TL to enable/disable logs without breaking runtime.
*/
const DEBUG_TL = true;

function dbgCount(key) {
  if (!DEBUG_TL) return 0;
  // Persist across hot reloads
  const store = (window.__TLDBG__ ||= { counts: Object.create(null), t0: performance.now() });
  store.counts[key] = (store.counts[key] || 0) + 1;
  return store.counts[key];
}

function dbgLog(label, payload) {
  if (!DEBUG_TL) return;
  const store = (window.__TLDBG__ ||= { counts: Object.create(null), t0: performance.now() });
  const t = (performance.now() - store.t0).toFixed(1);
  if (payload === undefined) console.log(`[TLDBG ${t}] ${label}`);
  else console.log(`[TLDBG ${t}] ${label}`, payload);
}
/* ===== end debug helpers ===== */

// ===== Timeline debug logging =====
const DEBUG_HOVER = false; // set false to silence hover/connection logs
const DEBUG_MAP_SYNC = false; // set true only while debugging pin/map alignment





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

/*
 * Map View location clusters:
 * projected objects within this many browser pixels are treated as sharing one
 * location and represented by a disclosure triangle plus expandable branch.
 */
const LOCATION_CLUSTER_TOLERANCE_PX = 10;

/*
 * Selected-location disclosure triangle size, in fixed screen pixels.
 * Both the closed/downward and open/upward arrows use this same geometry.
 */
const LOCATION_CLUSTER_BUTTON_RADIUS = 7.2;
const LOCATION_CLUSTER_COLLAPSED_RADIUS = LOCATION_CLUSTER_BUTTON_RADIUS;
const LOCATION_CLUSTER_EXPANDED_RADIUS = LOCATION_CLUSTER_BUTTON_RADIUS;

/*
 * Position of the hidden-object count relative to the disclosure button.
 * TWEAK THESE TWO VALUES to move every count label:
 * - negative X moves it left; positive X moves it right
 * - negative Y moves it up; positive Y moves it down
 */
const LOCATION_CLUSTER_COUNT_X_OFFSET = -2;
const LOCATION_CLUSTER_COUNT_Y_OFFSET = 2;

function locationClusterTrianglePath(cx, cy, size, pointsUp = false) {
  const halfWidth = size;
  const halfHeight = size * 0.78;

  return pointsUp
    ? [
        `M ${cx - halfWidth} ${cy + halfHeight}`,
        `L ${cx + halfWidth} ${cy + halfHeight}`,
        `L ${cx} ${cy - halfHeight}`,
        "Z",
      ].join(" ")
    : [
        `M ${cx - halfWidth} ${cy - halfHeight}`,
        `L ${cx + halfWidth} ${cy - halfHeight}`,
        `L ${cx} ${cy + halfHeight}`,
        "Z",
      ].join(" ");
}
/*
 * Base branch geometry at the reference map zoom.
 *
 * TWEAK THESE TWO VALUES to change the ordinary branch length:
 * - FIRST_ICON_Y controls the initial line from the pin to the first icon.
 * - ICON_SPACING controls the distance between subsequent icons.
 */
const LOCATION_CLUSTER_FIRST_ICON_Y = 18;
const LOCATION_CLUSTER_ICON_SPACING = 14;

/*
 * TWEAK THIS VALUE to control how strongly branch length reacts to map zoom.
 *
 * 0    = branch length never changes
 * 0.5  = gentle zoom response
 * 1    = branch length changes directly with map zoom
 */
const LOCATION_CLUSTER_BRANCH_ZOOM_SENSITIVITY = 0.4;

/*
 * The initial map camera opens at k=3. At that zoom the branch uses exactly
 * FIRST_ICON_Y and ICON_SPACING above.
 */
const LOCATION_CLUSTER_BRANCH_REFERENCE_MAP_ZOOM = 10;

/* Safety limits so the branch never becomes unusably short or long. */
const LOCATION_CLUSTER_BRANCH_MIN_SCALE = 0.5;
const LOCATION_CLUSTER_BRANCH_MAX_SCALE = 2.25;

/*
 * Ordinary/no-selection object-size controls.
 *
 * IMPORTANT: the ordinary Default View sizing path remains unchanged.
 * Selected mode gets its own normalized visual zoom below.
 */
const OBJECT_SIZE_MAX_VISUAL_ZOOM = 22;
const OBJECT_SIZE_MAP_MAX_CAMERA_ZOOM = 40;
const FATHER_SIZE_SCALE = 2.2;

/*
 * Unified SELECTED-state zoom range.
 *
 * Default chronological camera:
 *   1  -> 22
 *
 * Geographical camera:
 *   1  -> 40
 *
 * Both are normalized to exactly:
 *   1  -> 22
 *
 * Every selected-state object-size rule consumes this one normalized value.
 * This makes selected/connected objects shrink monotonically as either view is
 * zoomed out and guarantees identical sizes at both endpoints.
 */
const SELECTED_SIZE_MIN_VISUAL_ZOOM = 7;
const SELECTED_SIZE_MAX_VISUAL_ZOOM = 22;
const SELECTED_SIZE_MAP_MIN_CAMERA_ZOOM = 1;
const SELECTED_SIZE_MAP_MAX_CAMERA_ZOOM = 40;

/*
 * Selected pin endpoint sizes.
 *
 * Current selected-pin endpoints are 15px at deepest zoom and 8px at the
 * outer selected-size floor. These remain easy to tune independently.
 */
const SELECTED_PIN_HEAD_RADIUS_AT_MAX_ZOOM = 15;
const SELECTED_PIN_HEAD_RADIUS_AT_MIN_ZOOM = 8;

/*
 * Connected objects use the SAME transient hover enlargement as ordinary
 * objects. Selected-mode zoom still determines each object's BASE size; hover
 * simply multiplies that current size by the familiar 1.6 factor.
 */
const CONNECTED_OBJECT_HOVER_SCALE = HOVER_SCALE_DOT;

const LOCATION_CLUSTER_HIT_RADIUS = 13;

const DIM_NODE_OPACITY = 0.12;            // texts/fathers that are NOT relevant during selection

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

/*
 * Bottom timeline sizing.
 * Normal mode keeps the original one-row axis area. Selected chronological
 * mode expands it to three rows: later / selected / earlier.
 */
const TIMELINE_AXIS_BOTTOM_HEIGHT = 28;
const SELECTED_TIMELINE_AXIS_HEIGHT_MULTIPLIER = 3;
const SELECTED_TIMELINE_AXIS_BOTTOM_HEIGHT =
  TIMELINE_AXIS_BOTTOM_HEIGHT *
  SELECTED_TIMELINE_AXIS_HEIGHT_MULTIPLIER;

/*
 * Label baselines measured downward from the horizontal timeline.
 * These values intentionally fit inside 3 × TIMELINE_AXIS_BOTTOM_HEIGHT.
 */
const SELECTED_AXIS_LABEL_Y = {
  upper: 16,
  middle: 40,
  lower: 64,
};

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

/*
 * Selected-tooltip placement controls.
 *
 * The main selected-object tooltip is deterministic in BOTH views:
 * it is always centered directly above the selected pin.
 *
 * The two views may still use different vertical gaps if desired.
 * Connected-object mini-tooltips retain their separate collision-aware
 * placement system.
 */
const SELECTED_TOOLTIP_GAP = 12;
const SELECTED_TOOLTIP_CHRONOLOGICAL_GAP = 6;

/* Tooltip border hierarchy.
 * These values feed CSS custom properties, including the visible hover frame.
 */
const MAIN_TOOLTIP_BORDER_WIDTH = 2;
const MINI_TOOLTIP_BORDER_WIDTH = 1;
const MINI_TOOLTIP_HOVER_RING_WIDTH = 0;

/*
 * Selected chronological guide appearance.
 * Opacity accepts 0–1. The guide color is intentionally darker than the
 * ordinary grid because the normal grid was already at full opacity but used
 * a very pale stroke.
 */
const SELECTED_CHRONOLOGY_GUIDE_OPACITY = 1;
const SELECTED_CHRONOLOGY_GUIDE_COLOR = "#94a3b8";

/* Selected chronological date is slightly larger than connected dates. */
const SELECTED_AXIS_PRIMARY_DATE_FONT_SIZE = "1.22em";

/*
 * Selected-connection Info Window hierarchy.
 *
 * The selected endpoint is deliberately more prominent than the connected
 * endpoint being inspected. These values affect only the Info Window.
 */
const CONNECTION_INFO_SELECTED_NAME_FONT_SIZE = "1.1em";
const CONNECTION_INFO_CONNECTED_NAME_FONT_SIZE = "1em";
const CONNECTION_INFO_SELECTED_MARKER_SIZE = 18;
const CONNECTION_INFO_CONNECTED_MARKER_SIZE = 13;

/*
 * Persistent connected-object mini-label controls.
 */
const MINI_TOOLTIP_GAP = 7;
const MINI_TOOLTIP_VIEWPORT_PADDING = 4;
const MINI_TOOLTIP_OBJECT_CLEARANCE = 28;
const MINI_TOOLTIP_LINE_CLEARANCE = 34;

/*
 * Selection tooltip sequence infrastructure is intentionally retained, but
 * automatic mini-tooltips are disabled for the current presentation.
 */
const MINI_TOOLTIPS_ENABLED = false;
const MINI_TOOLTIP_AUTO_MIN_MS = 0;
const MINI_TOOLTIP_AUTO_MAX_MS = 0;
const MINI_TOOLTIP_OBJECTS_FOR_MAX = 10;

/*
 * Selected-neighborhood focus controls.
 * With no connected object hovered, every selected connection remains bright.
 * Hovering one connected object keeps its own line/object bright and dims the
 * rest of the selected one-hop neighborhood.
 */
/*
 * Selected-connection opacity hierarchy.
 *
 * TWEAK THESE TWO VALUES:
 * - IDLE = all direct connection lines immediately after selecting an object
 * - DIM  = non-hovered direct connections while one connected object is hovered
 *
 * The hovered connection itself still uses CONNECTION_HIGHLIGHT_OPACITY below.
 */
const CONNECTION_SELECTED_IDLE_OPACITY = 0.08;
const CONNECTION_SELECTED_DIM_OPACITY = 0.1;

/*
 * Selected pins and connected objects now respond to the active view's zoom.
 * The scale is clamped so maximum map/timeline zoom remains usable.
 */

function getMiniTooltipAutoDuration(connectedObjectCount) {
  const count = Math.max(1, Number(connectedObjectCount) || 1);
  const denominator = Math.max(1, MINI_TOOLTIP_OBJECTS_FOR_MAX - 1);
  const progress = clamp((count - 1) / denominator, 0, 1);

  return Math.round(
    MINI_TOOLTIP_AUTO_MIN_MS +
      progress *
        (MINI_TOOLTIP_AUTO_MAX_MS - MINI_TOOLTIP_AUTO_MIN_MS)
  );
}

// Now supports an optional third line for "note"
const tipHTML = (title, subtitle, note) => `
  <div class="tl-tip-title">${title ?? ""}</div>
  ${subtitle ? `<div class="tl-tip-sub">${subtitle}</div>` : ""}
  ${note ? `<div class="tl-tip-note">${note}</div>` : ""}
`;

/*
 * Shared object tooltip layout:
 * line 1: object name
 * line 2: date metadata (and author for texts)
 * line 3: historical/original location, slightly bolder than the date line
 */
const hasTooltipValue = (value) => {
  const text = String(value ?? "").trim();
  return !!text && text !== "-" && text !== "—";
};

const objectTipHTML = (title, dateLineHTML, location) => {
  const locationText = String(location || "").trim();

  return `
    <div class="tl-tip-title">${title ?? ""}</div>
    ${
      dateLineHTML
        ? `<div class="tl-tip-meta tl-tip-dateLine">${dateLineHTML}</div>`
        : ""
    }
    ${
      hasTooltipValue(locationText)
        ? `<div class="tl-tip-meta tl-tip-location" style="font-weight: 600;"><span class="tl-tip-locationText">${locationText}</span></div>`
        : ""
    }
  `;
};

const textObjectTipHTML = (row) => {
  const dateText = String(
    row?.displayDate || formatYear(row?.when) || ""
  ).trim();

  const authorText = String(
    row?.authorName || row?.Author || row?.["Author"] || ""
  ).trim();

  const authorHTML = hasTooltipValue(authorText)
    ? `<span class="tl-tip-author">by ${authorText}</span>`
    : "";

  const dateHTML = hasTooltipValue(dateText)
    ? `<span class="tl-tip-date">${dateText}</span>`
    : "";

  const dateLineHTML = [authorHTML, dateHTML]
    .filter(Boolean)
    .join('<span class="tl-tip-metaDivider" aria-hidden="true"> · </span>');

  return objectTipHTML(
    row?.title || "",
    dateLineHTML,
    row?.originalLocation ||
      row?.originalGeographicalLocation ||
      row?.["Original Geographical Location"] ||
      ""
  );
};

const fatherObjectTipHTML = (row) => {
  const dobText = String(row?.dob || row?.["D.O.B"] || "").trim();
  const dodText = String(row?.dod || row?.["D.O.D"] || "").trim();

  const dateRangeText =
    hasTooltipValue(dobText) && hasTooltipValue(dodText)
      ? `${dobText} – ${dodText}`
      : hasTooltipValue(dobText)
        ? dobText
        : hasTooltipValue(dodText)
          ? dodText
          : "";

  const dateLineHTML = hasTooltipValue(dateRangeText)
    ? `<span class="tl-tip-date">${dateRangeText}</span>`
    : "";

  return objectTipHTML(
    row?.name || "",
    dateLineHTML,
    row?.location ||
      row?.originalLocation ||
      row?.Location ||
      ""
  );
};

/*
 * Tooltip borders use the same mean-color logic as cross-system
 * connection lines. A one-system object simply keeps its own color.
 */
function meanObjectColors(colors) {
  const valid = (Array.isArray(colors) ? colors : [colors])
    .map((color) => String(color || "").trim())
    .filter(Boolean);

  if (!valid.length) return "#777777";

  return valid.slice(1).reduce(
    (mixed, color) => _meanHex(mixed, color) || mixed,
    valid[0]
  );
}

function objectTooltipAccent(row) {
  const colors =
    Array.isArray(row?.colors) && row.colors.length
      ? row.colors
      : [row?.color];

  return meanObjectColors(colors);
}

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

function computePinHeadGeometry(
  cx,
  cy,
  rHead,
  fixedHeadRadius = null
) {
  const MIN_R = 10;
  const MAX_R = 22;

  const scaled = (rHead || MIN_R) * 3;

  /*
   * Selected pins pass a direct screen-space radius here. Other pin types,
   * such as card-hover pins, keep their existing computed/clamped sizing.
   */
  const R = Number.isFinite(fixedHeadRadius)
    ? Math.max(1, fixedHeadRadius)
    : Math.max(MIN_R, Math.min(MAX_R, scaled));

  const OFFSET_Y = R * 1.8;

  // ✅ CONSTANT PIXEL NUDGE: tweak this value
  const OFFSET_X = 0; // negative = left, positive = right

  const cxHead = cx + OFFSET_X;
  const cyHead = cy - OFFSET_Y;

  return { cxHead, cyHead, R };
}




function pinPathD(
  cx,
  cy,
  rHead,
  fixedHeadRadius = null
) {
  const { cxHead, cyHead, R } =
    computePinHeadGeometry(
      cx,
      cy,
      rHead,
      fixedHeadRadius
    );

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

// Read an optional numeric dataset field without turning an empty string into 0.
function getOptionalFiniteNumber(obj, ...candidateKeys) {
  for (const key of candidateKeys) {
    const raw = getLooseField(obj, key);

    if (raw == null || String(raw).trim() === "") continue;

    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }

  return null;
}

function hasMapCoordinates(entry) {
  if (!entry) return false;

  const latitude =
    entry.Latitude ?? entry.latitude ?? entry.lat;
  const longitude =
    entry.Longitude ?? entry.longitude ?? entry.lng ?? entry.lon;

  if (
    latitude == null ||
    longitude == null ||
    String(latitude).trim() === "" ||
    String(longitude).trim() === ""
  ) {
    return false;
  }

  return (
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude))
  );
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
  const nestedModules =
    import.meta.glob("../data/**/*_connections.json", {
      eager: true,
      import: "default",
    }) || {};

  /*
   * A root-level supraclusteral_connections.json has no folder for folderOf()
   * to recover. Load that exact path as well; object spread de-duplicates it
   * if the broader glob already matched it.
   */
  const rootSupraclusteralModules =
    import.meta.glob("../data/supraclusteral_connections.json", {
      eager: true,
      import: "default",
    }) || {};

  const modules = {
    ...nestedModules,
    ...rootSupraclusteralModules,
  };

  const folderOf = (p) => {
    const m = p.match(/\/data\/([^/]+)\//);
    return m ? m[1] : null;
  };

  const registry = [];

  for (const [path, data] of Object.entries(modules)) {
    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) continue;

    const isSupraclusteral =
      /\/supraclusteral_connections\.json$/i.test(path);

    const folder = folderOf(path);

    // Ordinary local connection files still require their containing folder.
    if (!isSupraclusteral && !folder) continue;

    registry.push({
      folder: folder || "__supraclusteral__",

      /*
       * Supraclusteral rows carry their own Primary/Secondary Duration fields,
       * so they do not need (and should not inherit) a fallback band.
       */
      durationId:
        isSupraclusteral || !folder
          ? null
          : `${folder}-composite`,

      connections: rows,
      isSupraclusteral,
      sourcePath: path,
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

/*
 * Connection datasets have accumulated a few shorthand category values.
 * Normalize them once so rendering, cards, line styles, and Info Windows all
 * interpret the same relationship vocabulary.
 */
function normalizeConnectionCategory(rawCategory) {
  const category = String(rawCategory || "")
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ");

  const aliases = {
    explicit: "explicit reference",
    "direct reference": "explicit reference",
    indirect: "indirect connection",
    comparative: "comparative connection",
    speculative: "speculative connection",
    custom: "custom connection",
    cognate: "cognate connection",
    "part of": "partof",
    "part-of": "partof",
    part_of: "partof",
  };

  return aliases[category] || category;
}

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
  // Direction must not exclude text-primary / father-secondary rows: those
  // still belong on the secondary father's card (for example, Malachi).
  const relevant = allConnections.filter((c) => {
    const isSubjectA =
      c.aId === subjectId &&
      c.aType === "father";

    const isSubjectB =
      c.bId === subjectId &&
      c.bType === "father";

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
  const indirectTextRefs = [];       // "is indirectly referenced in Text1, Text2, Text3"
  const looseItems = [];
  const cognateEntries = [];         // "is cognate with A, B, C"
  const comparativeEntries = [];     // "shares a comparative framework with A, B, C"
  const speculativeFatherEntries = []; // "shares structural similarities with A, B, C"


  const ensureGroup = (obj, key) => {
    if (!obj[key]) obj[key] = [];
    return obj[key];
  };

  for (const c of relevant) {
    const rawCat = c.category || "";
    const category = normalizeConnectionCategory(rawCat);
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

    // --- Father ↔ father speculative connection ---
    // Rendered cautiously as a structural similarity, not as asserted lineage,
    // influence, identity, or transmission.
    if (
      category === "speculative connection" &&
      otherType === "father"
    ) {
      speculativeFatherEntries.push(entry);
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

    // --- Father ↔ text indirect connection (grouped) ---
    if (
      category === "indirect connection" &&
      otherType === "text"
    ) {
      indirectTextRefs.push(entry);
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

  // Speculative father ↔ father: "shares structural similarities with ..."
  if (speculativeFatherEntries.length) {
    makeGroupedItem(
      `shares structural similarities with `,
      speculativeFatherEntries
    );
  }

  // Explicit text references: "is mentioned in Text1, Text2, Text3"
  if (explicitTextRefs.length) {
    makeGroupedItem(`is mentioned in `, explicitTextRefs);
  }

  // Indirect text references: "is indirectly referenced in Text1, Text2, Text3"
  if (indirectTextRefs.length) {
    makeGroupedItem(`is indirectly referenced in `, indirectTextRefs);
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

  // Aggregated textual connections
  const implicitInformedTargets = [];
  const explicitInformedByTargets = [];

  const implicitInformsTargets = [];
  const explicitInformsTargets = [];

  // Comparative split by direction
  const comparativeSecondaryTargets = [];
  const comparativePrimaryTargets = [];

  // Part-of relationship split by direction
  // Primary text contains the secondary text.
  const containedWithinTargets = []; // subject is secondary
  const containsTargets = [];        // subject is primary

  // Symmetric custom text ↔ text relationships.
  const customTextTargets = [];

  // Symmetric speculative text ↔ text relationships.
  const speculativeTextTargets = [];

  const textualOther = [];

  // Father ↔ text connections
  const fatherRefs = [];
  const fatherIndirect = [];
  const fatherRelates = [];
  const fatherComparative = [];

  const normX = (raw) => {
    const v = Number(raw ?? NaN);
    return Number.isFinite(v) ? v : null;
  };

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
    const category = normalizeConnectionCategory(rawCat);

    const rawNote = String(c.note || "").trim();
    const hasNote = rawNote !== "" && rawNote !== "-";

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
        const otherId = c[`${otherSide}Id`];
        const otherType = c[`${otherSide}Type`];

        let otherX = null;

        if (isSubjectA && !isSubjectB) {
          otherX = normX(c.bx);
        } else if (isSubjectB && !isSubjectA) {
          otherX = normX(c.ax);
        }

        const target = {
          type: otherType,
          id: otherId,
          name: otherName,
          note: hasNote ? rawNote : "",
          x: otherX,
        };

        // --- Indirect connection ---
        if (category === "indirect connection") {
          if (isSubjectB && !isSubjectA) {
            implicitInformedTargets.push(target);
          } else if (isSubjectA && !isSubjectB) {
            implicitInformsTargets.push(target);
          } else {
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
              note: "",
              _sortX: otherX,
            });
          }

          continue;
        }

        // --- Explicit reference ---
        if (category === "explicit reference") {
          if (isSubjectB && !isSubjectA) {
            explicitInformedByTargets.push(target);
          } else if (isSubjectA && !isSubjectB) {
            explicitInformsTargets.push(target);
          } else {
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
              note: "",
              _sortX: otherX,
            });
          }

          continue;
        }

        // --- Comparative connection ---
        if (category === "comparative connection") {
          if (isSubjectB && !isSubjectA) {
            comparativeSecondaryTargets.push(target);
          } else if (isSubjectA && !isSubjectB) {
            comparativePrimaryTargets.push(target);
          } else {
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
              note: "",
              _sortX: otherX,
            });
          }

          continue;
        }

        // --- Custom text ↔ text connection ---
        // Symmetric on both TextCards: "relates to ..."
        if (category === "custom connection") {
          customTextTargets.push(target);
          continue;
        }

        // --- Speculative text ↔ text connection ---
        // Symmetric on both TextCards. This wording describes resemblance
        // without asserting direct influence or transmission.
        if (category === "speculative connection") {
          speculativeTextTargets.push(target);
          continue;
        }

        // --- Part-of relationship ---
        //
        // Primary/A = containing text or collection
        // Secondary/B = text contained within it
        //
        // A card: "contains B"
        // B card: "is contained within A"
        if (category === "partof") {
          if (isSubjectB && !isSubjectA) {
            containedWithinTargets.push(target);
          } else if (isSubjectA && !isSubjectB) {
            containsTargets.push(target);
          }

          continue;
        }
      }

      // Text ↔ text row has been handled.
      continue;
    }

    // ===== 2) FATHER ↔ TEXT =====
    const isExplicit = category === "explicit reference";
    const isIndirect = category === "indirect connection";
    const isCustom = category === "custom connection";
    const isComparative = category === "comparative connection";

    if (isExplicit || isIndirect || isCustom || isComparative) {
      const bucket = isExplicit
        ? fatherRefs
        : isIndirect
          ? fatherIndirect
          : isCustom
            ? fatherRelates
            : fatherComparative;

      // Father on A, text on B
      if (aIsFather && bIsText && c.bId === subjectId) {
        bucket.push({
          otherId: c.aId,
          otherType: c.aType,
          otherName: c.aName || "",
          note: hasNote ? rawNote : "",
          x: normX(c.ax),
        });

        continue;
      }

      // Text on A, father on B
      if (bIsFather && aIsText && c.aId === subjectId) {
        bucket.push({
          otherId: c.bId,
          otherType: c.bType,
          otherName: c.bName || "",
          note: hasNote ? rawNote : "",
          x: normX(c.bx),
        });

        continue;
      }
    }
  }

  // ===== Assemble textual items =====

  const textualItems = [];

  const makeTextualRow = (textBefore, targetsWithX) => {
    if (!targetsWithX || !targetsWithX.length) return;

    const sortedTargets = [...targetsWithX].sort(compareByX);

    const targets = sortedTargets.map((target) => ({
      type: target.type,
      id: target.id,
      name: target.name,

      // TextCard uses this target object to render the link and,
      // when present, the target-specific information button.
      note: target.note || "",
    }));

    let rowSortX = null;

    for (const target of sortedTargets) {
      const x = normX(target.x);

      if (x !== null) {
        rowSortX = x;
        break;
      }
    }

    textualItems.push({
      section: "textual",
      textBefore,
      targets,

      // Notes belong to individual targets, not to the full row.
      note: "",
      _sortX: rowSortX,
    });
  };

  // Subject is the secondary text
  if (implicitInformedTargets.length) {
    makeTextualRow(
      "implicitly informed by ",
      implicitInformedTargets
    );
  }

  if (explicitInformedByTargets.length) {
    makeTextualRow(
      "explicitly informed by ",
      explicitInformedByTargets
    );
  }

  if (comparativeSecondaryTargets.length) {
    makeTextualRow(
      "shares a comparative framework with an earlier text ",
      comparativeSecondaryTargets
    );
  }

  if (containedWithinTargets.length) {
    makeTextualRow(
      "is contained within ",
      containedWithinTargets
    );
  }

  // Subject is the primary text
  if (implicitInformsTargets.length) {
    makeTextualRow(
      "implicitly informs ",
      implicitInformsTargets
    );
  }

  if (explicitInformsTargets.length) {
    makeTextualRow(
      "explicitly informs ",
      explicitInformsTargets
    );
  }

  if (comparativePrimaryTargets.length) {
    makeTextualRow(
      "provides an earlier comparative framework for ",
      comparativePrimaryTargets
    );
  }

  if (customTextTargets.length) {
    makeTextualRow(
      "relates to ",
      customTextTargets
    );
  }

  if (speculativeTextTargets.length) {
    makeTextualRow(
      "shares structural similarities with ",
      speculativeTextTargets
    );
  }

  if (containsTargets.length) {
    makeTextualRow(
      "contains ",
      containsTargets
    );
  }

  for (const row of textualOther) {
    textualItems.push(row);
  }

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

  const finalTextualItems = textualItems.map(
    ({ _sortX, ...rest }) => rest
  );

  // ===== Mythic/Historic figure connections =====

  const finalItems = [...finalTextualItems];

  const uniqByOtherId = (arr) => {
    const seen = new Set();
    const out = [];

    for (const entry of arr || []) {
      const key = String(entry?.otherId ?? "");

      if (!key || seen.has(key)) continue;

      seen.add(key);
      out.push(entry);
    }

    return out;
  };

  // Explicit reference: "mentions ..."
  if (fatherRefs.length) {
    const sortedFathers = uniqByOtherId(fatherRefs).sort(compareByX);

    const targets = sortedFathers.map((entry) => ({
      type: entry.otherType,
      id: entry.otherId,
      name: entry.otherName,
      note: entry.note || "",
    }));

    finalItems.push({
      section: "mythic",
      textBefore: "mentions ",
      targets,
      note: "",
    });
  }

  // Indirect connection: "indirectly references ..."
  if (fatherIndirect.length) {
    const sortedFathers = uniqByOtherId(fatherIndirect).sort(compareByX);

    const targets = sortedFathers.map((entry) => ({
      type: entry.otherType,
      id: entry.otherId,
      name: entry.otherName,
      note: entry.note || "",
    }));

    finalItems.push({
      section: "mythic",
      textBefore: "indirectly references ",
      targets,
      note: "",
    });
  }

  // Custom connection: "relates to ..."
  if (fatherRelates.length) {
    const sortedFathers = uniqByOtherId(fatherRelates).sort(compareByX);

    const targets = sortedFathers.map((entry) => ({
      type: entry.otherType,
      id: entry.otherId,
      name: entry.otherName,
      note: entry.note || "",
    }));

    finalItems.push({
      section: "mythic",
      textBefore: "relates to ",
      targets,
      note: "",
    });
  }

  // Comparative connection: symmetric for father ↔ text.
  if (fatherComparative.length) {
    const sortedFathers = uniqByOtherId(fatherComparative).sort(compareByX);

    const targets = sortedFathers.map((entry) => ({
      type: entry.otherType,
      id: entry.otherId,
      name: entry.otherName,
      note: entry.note || "",
    }));

    finalItems.push({
      section: "mythic",
      textBefore: "shares a comparative framework with ",
      targets,
      note: "",
    });
  }

  return finalItems;
}



/* ===== Selected-connection Info Window ===== */

function singularConnectionRole(rawRole) {
  const role = String(rawRole || "")
    .trim()
    .toLowerCase();

  const aliases = {
    consorts: "consort",
    siblings: "sibling",
    brothers: "brother",
    sisters: "sister",
    fathers: "father",
    mothers: "mother",
    sons: "son",
    daughters: "daughter",
  };

  return aliases[role] || role;
}

function roleWithIndefiniteArticle(rawRole) {
  const role = singularConnectionRole(rawRole);
  if (!role) return "";

  const article = /^[aeiou]/i.test(role)
    ? "an"
    : "a";

  return `${article} ${role}`;
}

function buildFamilialRelationshipSentence(
  connection,
  selectedIsA,
  subjectName,
  objectName
) {
  const category = String(connection?.category || "")
    .trim()
    .toLowerCase();

  const rawRelationship = category
    .replace(/^familial\s*:\s*/, "")
    .trim();

  const parts = rawRelationship
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const core = parts[0] || "";
  const hasConsortQualifier =
    parts.slice(1).some((part) =>
      part.includes("consort")
    ) ||
    (
      core.includes("consort") &&
      core.includes("/")
    );

  let roleA = "";
  let roleB = "";

  if (core.includes("/")) {
    const roleParts = core
      .split("/")
      .map((role) => singularConnectionRole(role));

    roleA = roleParts[0] || "";
    roleB = roleParts[1] || roleA;
  } else if (core.includes("consort")) {
    roleA = "consort";
    roleB = "consort";
  } else if (core.includes("sibling")) {
    roleA = "sibling";
    roleB = "sibling";
  } else {
    roleA = singularConnectionRole(core);
    roleB = roleA;
  }

  let subjectRole = selectedIsA
    ? roleA
    : roleB;

  if (!subjectRole) {
    return `${subjectName} is related to ${objectName}`;
  }

  if (
    hasConsortQualifier &&
    subjectRole !== "consort"
  ) {
    subjectRole = `${subjectRole} and consort`;
  }

  return `${subjectName} is ${roleWithIndefiniteArticle(
    subjectRole
  )} of ${objectName}`;
}

function buildConnectionRelationshipSentence(
  connection,
  selectedType,
  selectedId
) {
  if (!connection || !selectedType || selectedId == null) {
    return "";
  }

  const selectedIsA =
    connection.aType === selectedType &&
    connection.aId === selectedId;

  const selectedIsB =
    connection.bType === selectedType &&
    connection.bId === selectedId;

  if (!selectedIsA && !selectedIsB) return "";

  const subjectType = selectedIsA
    ? connection.aType
    : connection.bType;

  const objectType = selectedIsA
    ? connection.bType
    : connection.aType;

  const subjectName = selectedIsA
    ? connection.aName
    : connection.bName;

  const objectName = selectedIsA
    ? connection.bName
    : connection.aName;

  const category = normalizeConnectionCategory(
    connection.category
  );

  const bothFathers =
    subjectType === "father" &&
    objectType === "father";

  const bothTexts =
    subjectType === "text" &&
    objectType === "text";

  const mixed = !bothFathers && !bothTexts;

  const isExplicit =
    category === "explicit reference" ||
    category === "direct reference";

  const isIndirect =
    category === "indirect connection";

  const isComparative =
    category === "comparative connection";

  const isSpeculative =
    category === "speculative connection";

  const isCustom =
    category === "custom connection";

  const isCognate =
    category === "cognate connection";

  const isPartOf =
    category === "partof" ||
    category === "part of";

  const isSyncretic =
    category.startsWith("syncretic");

  if (
    bothFathers &&
    category.startsWith("familial:")
  ) {
    return buildFamilialRelationshipSentence(
      connection,
      selectedIsA,
      subjectName,
      objectName
    );
  }

  if (bothFathers) {
    if (isSyncretic) {
      return `${subjectName} was syncretized with ${objectName}`;
    }

    if (isCognate) {
      return `${subjectName} is cognate with ${objectName}`;
    }

    if (isComparative) {
      return `${subjectName} shares a comparative framework with ${objectName}`;
    }

    if (isCustom) {
      return `${subjectName} relates to ${objectName}`;
    }

    if (isSpeculative) {
      return `${subjectName} shares structural similarities with ${objectName}`;
    }

    return `${subjectName} is related to ${objectName}`;
  }

  if (mixed) {
    const selectedIsFather =
      subjectType === "father";

    if (isExplicit) {
      return selectedIsFather
        ? `${subjectName} is mentioned in ${objectName}`
        : `${subjectName} mentions ${objectName}`;
    }

    if (isIndirect) {
      return selectedIsFather
        ? `${subjectName} is indirectly referenced in ${objectName}`
        : `${subjectName} indirectly references ${objectName}`;
    }

    if (isCustom) {
      return `${subjectName} relates to ${objectName}`;
    }

    if (isComparative) {
      return `${subjectName} shares a comparative framework with ${objectName}`;
    }

    if (isCognate) {
      return `${subjectName} is cognate with ${objectName}`;
    }

    if (isSpeculative) {
      return `${subjectName} has a speculative connection to ${objectName}`;
    }

    return `${subjectName} is related to ${objectName}`;
  }

  if (bothTexts) {
    if (isPartOf) {
      return selectedIsA
        ? `${subjectName} contains ${objectName}`
        : `${subjectName} is contained within ${objectName}`;
    }

    if (isIndirect) {
      return selectedIsA
        ? `${subjectName} implicitly informs ${objectName}`
        : `${subjectName} is implicitly informed by ${objectName}`;
    }

    if (isExplicit) {
      return selectedIsA
        ? `${subjectName} explicitly informs ${objectName}`
        : `${subjectName} is explicitly informed by ${objectName}`;
    }

    if (isComparative) {
      return selectedIsA
        ? `${subjectName} provides an earlier comparative framework for ${objectName}`
        : `${subjectName} shares a comparative framework with the earlier text ${objectName}`;
    }

    if (isCognate) {
      return `${subjectName} is cognate with ${objectName}`;
    }

    if (isCustom) {
      return `${subjectName} relates to ${objectName}`;
    }

    if (isSpeculative) {
      return `${subjectName} shares structural similarities with ${objectName}`;
    }

    return `${subjectName} is related to ${objectName}`;
  }

  return `${subjectName} is related to ${objectName}`;
}

function buildConnectionInfoWindowEntries({
  allConnections,
  selectedType,
  selectedId,
  hoveredType,
  hoveredId,
}) {
  if (
    !selectedType ||
    selectedId == null ||
    !hoveredType ||
    hoveredId == null
  ) {
    return [];
  }

  return (allConnections || [])
    .filter((connection) => {
      const selectedTouchesA =
        connection.aType === selectedType &&
        connection.aId === selectedId;

      const selectedTouchesB =
        connection.bType === selectedType &&
        connection.bId === selectedId;

      if (!selectedTouchesA && !selectedTouchesB) {
        return false;
      }

      const otherType = selectedTouchesA
        ? connection.bType
        : connection.aType;

      const otherId = selectedTouchesA
        ? connection.bId
        : connection.aId;

      return (
        otherType === hoveredType &&
        otherId === hoveredId
      );
    })
    .map((connection) => {
      const note = String(connection.note || "").trim();

      const selectedIsA =
        connection.aType === selectedType &&
        connection.aId === selectedId;

      return {
        key: connection._key,
        statement: buildConnectionRelationshipSentence(
          connection,
          selectedType,
          selectedId
        ),
        selectedType,
        selectedId,
        connectedType: selectedIsA
          ? connection.bType
          : connection.aType,
        connectedId: selectedIsA
          ? connection.bId
          : connection.aId,
        selectedName: selectedIsA
          ? connection.aName || ""
          : connection.bName || "",
        connectedName: selectedIsA
          ? connection.bName || ""
          : connection.aName || "",
        note:
          note && note !== "-" && note !== "—"
            ? note
            : "",
        category: connection.category || "",
        color: connection.color || "#777777",
      };
    })
    .filter((entry) => entry.statement);
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
  // Unclipped SVG overlay for the selected-location dropdown.
  const locationClusterBranchRef = useRef(null);

  const connectionsRef = useRef(null);
  const allConnectionRowsRef = useRef([]);

  /*
   * renderConnections runs outside the D3 setup effect. This ref lets it ask
   * the persistent selected/mini tooltip layer to refresh after connection or
   * map geometry changes. The main selected tooltip itself no longer rescored:
   * it always stays directly above the selected pin.
   */
  const renderSelectedTooltipRef = useRef(() => {});

  /*
   * The selected tooltip always uses the "top" placement. We still cache its
   * measured width/height so D3 can reposition it cheaply as the selected pin
   * moves during zoom/pan without repeatedly measuring the DOM.
   */
  const selectedTooltipPlacementRef = useRef({
    layoutKey: null,
    placement: null,
    width: 0,
    height: 0,
  });

  const miniTooltipPlacementsRef = useRef(new Map());

  /*
   * Mini-tooltip sequence state is retained for possible later reuse. The
   * selected object's main tooltip is now driven by the active zoom tier.
   */
  const tooltipSequenceRef = useRef({
    selectionKey: null,
    phase: "idle", // idle | selected | mini | hover
    connectedCount: 0,
    miniDurationMs: 0,
  });
  const tooltipSequenceTimersRef = useRef({
    main: 0,
    mini: 0,
    raf: 0,
  });


  /*
   * Map View cannot open location branches until geographic clustering has
   * finished for the newly rendered view. This one-shot flag is consumed by
   * rebuildGeographicNodePositions after every Map View activation.
   */
  const pendingAutoOpenMapClustersRef = useRef(false);

  /*
   * The tooltip-sequence effect is declared before the cluster callback.
   * This ref gives its timers a stable way to fold all branches at the end of
   * the automatic Map View presentation.
   */
  const closeLocationClusterBranchRef = useRef(() => {});

  const hoveredTextIdRef = useRef(null);
  const hoveredFatherIdRef = useRef(null);


  // Track last hovered elements so we can forcibly un-hover them on the next enter.
  // This prevents "stuck enlarged" when mouseleave is missed due to DOM updates.
  const lastHoverTextElRef = useRef(null);
  const lastHoverFatherElRef = useRef(null);
  
  
  const prevZoomedInRef = useRef(false);
  const hoveredDurationIdRef = useRef(null);
  const awaitingCloseClickSegRef = useRef(false);
  
  const zoomDraggingRef = useRef(false);

  const relevantTextIdsRef = useRef(new Set());
  const relevantFatherIdsRef = useRef(new Set());

  /*
   * Map View positions, stored in the chart group's local SVG coordinates.
   * Only the selected one-hop neighborhood is present here.
   */
  const geographicNodePositionsRef = useRef({
    text: new Map(),
    father: new Map(),
  });

  /*
   * Map-location cluster state stays outside React's render cycle.
   * One cluster may be attached to the selected pin, while additional clusters
   * represent two or more connected objects sharing another projected location.
   */
  const selectedLocationClusterRef = useRef({
    key: null,
    selectedType: null,
    selectedId: null,
    selectedPoint: null,
    locationLabel: "",
    entries: [],
  });
  const connectedLocationClustersRef = useRef([]);

  // Normal markers for every clustered object are hidden. Only selected-location
  // members suppress their original zero-length connection lines.
  const clusteredNodeKeysRef = useRef(new Set());
  const connectionSuppressedNodeKeysRef = useRef(new Set());

  // Each location cluster keeps its own open/closed state while one object is
  // selected. Selection changes clear the set and restore every control to its
  // folded/downward state.
  const locationClusterOpenRef = useRef(false);
  const openLocationClusterKeysRef = useRef(new Set());

  // PERF: gate expensive bulk style updates (opacity/dimming) so they only rerun when tier/selection changes
  const lastStyleStateRef = useRef({ zoomMode: null, key: "" });

  // PERF: bump whenever TagPanel changes what nodes exist (exit/re-enter resets opacity)
  const visVersionRef = useRef(0);

  const clipId = useId();
    
  
function logRenderedCounts(reason = "") {
  if (!textsRef.current || !fathersRef.current) return;

  // Count *rendered* marks (current DOM), not dataset sizes
  const textsCount = d3.select(textsRef.current)
    .selectAll("circle.textDot")
    .size();

  const fathersCount = d3.select(fathersRef.current)
    .selectAll("g.fatherMark")
    .size();

  const total = textsCount + fathersCount;

  console.log(
    `[Timeline] Rendered${reason ? ` (${reason})` : ""} — texts: ${textsCount}, fathers: ${fathersCount}, total: ${total}`
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
  const [layerMode, setLayerMode] = useState("noborders");
  const [isReady, setIsReady] = useState(false);

  


  // Global visibility overrides (panel checkboxes)
  const [showTexts, setShowTexts] = useState(true);
  const [showFathers, setShowFathers] = useState(true);
  const [showConnections, setShowConnections] = useState(true);
  const [showMap, setShowMap] = useState(false);
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
  // Hover target from links inside TextCard/FatherCard.
  // The ref updates D3 immediately; the matching state also drives the
  // React-rendered connection Info Window.
  const hoverPinTargetRef = useRef(null);
  const [cardHoveredTarget, setCardHoveredTarget] = useState(null);

  function getSelectedFocusTarget() {
    return (
      hoveredTimelineTargetRef.current ||
      hoverPinTargetRef.current ||
      null
    );
  }

  function selectedNeighborhoodOpacity(type, id) {
    if (!selectedText && !selectedFather) return BASE_OPACITY;

    const selectedType = selectedText ? "text" : "father";
    const selectedId = selectedText?.id ?? selectedFather?.id ?? null;

    // The selected object's ordinary icon stays hidden behind its pin.
    if (type === selectedType && id === selectedId) return 0;

    const activeTarget = getSelectedFocusTarget();
    if (!activeTarget) return BASE_OPACITY;

    return activeTarget.type === type && activeTarget.id === id
      ? BASE_OPACITY
      : DIM_NODE_OPACITY;
  }

  function syncSelectedNeighborhoodFocus() {
    if (textsRef.current) {
      const textRoot = d3.select(textsRef.current);

      textRoot
        .selectAll("circle.textDot")
        .style(
          "opacity",
          (row) => selectedNeighborhoodOpacity("text", row?.id),
          "important"
        );

      textRoot
        .selectAll("g.dotSlices")
        .style(
          "opacity",
          (row) => selectedNeighborhoodOpacity("text", row?.id),
          "important"
        );
    }

    if (fathersRef.current) {
      d3.select(fathersRef.current)
        .selectAll("g.fatherMark")
        .style(
          "opacity",
          (row) => selectedNeighborhoodOpacity("father", row?.id),
          "important"
        );
    }

    if (pinsRef.current) {
      const activeTarget = getSelectedFocusTarget();
      const pinsRoot = d3.select(pinsRef.current);

      const clusterContainsTarget = (cluster) =>
        !!activeTarget &&
        Array.isArray(cluster?.entries) &&
        cluster.entries.some(
          (entry) =>
            entry?.type === activeTarget.type &&
            entry?.id === activeTarget.id
        );

      // The selected pin itself always remains fully visible.
      pinsRoot
        .selectAll("g.textPin, g.fatherPin")
        .style("opacity", BASE_OPACITY);

      /*
       * Disclosure controls participate in the same selected-neighbour focus
       * treatment as ordinary connected objects. While one object is hovered,
       * keep only the triangle belonging to that object's location prominent.
       */
      pinsRoot
        .selectAll("g.connectedLocationClusterControl")
        .each(function (cluster) {
          const keepProminent =
            !activeTarget || clusterContainsTarget(cluster);
          const control = d3.select(this);

          control.style(
            "opacity",
            keepProminent ? BASE_OPACITY : DIM_NODE_OPACITY
          );

          control
            .select("path.tl-pin-cluster-button")
            .style(
              "pointer-events",
              keepProminent ? "all" : "none"
            );
        });

      const selectedCluster = selectedLocationClusterRef.current;
      const keepSelectedClusterControl =
        !activeTarget || clusterContainsTarget(selectedCluster);

      pinsRoot
        .selectAll("g.textPin, g.fatherPin")
        .each(function () {
          const pin = d3.select(this);
          const controlOpacity = keepSelectedClusterControl
            ? BASE_OPACITY
            : DIM_NODE_OPACITY;

          pin
            .select("path.tl-pin-cluster-button")
            .style("opacity", controlOpacity)
            .style(
              "pointer-events",
              keepSelectedClusterControl ? "all" : "none"
            );

          pin
            .select("text.tl-pin-cluster-count")
            .style("opacity", controlOpacity);
        });
    }

    if (locationClusterBranchRef.current) {
      const activeTarget = getSelectedFocusTarget();
      const branchLayer = d3.select(locationClusterBranchRef.current);

      /*
       * Segment data is ordered from the disclosure button downward. Therefore
       * a hovered lower item must retain every segment whose index is less than
       * or equal to the hovered item's index. Doing this per branch also avoids
       * a hovered object in one location brightening a different open branch.
       */
      branchLayer
        .selectAll("g.locationClusterBranch")
        .each(function () {
          const branch = d3.select(this);
          const segments = branch.selectAll(
            "line.locationClusterBranch__segment"
          );
          const segmentEntries = segments.data();
          const activeBranchIndex = activeTarget
            ? segmentEntries.findIndex(
                (entry) =>
                  entry?.type === activeTarget.type &&
                  entry?.id === activeTarget.id
              )
            : -1;

          segments.attr("stroke-opacity", (_entry, index) => {
            if (!activeTarget) {
              return CONNECTION_SELECTED_IDLE_OPACITY;
            }

            if (activeBranchIndex < 0) {
              return CONNECTION_SELECTED_DIM_OPACITY;
            }

            return index <= activeBranchIndex
              ? CONNECTION_HIGHLIGHT_OPACITY
              : CONNECTION_SELECTED_DIM_OPACITY;
          });

          branch
            .selectAll("g.locationClusterBranch__item")
            .style("opacity", (entry) => {
              if (!activeTarget) return BASE_OPACITY;

              return activeTarget.type === entry?.type &&
                activeTarget.id === entry?.id
                ? BASE_OPACITY
                : DIM_NODE_OPACITY;
            });
        });
    }
  }

  function setCardLinkHoverTarget(nextTarget) {
    hoverPinTargetRef.current = nextTarget;

    setCardHoveredTarget((previous) => {
      const previousType = previous?.type ?? null;
      const previousId = previous?.id ?? null;
      const nextType = nextTarget?.type ?? null;
      const nextId = nextTarget?.id ?? null;

      if (
        previousType === nextType &&
        previousId === nextId
      ) {
        return previous;
      }

      return nextTarget;
    });

    if (wrapRef.current) {
      d3.select(wrapRef.current)
        .selectAll("div.tl-mini-tooltip")
        .classed(
          "is-card-link-hover",
          (entry) =>
            !!nextTarget &&
            nextTarget.type === entry?.type &&
            nextTarget.id === entry?.id
        );
    }

    syncSelectedNeighborhoodFocus();
    scheduleCurrentConnectionRender();

    // Show the matching mini-tooltip immediately.
    renderSelectedTooltipRef.current?.(true);

    // The selected chronological date guides live inside the D3 layout rather
    // than React, so card-link hover must explicitly redraw that layer too.
    if (selectedText || selectedFather) {
      reapplyCurrentLayoutRef.current?.();
    }
  }

  // Hover target from hovering actual nodes on the timeline (used to tint links inside cards)
const [hoveredTimelineTarget, setHoveredTimelineTarget] = useState(null);

// Keep a ref in sync so D3 handlers/anim funcs can read without stale closures
const hoveredTimelineTargetRef = useRef(null);
useEffect(() => {
  hoveredTimelineTargetRef.current = hoveredTimelineTarget;
}, [hoveredTimelineTarget]);

// avoid rerender spam when hovering the same thing repeatedly
const setHoveredTimelineTargetSafe = (next) => {
  // Update the ref immediately so D3 hover handlers and the persistent
  // mini-tooltip layer see the same target without waiting for React.
  hoveredTimelineTargetRef.current = next;

  if (wrapRef.current) {
    d3.select(wrapRef.current)
      .selectAll("div.tl-mini-tooltip")
      .classed(
        "is-timeline-icon-hover",
        (entry) =>
          !!next &&
          next.type === entry?.type &&
          next.id === entry?.id
      );
  }

  syncSelectedNeighborhoodFocus();
  scheduleCurrentConnectionRender();

  // Mini-tooltip code remains wired for later reactivation.
  renderSelectedTooltipRef.current?.(true);

  // Selected chronological guides and their three-tier labels are part of the
  // D3 layout, so update them immediately on timeline-object enter/leave.
  if (selectedText || selectedFather) {
    reapplyCurrentLayoutRef.current?.();
  }

  setHoveredTimelineTarget((prev) => {
    const pType = prev?.type ?? null;
    const pId = prev?.id ?? null;
    const nType = next?.type ?? null;
    const nId = next?.id ?? null;
    if (pType === nType && pId === nId) return prev;
    return next;
  });
};

// NEW: prevent hover ping-pong when card rerender briefly steals pointer events
const hoverTL_ClearTimerRef = useRef(null);

const cancelHoverTLClear = () => {
  if (hoverTL_ClearTimerRef.current) {
    clearTimeout(hoverTL_ClearTimerRef.current);
    hoverTL_ClearTimerRef.current = null;
  }
};

const clearHoveredTimelineTargetSoon = (ms = 60) => {
  cancelHoverTLClear();
  hoverTL_ClearTimerRef.current = setTimeout(() => {
    setHoveredTimelineTargetSafe(null);
    hoverTL_ClearTimerRef.current = null;
  }, ms);
};

  const [showMore, setShowMore] = useState(false);

  // Card density (fold/unfold) is shared across TextCard + FatherCard and persisted
const CARD_FOLD_KEY = "tl_card_folded_v1";

const [isCardFolded, setIsCardFolded] = useState(() => {
  try {
    const raw = localStorage.getItem(CARD_FOLD_KEY);
    return raw ? JSON.parse(raw) : false;
  } catch {
    return false;
  }
});

useEffect(() => {
  try {
    localStorage.setItem(CARD_FOLD_KEY, JSON.stringify(isCardFolded));
  } catch {}
}, [isCardFolded]);

  const [cardPos, setCardPos] = useState({ left: 16, top: 16 });
  const [selectedFather, setSelectedFather] = useState(null);
  const [fatherCardPos, setFatherCardPos] = useState({ left: 16, top: 16 });

  /*
   * Keep the sequence infrastructure ready for later use, but for now:
   * - the selected object's main tooltip is controlled by the zoom tier;
   * - mini-tooltips never enter an automatic or hover-visible phase;
   * - Map View location branches do not auto-open for a disabled mini phase.
   */
  useEffect(() => {
    const timers = tooltipSequenceTimersRef.current;

    if (timers.main) clearTimeout(timers.main);
    if (timers.mini) clearTimeout(timers.mini);
    if (timers.raf) cancelAnimationFrame(timers.raf);

    timers.main = 0;
    timers.mini = 0;
    timers.raf = 0;

    closeLocationClusterBranchRef.current?.();
    pendingAutoOpenMapClustersRef.current =
      Boolean(showMap && MINI_TOOLTIPS_ENABLED);

    const selectedType = selectedText
      ? "text"
      : selectedFather
        ? "father"
        : null;

    const selectedId =
      selectedText?.id ??
      selectedFather?.id ??
      null;

    if (!selectedType || !selectedId) {
      pendingAutoOpenMapClustersRef.current = false;

      tooltipSequenceRef.current = {
        selectionKey: null,
        phase: "idle",
        connectedCount: 0,
        miniDurationMs: 0,
      };

      renderSelectedTooltipRef.current?.(false);
      return undefined;
    }

    const selectionKey = `${selectedType}:${selectedId}`;
    const connectedKeys = new Set();

    for (const row of allConnectionRowsRef.current || []) {
      const aHit =
        row.aType === selectedType &&
        row.aId === selectedId;

      const bHit =
        row.bType === selectedType &&
        row.bId === selectedId;

      if (!aHit && !bHit) continue;

      const otherType = aHit ? row.bType : row.aType;
      const otherId = aHit ? row.bId : row.aId;

      if (otherType && otherId != null) {
        connectedKeys.add(`${otherType}:${otherId}`);
      }
    }

    const connectedCount = connectedKeys.size;

    tooltipSequenceRef.current = {
      selectionKey,
      phase: "hover",
      connectedCount,
      miniDurationMs: 0,
    };

    timers.raf = requestAnimationFrame(() => {
      timers.raf = 0;

      if (
        tooltipSequenceRef.current.selectionKey !==
        selectionKey
      ) {
        return;
      }

      renderSelectedTooltipRef.current?.(true);
    });

    return () => {
      if (timers.main) clearTimeout(timers.main);
      if (timers.mini) clearTimeout(timers.mini);
      if (timers.raf) cancelAnimationFrame(timers.raf);

      timers.main = 0;
      timers.mini = 0;
      timers.raf = 0;
    };
  }, [selectedText?.id, selectedFather?.id, showMap]);

  /*
   * Active camera zoom.
   *
   * This helper itself does not decide marker size. It simply reports whichever
   * camera is active so selected-state sizing can normalize it in one place.
   */
  function getActiveViewZoomK(timelineZoomK = kRef.current) {
    if (showMapRef.current) {
      const mapZoom = Number(
        timelineMapRef.current
          ?.getViewportTransform?.()
          ?.k
      );

      if (Number.isFinite(mapZoom)) return mapZoom;
    }

    const fallback = Number(timelineZoomK);
    return Number.isFinite(fallback) ? fallback : 1;
  }

  /*
   * EXISTING ORDINARY / NO-SELECTION sizing path.
   *
   * Leave this behavior alone: the user already likes how ordinary objects
   * respond to zoom when nothing is selected.
   */
  function getObjectSizingZoomK(timelineZoomK = kRef.current) {
    const activeZoom = getActiveViewZoomK(timelineZoomK);

    if (showMapRef.current) {
      return clamp(
        (activeZoom / OBJECT_SIZE_MAP_MAX_CAMERA_ZOOM) *
          OBJECT_SIZE_MAX_VISUAL_ZOOM,
        0,
        OBJECT_SIZE_MAX_VISUAL_ZOOM
      );
    }

    return clamp(activeZoom, 0, OBJECT_SIZE_MAX_VISUAL_ZOOM);
  }

  /*
   * ONE selected-state zoom normalizer for BOTH views.
   *
   * Default View already spans 1..22 and therefore passes straight through.
   * Geographical View spans 1..40 and is linearly remapped onto 1..22.
   *
   * Crucially, both minima map to 1 and both maxima map to 22. There is no
   * outer-zoom reversal, compensation, secondary branch, or minimum-size phase.
   */
  function getSelectedStateVisualZoomK(timelineZoomK = kRef.current) {
    const activeZoom = getActiveViewZoomK(timelineZoomK);

    if (showMapRef.current) {
      const cameraRange =
        SELECTED_SIZE_MAP_MAX_CAMERA_ZOOM -
        SELECTED_SIZE_MAP_MIN_CAMERA_ZOOM;

      const cameraProgress = clamp(
        (activeZoom - SELECTED_SIZE_MAP_MIN_CAMERA_ZOOM) /
          Math.max(0.001, cameraRange),
        0,
        1
      );

      return (
        SELECTED_SIZE_MIN_VISUAL_ZOOM +
        cameraProgress *
          (SELECTED_SIZE_MAX_VISUAL_ZOOM -
            SELECTED_SIZE_MIN_VISUAL_ZOOM)
      );
    }

    return clamp(
      activeZoom,
      SELECTED_SIZE_MIN_VISUAL_ZOOM,
      SELECTED_SIZE_MAX_VISUAL_ZOOM
    );
  }

  /*
   * Shared 0..1 selected-state size progress.
   * 0 = absolute outermost zoom
   * 1 = absolute deepest zoom
   */
  function getSelectedStateSizeProgress(timelineZoomK = kRef.current) {
    const visualZoom = getSelectedStateVisualZoomK(timelineZoomK);
    const range =
      SELECTED_SIZE_MAX_VISUAL_ZOOM -
      SELECTED_SIZE_MIN_VISUAL_ZOOM;

    return clamp(
      (visualZoom - SELECTED_SIZE_MIN_VISUAL_ZOOM) /
        Math.max(0.001, range),
      0,
      1
    );
  }

  /*
   * The selected pin uses the same normalized selected-state progress as its
   * connected objects and interpolates smoothly between the current 15px/8px
   * endpoint values.
   */
  function getSelectedPinHeadRadius(timelineZoomK = kRef.current) {
    const progress =
      getSelectedStateSizeProgress(timelineZoomK);

    return (
      SELECTED_PIN_HEAD_RADIUS_AT_MIN_ZOOM +
      progress *
        (SELECTED_PIN_HEAD_RADIUS_AT_MAX_ZOOM -
          SELECTED_PIN_HEAD_RADIUS_AT_MIN_ZOOM)
    );
  }


  /*
   * A directly connected object remains visually emphasized, but its SIZE now
   * follows the single selected-state zoom curve above.
   *
   * The selected object itself is excluded because it is represented by the
   * larger selected pin.
   */
  const isConnectedTextObject = (row) => {
    if (!row || (!selectedText && !selectedFather)) return false;
    if (selectedText?.id === row.id) return false;
    return relevantTextIdsRef.current.has(row.id);
  };

  const isConnectedFatherObject = (row) => {
    if (!row || (!selectedText && !selectedFather)) return false;
    if (selectedFather?.id === row.id) return false;
    return relevantFatherIdsRef.current.has(row.id);
  };

  /*
   * Connected objects consume the SAME normalized selected visual zoom in both
   * chronological and geographical modes.
   *
   * 22 at maximum zoom -> existing approved deep size.
   *  1 at minimum zoom -> tiny, close-to-invisible outer size.
   *
   * No inverse outer-zoom growth remains.
   */
  function getConnectedObjectSizingZoomK(timelineZoomK = kRef.current) {
    return getSelectedStateVisualZoomK(timelineZoomK);
  }

  const getTextObjectRadius = (row, zoomK) => {
    const sizingZoom = isConnectedTextObject(row)
      ? getConnectedObjectSizingZoomK(zoomK)
      : getObjectSizingZoomK(zoomK);

    return textBaseR(row) * sizingZoom;
  };

  const getFatherObjectRadius = (row, zoomK) => {
    const sizingZoom = isConnectedFatherObject(row)
      ? getConnectedObjectSizingZoomK(zoomK)
      : getObjectSizingZoomK(zoomK);

    return (
      getFatherBaseR(row) *
      sizingZoom *
      FATHER_SIZE_SCALE
    );
  };

  const getTextObjectHoverScale = (row) =>
    isConnectedTextObject(row)
      ? CONNECTED_OBJECT_HOVER_SCALE
      : HOVER_SCALE_DOT;

  const getFatherObjectHoverScale = (row) =>
    isConnectedFatherObject(row)
      ? CONNECTED_OBJECT_HOVER_SCALE
      : HOVER_SCALE_FATHER;

  const selectedMapEntry = selectedText || selectedFather;
  const selectedMapAvailable = hasMapCoordinates(selectedMapEntry);

  // A map is meaningful only while a coordinate-bearing card is open.
  // Keep Map View on while navigating between mapped entries, but reset it
  // when the card closes or navigation reaches an entry without coordinates.
  useEffect(() => {
    if (!selectedMapEntry || !selectedMapAvailable) {
      setShowMap(false);
    }
  }, [selectedMapEntry, selectedMapAvailable]);

  /*
   * TimelineMap owns a persistent geographic viewport.
   *
   * We measure the selected pin only to establish the initial map center when
   * Map View opens. Dragging, zooming, and later selection changes never route
   * through React state and never recenter the geographic camera.
   */
  const timelineMapRef = useRef(null);
  const selectedPinScreenPositionRef = useRef(null);
  const selectedPinPositionRafRef = useRef(0);
  const selectedPinSettleTimerRef = useRef(0);
  const mapProjectionRafRef = useRef(0);
  const reapplyCurrentLayoutRef = useRef(() => {});

  /*
   * When switching views, remember the selected pin's browser position.
   * The destination camera is then translated so the pin remains under the
   * same screen pixel instead of jumping.
   */
  const pendingViewSwitchRef = useRef(null);
  const viewSwitchAlignmentRafRef = useRef(0);

  const showMapRef = useRef(showMap);
  const selectedMapAvailableRef = useRef(selectedMapAvailable);
  showMapRef.current = showMap;
  selectedMapAvailableRef.current = selectedMapAvailable;

  function getGeographicNodePosition(type, id) {
    if (!showMapRef.current) return null;

    const bucket =
      type === "father"
        ? geographicNodePositionsRef.current.father
        : geographicNodePositionsRef.current.text;

    return bucket.get(id) || null;
  }

  function readSelectedPinTipClient() {
    const selectedPinPath = pinsRef.current?.querySelector(
      "g.textPin path.tl-pin-body, g.fatherPin path.tl-pin-body"
    );

    if (!selectedPinPath) return null;

    const rect = selectedPinPath.getBoundingClientRect();

    const clientX = rect.left + rect.width / 2;
    const clientY = rect.bottom;

    if (
      !Number.isFinite(clientX) ||
      !Number.isFinite(clientY)
    ) {
      return null;
    }

    return { clientX, clientY };
  }

  const closeLocationClusterBranch = useCallback((clusterKey = null) => {
    const openKeys = openLocationClusterKeysRef.current;

    if (clusterKey) {
      openKeys.delete(clusterKey);
    } else {
      openKeys.clear();
    }

    locationClusterOpenRef.current = openKeys.size > 0;

    if (locationClusterBranchRef.current) {
      const branchLayer = d3.select(locationClusterBranchRef.current);

      if (clusterKey) {
        branchLayer
          .selectAll("g.locationClusterBranch")
          .filter((cluster) => cluster?.key === clusterKey)
          .remove();
      } else {
        branchLayer
          .selectAll("g.locationClusterBranch")
          .remove();
      }

      if (!locationClusterOpenRef.current) {
        branchLayer
          .style("display", "none")
          .attr("aria-hidden", "true");
      }
    }

    if (pinsRef.current) {
      d3.select(pinsRef.current)
        .selectAll("path.tl-pin-cluster-button")
        .each(function () {
          const button = d3.select(this);
          const key = button.attr("data-cluster-key");
          const isOpen = !!key && openKeys.has(key);
          const cx = Number(button.attr("data-cx"));
          const cy = Number(button.attr("data-cy"));

          const selectedCluster = selectedLocationClusterRef.current;
          const cluster =
            selectedCluster?.key === key
              ? selectedCluster
              : connectedLocationClustersRef.current.find(
                  (candidate) => candidate?.key === key
                );
          const clusterCount = Array.isArray(cluster?.entries)
            ? cluster.entries.length
            : 0;

          button
            .classed("is-open", isOpen)
            .attr("aria-expanded", isOpen ? "true" : "false")
            .attr(
              "aria-label",
              isOpen
                ? `Hide ${clusterCount} connected objects at this location`
                : `Show ${clusterCount} connected objects at this location`
            );

          if (Number.isFinite(cx) && Number.isFinite(cy)) {
            button.attr(
              "d",
              locationClusterTrianglePath(
                cx,
                cy,
                isOpen
                  ? LOCATION_CLUSTER_EXPANDED_RADIUS
                  : LOCATION_CLUSTER_COLLAPSED_RADIUS,
                isOpen
              )
            );
          }

          const control = d3.select(this.parentNode);
          control
            .select("text.tl-pin-cluster-count")
            .style("display", isOpen ? "none" : null);
        });
    }

    renderSelectedTooltipRef.current?.(true);
  }, []);

  closeLocationClusterBranchRef.current = closeLocationClusterBranch;

  /*
   * Branches remain open until their own triangle is pressed. Escape is the
   * one global user action that folds every open branch.
   */
  useEffect(() => {
    const onDocumentKeyDown = (event) => {
      if (event.key === "Escape") {
        closeLocationClusterBranch();
      }
    };

    document.addEventListener("keydown", onDocumentKeyDown);

    return () => {
      document.removeEventListener("keydown", onDocumentKeyDown);
    };
  }, [closeLocationClusterBranch]);

  /*
   * A new selection, closing the card, or leaving Map View starts closed.
   */
  useEffect(() => {
    closeLocationClusterBranch();
    selectedLocationClusterRef.current = {
      key: null,
      selectedType: null,
      selectedId: null,
      selectedPoint: null,
      locationLabel: "",
      entries: [],
    };
    connectedLocationClustersRef.current = [];
    clusteredNodeKeysRef.current = new Set();
    connectionSuppressedNodeKeysRef.current = new Set();
  }, [
    selectedText?.id,
    selectedFather?.id,
    showMap,
    closeLocationClusterBranch,
  ]);

  const handleMapProjectionChange = useCallback(() => {
    if (mapProjectionRafRef.current) return;

    mapProjectionRafRef.current = requestAnimationFrame(() => {
      mapProjectionRafRef.current = 0;
      reapplyCurrentLayoutRef.current?.();
    });
  }, []);

  function clearSelectedPinScreenPosition() {
    selectedPinScreenPositionRef.current = null;
    timelineMapRef.current?.resetViewport?.();
  }

  function scheduleSelectedPinScreenPositionFromDom(
    reason = "apply"
  ) {
    if (!showMapRef.current) return;

    const mapApi = timelineMapRef.current;
    if (mapApi?.isViewportInitialized?.()) return;

    if (selectedPinPositionRafRef.current) return;

    selectedPinPositionRafRef.current = requestAnimationFrame(() => {
      selectedPinPositionRafRef.current = 0;

      if (!showMapRef.current) return;

      const currentMapApi = timelineMapRef.current;
      if (currentMapApi?.isViewportInitialized?.()) return;

      const pendingSwitch =
        pendingViewSwitchRef.current;

      const measuredPinTip = readSelectedPinTipClient();

      const next =
        pendingSwitch?.targetShowMap === true &&
        pendingSwitch.anchor
          ? pendingSwitch.anchor
          : measuredPinTip;

      if (!next) return;

      const roundedNext = {
        clientX:
          Math.round(next.clientX * 10) / 10,
        clientY:
          Math.round(next.clientY * 10) / 10,
      };

      selectedPinScreenPositionRef.current = roundedNext;

      const initialized =
        currentMapApi?.ensureViewportInitialized?.(
          roundedNext
        );

      if (
        initialized &&
        pendingSwitch?.targetShowMap === true
      ) {
        pendingViewSwitchRef.current = null;
      }

      if (DEBUG_MAP_SYNC) {
        console.log("[MAP VIEWPORT INITIALIZED]", {
          reason,
          selectedType:
            selectedText
              ? "text"
              : selectedFather
                ? "father"
                : null,
          selectedId:
            selectedText?.id ??
            selectedFather?.id ??
            null,
          measuredPinTipScreen: roundedNext,
        });
      }
    });
  }

  // Initialize on Map View open; selection changes become no-ops once initialized.
  useEffect(() => {
    if (selectedPinSettleTimerRef.current) {
      clearTimeout(selectedPinSettleTimerRef.current);
      selectedPinSettleTimerRef.current = 0;
    }

    if (
      !showMap ||
      !selectedMapAvailable ||
      (!selectedText && !selectedFather)
    ) {
      clearSelectedPinScreenPosition();
      return undefined;
    }

    scheduleSelectedPinScreenPositionFromDom("map-or-selection");
    selectedPinSettleTimerRef.current = setTimeout(() => {
      selectedPinSettleTimerRef.current = 0;
      scheduleSelectedPinScreenPositionFromDom("pin-animation-settled");
    }, 280);

    return () => {
      if (selectedPinSettleTimerRef.current) {
        clearTimeout(selectedPinSettleTimerRef.current);
        selectedPinSettleTimerRef.current = 0;
      }
    };
  }, [
    showMap,
    selectedMapAvailable,
    selectedText?.id,
    selectedFather?.id,
  ]);

  useEffect(() => {
    return () => {
      if (selectedPinPositionRafRef.current) {
        cancelAnimationFrame(selectedPinPositionRafRef.current);
      }
      if (selectedPinSettleTimerRef.current) {
        clearTimeout(selectedPinSettleTimerRef.current);
      }
      if (mapProjectionRafRef.current) {
        cancelAnimationFrame(mapProjectionRafRef.current);
      }
      if (viewSwitchAlignmentRafRef.current) {
        cancelAnimationFrame(
          viewSwitchAlignmentRafRef.current
        );
      }
    };
  }, []);

  // If nothing is selected (no card open), there is nowhere to hover-link from.
  useEffect(() => {
    if (!selectedText && !selectedFather) {
      setCardLinkHoverTarget(null);
    }
  }, [selectedText, selectedFather]);

 // NEW: clear timeline-hover → card highlight when cards close 
useEffect(() => {
  if (!selectedText && !selectedFather) setHoveredTimelineTarget(null);
}, [selectedText, selectedFather]);

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
const lastTransformRef = useRef(null);

/*
 * Clicking a visible chronological object should not move it merely because
 * selected mode reserves a taller axis area. Store its pre-selection browser
 * anchor and compensate the zoom transform after the new layout is measured.
 */
const pendingSelectionCameraRef = useRef(null);

/*
 * Closing selected mode changes the chart height in the opposite direction:
 * the 3-row selected axis collapses back to the normal 1-row axis.
 *
 * Capture the selected object's browser anchor immediately before the card
 * clears its selection state, then compensate the Default View camera after
 * the normal chart height has been restored. This is the exact inverse of the
 * pendingSelectionCameraRef behavior above and prevents the timeline/map from
 * making a small vertical jump when a card closes.
 *
 * If the card is closed while Geographical View is active, this anchor waits
 * until Default View is visible again before being consumed.
 */
const pendingDeselectionCameraRef = useRef(null);

/* Close an open Filters drawer before the whole control slides offscreen. */
useEffect(() => {
  if (!modalOpen) return;

  const panel = wrapRef.current?.querySelector(
    ".timelineTagPanelHost .tagPanelWrap"
  );

  if (panel?.classList.contains("tagPanelWrap--open")) {
    panel.querySelector(".tagPanel__tab")?.click();
  }
}, [modalOpen]);

/*
 * Translate the Default View camera so the newly rendered chronological pin
 * lands at the same browser position that the geographic pin occupied.
 * Zoom level remains unchanged.
 */
function alignDefaultViewPinToClient(anchorClient) {
  if (
    showMapRef.current ||
    !anchorClient ||
    !svgRef.current ||
    !zoomRef.current ||
    !svgSelRef.current
  ) {
    return false;
  }

  const currentPin = readSelectedPinTipClient();
  const svgMatrix = svgRef.current.getScreenCTM?.();

  if (!currentPin || !svgMatrix) return false;

  let inverseSvgMatrix;
  try {
    inverseSvgMatrix = svgMatrix.inverse();
  } catch {
    return false;
  }

  const desiredLocal = new DOMPoint(
    anchorClient.clientX,
    anchorClient.clientY
  ).matrixTransform(inverseSvgMatrix);

  const currentLocal = new DOMPoint(
    currentPin.clientX,
    currentPin.clientY
  ).matrixTransform(inverseSvgMatrix);

  const dx = desiredLocal.x - currentLocal.x;
  const dy = desiredLocal.y - currentLocal.y;

  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return false;
  }

  if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) {
    return true;
  }

  const currentTransform =
    lastTransformRef.current ?? d3.zoomIdentity;

  const nextTransform = d3.zoomIdentity
    .translate(
      currentTransform.x + dx,
      currentTransform.y + dy
    )
    .scale(currentTransform.k);

  svgSelRef.current.call(
    zoomRef.current.transform,
    nextTransform
  );

  lastTransformRef.current = nextTransform;
  kRef.current = nextTransform.k;

  return true;
}

/*
 * Remember the selected object's exact browser position immediately before
 * its TextCard/FatherCard clears selection state.
 *
 * readSelectedPinTipClient() returns the bottom tip of the selected pin, which
 * is geometrically the object's actual timeline/map anchor.
 */
function prepareDeselectionCameraAnchor(type, row) {
  if (!row) {
    pendingDeselectionCameraRef.current = null;
    return;
  }

  const anchor = readSelectedPinTipClient();

  if (
    !anchor ||
    !Number.isFinite(anchor.clientX) ||
    !Number.isFinite(anchor.clientY)
  ) {
    pendingDeselectionCameraRef.current = null;
    return;
  }

  pendingDeselectionCameraRef.current = {
    type,
    id: row.id,
    clientX: anchor.clientX,
    clientY: anchor.clientY,
  };
}

/*
 * Map View is initialized from the current pin position. Default View is
 * translated back to the current map-pin position. This keeps the pin visually
 * stationary in both directions while preserving each view's zoom level.
 */
const handleShowMapChange = useCallback((nextValue) => {
  const nextShowMap = Boolean(nextValue);

  if (nextShowMap === showMapRef.current) return;

  const anchor = readSelectedPinTipClient();

  pendingViewSwitchRef.current = anchor
    ? {
        targetShowMap: nextShowMap,
        anchor,
      }
    : null;

  if (nextShowMap) {
    timelineMapRef.current?.resetViewport?.();
  }

  setShowMap(nextShowMap);
}, []);

/*
 * The main D3 rendering effect runs later in the same commit. Waiting for the
 * next animation frame lets the Default View pin finish receiving its
 * chronological coordinates before the camera translation is calculated.
 */
useEffect(() => {
  if (showMap) return undefined;

  const pendingSwitch = pendingViewSwitchRef.current;

  if (
    pendingSwitch?.targetShowMap !== false ||
    !pendingSwitch.anchor
  ) {
    return undefined;
  }

  if (viewSwitchAlignmentRafRef.current) {
    cancelAnimationFrame(
      viewSwitchAlignmentRafRef.current
    );
  }

  viewSwitchAlignmentRafRef.current =
    requestAnimationFrame(() => {
      viewSwitchAlignmentRafRef.current = 0;

      const activeSwitch =
        pendingViewSwitchRef.current;

      if (
        activeSwitch?.targetShowMap !== false ||
        !activeSwitch.anchor
      ) {
        return;
      }

      if (
        alignDefaultViewPinToClient(
          activeSwitch.anchor
        )
      ) {
        pendingViewSwitchRef.current = null;
      }
    });

  return () => {
    if (viewSwitchAlignmentRafRef.current) {
      cancelAnimationFrame(
        viewSwitchAlignmentRafRef.current
      );
      viewSwitchAlignmentRafRef.current = 0;
    }
  };
}, [showMap, selectedText?.id, selectedFather?.id]);


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
const selectedChronologicalAxisExpanded =
  !!(selectedText || selectedFather) && !showMap;

const margin = {
  top: 8,
  right: 0,
  bottom: selectedChronologicalAxisExpanded
    ? SELECTED_TIMELINE_AXIS_BOTTOM_HEIGHT
    : TIMELINE_AXIS_BOTTOM_HEIGHT,
  left: 0,
};

// Prevent negative inner dimensions during the first render
const innerWidth = Math.max(0, width - margin.left - margin.right);
const innerHeight = Math.max(0, height - margin.top - margin.bottom);

const axisY = innerHeight;
  /* ---- Time domain & base scales ---- */
  const domainHuman = useMemo(() => [-6900, 2500], []);
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
        const currentGeo = (t["Current Geographical Location"] || "").trim();
        const latitude = getOptionalFiniteNumber(t, "Latitude", "lat");
        const longitude = getOptionalFiniteNumber(
          t,
          "Longitude",
          "lng",
          "lon"
        );
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
          currentGeographicalLocation: currentGeo,

          // Normalized map fields consumed by TimelineMap.
          originalLocation: originalGeo,
          modernLocation: currentGeo,
          latitude,
          longitude,

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
      const modernLocation = (
        f["Current Geographical Location"] ||
        f["Modern Geographical Location"] ||
        location
      ).trim();
      const latitude = getOptionalFiniteNumber(f, "Latitude", "lat");
      const longitude = getOptionalFiniteNumber(
        f,
        "Longitude",
        "lng",
        "lon"
      );
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

        // Same normalized map interface used by text rows.
        originalLocation: location,
        modernLocation,
        latitude,
        longitude,

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

useEffect(() => {
  visVersionRef.current += 1;
}, [visTextRows, visFatherRows]);

// Fast lookups for hover-pin targets (only among *currently visible* rows)
const visTextById = useMemo(
  () => new Map((visTextRows || []).map(r => [r.id, r])),
  [visTextRows]
);
const visFatherById = useMemo(
  () => new Map((visFatherRows || []).map(r => [r.id, r])),
  [visFatherRows]
);

// If TagPanel filtering removes the currently selected item, auto-clear selection.
useEffect(() => {
  if (selectedText && !visTextById.has(selectedText.id)) {
    setSelectedText(null);
  }
  if (selectedFather && !visFatherById.has(selectedFather.id)) {
    setSelectedFather(null);
  }
}, [selectedText, selectedFather, visTextById, visFatherById]);

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

  const geographicPoint = getGeographicNodePosition("father", d.id);

  let cx = geographicPoint?.x;
  let cy = geographicPoint?.y;

  if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
    cx = zx(toAstronomical(d.when));

    let cyU = y0(d.y);
    const yBandMap = fatherYMap.get(d.durationId);
    const assignedU = yBandMap?.get(d.id);
    if (Number.isFinite(assignedU)) cyU = assignedU;

    cy = zy(cyU);
  }

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
  // Clicking a link clears any transient card-link hover emphasis.
  setCardLinkHoverTarget(null);
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

// Card-link hover emphasizes the matching connected object's mini-tooltip.
const handleCardLinkHover = (targetType, targetId) => {
  if (!selectedText && !selectedFather) return;

  if (!targetType || !targetId) {
    setCardLinkHoverTarget(null);
    return;
  }

  setCardLinkHoverTarget({
    type: targetType === "figure" ? "father" : targetType,
    id: targetId,
  });
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
  const cat = normalizeConnectionCategory(category);
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


const CONNECTION_BASE_OPACITY = 0.015;   // faint default
const CONNECTION_HIGHLIGHT_OPACITY = 1; // hovered selected connection



function renderConnections(zx, zy, k) {
  if (!connectionsRef.current) return;

  // Current selection / hover state
  const selText       = selectedText;
  const selFather     = selectedFather;
  // Selection mode renders only connections touching the selected node.
  // This overrides the checkbox and removes unrelated lines from the DOM.
  const hasSelection = !!(selText || selFather);
  const hoveredTextId   = hasSelection ? null : hoveredTextIdRef.current;
  const hoveredFatherId = hasSelection ? null : hoveredFatherIdRef.current;
  const selectedHoverTarget = hasSelection
    ? (
        hoveredTimelineTargetRef.current ||
        hoverPinTargetRef.current
      )
    : null;

  const baseOpacity = CONNECTION_BASE_OPACITY;
  const highlightOpacity = CONNECTION_HIGHLIGHT_OPACITY;

  const allData = allConnectionRowsRef.current || [];
if (DEBUG_HOVER) {
  dbgCount("renderConnections");
  console.log("[CONN RENDER]", {
    showConnections: !!showConnections,
    hasSelection: !!(selText || selFather),
    selText: selText?.id || null,
    selFather: selFather?.id || null,
    hoveredTextId,
    hoveredFatherId,
    nAll: allData.length,
    k,
    t: performance.now().toFixed(1),
  });
}



const mapModeActive =
  showMapRef.current && selectedMapAvailableRef.current;

const selectedType = selText
  ? "text"
  : selFather
    ? "father"
    : null;

const selectedId =
  selText?.id ??
  selFather?.id ??
  null;

const geographicPositions = geographicNodePositionsRef.current;

const endpointPosition = (type, id) => {
  const bucket =
    type === "father"
      ? geographicPositions.father
      : geographicPositions.text;

  return bucket.get(id) || null;
};

let data = hasSelection
  ? allData.filter((d) => (
      (selText && (
        (d.aType === "text" && d.aId === selText.id) ||
        (d.bType === "text" && d.bId === selText.id)
      )) ||
      (selFather && (
        (d.aType === "father" && d.aId === selFather.id) ||
        (d.bType === "father" && d.bId === selFather.id)
      ))
    ))
  : (showConnections ? allData : []);

if (mapModeActive) {
  const suppressedKeys =
    connectionSuppressedNodeKeysRef.current;

  data = data.filter(
    (d) =>
      endpointPosition(d.aType, d.aId) &&
      endpointPosition(d.bType, d.bId) &&
      !suppressedKeys.has(`${d.aType}:${d.aId}`) &&
      !suppressedKeys.has(`${d.bType}:${d.bId}`)
  );
}

if (DEBUG_HOVER) {
  console.log("[CONN DATA]", { nData: data.length, t: performance.now().toFixed(1) });
}

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
    .attr("x1", (d) => {
      const point = mapModeActive
        ? endpointPosition(d.aType, d.aId)
        : null;
      return point ? point.x : zx(toAstronomical(d.ax));
    })
    .attr("y1", (d) => {
      const point = mapModeActive
        ? endpointPosition(d.aType, d.aId)
        : null;
      return point ? point.y : zy(d.ay);
    })
    .attr("x2", (d) => {
      const point = mapModeActive
        ? endpointPosition(d.bType, d.bId)
        : null;
      return point ? point.x : zx(toAstronomical(d.bx));
    })
    .attr("y2", (d) => {
      const point = mapModeActive
        ? endpointPosition(d.bType, d.bId)
        : null;
      return point ? point.y : zy(d.by);
    })
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

      const connectsSelectedToHovered =
        !!selectedHoverTarget &&
        !!selectedType &&
        !!selectedId &&
        (
          (
            d.aType === selectedType &&
            d.aId === selectedId &&
            d.bType === selectedHoverTarget.type &&
            d.bId === selectedHoverTarget.id
          ) ||
          (
            d.bType === selectedType &&
            d.bId === selectedId &&
            d.aType === selectedHoverTarget.type &&
            d.aId === selectedHoverTarget.id
          )
        );

// Selection reveals every direct line softly in both Default and Map View.
// Hovering one connected object spotlights only its line and dims the rest.
if (hasSelection) {
  if (!selectedHoverTarget) {
    return CONNECTION_SELECTED_IDLE_OPACITY;
  }

  return connectsSelectedToHovered
    ? highlightOpacity
    : CONNECTION_SELECTED_DIM_OPACITY;
}

// Hover highlighting is only active when nothing is selected.
if (!hasSelection && touchesHovered) return highlightOpacity;

return baseOpacity;
    });

  renderSelectedTooltipRef.current?.(true);
}

// PERF: coalesce renderConnections calls (zoom can fire dozens of times per second)
function scheduleRenderConnections(zx, zy, k) {
if (DEBUG_HOVER) {
  const c = dbgCount("scheduleRenderConnections");
  dbgLog("CONN_SCHED", { c, showConnections: !!showConnections, hasSelection: !!(selectedText || selectedFather), hoveredTextId: hoveredTextIdRef.current || null, hoveredFatherId: hoveredFatherIdRef.current || null, k, t: performance.now().toFixed(1) }, 0);
}
  connArgsRef.current = { zx, zy, k };
  if (connUpdateRaf.current) return;
  connUpdateRaf.current = requestAnimationFrame(() => {
    connUpdateRaf.current = 0;
    const args = connArgsRef.current;
    if (!args) return;
    renderConnections(args.zx, args.zy, args.k);
  });
}

function scheduleCurrentConnectionRender() {
  const transform =
    lastTransformRef.current ?? d3.zoomIdentity;

  const zx =
    zxRef.current ?? transform.rescaleX(x);

  const zy =
    zyRef.current ?? transform.rescaleY(y0);

  scheduleRenderConnections(
    zx,
    zy,
    transform.k ?? kRef.current ?? 1
  );
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

      // Endpoint tokens are expected to be explicit: "father" or "text".
      // Unknown values are rejected and reported by the caller.
      if (typeRaw === "father") {
        const row =
          fatherByBandByIndex
            .get(bandId)
            ?.get(index) || null;

        if (!row) return null;

        return {
          type: "father",
          row,
          bandId,
        };
      }

      if (typeRaw === "text") {
        const row =
          textByBandByIndex
            .get(bandId)
            ?.get(index) || null;

        if (!row) return null;

        return {
          type: "text",
          row,
          bandId,
        };
      }

      return null;
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

  const skippedConnections = [];

  for (const ds of connectionRegistry) {
    const fallbackBandId = ds.durationId || null; // legacy datasets (per folder)

    for (const row of ds.connections) {
      // For supraclusteral rows:
      //   Primary Duration / Secondary Duration are present and may differ.
      // For legacy rows:
      //   they're missing -> we fall back to ds.durationId for both ends.
      const aBandId =
        toCompositeBandId(row["Primary Duration"]) ??
        fallbackBandId;

      const bBandId =
        toCompositeBandId(row["Secondary Duration"]) ??
        fallbackBandId;

      if (!aBandId || !bBandId) {
        skippedConnections.push({
          index: row.Index ?? row.id ?? null,
          reason: "missing duration/band",
          primaryDuration: row["Primary Duration"] ?? null,
          secondaryDuration: row["Secondary Duration"] ?? null,
          sourcePath: ds.sourcePath || null,
        });
        continue;
      }

      const A = parseEnd(
        row.Primary,
        row["Primary Name"],
        aBandId
      );

      const B = parseEnd(
        row.Secondary,
        row["Secondary Name"],
        bBandId
      );

      if (!A || !B) {
        skippedConnections.push({
          index: row.Index ?? row.id ?? null,
          reason: !A && !B
            ? "both endpoints unresolved"
            : !A
              ? "primary endpoint unresolved"
              : "secondary endpoint unresolved",
          primary: row.Primary ?? null,
          primaryName: row["Primary Name"] ?? null,
          primaryBandId: aBandId,
          secondary: row.Secondary ?? null,
          secondaryName: row["Secondary Name"] ?? null,
          secondaryBandId: bBandId,
          sourcePath: ds.sourcePath || null,
        });
        continue;
      }

      const ax = Number(A.row.when ?? NaN);
      const bx = Number(B.row.when ?? NaN);

      if (!Number.isFinite(ax) || !Number.isFinite(bx)) {
        skippedConnections.push({
          index: row.Index ?? row.id ?? null,
          reason: "endpoint date unresolved",
          primaryName: row["Primary Name"] ?? null,
          primaryWhen: A.row.when ?? null,
          secondaryName: row["Secondary Name"] ?? null,
          secondaryWhen: B.row.when ?? null,
          sourcePath: ds.sourcePath || null,
        });
        continue;
      }

      const aYmap = A.type === "father" ? fatherYMap : textYMap;
      const bYmap = B.type === "father" ? fatherYMap : textYMap;

      // IMPORTANT: use each endpoint's own band id
      const ay =
        aYmap.get(aBandId)?.get(A.row.id);

      const by =
        bYmap.get(bBandId)?.get(B.row.id);

      if (!Number.isFinite(ay) || !Number.isFinite(by)) {
        skippedConnections.push({
          index: row.Index ?? row.id ?? null,
          reason: "endpoint layout position unresolved",
          primaryName: row["Primary Name"] ?? null,
          primaryBandId: aBandId,
          primaryId: A.row.id,
          primaryY: ay ?? null,
          secondaryName: row["Secondary Name"] ?? null,
          secondaryBandId: bBandId,
          secondaryId: B.row.id,
          secondaryY: by ?? null,
          sourcePath: ds.sourcePath || null,
        });
        continue;
      }

      const rawCategory =
        row["Connection Category"] ?? "";

      const category =
        normalizeConnectionCategory(rawCategory);

      const style = styleForConnection(
        category,
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
        category,
        rawCategory,
      });
    }
  }

  allConnectionRowsRef.current = out;

  if (DEBUG_TL && skippedConnections.length) {
    console.warn(
      `[Timeline] Skipped ${skippedConnections.length} connection row(s)`,
      skippedConnections
    );
  }

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

  syncSelectedNeighborhoodFocus();
}, [selectedText, selectedFather, visTextRows, visFatherRows]);



  // Re-apply connection styling when selected text/father changes
  useEffect(() => {
    if (!connectionsRef.current) return;
    const t = lastTransformRef.current ?? d3.zoomIdentity;
    scheduleRenderConnections(t.rescaleX(x), t.rescaleY(y0), t.k);
  }, [selectedText, selectedFather, showMap, x, y0, renderConnections]);



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

    /*
     * Selection performance mode:
     * while a card is open, keep only the selected node and its direct
     * one-hop text/father neighbors in the D3 data joins.
     *
     * Selected mode derives rows from the complete text/father collections
     * so every direct neighbor can appear. When the card closes, the normal
     * TagPanel-filtered collections return.
     */
    const hasSelectionForRendering = !!(selectedText || selectedFather);
    const relevantTextIdsForRendering = relevantTextIdsRef.current;
    const relevantFatherIdsForRendering = relevantFatherIdsRef.current;
    const mapModeForRendering =
      showMapRef.current && selectedMapAvailableRef.current;

    const renderTextRows = hasSelectionForRendering
      ? (textRows || []).filter(
          (row) =>
            relevantTextIdsForRendering.has(row.id) &&
            (!mapModeForRendering || hasMapCoordinates(row))
        )
      : visTextRows;

    const renderFatherRows = hasSelectionForRendering
      ? (fatherRows || []).filter(
          (row) =>
            relevantFatherIdsForRendering.has(row.id) &&
            (!mapModeForRendering || hasMapCoordinates(row))
        )
      : visFatherRows;

    

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

    /*
     * Persistent selected-object tooltip for the deepest Default View tier.
     * It is separate from tipText, so ordinary hover tooltips remain
     * independent when no object is selected.
     */
    const tipSelected = makeTip("tl-selected")
      .classed("tl-text", true)
      .style(
        "--tl-main-tooltip-border-width",
        `${MAIN_TOOLTIP_BORDER_WIDTH}px`
      );

    const miniTooltipLayer = d3
      .select(wrapEl)
      .selectAll("div.tl-mini-tooltip-layer")
      .data([0])
      .join("div")
      .attr("class", "tl-mini-tooltip-layer");

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

    /*
     * Persistent selected-object tooltip and connected-object mini-labels.
     *
     * Placement is scored once for a selected object in each view. Later
     * drag/zoom frames preserve the chosen side and simply follow each SVG
     * anchor. This avoids flicker and prevents labels from lingering at a
     * viewport edge when their objects are dragged offscreen.
     */
    function renderPersistentObjectTooltips(
      allowPlacementCalculation = false
    ) {
      const selectedRow =
        selectedText || selectedFather;

      const selectedType = selectedText
        ? "text"
        : selectedFather
          ? "father"
          : null;

      const selectedId =
        selectedText?.id ??
        selectedFather?.id ??
        null;

      const activeSelectionKey =
        selectedType && selectedId
          ? `${selectedType}:${selectedId}`
          : null;

      const tooltipSequence =
        tooltipSequenceRef.current;

      const tooltipPhase =
        tooltipSequence.selectionKey === activeSelectionKey
          ? tooltipSequence.phase
          : activeSelectionKey
            ? "selected"
            : "idle";

      /*
       * The selected tooltip is persistent in both views at the middle and
       * deepest zoom tiers. It disappears only in the outest tier.
       */
      const showSelectedPersistent =
        getActiveViewZoomK(kRef.current) >=
        ZOOM_SEGMENT_THRESHOLD;

      const showAllMiniIntro =
        MINI_TOOLTIPS_ENABLED &&
        tooltipPhase === "mini";

      /*
       * Automatic mini-tooltips remain disabled. While an object is selected,
       * hovering either an actual connected object or its link inside the open
       * card shows that one mini-tooltip. In either view the hovered label is
       * anchored directly above its object.
       */
      const selectionHoverMini =
        !!activeSelectionKey &&
        tooltipPhase === "hover";

      const directSelectionHoverMini =
        selectionHoverMini;

      const showHoveredMiniOnly =
        selectionHoverMini ||
        (
          MINI_TOOLTIPS_ENABLED &&
          tooltipPhase === "hover"
        );

      if (!selectedRow || !selectedType || !selectedId) {
        hideTipSel(tipSelected);

        miniTooltipLayer
          .selectAll("div.tl-mini-tooltip")
          .data([])
          .join("div");

        selectedTooltipPlacementRef.current = {
          layoutKey: null,
          placement: null,
          width: 0,
          height: 0,
        };

        miniTooltipPlacementsRef.current.clear();
        return;
      }

      const viewName = showMapRef.current
        ? "map"
        : "default";

      const layoutKey =
        `${viewName}:${selectedType}:${selectedId}`;

      if (
        selectedTooltipPlacementRef.current
          .layoutKey !== layoutKey
      ) {
        selectedTooltipPlacementRef.current = {
          layoutKey,
          placement: null,
          width: 0,
          height: 0,
        };

        miniTooltipPlacementsRef.current.clear();

        tipSelected
          .style("display", "none")
          .style("visibility", "hidden")
          .style("opacity", 0);
      }

      const selector = selectedText
        ? "g.textPin path.tl-pin-body"
        : "g.fatherPin path.tl-pin-body";

      const pinBody =
        pinsRef.current?.querySelector(selector);

      if (!pinBody) {
        hideTipSel(tipSelected);

        miniTooltipLayer
          .selectAll("div.tl-mini-tooltip")
          .style("display", "none");

        return;
      }

      const wrapRect =
        wrapEl.getBoundingClientRect();

      const pinClientRect =
        pinBody.getBoundingClientRect();

      const intersectsViewport = (rect) =>
        (
          rect.right >= wrapRect.left &&
          rect.left <= wrapRect.right &&
          rect.bottom >= wrapRect.top &&
          rect.top <= wrapRect.bottom
        );

      const pinIsVisible =
        pinClientRect.width > 0 &&
        pinClientRect.height > 0 &&
        intersectsViewport(pinClientRect);

      const toLocalRect = (
        clientRect,
        padding = 0
      ) => ({
        left:
          clientRect.left -
          wrapRect.left -
          padding,
        top:
          clientRect.top -
          wrapRect.top -
          padding,
        right:
          clientRect.right -
          wrapRect.left +
          padding,
        bottom:
          clientRect.bottom -
          wrapRect.top +
          padding,
        width:
          clientRect.width + padding * 2,
        height:
          clientRect.height + padding * 2,
      });

      const addRectDimensions = (rect) => ({
        ...rect,
        width:
          rect.width ??
          Math.max(0, rect.right - rect.left),
        height:
          rect.height ??
          Math.max(0, rect.bottom - rect.top),
        cx:
          (rect.left + rect.right) / 2,
        cy:
          (rect.top + rect.bottom) / 2,
      });

      const rectangleOverlapArea = (a, b) => {
        const width = Math.max(
          0,
          Math.min(a.right, b.right) -
            Math.max(a.left, b.left)
        );

        const height = Math.max(
          0,
          Math.min(a.bottom, b.bottom) -
            Math.max(a.top, b.top)
        );

        return width * height;
      };

      const pointToSegmentDistance = (
        px,
        py,
        segment
      ) => {
        const vx = segment.x2 - segment.x1;
        const vy = segment.y2 - segment.y1;
        const lengthSquared = vx * vx + vy * vy;

        if (lengthSquared <= 0.0001) {
          return Math.hypot(
            px - segment.x1,
            py - segment.y1
          );
        }

        const t = clamp(
          (
            (px - segment.x1) * vx +
            (py - segment.y1) * vy
          ) / lengthSquared,
          0,
          1
        );

        const nearestX = segment.x1 + t * vx;
        const nearestY = segment.y1 + t * vy;

        return Math.hypot(
          px - nearestX,
          py - nearestY
        );
      };

      const lineSegmentsIntersect = (
        ax,
        ay,
        bx,
        by,
        cx,
        cy,
        dx,
        dy
      ) => {
        const cross = (
          x1,
          y1,
          x2,
          y2,
          x3,
          y3
        ) =>
          (x2 - x1) * (y3 - y1) -
          (y2 - y1) * (x3 - x1);

        const d1 = cross(ax, ay, bx, by, cx, cy);
        const d2 = cross(ax, ay, bx, by, dx, dy);
        const d3 = cross(cx, cy, dx, dy, ax, ay);
        const d4 = cross(cx, cy, dx, dy, bx, by);

        return (
          ((d1 >= 0 && d2 <= 0) ||
            (d1 <= 0 && d2 >= 0)) &&
          ((d3 >= 0 && d4 <= 0) ||
            (d3 <= 0 && d4 >= 0))
        );
      };

      const segmentIntersectsRect = (
        segment,
        rect
      ) => {
        const endpointInside = (x, y) =>
          x >= rect.left &&
          x <= rect.right &&
          y >= rect.top &&
          y <= rect.bottom;

        if (
          endpointInside(segment.x1, segment.y1) ||
          endpointInside(segment.x2, segment.y2)
        ) {
          return true;
        }

        return (
          lineSegmentsIntersect(
            segment.x1,
            segment.y1,
            segment.x2,
            segment.y2,
            rect.left,
            rect.top,
            rect.right,
            rect.top
          ) ||
          lineSegmentsIntersect(
            segment.x1,
            segment.y1,
            segment.x2,
            segment.y2,
            rect.right,
            rect.top,
            rect.right,
            rect.bottom
          ) ||
          lineSegmentsIntersect(
            segment.x1,
            segment.y1,
            segment.x2,
            segment.y2,
            rect.right,
            rect.bottom,
            rect.left,
            rect.bottom
          ) ||
          lineSegmentsIntersect(
            segment.x1,
            segment.y1,
            segment.x2,
            segment.y2,
            rect.left,
            rect.bottom,
            rect.left,
            rect.top
          )
        );
      };

      const placementVector = (placement) => {
        switch (placement) {
          case "top":
            return { x: 0, y: -1 };
          case "top-right":
            return { x: 0.707, y: -0.707 };
          case "right":
            return { x: 1, y: 0 };
          case "bottom-right":
            return { x: 0.707, y: 0.707 };
          case "bottom":
            return { x: 0, y: 1 };
          case "bottom-left":
            return { x: -0.707, y: 0.707 };
          case "left":
            return { x: -1, y: 0 };
          case "top-left":
            return { x: -0.707, y: -0.707 };
          default:
            return { x: 0, y: -1 };
        }
      };

      const placementRect = (
        anchorRect,
        placement,
        width,
        height,
        gap
      ) => {
        const anchor = addRectDimensions(anchorRect);

        let left;
        let top;

        switch (placement) {
          case "top-right":
            left = anchor.right + gap;
            top = anchor.top - height - gap;
            break;
          case "right":
            left = anchor.right + gap;
            top = anchor.cy - height / 2;
            break;
          case "bottom-right":
            left = anchor.right + gap;
            top = anchor.bottom + gap;
            break;
          case "bottom":
            left = anchor.cx - width / 2;
            top = anchor.bottom + gap;
            break;
          case "bottom-left":
            left = anchor.left - width - gap;
            top = anchor.bottom + gap;
            break;
          case "left":
            left = anchor.left - width - gap;
            top = anchor.cy - height / 2;
            break;
          case "top-left":
            left = anchor.left - width - gap;
            top = anchor.top - height - gap;
            break;
          case "top":
          default:
            left = anchor.cx - width / 2;
            top = anchor.top - height - gap;
            break;
        }

        return addRectDimensions({
          left,
          top,
          right: left + width,
          bottom: top + height,
          width,
          height,
        });
      };

      const connectionSegments = [];

      connectionsRef.current
        ?.querySelectorAll("line.connection")
        .forEach((line) => {
          const style =
            window.getComputedStyle(line);

          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            Number(style.opacity) === 0 ||
            Number(style.strokeOpacity) === 0
          ) {
            return;
          }

          const matrix = line.getScreenCTM?.();
          if (!matrix) return;

          const x1 = Number(line.getAttribute("x1"));
          const y1 = Number(line.getAttribute("y1"));
          const x2 = Number(line.getAttribute("x2"));
          const y2 = Number(line.getAttribute("y2"));

          if (
            ![x1, y1, x2, y2].every(
              Number.isFinite
            )
          ) {
            return;
          }

          const p1 = new DOMPoint(
            x1,
            y1
          ).matrixTransform(matrix);

          const p2 = new DOMPoint(
            x2,
            y2
          ).matrixTransform(matrix);

          connectionSegments.push({
            x1: p1.x - wrapRect.left,
            y1: p1.y - wrapRect.top,
            x2: p2.x - wrapRect.left,
            y2: p2.y - wrapRect.top,
          });
        });

      const markerByKey = new Map();

      const registerMarker = (
        node,
        type,
        forcePlacement = null
      ) => {
        if (!node) return;

        const style =
          window.getComputedStyle(node);

        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          Number(style.opacity) === 0
        ) {
          return;
        }

        const datum = d3.select(node).datum();
        const row = datum?.row || datum;

        const id = datum?.id ?? row?.id;

        if (!row || id == null) return;

        if (
          type === selectedType &&
          id === selectedId
        ) {
          return;
        }

        const clientRect =
          node.getBoundingClientRect();

        if (
          clientRect.width <= 0 ||
          clientRect.height <= 0
        ) {
          return;
        }

        const key = `${type}:${id}`;

        const existing = markerByKey.get(key);

        /*
         * Text circles and pie groups may both exist. Keep whichever currently
         * has the more useful rendered bounding box.
         */
        if (
          existing &&
          (
            existing.clientRect.width *
              existing.clientRect.height
          ) >=
            (
              clientRect.width *
              clientRect.height
            )
        ) {
          return;
        }

        markerByKey.set(key, {
          key,
          type,
          id,
          row,
          node,
          clientRect,
          forcePlacement,
          label:
            type === "text"
              ? row.title || datum?.label || ""
              : row.name || datum?.label || "",
          accent:
            datum?.colors
              ? meanObjectColors(datum.colors)
              : objectTooltipAccent(row),
        });
      };

      textsRef.current
        ?.querySelectorAll(
          "circle.textDot, g.dotSlices"
        )
        .forEach((node) =>
          registerMarker(node, "text")
        );

      fathersRef.current
        ?.querySelectorAll("g.fatherMark")
        .forEach((node) =>
          registerMarker(node, "father")
        );

      /*
       * Co-located markers exist only as branch icons while the branch is
       * expanded. In Geographical Map mode their mini-tooltips intentionally
       * sit BELOW the branch icon. This keeps the labels away from the
       * disclosure button / branch origin and gives every shared-location
       * object one stable directional rule.
       */
      if (
        showMapRef.current &&
        locationClusterOpenRef.current
      ) {
        locationClusterBranchRef.current
          ?.querySelectorAll(
            "g.locationClusterBranch__item"
          )
          .forEach((node) => {
            const datum = d3.select(node).datum();

            registerMarker(
              node,
              datum?.type || "text",
              "bottom"
            );
          });
      }

      const markerEntries =
        Array.from(markerByKey.values());

      /*
       * Connected-object geometry is used only by the mini-tooltip collision
       * system. The selected object's main tooltip is always placed directly
       * above its pin and does not participate in obstacle scoring.
       */
      const connectedObjectObstacles = markerEntries.map(
        (entry) =>
          addRectDimensions(
            toLocalRect(entry.clientRect, 5)
          )
      );

      const miniTooltipObstacles = [
        ...connectedObjectObstacles,
      ];

      wrapEl
        .querySelectorAll(
          ".textCard, .fatherCard, .timelineSearch, .searchBar"
        )
        .forEach((node) => {
          const rect = node.getBoundingClientRect();

          if (rect.width > 0 && rect.height > 0) {
            miniTooltipObstacles.push(
              addRectDimensions(
                toLocalRect(rect, 2)
              )
            );
          }
        });

      const scoreRectangle = (
        candidate,
        {
          obstacles,
          occupiedLabels = [],
          viewportPadding,
          objectClearance,
          lineClearance,
          radialVector = null,
          placement = null,
          considerConnectionLines = true,
        }
      ) => {
        let score = 0;

        const overflowLeft = Math.max(
          0,
          viewportPadding - candidate.left
        );

        const overflowTop = Math.max(
          0,
          viewportPadding - candidate.top
        );

        const overflowRight = Math.max(
          0,
          candidate.right -
            (
              wrapRect.width -
              viewportPadding
            )
        );

        const overflowBottom = Math.max(
          0,
          candidate.bottom -
            (
              wrapRect.height -
              viewportPadding
            )
        );

        score +=
          (
            overflowLeft +
            overflowTop +
            overflowRight +
            overflowBottom
          ) * 10000;

        for (const obstacle of obstacles) {
          const overlap =
            rectangleOverlapArea(
              candidate,
              obstacle
            );

          if (overlap > 0) {
            score += 100000 + overlap * 30;
          }

          const distance = Math.hypot(
            candidate.cx - obstacle.cx,
            candidate.cy - obstacle.cy
          );

          if (distance < objectClearance) {
            score +=
              (
                objectClearance - distance
              ) * 25;
          }
        }

        for (const occupied of occupiedLabels) {
          const overlap =
            rectangleOverlapArea(
              candidate,
              occupied
            );

          if (overlap > 0) {
            score += 160000 + overlap * 45;
          }
        }

        if (considerConnectionLines) {
          for (const segment of connectionSegments) {
            if (
              segmentIntersectsRect(
                segment,
                candidate
              )
            ) {
              score += 75000;
            }

            const distance =
              pointToSegmentDistance(
                candidate.cx,
                candidate.cy,
                segment
              );

            if (distance < lineClearance) {
              score +=
                (
                  lineClearance - distance
                ) * 18;
            }
          }
        }

        /*
         * Mini-labels naturally prefer the side facing away from the selected
         * pin, while still yielding to actual crowding.
         */
        if (
          radialVector &&
          placement
        ) {
          const direction =
            placementVector(placement);

          const length = Math.hypot(
            radialVector.x,
            radialVector.y
          ) || 1;

          const dot =
            (
              direction.x * radialVector.x +
              direction.y * radialVector.y
            ) / length;

          score -= dot * 42;
        }

        return score;
      };

      const allPlacements = [
        "top",
        "top-right",
        "right",
        "bottom-right",
        "bottom",
        "bottom-left",
        "left",
        "top-left",
      ];

      const pinRect = addRectDimensions(
        toLocalRect(pinClientRect)
      );

      let selectedTooltipRect = null;

      const selectedPlacementCache =
        selectedTooltipPlacementRef.current;

      const selectedHTML = selectedText
        ? textObjectTipHTML(selectedText)
        : fatherObjectTipHTML(selectedFather);

      const selectedAccent =
        objectTooltipAccent(selectedRow);

      /*
       * Selected-view styling now lives on the stable React timelineWrap.
       * This avoids losing Map View emphasis when D3 refreshes tooltip classes
       * during repeated geographic zoom/layout updates.
       */
      const selectedTooltipGap = showMapRef.current
        ? SELECTED_TOOLTIP_GAP
        : SELECTED_TOOLTIP_CHRONOLOGICAL_GAP;

      if (
        showSelectedPersistent &&
        !selectedPlacementCache.placement &&
        allowPlacementCalculation
      ) {
        tipSelected
          .html(selectedHTML)
          .style("--accent", selectedAccent)
          .style("display", "block")
          .style("visibility", "hidden")
          .style("opacity", 1);

        const tipNode = tipSelected.node();

        const width =
          tipNode?.offsetWidth || 0;

        const height =
          tipNode?.offsetHeight || 0;

        if (width > 0 && height > 0) {
          /*
           * One rule in both selected views:
           * center the main tooltip directly above the selected pin.
           *
           * Map zoom/pan therefore changes only the pin anchor coordinates;
           * it can no longer cause the tooltip to switch sides because nearby
           * connected objects or branch geometry changed.
           */
          selectedTooltipPlacementRef.current = {
            layoutKey,
            placement: "top",
            width,
            height,
          };
        }
      }

      const activeSelectedPlacement =
        selectedTooltipPlacementRef.current;

      if (
        showSelectedPersistent &&
        activeSelectedPlacement.placement &&
        pinIsVisible
      ) {
        selectedTooltipRect = placementRect(
          pinRect,
          activeSelectedPlacement.placement,
          activeSelectedPlacement.width,
          activeSelectedPlacement.height,
          selectedTooltipGap
        );

        tipSelected
          .html(selectedHTML)
          .style("--accent", selectedAccent)
          .style("display", "block")
          .style("visibility", "visible")
          .style("opacity", 1)
          .style(
            "left",
            `${selectedTooltipRect.left}px`
          )
          .style(
            "top",
            `${selectedTooltipRect.top}px`
          )
          .attr(
            "data-placement",
            activeSelectedPlacement.placement
          );
      } else {
        tipSelected
          .style("display", "none")
          .style("visibility", "hidden")
          .style("opacity", 0);
      }

      const selectedPinCenter = {
        x: pinRect.cx,
        y: pinRect.cy,
      };

      markerEntries.sort((a, b) => {
        const aRect = addRectDimensions(
          toLocalRect(a.clientRect)
        );

        const bRect = addRectDimensions(
          toLocalRect(b.clientRect)
        );

        const angleA = Math.atan2(
          aRect.cy - selectedPinCenter.y,
          aRect.cx - selectedPinCenter.x
        );

        const angleB = Math.atan2(
          bRect.cy - selectedPinCenter.y,
          bRect.cx - selectedPinCenter.x
        );

        return angleA - angleB;
      });

      const miniSelection = miniTooltipLayer
        .selectAll("div.tl-mini-tooltip")
        .data(
          markerEntries,
          (entry) => entry.key
        )
        .join(
          (enter) =>
            enter
              .append("div")
              .attr(
                "class",
                "tl-mini-tooltip"
              )
              .style("position", "absolute")
              .style("pointer-events", "none")
              .style("display", "none")
              .style("visibility", "hidden")
              .style("opacity", 0),
          (update) => update,
          (exit) => exit.remove()
        )
        .html((entry) =>
          entry.type === "text"
            ? textObjectTipHTML(entry.row)
            : fatherObjectTipHTML(entry.row)
        )
        .style(
          "--accent",
          (entry) => entry.accent
        )
        .style(
          "--tl-mini-tooltip-border-width",
          `${MINI_TOOLTIP_BORDER_WIDTH}px`
        )
        .style(
          "--tl-mini-tooltip-hover-ring-width",
          `${MINI_TOOLTIP_HOVER_RING_WIDTH}px`
        )
        .classed(
          "is-card-link-hover",
          (entry) => {
            const target = hoverPinTargetRef.current;

            return (
              !!target &&
              target.type === entry.type &&
              target.id === entry.id
            );
          }
        )
        .classed(
          "is-timeline-icon-hover",
          (entry) => {
            const target = hoveredTimelineTargetRef.current;

            return (
              !!target &&
              target.type === entry.type &&
              target.id === entry.id
            );
          }
        );

      const occupiedMiniRects = [];

      miniSelection.each(function (entry) {
        const label = d3.select(this);

        const cardHoverTarget =
          hoverPinTargetRef.current;

        const iconHoverTarget =
          hoveredTimelineTargetRef.current;

        const isCardHovered =
          !!cardHoverTarget &&
          cardHoverTarget.type === entry.type &&
          cardHoverTarget.id === entry.id;

        const isIconHovered =
          !!iconHoverTarget &&
          iconHoverTarget.type === entry.type &&
          iconHoverTarget.id === entry.id;

        const shouldShowMini =
          showAllMiniIntro ||
          (
            showHoveredMiniOnly &&
            (isCardHovered || isIconHovered)
          );

        const currentRect =
          entry.node.getBoundingClientRect();

        const markerIsVisible =
          currentRect.width > 0 &&
          currentRect.height > 0 &&
          intersectsViewport(currentRect);

        /*
         * Direct selected-object hover enlarges ordinary timeline/map markers
         * over HOVER_ANIM_MS. getBoundingClientRect() therefore changes for a
         * few frames even though the marker's center does not move. If the
         * mini-tooltip follows that live rectangle, its top edge is pulled
         * upward while the icon grows, producing the small visible "jerk".
         *
         * Anchor direct-hover mini-tooltips to the marker's FINAL hovered
         * footprint immediately instead. The center still comes from the live
         * DOM rectangle, so map/timeline pan and zoom continue to track
         * correctly; only the transient hover-size animation is removed from
         * tooltip positioning.
         */
        const directHoverAnchorRect = () => {
          const liveAnchorRect = addRectDimensions(
            toLocalRect(currentRect)
          );

          if (
            !directSelectionHoverMini ||
            !isIconHovered ||
            !entry.node.matches?.(
              "circle.textDot, g.dotSlices, g.fatherMark"
            )
          ) {
            return liveAnchorRect;
          }

          const baseRadius =
            entry.type === "father"
              ? getFatherObjectRadius(entry.row, kRef.current)
              : getTextObjectRadius(entry.row, kRef.current);

          const hoverScale =
            entry.type === "father"
              ? getFatherObjectHoverScale(entry.row)
              : getTextObjectHoverScale(entry.row);

          const hoveredRadius =
            Math.max(0, baseRadius * hoverScale);

          if (!Number.isFinite(hoveredRadius)) {
            return liveAnchorRect;
          }

          return addRectDimensions({
            left: liveAnchorRect.cx - hoveredRadius,
            top: liveAnchorRect.cy - hoveredRadius,
            right: liveAnchorRect.cx + hoveredRadius,
            bottom: liveAnchorRect.cy + hoveredRadius,
            width: hoveredRadius * 2,
            height: hoveredRadius * 2,
          });
        };

        const placementKey =
          `${layoutKey}:${entry.key}`;

        let placementCache =
          miniTooltipPlacementsRef.current.get(
            placementKey
          );

        if (
          shouldShowMini &&
          !placementCache &&
          allowPlacementCalculation
        ) {
          label
            .style("display", "block")
            .style("visibility", "hidden")
            .style("opacity", 1);

          const labelNode = label.node();

          const width =
            labelNode?.offsetWidth || 0;

          const height =
            labelNode?.offsetHeight || 0;

          if (width > 0 && height > 0) {
            const anchorRect =
              directHoverAnchorRect();

            const radialVector = {
              x:
                anchorRect.cx -
                selectedPinCenter.x,
              y:
                anchorRect.cy -
                selectedPinCenter.y,
            };

            let placement =
              entry.forcePlacement ||
              (directSelectionHoverMini
                ? "top"
                : null);

            if (!placement) {
              const occupied = [
                ...(selectedTooltipRect
                  ? [selectedTooltipRect]
                  : []),
                ...occupiedMiniRects,
              ];

              const best = allPlacements.reduce(
                (
                  winner,
                  candidatePlacement,
                  priority
                ) => {
                  const candidate =
                    placementRect(
                      anchorRect,
                      candidatePlacement,
                      width,
                      height,
                      MINI_TOOLTIP_GAP
                    );

                  const score =
                    scoreRectangle(candidate, {
                      obstacles:
                        miniTooltipObstacles,
                      occupiedLabels:
                        occupied,
                      viewportPadding:
                        MINI_TOOLTIP_VIEWPORT_PADDING,
                      objectClearance:
                        MINI_TOOLTIP_OBJECT_CLEARANCE,
                      lineClearance:
                        MINI_TOOLTIP_LINE_CLEARANCE,
                      radialVector,
                      placement:
                        candidatePlacement,
                    }) +
                    priority * 0.01;

                  return (
                    !winner ||
                    score < winner.score
                  )
                    ? {
                        placement:
                          candidatePlacement,
                        score,
                      }
                    : winner;
                },
                null
              );

              placement =
                best?.placement || "right";
            }

            placementCache = {
              placement,
              width,
              height,
            };

            miniTooltipPlacementsRef.current.set(
              placementKey,
              placementCache
            );
          }
        }

        if (
          !shouldShowMini ||
          !placementCache ||
          !markerIsVisible
        ) {
          label
            .style("display", "none")
            .style("visibility", "hidden")
            .style("opacity", 0);

          return;
        }

        const anchorRect =
          directHoverAnchorRect();

        const labelRect = placementRect(
          anchorRect,
          placementCache.placement,
          placementCache.width,
          placementCache.height,
          MINI_TOOLTIP_GAP
        );

        occupiedMiniRects.push(labelRect);

        label
          .style("display", "block")
          .style("visibility", "visible")
          .style("opacity", 1)
          .style("left", `${labelRect.left}px`)
          .style("top", `${labelRect.top}px`)
          .attr(
            "data-placement",
            placementCache.placement
          );
      });

      if (!showMapRef.current) {
        renderDefaultSelectionAxisAndGuides(
          zxRef.current,
          zyRef.current
        );
      }
    }

    renderSelectedTooltipRef.current =
      renderPersistentObjectTooltips;

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

  // legacy no-ops (hover is ref-driven now)
const setHoveredDurationId = () => {};
const setHoveredSegmentId = () => {};

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

    // === NEW: "noborders" mode ===
  // No fills, no strokes, no outlines, no custom group borders.
  if (lm === "noborders") {
    const outlineRoot = d3.select(outlinesRef.current);

    outlineRoot.selectAll("rect.outlineRect")
      .style("fill-opacity", 0)
      .style("stroke-opacity", 0)
      .style("stroke", "none");

    d3.select(customPolysRef.current)
      .selectAll("path.customGroup")
    .style("fill-opacity", 0)
    .style("stroke-opacity", 0)
  .style("stroke", "none");

    // labels are hidden by gOut display:none in updateInteractivity,
    // but leaving label styling alone here is fine.
    return;
  }


  const showDurationChrome =
    (lm === "durations") &&
    (zoomMode === "outest") &&
    !hasSelection;

  const showPassiveOutlines =
    (lm === "none") ||
    (lm === "durations" && (zoomMode === "middle" || zoomMode === "deepest")) ||
    (lm === "segments"  && (zoomMode === "deepest"));

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
    .style("stroke", (d) => showPassiveOutlines ? (d.color || "#999") : "none")
    .style("stroke-opacity", showPassiveOutlines ? OUTLINE_ONLY_STROKE_OPACITY : 0)
    .style("stroke-width", showPassiveOutlines ? `${OUTLINE_ONLY_STROKE_WIDTH}px` : null);
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
          updateHoverVisuals();
        }
      } else {
        syncDurationHoverFromPointer(srcEvt);

        // ensure segment hover doesn't linger
        if (hoveredSegIdRef.current != null) {
          hoveredSegIdRef.current = null;
          updateSegmentPreview();
        }
      }
    } else if (k < ZOOM_THRESHOLD) {
      // MIDDLE: segments hover
      syncSegmentHoverFromPointer(srcEvt);

      // ensure duration hover doesn't linger
      if (hoveredDurationIdRef.current != null) {
        hoveredDurationIdRef.current = null;
        updateHoverVisuals();
      }
    } else {
      // DEEPEST: clear both to avoid "stuck" hover UI
      if (hoveredDurationIdRef.current != null) {
        hoveredDurationIdRef.current = null;
        updateHoverVisuals();
      }
      if (hoveredSegIdRef.current != null) {
        hoveredSegIdRef.current = null;
        updateSegmentPreview();
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
  .data(renderTextRows, (d) => d.id)
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
        .attr("r", (d) => {
          const k = kRef.current;
          const rBase = getTextObjectRadius(d, k);
          const isSelected = selectedText && selectedText.id === d.id;
          const isHovered = hoveredTextIdRef.current === d.id;
          return isSelected ? rBase * HOVER_SCALE_DOT : rBase;
      })
        
        // ensure the circle itself receives events (pies keep pointer-events: none)
        .style("pointer-events", "all")
        .style("cursor", "pointer"),
    (update) =>
      update
        .attr("fill", (d) =>
          (d.colors && d.colors.length > 1 ? "transparent" : (d.color || "#444"))
        )
        .attr("r", (d) => {
          const k = kRef.current;
          const rBase = getTextObjectRadius(d, k);
          const isSelected = selectedText && selectedText.id === d.id;
          const isHovered = hoveredTextIdRef.current === d.id;
          return isSelected ? rBase * HOVER_SCALE_DOT : rBase;
        })
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
  .data(
    renderTextRows.filter((d) => (d.colors || []).length > 1),
    (d) => d.id
  )
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


// --- Hover enlargement helpers (single-owner; smooth for circles + pies) ---
const HOVER_ANIM_MS = 70;

// =========================
// DEBUG: hover / connections instrumentation
// Toggle DEBUG_HOVER to false when done.
// =========================
const DEBUG_HOVER = false;
const __TLDBG = (globalThis.__TLDBG = globalThis.__TLDBG || {
  start: performance.now(),
  counts: Object.create(null),
  last: Object.create(null),
});

function dbgCount(key) {
  __TLDBG.counts[key] = (__TLDBG.counts[key] || 0) + 1;
  return __TLDBG.counts[key];
}

// Throttled console logging by key (default 60ms)
function dbgLog(key, payload, throttleMs = 60) {
  if (!DEBUG_HOVER) return;
  const now = performance.now();
  const last = __TLDBG.last[key] || 0;
  if ((now - last) < throttleMs) return;
  __TLDBG.last[key] = now;
  // keep logs compact but informative
  try {
    console.log(`[TLDBG ${key}]`, payload);
  } catch (_e) {
    console.log(`[TLDBG ${key}]`);
  }
}

function getTextCenterPx(d) {
  const zx = zxRef.current, zy = zyRef.current;
  if (!zx || !zy) return null;

  const geographicPoint = getGeographicNodePosition("text", d.id);
  if (geographicPoint) {
    return { cx: geographicPoint.x, cy: geographicPoint.y };
  }

  const cx = zx(toAstronomical(d.when));

  // Use placed Y (lane/base) in band-units
  let yU = textYMap.get(d.durationId)?.get(d.id);
  if (!Number.isFinite(yU)) yU = y0(d.y);

  const cy = zy(yU);
  return { cx, cy };
}

function animateTextHover(el, d, hovering) {
  const c = getTextCenterPx(d);
  if (!c) return;

  const s = hovering
    ? getTextObjectHoverScale(d)
    : 1;


// DEBUG
if (DEBUG_HOVER) {
  const hasSel = !!(selectedText || selectedFather);
  const isRel = relevantTextIdsRef?.current?.has?.(d.id);
  dbgCount(hovering ? "text_hover_on" : "text_hover_off");
  dbgLog("TEXT_HOVER", {
    evt: hovering ? "ON" : "OFF",
    id: d.id,
    title: d.title,
    hasSelection: hasSel,
    isRelated: !!isRel,
    k: kRef.current,
    hoveredTimelineTarget: hoveredTimelineTargetRef?.current || null,
    t: performance.now().toFixed(1),
  }, 0); // no throttle; we want to see flapping
}


  const circleSel = d3.select(el);
  const pieSel = gTexts.selectAll("g.dotSlices").filter(p => p.id === d.id);
  const hasSelectionHere = !!(selectedText || selectedFather);

  // One shared transition instance so circle + visible pie scale in the same wave.
  const t = d3.transition("tlHover").duration(HOVER_ANIM_MS).ease(d3.easeCubicOut);

  circleSel.interrupt("tlHover")
    .transition(t)
    .attr("transform", s === 1 ? "" : `translate(${c.cx},${c.cy}) scale(${s}) translate(${-c.cx},${-c.cy})`);

  if (hasSelectionHere) {
    /*
     * SELECTED MODE — split transform ownership.
     *
     * g.dotSlices is continuously owned by layout/zoom and is responsible only
     * for translate(cx, cy). Hover must therefore NOT animate that same
     * transform attribute. Instead scale the local pie artwork, whose geometry
     * is centered at (0, 0). Layout refreshes can now reposition the outer group
     * without cancelling or snapping the hover enlargement.
     */
    pieSel
      .selectAll("path.slice, g.separators")
      .interrupt("tlHover")
      .transition(t)
      .attr("transform", s === 1 ? null : `scale(${s})`);
  } else {
    /*
     * NO-SELECTION MODE — preserve the existing behavior exactly.
     * The user already likes this interaction and hoveredTextIdRef/layout agree
     * with the same 1.6 scale here.
     */
    pieSel.interrupt("tlHover")
      .transition(t)
      .attr("transform", s === 1
        ? `translate(${c.cx},${c.cy})`
        : `translate(${c.cx},${c.cy}) scale(${s})`);
  }
}

function animateFatherHover(el, d, hovering) {
  const zx = zxRef.current, zy = zyRef.current;
  if (!zx || !zy) return;

  const geographicPoint = getGeographicNodePosition("father", d.id);

  let cx = geographicPoint?.x;
  let cy = geographicPoint?.y;

  if (!Number.isFinite(cx)) {
    cx = parseFloat(d3.select(el).attr("data-cx"));
  }
  if (!Number.isFinite(cx)) {
    cx = zx(toAstronomical(d.when));
  }

  // Use the already-computed on-screen cy if present (set in apply).
  if (!Number.isFinite(cy)) {
    cy = parseFloat(d3.select(el).attr("data-cy"));
  }
  if (!Number.isFinite(cy)) {
    let cyU = y0(d.y);
    const yBandMap = fatherYMap.get(d.durationId);
    const assignedU = yBandMap?.get(d.id);
    if (Number.isFinite(assignedU)) cyU = assignedU;
    cy = zy(cyU);
  }

  const s = hovering
    ? getFatherObjectHoverScale(d)
    : 1;


// DEBUG
if (DEBUG_HOVER) {
  const hasSel = !!(selectedText || selectedFather);
  const isRel = relevantFatherIdsRef?.current?.has?.(d.id);
  dbgCount(hovering ? "father_hover_on" : "father_hover_off");
  dbgLog("FATHER_HOVER", {
    evt: hovering ? "ON" : "OFF",
    id: d.id,
    name: d.name,
    hasSelection: hasSel,
    isRelated: !!isRel,
    k: kRef.current,
    hoveredTimelineTarget: hoveredTimelineTargetRef?.current || null,
    t: performance.now().toFixed(1),
  }, 0);
}


  d3.select(el)
    .interrupt("tlHover")
    .transition("tlHover")
    .duration(HOVER_ANIM_MS)
    .ease(d3.easeCubicOut)
    .attr("transform", s === 1 ? "" : `translate(${cx},${cy}) scale(${s}) translate(${-cx},${-cy})`);
}


textSel
  .on("mouseenter", function (_ev, d) {
if (DEBUG_HOVER) {
  const hasSel = !!(selectedText || selectedFather);
  const isRel = relevantTextIdsRef?.current?.has?.(d.id);
  dbgCount("text_mouseenter");
  console.log("[TEXT ENTER]", { id: d.id, title: d.title, hasSelection: hasSel, isRelated: !!isRel, k: kRef.current, t: performance.now().toFixed(1) });
}
    // mark hovered text for connection highlighting
    cancelHoverTLClear();


    // Prevent stuck hover: forcibly un-hover the previous text element when entering a new one.
    if (lastHoverTextElRef.current && lastHoverTextElRef.current !== this) {
      hardResetTextHover(lastHoverTextElRef.current);
    }
    lastHoverTextElRef.current = this;
    
    const hasSelectionHere = !!(selectedText || selectedFather);

    /*
     * Ordinary/no-selection mode keeps the existing hoveredTextIdRef behavior.
     *
     * Selected mode deliberately does NOT write any text (including multi-color
     * pie texts) into hoveredTextIdRef. The selected-layout reapply path also
     * reads that ref and would otherwise apply HOVER_SCALE_DOT before
     * animateTextHover() runs, giving pie texts two competing hover owners.
     *
     * With selection active, animateTextHover() alone owns transient scaling
     * for circles and pies, just as animateFatherHover() does for fathers.
     */
    if (!hasSelectionHere) {
      hoveredTextIdRef.current = d.id;
    } else {
      hoveredTextIdRef.current = null;
    }



    // NEW: let open cards know what is being hovered on the timeline
    if (selectedText || selectedFather) {
      setHoveredTimelineTargetSafe({ type: "text", id: d.id });
    }

    animateTextHover(this, d, true);

const zx = zxRef.current, zy = zyRef.current, kNow = kRef.current;
const hasSel = !!(selectedText || selectedFather);
if (!hasSel && zx && zy) setTimeout(() => scheduleRenderConnections(zx, zy, kNow), 0);
// NEW: derive segment preview from state (no ad-hoc styling)
    const seg = findSegForText(d);
    if (seg) {
      hoveredSegIdRef.current = seg.id;
      hoveredSegParentIdRef.current = seg.parentId;
      updateSegmentPreview();
      updateHoverVisuals();
    }

    const hasActiveSelection = !!(selectedText || selectedFather);
    const isSelected = selectedText && selectedText.id === d.id;

    // In selected-neighborhood mode the persistent mini-tooltip already names
    // every connected object. Hover therefore emphasizes that frame instead
    // of opening the larger ordinary tooltip.
    if (!hasActiveSelection && !isSelected) {
      const html = textObjectTipHTML(d);
      const a = textAnchorClient(this, d);
      if (a) showTip(
        tipText,
        html,
        a.x,
        a.y,
        objectTooltipAccent(d)
      );
    } else {
      hideTipSel(tipText);
    }
  })
  .on("mousemove", function (_ev, d) {
    const hasActiveSelection = !!(selectedText || selectedFather);
    const isSelected = selectedText && selectedText.id === d.id;

    if (!hasActiveSelection && !isSelected) {
      const html = textObjectTipHTML(d);
      const a = textAnchorClient(this, d);
      if (a) showTip(
        tipText,
        html,
        a.x,
        a.y,
        objectTooltipAccent(d)
      );
    } else {
      hideTipSel(tipText);
    }
  })
.on("mouseleave", function (_ev, d) {
if (DEBUG_HOVER) {
  const hasSel = !!(selectedText || selectedFather);
  const isRel = relevantTextIdsRef?.current?.has?.(d.id);
  dbgCount("text_mouseleave");
  console.log("[TEXT LEAVE]", { id: d.id, title: d.title, hasSelection: hasSel, isRelated: !!isRel, k: kRef.current, t: performance.now().toFixed(1) });
}
  hoveredTextIdRef.current = null;

  // Ensure we fully reset hover transforms (robust even if transitions were interrupted)
  hardResetTextHover(this);
  if (lastHoverTextElRef.current === this) lastHoverTextElRef.current = null;
  clearHoveredTimelineTargetSoon(60);

  animateTextHover(this, d, false);

const zx = zxRef.current, zy = zyRef.current, kNow = kRef.current;
const hasSel = !!(selectedText || selectedFather);
if (!hasSel && zx && zy) setTimeout(() => scheduleRenderConnections(zx, zy, kNow), 0);

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
        const tooBottom =
          relY >
          wrapRect.height -
            SELECTED_TIMELINE_AXIS_BOTTOM_HEIGHT -
            EDGE_PAD;

        const shouldRecenter = (tooLeft || tooRight || tooTop || tooBottom);

        hideTipSel(tipText); // hide small hover tip, keep segment box if any

        pendingSelectionCameraRef.current = {
          mode: shouldRecenter ? "recenter" : "preserve",
          type: "text",
          id: d.id,
          clientX: a?.x ?? (wrapRect.left + relX),
          clientY: a?.y ?? (wrapRect.top + relY),
        };

        if (shouldRecenter) {
          // The card occupies the left side; the existing fly-to target places
          // the object in the center of the remaining visible workspace.
          const centerLeft = Math.round((wrapRect.width - CARD_W) / 2);
          const centerTop = Math.max(8, Math.round(72));
          setCardPos({ left: centerLeft, top: centerTop });
        } else {
          // Keep the card near the clicked object while the camera preserves
          // the object's exact pre-selection browser position.
          let left = a ? a.x - wrapRect.left + PAD : PAD;
          let top = a ? a.y - wrapRect.top + PAD : PAD;
          left = Math.max(4, Math.min(left, wrapRect.width - CARD_W - 4));
          top = Math.max(4, Math.min(top, wrapRect.height - CARD_H - 4));
          setCardPos({ left, top });
        }

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

      const chartNode = gRoot.node();
      const chartScreenMatrix = chartNode?.getScreenCTM?.();
      if (!chartScreenMatrix) return null;

      const geographicPoint = getGeographicNodePosition("text", d.id);

      let cx = geographicPoint?.x;
      let cy = geographicPoint?.y;

      if (!Number.isFinite(cx)) {
        cx = el ? parseFloat(d3.select(el).attr("cx")) : NaN;
      }
      if (!Number.isFinite(cy)) {
        cy = el ? parseFloat(d3.select(el).attr("cy")) : NaN;
      }

      if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
        const fallback = timelinePointForText(d, zx, zy);
        cx = fallback.x;
        cy = fallback.y;
      }

      const clientPoint = new DOMPoint(
        cx,
        cy
      ).matrixTransform(chartScreenMatrix);

      return {
        x: clientPoint.x,
        y: clientPoint.y,
      };
    }

    

// Force-reset hover transforms without needing to recompute centers.
// (Safe when mouseleave is missed; base positioning is driven by cx/cy + apply pass.)
function hardResetTextHover(el) {
  if (!el) return;
  try {
    const sel = d3.select(el);
    sel.interrupt("tlHover").attr("transform", "");
    const id = el.__data__ && el.__data__.id;
    if (id != null) {
      const pie = gTexts
        .selectAll("g.dotSlices")
        .filter(p => p.id === id);

      if (selectedText || selectedFather) {
        // Selected-mode hover scale lives on the local pie artwork.
        pie
          .selectAll("path.slice, g.separators")
          .interrupt("tlHover")
          .attr("transform", null);
      }
    }
  } catch (_e) {}
}

function hardResetFatherHover(el) {
  if (!el) return;
  try {
    d3.select(el).interrupt("tlHover").attr("transform", "");
  } catch (_e) {}
}
function fatherAnchorClient(el, d) {
  const zx = zxRef.current, zy = zyRef.current;
  if (!zx || !zy || !el) return null;

  const chartNode = gRoot.node();
  const chartScreenMatrix = chartNode?.getScreenCTM?.();
  if (!chartScreenMatrix) return null;

  const geographicPoint = getGeographicNodePosition("father", d.id);

  let cx = geographicPoint?.x;
  let cy = geographicPoint?.y;

  if (!Number.isFinite(cx)) {
    cx = parseFloat(d3.select(el).attr("data-cx"));
  }
  if (!Number.isFinite(cy)) {
    cy = parseFloat(d3.select(el).attr("data-cy"));
  }

  if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
    const fallback = timelinePointForFather(d, zx, zy);
    cx = fallback.x;
    cy = fallback.y;
  }

  const clientPoint = new DOMPoint(
    cx,
    cy
  ).matrixTransform(chartScreenMatrix);

  return {
    x: clientPoint.x,
    y: clientPoint.y,
  };
}




   

    // Data join for fathers
// In fathersSel join (enter)
const fathersSel = gFathers
  .selectAll("g.fatherMark")
  .data(renderFatherRows, (d) => d.id)
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

  // Re-apply selected-neighborhood focus AFTER joins.
  syncSelectedNeighborhoodFocus();

  /*
   * Father hover policy.
   *
   * No selection:
   *   preserve the existing behavior — father hover activates only at the
   *   ordinary deepest zoom threshold.
   *
   * Selected mode:
   *   connected fathers are already filtered by pointer-events elsewhere, so
   *   any father that can receive the pointer should also be allowed to run
   *   its hover handler at EVERY zoom level. This mirrors connected texts and
   *   ensures hoveredTimelineTarget is set, which is what drives the selected
   *   mini-tooltip.
   */
  const allowFatherHover = () => {
    const k = getActiveViewZoomK(kRef.current);
    const hasSel = !!(selectedText || selectedFather);

    if (hasSel) return true;

    return k >= ZOOM_THRESHOLD;
  };


    // Lightweight hover tooltip for fathers (zoomed-in like texts)
fathersSel
.on("mouseenter", function (_ev, d) {
if (DEBUG_HOVER) {
  const hasSel = !!(selectedText || selectedFather);
  const isRel = relevantFatherIdsRef?.current?.has?.(d.id);
  dbgCount("father_mouseover");
  console.log("[FATHER OVER]", { id: d.id, name: d.name, hasSelection: hasSel, isRelated: !!isRel, allowHover: allowFatherHover(), k: kRef.current, t: performance.now().toFixed(1) });
}
  cancelHoverTLClear();

  // Prevent stuck hover: forcibly un-hover the previous father element when entering a new one.
  if (lastHoverFatherElRef.current && lastHoverFatherElRef.current !== this) {
    hardResetFatherHover(lastHoverFatherElRef.current);
  }
  lastHoverFatherElRef.current = this;
  if (!allowFatherHover()) return;

  // mark hovered father for connection highlighting
  if (!(selectedText || selectedFather)) {
    hoveredFatherIdRef.current = d.id;
  } else {
    hoveredFatherIdRef.current = null;
  }

  // NEW
  if (selectedText || selectedFather) {
    setHoveredTimelineTargetSafe({ type: "father", id: d.id });
  }

  animateFatherHover(this, d, true);

const zx = zxRef.current, zy = zyRef.current, kNow = kRef.current;
const hasSel = !!(selectedText || selectedFather);
if (!hasSel && zx && zy) setTimeout(() => scheduleRenderConnections(zx, zy, kNow), 0);

  if (selectedText || selectedFather) {
    hideTipSel(tipText);
    return;
  }

  const a = fatherAnchorClient(this, d);
  if (!a) return;
  showTip(
    tipText,
    fatherObjectTipHTML(d),
    a.x,
    a.y,
    objectTooltipAccent(d)
  );
})
  .on("mousemove", function (_ev, d) {
    if (!allowFatherHover()) return;

    if (selectedText || selectedFather) {
      hideTipSel(tipText);
      return;
    }

    const a = fatherAnchorClient(this, d);
    if (!a) return;
    showTip(
      tipText,
      fatherObjectTipHTML(d),
      a.x,
      a.y,
      objectTooltipAccent(d)
    );
  })
  .on("mouseleave", function (_ev, d) {
if (DEBUG_HOVER) {
  const hasSel = !!(selectedText || selectedFather);
  const isRel = relevantFatherIdsRef?.current?.has?.(d.id);
  dbgCount("father_mouseout");
  console.log("[FATHER OUT]", { id: d.id, name: d.name, hasSelection: hasSel, isRelated: !!isRel, allowHover: allowFatherHover(), k: kRef.current, t: performance.now().toFixed(1) });
}
  // clear hovered father highlight
  hoveredFatherIdRef.current = null;

  hardResetFatherHover(this);
  if (lastHoverFatherElRef.current === this) lastHoverFatherElRef.current = null;

  // NEW
  clearHoveredTimelineTargetSoon(60);

  animateFatherHover(this, d, false);

const zx = zxRef.current, zy = zyRef.current, kNow = kRef.current;
const hasSel = !!(selectedText || selectedFather);
if (!hasSel && zx && zy) setTimeout(() => scheduleRenderConnections(zx, zy, kNow), 0);


  hideTipSel(tipText);
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
    const tooBottom =
      relY >
      wrapRect.height -
        SELECTED_TIMELINE_AXIS_BOTTOM_HEIGHT -
        EDGE_PAD;

    const shouldRecenter = (tooLeft || tooRight || tooTop || tooBottom);

    // Only hide the tiny hover tip; leave the segment box (tipSeg) up
    hideTipSel(tipText);
    // hideTipSel(tipSeg);   // <-- do NOT call this
    // hideTipSel(tipDur);   // optional: keep duration card if it’s open

    pendingSelectionCameraRef.current = {
      mode: shouldRecenter ? "recenter" : "preserve",
      type: "father",
      id: d.id,
      clientX: a?.x ?? (wrapRect.left + relX),
      clientY: a?.y ?? (wrapRect.top + relY),
    };

    if (shouldRecenter) {
      const centerLeft = Math.round((wrapRect.width - CARD_W) / 2);
      const centerTop = Math.max(8, Math.round(72));
      setFatherCardPos({ left: centerLeft, top: centerTop });
    } else {
      let left = a ? a.x - wrapRect.left + PAD : PAD;
      let top = a ? a.y - wrapRect.top + PAD : PAD;
      left = Math.max(4, Math.min(left, wrapRect.width - CARD_W - 4));
      top = Math.max(4, Math.min(top, wrapRect.height - CARD_H - 4));
      setFatherCardPos({ left, top });
    }

    setSelectedFather(d);
    setSelectedText(null);
    setShowMore(false);

    ev.stopPropagation();
  })



    function timelinePointForText(d, zx, zy) {
      const xPx = zx(toAstronomical(d.when));

      let yU = textYMap.get(d.durationId)?.get(d.id);
      if (!Number.isFinite(yU)) {
        yU = y0(d.y);
      }

      return { x: xPx, y: zy(yU) };
    }

    function timelinePointForFather(d, zx, zy) {
      const xPx = zx(toAstronomical(d.when));

      let yU = y0(d.y);
      const yBandMap = fatherYMap.get(d.durationId);
      const assignedU = yBandMap?.get(d.id);
      if (Number.isFinite(assignedU)) {
        yU = assignedU;
      }

      return { x: xPx, y: zy(yU) };
    }

    function placedPointForText(d, zx, zy) {
      return (
        getGeographicNodePosition("text", d.id) ||
        timelinePointForText(d, zx, zy)
      );
    }

    function placedPointForFather(d, zx, zy) {
      return (
        getGeographicNodePosition("father", d.id) ||
        timelinePointForFather(d, zx, zy)
      );
    }

    /*
     * Selected Default View replaces the ordinary adaptive timeline ticks and
     * full-height grid with one selected-object date guide. Hovering either an
     * actual connected object or its card link adds its date and guide until
     * pointer leave.
     *
     * We intentionally reuse the existing axis/grid generators so these ticks
     * and dashed lines inherit the exact normal timeline styling.
     */
    function renderDefaultSelectionAxisAndGuides(zx, zy) {
      const selectedRow = selectedText || selectedFather;
      const selectedType = selectedText
        ? "text"
        : selectedFather
          ? "father"
          : null;

      if (
        showMapRef.current ||
        !selectedRow ||
        !selectedType ||
        !zx ||
        !zy
      ) {
        gAxis
          .selectAll("text.selectedChronologyDateLabel")
          .remove();
        return false;
      }

      const selectedWhen = Number(selectedRow.when);
      const guideEntries = [];

      const addGuide = (type, row, role) => {
        if (!row || !Number.isFinite(Number(row.when))) return;

        const point = type === "father"
          ? timelinePointForFather(row, zx, zy)
          : timelinePointForText(row, zx, zy);

        if (
          !Number.isFinite(point?.x) ||
          !Number.isFinite(point?.y)
        ) {
          return;
        }

        const when = Number(row.when);

        let level = "middle";
        if (role === "hovered") {
          if (when < selectedWhen) level = "lower";
          else if (when > selectedWhen) level = "upper";
          else level = "upper";
        }

        const label = type === "father"
          ? String(row?.dob || "").trim()
          : String(row?.displayDate || "").trim();

        guideEntries.push({
          key: `${role}:${type}:${row.id}`,
          role,
          type,
          row,
          when,
          tickValue: toAstronomical(when),
          objectY: point.y,
          level,
          label: label || formatTick(toAstronomical(when)),
        });
      };

      addGuide(selectedType, selectedRow, "selected");

      const hovered = getSelectedFocusTarget();
      if (hovered) {
        const isConnected = hovered.type === "father"
          ? relevantFatherIdsRef.current.has(hovered.id)
          : relevantTextIdsRef.current.has(hovered.id);

        if (isConnected) {
          const hoveredRow = hovered.type === "father"
            ? fatherRows.find((row) => row.id === hovered.id)
            : textRows.find((row) => row.id === hovered.id);

          addGuide(hovered.type, hoveredRow, "hovered");
        }
      }

      /*
       * One numeric Dataviz position needs only one physical tick and one
       * dashed guide. Separate visible labels are still retained so selected
       * and hovered objects can occupy different rows even at the same X.
       */
      const guideByTick = new Map();
      for (const entry of guideEntries) {
        const previous = guideByTick.get(entry.tickValue);
        if (!previous || entry.objectY < previous.objectY) {
          guideByTick.set(entry.tickValue, entry);
        }
      }

      const tickValues = Array.from(guideByTick.keys())
        .sort((a, b) => a - b);

      /*
       * Use the axis generator's own tick text nodes for selected/hovered dates.
       * This gives the labels exactly the same typography, fill, smoothing, and
       * inherited CSS as the ordinary unselected chronological labels.
       */
      const labelsByTick = new Map();
      for (const entry of guideEntries) {
        const bucket = labelsByTick.get(entry.tickValue) || [];
        bucket.push(entry);
        labelsByTick.set(entry.tickValue, bucket);
      }

      const axisEntryForTick = (tickValue) => {
        const entries = labelsByTick.get(tickValue) || [];
        return (
          entries.find((entry) => entry.role === "selected") ||
          entries[0] ||
          null
        );
      };

      gAxis
        .style("display", null)
        .attr(
          "transform",
          `translate(${margin.left},${margin.top + axisY})`
        )
        .call(
          d3
            .axisBottom(zx)
            .tickValues(tickValues)
            .tickFormat((tickValue) =>
              (labelsByTick.get(tickValue) || [])
                .map((entry) => entry.label)
                .filter(Boolean)
                .join(" / ")
            )
        );

      gAxis
        .selectAll("g.tick text")
        .attr("y", (tickValue) => {
          const entry = axisEntryForTick(tickValue);
          return SELECTED_AXIS_LABEL_Y[entry?.level || "middle"];
        })
        .attr("dy", "0.71em")
        .classed(
          "selectedChronologyPrimaryDate",
          (tickValue) =>
            axisEntryForTick(tickValue)?.role === "selected"
        )
        .style("font-size", (tickValue) =>
          axisEntryForTick(tickValue)?.role === "selected"
            ? SELECTED_AXIS_PRIMARY_DATE_FONT_SIZE
            : null
        );

      // Remove stale labels created by earlier selected-axis implementations.
      gAxis
        .selectAll("text.selectedChronologyDateLabel")
        .remove();

      gGrid
        .style("display", null)
        .attr("transform", `translate(0,${axisY})`)
        .call(gridFor(zx, tickValues));

      gGrid
        .selectAll("g.tick")
        .each(function (tickValue) {
          const entry = guideByTick.get(tickValue);
          const y2 = entry
            ? Math.min(0, entry.objectY - axisY)
            : 0;

          d3.select(this)
            .select("line")
            .attr("y2", y2)
            .style("stroke", SELECTED_CHRONOLOGY_GUIDE_COLOR)
            .style("opacity", SELECTED_CHRONOLOGY_GUIDE_OPACITY)
            .attr(
              "stroke-opacity",
              SELECTED_CHRONOLOGY_GUIDE_OPACITY
            );
        });

      snapGrid(zx);
      return true;
    }

    /*
     * Rebuild the geographic one-hop layout in the chart SVG's own
     * coordinate system. TimelineMap remains the single owner of the map
     * projection; Timeline only consumes projected browser coordinates.
     */
    function rebuildGeographicNodePositions(zx, zy) {
      const nextTextPositions = new Map();
      const nextFatherPositions = new Map();

      geographicNodePositionsRef.current = {
        text: nextTextPositions,
        father: nextFatherPositions,
      };
      selectedLocationClusterRef.current = {
        key: null,
        selectedType: null,
        selectedId: null,
        selectedPoint: null,
        locationLabel: "",
        entries: [],
      };
      connectedLocationClustersRef.current = [];
      clusteredNodeKeysRef.current = new Set();
      connectionSuppressedNodeKeysRef.current = new Set();

      if (
        !showMapRef.current ||
        !selectedMapAvailableRef.current ||
        (!selectedText && !selectedFather)
      ) {
        return false;
      }

      const mapApi = timelineMapRef.current;
      const chartNode = gRoot.node();

      if (
        !mapApi?.projectLocationToClient ||
        !mapApi?.ensureViewportInitialized ||
        !chartNode
      ) {
        return false;
      }

      const chartScreenMatrix = chartNode.getScreenCTM?.();
      if (!chartScreenMatrix) return false;

      let inverseChartScreenMatrix;
      try {
        inverseChartScreenMatrix = chartScreenMatrix.inverse();
      } catch {
        return false;
      }

      const selectedAnchor = selectedText
        ? timelinePointForText(selectedText, zx, zy)
        : timelinePointForFather(selectedFather, zx, zy);

      const anchorClientPoint = new DOMPoint(
        selectedAnchor.x,
        selectedAnchor.y
      ).matrixTransform(chartScreenMatrix);

      const computedAnchorClient = {
        clientX: anchorClientPoint.x,
        clientY: anchorClientPoint.y,
      };

      const pendingSwitch = pendingViewSwitchRef.current;

      const anchorClient =
        pendingSwitch?.targetShowMap === true &&
        pendingSwitch.anchor
          ? pendingSwitch.anchor
          : computedAnchorClient;

      const viewportReady =
        mapApi.ensureViewportInitialized(anchorClient);

      if (!viewportReady) {
        return false;
      }

      if (pendingSwitch?.targetShowMap === true) {
        pendingViewSwitchRef.current = null;
      }

      selectedPinScreenPositionRef.current = anchorClient;

      const projectRow = (row) => {
        if (!hasMapCoordinates(row)) return null;

        const longitude =
          row.Longitude ?? row.longitude ?? row.lng ?? row.lon;
        const latitude =
          row.Latitude ?? row.latitude ?? row.lat;

        const clientPoint = mapApi.projectLocationToClient(
          longitude,
          latitude
        );

        if (!clientPoint) return null;

        const chartPoint = new DOMPoint(
          clientPoint.clientX,
          clientPoint.clientY
        ).matrixTransform(inverseChartScreenMatrix);

        if (
          !Number.isFinite(chartPoint.x) ||
          !Number.isFinite(chartPoint.y)
        ) {
          return null;
        }

        return {
          x: chartPoint.x,
          y: chartPoint.y,
          clientX: clientPoint.clientX,
          clientY: clientPoint.clientY,
        };
      };

      for (const row of renderTextRows) {
        const point = projectRow(row);
        if (point) nextTextPositions.set(row.id, point);
      }

      for (const row of renderFatherRows) {
        const point = projectRow(row);
        if (point) nextFatherPositions.set(row.id, point);
      }

      const selectedType = selectedText ? "text" : "father";
      const selectedRow = selectedText || selectedFather;
      const selectedBucket =
        selectedType === "text"
          ? nextTextPositions
          : nextFatherPositions;
      const selectedPoint =
        selectedBucket.get(selectedRow?.id) || null;

      const getLocationLabel = (row) => {
        if (!row) return "";

        const original = String(
          row.originalLocation ??
          row["Original Geographical Location"] ??
          row.Location ??
          row.location ??
          ""
        ).trim();

        const modern = String(
          row.modernLocation ??
          row["Current Geographical Location"] ??
          row.currentGeographicalLocation ??
          ""
        ).trim();

        if (!original && !modern) return "";
        if (!original) return modern;
        if (!modern) return original;

        const originalLower = original.toLocaleLowerCase();
        const modernLower = modern.toLocaleLowerCase();

        if (
          originalLower === modernLower ||
          modernLower.startsWith(`${originalLower},`) ||
          modernLower.startsWith(`${originalLower} `)
        ) {
          return modern;
        }

        return `${original} · ${modern}`;
      };

      const directConnections =
        allConnectionRowsRef.current || [];

      const findDirectConnection = (type, id) =>
        directConnections.find((connection) => (
          (
            connection.aType === selectedType &&
            connection.aId === selectedRow?.id &&
            connection.bType === type &&
            connection.bId === id
          ) ||
          (
            connection.bType === selectedType &&
            connection.bId === selectedRow?.id &&
            connection.aType === type &&
            connection.aId === id
          )
        )) || null;

      const makeClusterEntry = (type, row, point) => {
        const label =
          type === "text"
            ? (row.title || "Untitled text")
            : (row.name || "Unnamed figure");

        const colors =
          Array.isArray(row.colors) && row.colors.length
            ? row.colors
            : [row.color || "#666"];

        const connection =
          findDirectConnection(type, row.id);

        return {
          type,
          id: row.id,
          row,
          point,
          label,
          color: colors[0] || "#666",
          colors,
          connectionColor:
            connection?.color || colors[0] || "#999999",
          connectionStyle:
            connection?.style || {
              strokeWidth: 1.4,
              strokeDasharray: null,
              strokeLinecap: "round",
            },
        };
      };

      const candidates = [];

      for (const row of renderTextRows) {
        if (
          selectedType === "text" &&
          row.id === selectedRow?.id
        ) {
          continue;
        }

        const point = nextTextPositions.get(row.id);
        if (point) {
          candidates.push(
            makeClusterEntry("text", row, point)
          );
        }
      }

      for (const row of renderFatherRows) {
        if (
          selectedType === "father" &&
          row.id === selectedRow?.id
        ) {
          continue;
        }

        const point = nextFatherPositions.get(row.id);
        if (point) {
          candidates.push(
            makeClusterEntry("father", row, point)
          );
        }
      }

      const selectedEntries = [];
      const remainingCandidates = [];

      for (const entry of candidates) {
        const distance = selectedPoint
          ? Math.hypot(
              entry.point.clientX - selectedPoint.clientX,
              entry.point.clientY - selectedPoint.clientY
            )
          : Infinity;

        if (distance <= LOCATION_CLUSTER_TOLERANCE_PX) {
          selectedEntries.push(entry);
        } else {
          remainingCandidates.push(entry);
        }
      }

      const compareEntries = (a, b) =>
        a.label.localeCompare(b.label, undefined, {
          sensitivity: "base",
          numeric: true,
        });

      selectedEntries.sort(compareEntries);

      const selectedClusterKey =
        `selected:${selectedType}:${selectedRow?.id || ""}`;

      selectedLocationClusterRef.current = {
        key: selectedClusterKey,
        selectedType,
        selectedId: selectedRow?.id || null,
        selectedPoint,
        locationLabel: getLocationLabel(selectedRow),
        entries: selectedEntries,
      };

      const clusteredKeys = new Set();
      const suppressedConnectionKeys = new Set();

      for (const entry of selectedEntries) {
        const nodeKey = `${entry.type}:${entry.id}`;
        clusteredKeys.add(nodeKey);
        suppressedConnectionKeys.add(nodeKey);
      }

      /*
       * Build connected components by projected screen distance. This is more
       * robust than grouping by location strings and still works when nearby
       * records use slightly different coordinate precision.
       */
      const parent = remainingCandidates.map((_, index) => index);

      const findRoot = (index) => {
        let root = index;
        while (parent[root] !== root) {
          root = parent[root];
        }

        while (parent[index] !== index) {
          const next = parent[index];
          parent[index] = root;
          index = next;
        }

        return root;
      };

      const union = (a, b) => {
        const rootA = findRoot(a);
        const rootB = findRoot(b);
        if (rootA !== rootB) parent[rootB] = rootA;
      };

      for (let i = 0; i < remainingCandidates.length; i += 1) {
        for (let j = i + 1; j < remainingCandidates.length; j += 1) {
          const a = remainingCandidates[i].point;
          const b = remainingCandidates[j].point;

          if (
            Math.hypot(
              a.clientX - b.clientX,
              a.clientY - b.clientY
            ) <= LOCATION_CLUSTER_TOLERANCE_PX
          ) {
            union(i, j);
          }
        }
      }

      const groupsByRoot = new Map();

      remainingCandidates.forEach((entry, index) => {
        const root = findRoot(index);
        const group = groupsByRoot.get(root) || [];
        group.push(entry);
        groupsByRoot.set(root, group);
      });

      const connectedClusters = [];

      for (const group of groupsByRoot.values()) {
        if (group.length < 2) continue;

        group.sort(compareEntries);

        const anchorPoint = {
          x:
            group.reduce(
              (sum, entry) => sum + entry.point.x,
              0
            ) / group.length,
          y:
            group.reduce(
              (sum, entry) => sum + entry.point.y,
              0
            ) / group.length,
          clientX:
            group.reduce(
              (sum, entry) => sum + entry.point.clientX,
              0
            ) / group.length,
          clientY:
            group.reduce(
              (sum, entry) => sum + entry.point.clientY,
              0
            ) / group.length,
        };

        const memberKey = group
          .map((entry) => `${entry.type}:${entry.id}`)
          .sort()
          .join("|");

        const cluster = {
          key: `connected:${memberKey}`,
          anchorPoint,
          locationLabel:
            getLocationLabel(group[0]?.row),
          entries: group,
          color: meanObjectColors(
            group.flatMap((entry) => entry.colors)
          ),
        };

        connectedClusters.push(cluster);

        for (const entry of group) {
          clusteredKeys.add(`${entry.type}:${entry.id}`);
        }
      }

      connectedLocationClustersRef.current =
        connectedClusters;
      clusteredNodeKeysRef.current = clusteredKeys;
      connectionSuppressedNodeKeysRef.current =
        suppressedConnectionKeys;

      const validClusterKeys = new Set([
        ...(selectedEntries.length
          ? [selectedClusterKey]
          : []),
        ...connectedClusters.map((cluster) => cluster.key),
      ]);

      const openClusterKeys = openLocationClusterKeysRef.current;
      for (const key of Array.from(openClusterKeys)) {
        if (!validClusterKeys.has(key)) {
          openClusterKeys.delete(key);
        }
      }

      if (
        showMapRef.current &&
        pendingAutoOpenMapClustersRef.current
      ) {
        openClusterKeys.clear();
        for (const key of validClusterKeys) {
          openClusterKeys.add(key);
        }
        pendingAutoOpenMapClustersRef.current = false;
      }

      locationClusterOpenRef.current = openClusterKeys.size > 0;

      return (
        nextTextPositions.size > 0 ||
        nextFatherPositions.size > 0
      );
    }

    function apply(zx, zy, k = 1) {
  // cache latest rescaled axes for anchored tooltips
  zxRef.current = zx;
  zyRef.current = zy;

  const mapModeActive =
    showMapRef.current &&
    selectedMapAvailableRef.current &&
    !!(selectedText || selectedFather);

  rebuildGeographicNodePositions(zx, zy);

  // axis & grid with adaptive ticks, or selected-object date guides
  if (mapModeActive) {
    gAxis.style("display", "none");
    gGrid.style("display", "none");
  } else if (
    !renderDefaultSelectionAxisAndGuides(zx, zy)
  ) {
    const ticks = makeAdaptiveTicks(zx);

    gAxis
      .style("display", null)
      .attr("transform", `translate(${margin.left},${margin.top + axisY})`)
      .call(axisFor(zx, ticks));

    gAxis
      .selectAll("g.tick text")
      .classed("selectedChronologyPrimaryDate", false)
      .style("font-size", null);

    gGrid
      .style("display", null)
      .attr("transform", `translate(0,${axisY})`)
      .call(gridFor(zx, ticks));

    // Remove selected-mode inline guide styling so the normal CSS grid style
    // returns when the card closes.
    gGrid
      .selectAll("g.tick line")
      .style("stroke", null)
      .style("opacity", null)
      .attr("stroke-opacity", null);

    snapGrid(zx);
  }

  if (!mapModeActive) {
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

  }

  // === Author-lane layout (stable across zoom) ===
  // Position circles using per-band author lanes
// === Author-lane layout (stable across zoom) ===
// Position circles using per-band author lanes
gTexts.selectAll("circle.textDot").each(function (d) {
  const point = placedPointForText(d, zx, zy);
  const cx = point.x;
  const cy = point.y;

const isSelected = selectedText && selectedText.id === d.id;
const isHovered  = hoveredTextIdRef.current === d.id;

const rBase = getTextObjectRadius(d, k);
const rDraw = isSelected ? rBase * HOVER_SCALE_DOT : rBase;

const circle = d3.select(this)
  .attr("cx", cx)
  .attr("cy", cy)
  .attr("r", rDraw)
  .attr("stroke", (isSelected || isHovered) ? "#ffffff" : "none")
  .attr("stroke-width", (isSelected || isHovered) ? 1.4 : 0);

// The selected text is represented by the main pin, so hide only that icon.
const shouldHide =
  !!selectedText && selectedText.id === d.id;

circle.classed("hidden-icon", shouldHide);
});

// Also hide/show the multi-color pie for the selected text when pinned.
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
  `${layerMode}|${selectedText ? selectedText.id : ""}|${selectedFather ? selectedFather.id : ""}|v${visVersionRef.current}`;

const last = lastStyleStateRef.current;
const shouldUpdateDimming = (last.zoomMode !== zoomMode) || (last.key !== styleKey);

if (shouldUpdateDimming) {
  lastStyleStateRef.current = { zoomMode, key: styleKey };

  gTexts.selectAll("circle.textDot")
    .style("opacity", d => {
      // hide selected text icon completely
      if (selectedText && selectedText.id === d.id) return 0;

      if (!hasSel) return BASE_OPACITY;
      return selectedNeighborhoodOpacity("text", d.id);
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

// NOTE: Opacity for pie dots is handled at the group level (g.dotSlices) to match circles/fathers.
// If we also dim individual wedges here, the opacity gets applied twice (group * wedge),
// making non-related pies effectively invisible.
const o = BASE_OPACITY;

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
      return selectedNeighborhoodOpacity("father", d.id);
    }, "important");
}



/*
 * Render one vertical branch in an unclipped SVG layer. The active branch may
 * belong to the selected pin or to any crowded connected-object location.
 */
function getOpenLocationClusters() {
  const openKeys = openLocationClusterKeysRef.current;
  if (!openKeys.size) return [];

  const selectedCluster = selectedLocationClusterRef.current;
  const allClusters = [
    ...(selectedCluster?.key ? [selectedCluster] : []),
    ...connectedLocationClustersRef.current,
  ];

  return allClusters.filter((cluster) => {
    const point = cluster?.selectedPoint || cluster?.anchorPoint;
    return (
      cluster?.key &&
      openKeys.has(cluster.key) &&
      point &&
      Array.isArray(cluster.entries) &&
      cluster.entries.length > 0
    );
  });
}

function renderLocationClusterBranch() {
  const branchLayer = d3.select(locationClusterBranchRef.current);
  const openClusters = showMapRef.current
    ? getOpenLocationClusters()
    : [];

  const branchRoots = branchLayer
    .selectAll("g.locationClusterBranch")
    .data(openClusters, (cluster) => cluster.key)
    .join(
      (enter) =>
        enter
          .append("g")
          .attr("class", "locationClusterBranch"),
      (update) => update,
      (exit) => exit.remove()
    );

  if (!openClusters.length) {
    branchLayer
      .style("display", "none")
      .attr("aria-hidden", "true");

    renderSelectedTooltipRef.current?.(true);
    return;
  }

  branchLayer
    .style("display", null)
    .attr("aria-hidden", "false");

  branchRoots.each(function (cluster) {
    const branchRoot = d3.select(this);
    const entries = cluster.entries || [];
    const point = cluster.selectedPoint || cluster.anchorPoint;

      const anchorX = margin.left + point.x;
      const anchorY = margin.top + point.y;

      const mapZoom =
        timelineMapRef.current
          ?.getViewportTransform?.()
          ?.k ??
        LOCATION_CLUSTER_BRANCH_REFERENCE_MAP_ZOOM;

      const branchLengthScale = clamp(
        Math.pow(
          mapZoom /
            LOCATION_CLUSTER_BRANCH_REFERENCE_MAP_ZOOM,
          LOCATION_CLUSTER_BRANCH_ZOOM_SENSITIVITY
        ),
        LOCATION_CLUSTER_BRANCH_MIN_SCALE,
        LOCATION_CLUSTER_BRANCH_MAX_SCALE
      );

      const firstIconY =
        LOCATION_CLUSTER_FIRST_ICON_Y *
        branchLengthScale;

      const iconSpacing =
        LOCATION_CLUSTER_ICON_SPACING *
        branchLengthScale;

      const layoutEntries = entries.map((entry, index) => ({
        ...entry,
        branchY:
          firstIconY +
          index * iconSpacing,
        previousY:
          index === 0
            ? LOCATION_CLUSTER_EXPANDED_RADIUS
            : firstIconY +
              (index - 1) * iconSpacing,
      }));

      branchRoot
        .style("display", null)
        .attr("aria-hidden", "false")
        .attr("role", "group")
        .attr(
          "aria-label",
          "Connected objects at this location"
        )
        .attr("transform", `translate(${anchorX},${anchorY})`)
        .on("pointerdown.locationCluster", (event) => {
          event.stopPropagation();
        })
        .on("click.locationCluster", (event) => {
          event.stopPropagation();
        });

      /*
       * When one branch object is focused, every segment from the disclosure
       * button down to that object remains highlighted. This preserves a
       * continuous visual path for the second, third, and later branch items.
       */
      const activeBranchTarget = getSelectedFocusTarget();
      const activeBranchIndex = activeBranchTarget
        ? layoutEntries.findIndex(
            (entry) =>
              activeBranchTarget.type === entry.type &&
              activeBranchTarget.id === entry.id
          )
        : -1;

      /*
       * Each segment inherits the actual color, thickness, dash pattern, and
       * line-cap of the connection it replaces.
       */
      branchRoot
        .selectAll("line.locationClusterBranch__segment")
        .data(
          layoutEntries,
          (entry) => `${entry.type}:${entry.id}`
        )
        .join("line")
        .attr("class", "locationClusterBranch__segment")
        .attr("x1", 0)
        .attr("x2", 0)
        .attr("y1", (entry) => entry.previousY)
        .attr("y2", (entry) => entry.branchY)
        .attr(
          "stroke",
          (entry) => entry.connectionColor
        )
        .attr(
          "stroke-width",
          (entry) =>
            entry.connectionStyle?.strokeWidth || 1.4
        )
        .attr(
          "stroke-dasharray",
          (entry) =>
            entry.connectionStyle?.strokeDasharray || null
        )
        .attr(
          "stroke-linecap",
          (entry) =>
            entry.connectionStyle?.strokeLinecap || "round"
        )
        .attr("stroke-opacity", (entry, index) => {
          if (!activeBranchTarget) {
            return CONNECTION_SELECTED_IDLE_OPACITY;
          }

          if (activeBranchIndex < 0) {
            return CONNECTION_SELECTED_DIM_OPACITY;
          }

          return index <= activeBranchIndex
            ? CONNECTION_HIGHLIGHT_OPACITY
            : CONNECTION_SELECTED_DIM_OPACITY;
        });

      const activateEntry = (event, entry) => {
        event.preventDefault();
        event.stopPropagation();

        hideTipSel(tipText);
        closeLocationClusterBranch();
        setCardLinkHoverTarget(null);
        setHoveredTimelineTargetSafe(null);
        setShowMore(false);

        if (entry.type === "text") {
          setSelectedText(entry.row);
          setSelectedFather(null);
        } else {
          setSelectedFather(entry.row);
          setSelectedText(null);
        }
      };

      const items = branchRoot
        .selectAll("g.locationClusterBranch__item")
        .data(
          layoutEntries,
          (entry) => `${entry.type}:${entry.id}`
        )
        .join(
          (enter) => {
            const item = enter
              .append("g")
              .attr("class", "locationClusterBranch__item")
              .attr("role", "button")
              .attr("tabindex", 0);

            item
              .append("circle")
              .attr("class", "locationClusterBranch__hit");

            item
              .append("g")
              .attr("class", "locationClusterBranch__icon");

            return item;
          },
          (update) => update,
          (exit) => exit.remove()
        )
        .attr(
          "transform",
          (entry) => `translate(0,${entry.branchY})`
        )
        .attr("aria-label", (entry) => entry.label)
        .on("pointerdown.locationCluster", (event) => {
          event.stopPropagation();
        })
        .on("mouseenter.locationCluster", function (event, entry) {
          cancelHoverTLClear();

          d3.select(this).classed("is-hovered", true);

          setHoveredTimelineTargetSafe({
            type: entry.type,
            id: entry.id,
          });

          hideTipSel(tipText);
        })
        .on("mousemove.locationCluster", function () {
          hideTipSel(tipText);
        })
        .on("mouseleave.locationCluster", function () {
          d3.select(this).classed("is-hovered", false);
          clearHoveredTimelineTargetSoon(60);
          hideTipSel(tipText);
        })
        .on("click.locationCluster", activateEntry)
        .on(
          "keydown.locationCluster",
          (event, entry) => {
            if (
              event.key === "Enter" ||
              event.key === " "
            ) {
              activateEntry(event, entry);
            }
          }
        )
        .style("opacity", (entry) => {
          const activeTarget = getSelectedFocusTarget();
          if (!activeTarget) return BASE_OPACITY;

          return activeTarget.type === entry.type &&
            activeTarget.id === entry.id
            ? BASE_OPACITY
            : DIM_NODE_OPACITY;
        });

      const branchIconRadiusForEntry = (entry) =>
        entry?.type === "father"
          ? getFatherObjectRadius(entry.row, k)
          : getTextObjectRadius(entry.row, k);

      items
        .select("circle.locationClusterBranch__hit")
        .attr(
          "r",
          (entry) =>
            Math.max(
              LOCATION_CLUSTER_HIT_RADIUS,
              branchIconRadiusForEntry(entry) + 7
            )
        );


      /*
       * Render the same icon language used by the timeline:
       * text = circle/pie; father = triangle or concept square.
       */
      items.each(function (entry) {
        const item = d3.select(this);
        const icon = item.select(
          "g.locationClusterBranch__icon"
        );

        icon.selectAll("*").remove();

        const colors =
          Array.isArray(entry.colors) &&
          entry.colors.length
            ? entry.colors
            : [entry.color || "#666"];

        if (entry.type === "text") {
          icon.datum({ colors });

          icon
            .selectAll("path.slice")
            .data(
              colors.map((color, index) => ({
                color,
                index,
              }))
            )
            .join("path")
            .attr("class", "slice")
            .attr("fill", (slice) => slice.color)
            .style("fill", (slice) => slice.color);

          drawSlicesAtRadius(
            icon,
            branchIconRadiusForEntry(entry)
          );

          return;
        }

        const isConcept =
          hasConceptTag(
            entry.row.historicMythicStatusTags
          );

        const radius = branchIconRadiusForEntry(entry);

        const slices = isConcept
          ? splitSquareSlices(0, 0, radius, colors)
          : leftSplitTriangleSlices(
              0,
              0,
              radius,
              colors
            );

        icon
          .selectAll("path.slice")
          .data(slices, (_, index) => index)
          .join("path")
          .attr("class", "slice")
          .attr("d", (slice) => slice.d)
          .attr("fill", (slice) => slice.fill)
          .style("fill", (slice) => slice.fill)
          .attr(
            "vector-effect",
            "non-scaling-stroke"
          )
          .attr(
            "shape-rendering",
            "geometricPrecision"
          );

        const showMid =
          !isConcept &&
          hasHistoricTag(
            entry.row.historicMythicStatusTags
          );

        const overlays = isConcept
          ? buildSquareOverlaySegments(
              0,
              0,
              radius,
              colors
            )
          : buildOverlaySegments(
              0,
              0,
              radius,
              colors,
              showMid
            );

        const borderWidth =
          fatherBorderStrokeWidth(radius);

        icon
          .selectAll("line.overlay")
          .data(
            overlays,
            (segment, index) =>
              `${segment.type}:${index}`
          )
          .join("line")
          .attr("class", "overlay")
          .attr("x1", (segment) => segment.x1)
          .attr("y1", (segment) => segment.y1)
          .attr("x2", (segment) => segment.x2)
          .attr("y2", (segment) => segment.y2)
          .attr("stroke", "#ffffff")
          .attr(
            "stroke-width",
            (segment) =>
              segment.type === "mid"
                ? borderWidth * 2
                : borderWidth
          )
          .attr("stroke-linecap", "round")
          .attr(
            "vector-effect",
            "non-scaling-stroke"
          )
          .style("pointer-events", "none");
      });

  });

  renderSelectedTooltipRef.current?.(true);
}

function toggleLocationClusterBranch(
  event,
  cluster,
  clusterButton,
  cx,
  cy
) {
  event.preventDefault();
  event.stopPropagation();

  if (!cluster?.key || !cluster.entries?.length) return;

  const openKeys = openLocationClusterKeysRef.current;
  const wasOpen = openKeys.has(cluster.key);

  if (wasOpen) {
    closeLocationClusterBranch(cluster.key);
    renderLocationClusterBranch();
    return;
  }

  openKeys.add(cluster.key);
  locationClusterOpenRef.current = true;

  if (event.type === "click") {
    event.currentTarget?.blur?.();
  }

  clusterButton
    .classed("is-open", true)
    .attr(
      "d",
      locationClusterTrianglePath(
        cx,
        cy,
        LOCATION_CLUSTER_EXPANDED_RADIUS,
        true
      )
    )
    .attr("aria-expanded", "true")
    .attr(
      "aria-label",
      "Hide connected objects at this location"
    );

  d3.select(clusterButton.node()?.parentNode)
    .select("text.tl-pin-cluster-count")
    .style("display", "none");

  renderLocationClusterBranch();
}


/*
 * Co-located connected objects are represented by location-cluster controls,
 * so their normal markers and mini-tooltips do not remain stacked together.
 */
{
  const clusteredKeys = clusteredNodeKeysRef.current;

  gTexts
    .selectAll("circle.textDot")
    .style(
      "display",
      (d) =>
        clusteredKeys.has(`text:${d.id}`)
          ? "none"
          : null
    );

  gTexts
    .selectAll("g.dotSlices")
    .style(
      "display",
      (d) =>
        clusteredKeys.has(`text:${d.id}`)
          ? "none"
          : null
    );

  gFathers
    .selectAll("g.fatherMark")
    .style(
      "display",
      (d) =>
        clusteredKeys.has(`father:${d.id}`)
          ? "none"
          : null
    );
}

/*
 * Every non-selected map location containing two or more connected objects is
 * represented by one disclosure triangle. Its hidden objects are rendered only
 * inside the vertical branch after the triangle is opened.
 */
const connectedClusterControls = gPins
  .selectAll("g.connectedLocationClusterControl")
  .data(
    showMapRef.current
      ? connectedLocationClustersRef.current
      : [],
    (cluster) => cluster.key
  )
  .join(
    (enter) => {
      const control = enter
        .append("g")
        .attr(
          "class",
          "connectedLocationClusterControl"
        );

      control
        .append("path")
        .attr("class", "tl-pin-cluster-button")
        .attr("role", "button")
        .attr("tabindex", 0)
        .attr("aria-expanded", "false")
        .style("pointer-events", "all");

      control
        .append("text")
        .attr("class", "tl-pin-cluster-count")
        .attr("aria-hidden", "true");

      return control;
    },
    (update) => update,
    (exit) => exit.remove()
  );

connectedClusterControls.each(function (cluster) {
  const point = cluster.anchorPoint;
  if (!point) return;

  const cx = point.x;
  const cy = point.y;
  const isOpen =
    openLocationClusterKeysRef.current.has(cluster.key);

  const control = d3.select(this);
  const button = control
    .select("path.tl-pin-cluster-button")
    .attr("data-cluster-key", cluster.key)
    .attr("data-cx", cx)
    .attr("data-cy", cy)
    .attr(
      "d",
      locationClusterTrianglePath(
        cx,
        cy,
        isOpen
          ? LOCATION_CLUSTER_EXPANDED_RADIUS
          : LOCATION_CLUSTER_COLLAPSED_RADIUS,
        isOpen
      )
    )
    .attr(
      "aria-label",
      isOpen
        ? `Hide ${cluster.entries.length} connected objects at this location`
        : `Show ${cluster.entries.length} connected objects at this location`
    )
    .attr("aria-expanded", isOpen ? "true" : "false")
    .classed("is-open", isOpen);

  control
    .select("text.tl-pin-cluster-count")
    .style("display", isOpen ? "none" : null)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "hanging")
    .attr("x", cx + LOCATION_CLUSTER_COUNT_X_OFFSET)
    .attr(
      "y",
      cy +
        LOCATION_CLUSTER_COLLAPSED_RADIUS * 0.78 +
        4 +
        LOCATION_CLUSTER_COUNT_Y_OFFSET
    )
    .text(cluster.entries.length);

  const activate = (event) =>
    toggleLocationClusterBranch(
      event,
      cluster,
      button,
      cx,
      cy
    );

  button
    .on("click.locationCluster", activate)
    .on("keydown.locationCluster", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        activate(event);
      }
    });
});


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

      // Visible only when connected objects share the selected map location.
      g.append("path")
        .attr("class", "tl-pin-cluster-button")
        .attr("role", "button")
        .attr("tabindex", 0)
        .attr("aria-expanded", "false")
        .style("display", "none")
        .style("pointer-events", "all");

      g.append("text")
        .attr("class", "tl-pin-cluster-count")
        .attr("aria-hidden", "true")
        .style("display", "none");

      return g;
    },
    update => update,
    exit => exit.remove()
  )
  .each(function (d) {
    const point = placedPointForText(d, zx, zy);
    const cx = point.x;
    const cy = point.y;

    const fixedPinHeadRadius =
      getSelectedPinHeadRadius(k);

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


    const { cxHead, cyHead, R } =
      computePinHeadGeometry(
        cx,
        cy,
        null,
        fixedPinHeadRadius
      );
    const rIcon = R * 0.45;

    const g = d3.select(this);

    // Drive CSS pin border color
    g.style("--pin-color", pinColor);

    // Teardrop body path (white fill + colored border via CSS)
    g.select("path.tl-pin-body")
      .attr(
        "d",
        pinPathD(
          cx,
          cy,
          null,
          fixedPinHeadRadius
        )
      );

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

    const cluster = selectedLocationClusterRef.current;
    const hasLocationCluster =
      showMapRef.current &&
      cluster.selectedType === "text" &&
      cluster.selectedId === d.id &&
      cluster.entries.length > 0;

    const isClusterOpen =
      hasLocationCluster &&
      openLocationClusterKeysRef.current.has(cluster.key);

    const clusterButton = g
      .select("path.tl-pin-cluster-button")
      .style(
        "display",
        hasLocationCluster ? null : "none"
      )
      .attr("data-cluster-key", cluster.key || "")
      .attr("data-cx", cx)
      .attr("data-cy", cy + 1)
      .attr(
        "d",
        locationClusterTrianglePath(
          cx,
          cy + 1,
          isClusterOpen
            ? LOCATION_CLUSTER_EXPANDED_RADIUS
            : LOCATION_CLUSTER_COLLAPSED_RADIUS,
          isClusterOpen
        )
      )
      .attr(
        "aria-label",
        hasLocationCluster
          ? (
              isClusterOpen
                ? `Hide ${cluster.entries.length} connected objects at this location`
                : `Show ${cluster.entries.length} connected objects at this location`
            )
          : null
      )
      .attr(
        "aria-expanded",
        isClusterOpen ? "true" : "false"
      )
      .classed("is-open", isClusterOpen);

    const clusterCount = g
      .select("text.tl-pin-cluster-count")
      .style(
        "display",
        hasLocationCluster && !isClusterOpen ? null : "none"
      )
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "hanging")
      .attr("x", cx + LOCATION_CLUSTER_COUNT_X_OFFSET)
      .attr(
        "y",
        cy +
          1 +
          LOCATION_CLUSTER_COLLAPSED_RADIUS * 0.78 +
          4 +
          LOCATION_CLUSTER_COUNT_Y_OFFSET
      )
      .text(
        hasLocationCluster
          ? cluster.entries.length
          : ""
      );

    // SVG child order controls layering: put the triangle behind the pin body.
    clusterButton.lower();
    clusterCount.raise();

    const toggleClusterBranch = (event) => {
      if (!hasLocationCluster) return;

      toggleLocationClusterBranch(
        event,
        cluster,
        clusterButton,
        cx,
        cy + 1
      );
    };

    clusterButton
      .on(
        "click.locationCluster",
        toggleClusterBranch
      )
      .on(
        "keydown.locationCluster",
        (event) => {
          if (
            event.key === "Enter" ||
            event.key === " "
          ) {
            toggleClusterBranch(event);
          }
        }
      );
  });


// Position pies to match circles (same cy rule)
gTexts.selectAll("g.dotSlices").each(function (d) {
  const point = placedPointForText(d, zx, zy);
  const cx = point.x;
  const cy = point.y;

  const isSelected = !!(selectedText && selectedText.id === d.id);
  const isHovered  = (hoveredTextIdRef.current === d.id);

  const rBase = getTextObjectRadius(d, k);

  // IMPORTANT:
  // - Selected pies are rendered "big" via arc radius (rDraw) with NO scale transform.
  // - Hovered (non-selected) pies stay rBase but get a scale transform.
  const rDraw = isSelected ? (rBase * HOVER_SCALE_DOT) : rBase;

  const g = d3.select(this);
  const hasSelectionHere = !!(selectedText || selectedFather);
  const activeTimelineHover = hoveredTimelineTargetRef.current;
  const isSelectedModeHover =
    hasSelectionHere &&
    activeTimelineHover?.type === "text" &&
    activeTimelineHover?.id === d.id;

  if (!isSelected && isHovered) {
    g.attr("transform", `translate(${cx},${cy}) scale(${HOVER_SCALE_DOT})`);
  } else {
    // Outer pie group owns POSITION only in selected mode.
    g.attr("transform", `translate(${cx},${cy})`);
  }

  if (hasSelectionHere && !isSelectedModeHover) {
    g.selectAll("path.slice, g.separators")
      .interrupt("tlHover")
      .attr("transform", null);
  }

  drawSlicesAtRadius(g, rDraw);
});


  // Fathers (triangles)
 gFathers.selectAll("g.fatherMark").each(function (d) {
  const point = placedPointForFather(d, zx, zy);
  const cx = point.x;
  const cy = point.y;

  d3.select(this)
    .attr("data-cx", cx)
    .attr("data-cy", cy);

  const cols = d.colors && d.colors.length ? d.colors : [d.color || "#666"];

const isSelected = selectedFather && selectedFather.id === d.id;
const isHovered  = hoveredFatherIdRef.current === d.id;

const rBase = getFatherObjectRadius(d, k);
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
// Hide the original father icon only while it is represented by the main pin.
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

      // Visible only when connected objects share the selected map location.
      g.append("path")
        .attr("class", "tl-pin-cluster-button")
        .attr("role", "button")
        .attr("tabindex", 0)
        .attr("aria-expanded", "false")
        .style("display", "none")
        .style("pointer-events", "all");

      g.append("text")
        .attr("class", "tl-pin-cluster-count")
        .attr("aria-hidden", "true")
        .style("display", "none");

      return g;
    },
    update => update,
    exit => exit.remove()
  )
  .each(function (d) {
    const isConcept = hasConceptTag(d.historicMythicStatusTags);
    const point = placedPointForFather(d, zx, zy);
    const cx = point.x;
    const cy = point.y;

    const fixedPinHeadRadius =
      getSelectedPinHeadRadius(k);

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


    const { cxHead, cyHead, R } =
      computePinHeadGeometry(
        cx,
        cy,
        null,
        fixedPinHeadRadius
      );
    const rIcon = R * 0.45;

    // Offset the icon a bit if needed:
    const iconCx = cxHead + rIcon * (isConcept ? 0.0 : 0.1);             // left/right tweak here
    const iconCy = cyHead - rIcon * (isConcept ? 0.35 : 0.5); // move slightly up

    const g = d3.select(this);

    // Border color from symbolic system (CSS uses --pin-color)
    g.style("--pin-color", pinColor);

    // Teardrop body outline
    g.select("path.tl-pin-body")
      .attr(
        "d",
        pinPathD(
          cx,
          cy,
          null,
          fixedPinHeadRadius
        )
      );

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

    const cluster = selectedLocationClusterRef.current;
    const hasLocationCluster =
      showMapRef.current &&
      cluster.selectedType === "father" &&
      cluster.selectedId === d.id &&
      cluster.entries.length > 0;

    const isClusterOpen =
      hasLocationCluster &&
      openLocationClusterKeysRef.current.has(cluster.key);

    const clusterButton = g
      .select("path.tl-pin-cluster-button")
      .style(
        "display",
        hasLocationCluster ? null : "none"
      )
      .attr("data-cluster-key", cluster.key || "")
      .attr("data-cx", cx)
      .attr("data-cy", cy + 1)
      .attr(
        "d",
        locationClusterTrianglePath(
          cx,
          cy + 1,
          isClusterOpen
            ? LOCATION_CLUSTER_EXPANDED_RADIUS
            : LOCATION_CLUSTER_COLLAPSED_RADIUS,
          isClusterOpen
        )
      )
      .attr(
        "aria-label",
        hasLocationCluster
          ? (
              isClusterOpen
                ? "Hide connected objects at this location"
                : "Show connected objects at this location"
            )
          : null
      )
      .attr(
        "aria-expanded",
        isClusterOpen ? "true" : "false"
      )
      .classed("is-open", isClusterOpen);

    const clusterCount = g
      .select("text.tl-pin-cluster-count")
      .style(
        "display",
        hasLocationCluster && !isClusterOpen ? null : "none"
      )
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "hanging")
      .attr("x", cx + LOCATION_CLUSTER_COUNT_X_OFFSET)
      .attr(
        "y",
        cy +
          1 +
          LOCATION_CLUSTER_COLLAPSED_RADIUS * 0.78 +
          4 +
          LOCATION_CLUSTER_COUNT_Y_OFFSET
      )
      .text(
        hasLocationCluster
          ? cluster.entries.length
          : ""
      );

    // SVG child order controls layering: put the triangle behind the pin body.
    clusterButton.lower();
    clusterCount.raise();

    const toggleClusterBranch = (event) => {
      if (!hasLocationCluster) return;

      toggleLocationClusterBranch(
        event,
        cluster,
        clusterButton,
        cx,
        cy + 1
      );
    };

    clusterButton
      .on(
        "click.locationCluster",
        toggleClusterBranch
      )
      .on(
        "keydown.locationCluster",
        (event) => {
          if (
            event.key === "Enter" ||
            event.key === " "
          ) {
            toggleClusterBranch(event);
          }
        }
      );
  });

  // Initialize the map once; an established viewport is never recentered here.
  if (
    showMapRef.current &&
    (selectedText || selectedFather)
  ) {
    scheduleSelectedPinScreenPositionFromDom("d3-apply");
  } else if (!selectedText && !selectedFather) {
    clearSelectedPinScreenPosition();
  }

  // Card-link hover is represented by the matching mini-tooltip frame,
  // not by a secondary SVG pin. Remove any stale hover pins left by HMR.
  gPins
    .selectAll("g.hoverTextPin, g.hoverFatherPin")
    .remove();

  // ----- Lightweight viewport culling (texts, pies, fathers) -----
  // PERF: this touches lots of DOM nodes; coalesce to 1 per animation frame during zoom/pan
  cullArgsRef.current = { zx, innerWidth };
  if (!cullUpdateRaf.current) {
    cullUpdateRaf.current = requestAnimationFrame(() => {
      cullUpdateRaf.current = 0;
      const args = cullArgsRef.current;
      if (!args) return;

      if (
        showMapRef.current &&
        selectedMapAvailableRef.current
      ) {
        const newVisible = new Set();

        const clusteredKeys =
          clusteredNodeKeysRef.current;

        gTexts.selectAll("circle.textDot").each(function (d) {
          d3.select(this).style(
            "display",
            clusteredKeys.has(`text:${d.id}`)
              ? "none"
              : null
          );
          newVisible.add(d.id);
        });

        gTexts.selectAll("g.dotSlices")
          .style(
            "display",
            (d) =>
              clusteredKeys.has(`text:${d.id}`)
                ? "none"
                : null
          );

        gFathers.selectAll("g.fatherMark").each(function (d) {
          d3.select(this).style(
            "display",
            clusteredKeys.has(`father:${d.id}`)
              ? "none"
              : null
          );
          newVisible.add(d.id);
        });

        const previousVisible = visibleIdsRef.current;
        let changed =
          previousVisible.size !== newVisible.size;

        if (!changed) {
          for (const id of newVisible) {
            if (!previousVisible.has(id)) {
              changed = true;
              break;
            }
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

        return;
      }

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

  // Placement calculation is cheap after the cache is populated and is
  // needed when a selected object re-enters the middle/deepest zoom tiers.
  renderPersistentObjectTooltips(true);
  renderLocationClusterBranch();
  syncSelectedNeighborhoodFocus();

  /*
   * Map projection changes already arrive through a requestAnimationFrame.
   * Rendering map connections synchronously here keeps lines in the same frame
   * as their projected endpoints instead of letting them trail by one frame.
   */
  if (mapModeForRendering) {
    if (connUpdateRaf.current) {
      cancelAnimationFrame(connUpdateRaf.current);
      connUpdateRaf.current = 0;
    }
    connArgsRef.current = null;
    renderConnections(zx, zy, k);
  } else {
    scheduleRenderConnections(zx, zy, k);
  }
}

reapplyCurrentLayoutRef.current = () => {
  const transform = lastTransformRef.current ?? d3.zoomIdentity;
  const zx = transform.rescaleX(x);
  const zy = transform.rescaleY(y0);

  apply(zx, zy, transform.k);
  updateInteractivity(transform.k);
};


function updateInteractivity(k) {
  const hasSelection = !!(selectedText || selectedFather);
  const mapModeActive =
    showMapRef.current &&
    selectedMapAvailableRef.current &&
    hasSelection;

  /*
   * Geographic mode keeps the civilizational labels available but removes
   * temporal border geometry, segment geometry, and all temporal hit targets.
   */
  if (mapModeActive) {
    gOut.style("display", null);

    gOut.selectAll("rect.outlineRect")
      .style("display", "none")
      .style("pointer-events", "none");

    gOut.selectAll("text.durationLabel")
      .style("pointer-events", "none");

    gCustom.style("display", "none");
    gSeg.style("display", "none");

    gTexts.selectAll("circle.textDot")
      .style("pointer-events", "all");

    gFathers.selectAll("g.fatherMark")
      .style("pointer-events", "all");

    clearActiveDuration();
    clearActiveSegment();
    return;
  }

  // Restore duration rectangles after leaving Map View.
  gOut.selectAll("rect.outlineRect")
    .style("display", null);

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

    // === NEW: "noborders" mode ===
  // Hide ALL duration/segment rendering (fills + borders + labels), regardless of zoom/selection.
  if (layerMode === "noborders") {
    // Hide the whole durations layer (includes duration labels + outline rects)
    gOut.style("display", "none");

    // Hide custom polygons too
    gCustom.style("display", "none");

    // Hide segments layer
    gSeg.style("display", "none");

    // No duration/segment interactivity
    clearActiveDuration();
    clearActiveSegment();

    // Node interactivity policy in noborders:
// - If there is a selection, gate to only relevant nodes (same as normal selection behavior)
// - Otherwise keep the existing zoom-tier rule
if (hasSelection) {
  /*
   * Selected mode: direct one-hop neighbors remain interactive at EVERY
   * Default View zoom level, including OUTEST. This matches Geographical View.
   * Unrelated objects remain inert.
   */
  gTexts.selectAll("circle.textDot")
    .style("pointer-events", d =>
      relevantTextIdsRef.current.has(d.id) ? "all" : "none"
    );

  gFathers.selectAll("g.fatherMark")
    .style("pointer-events", d =>
      relevantFatherIdsRef.current.has(d.id) ? "all" : "none"
    );
} else {
  if (zoomMode === "deepest") {
    gTexts.selectAll("circle.textDot").style("pointer-events", "all");
    gFathers.selectAll("g.fatherMark").style("pointer-events", "all");
  } else {
    gTexts.selectAll("circle.textDot").style("pointer-events", "none");
    gFathers.selectAll("g.fatherMark").style("pointer-events", "none");
  }
}

    // Make sure any leftover styling updates don't resurrect strokes
    updateSegmentPreview();
    updateHoverVisuals();
    return;
  }

  // only keep generic flag(s) here (zoom tier classes live in zoom handler)
  const svgSel = d3.select(svgRef.current);
  svgSel.classed("has-selection", hasSelection);

  // Keep layer-mode classes on the SVG via D3 so React doesn't wipe zoom-* classes
  svgSel
    .classed("layer-durations",  layerMode === "durations")
    .classed("layer-segments",   layerMode === "segments")
    .classed("layer-none",       layerMode === "none")
    .classed("layer-noborders",  layerMode === "noborders");

  // === Radio-controlled layer policy (ONLY affects durations/segments) ===
  const durationsAllowed = (layerMode === "durations");
  const segmentsAllowed  = (layerMode === "segments");

  const showDurationsLayer =
    durationsAllowed && (zoomMode === "outest") && !hasSelection;

  const showSegmentsLayer =
    segmentsAllowed && (zoomMode === "outest" || zoomMode === "middle") && !hasSelection;

const showPassiveOutlines =
  (layerMode === "none") ||
  (hasSelection && layerMode !== "noborders") ||
  (layerMode === "durations" && (zoomMode === "middle" || zoomMode === "deepest")) ||
  (layerMode === "segments"  && (zoomMode === "deepest"));
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
    gOut.selectAll("rect.outlineRect")
      .style("pointer-events", "none");
    gSeg.selectAll("rect.segmentHit")
      .style("pointer-events", "none");
    gCustom.selectAll("path.customGroup")
      .style("pointer-events", "none");

    /*
     * Selected mode: direct connected nodes remain hot at every zoom level.
     * This lets OUTEST Default View use the same hover/Info Window/connection
     * highlighting behavior as Geographical View.
     */
    gTexts.selectAll("circle.textDot")
      .style("pointer-events", d =>
        relevantTextIdsRef.current.has(d.id) ? "all" : "none"
      );

    gFathers.selectAll("g.fatherMark")
      .style("pointer-events", d =>
        relevantFatherIdsRef.current.has(d.id) ? "all" : "none"
      );

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

function computeTransformForChartPoint(
  xDataAstro,
  yU,
  kTarget,
  desiredX,
  desiredY
) {
  const px0 = x(xDataAstro);
  const py0 = y0(yU);

  const tx = desiredX - kTarget * px0;
  const ty = desiredY - kTarget * py0;

  return d3.zoomIdentity.translate(tx, ty).scale(kTarget);
}

// Compute a zoom transform that places (xData, yU) at the existing fly-to target.
function computeTransformForPoint(xDataAstro, yU, kTarget) {
  return computeTransformForChartPoint(
    xDataAstro,
    yU,
    kTarget,
    innerWidth * SEARCH_FLY.xFrac,
    innerHeight * SEARCH_FLY.yFrac
  );
}

/*
 * Preserve an object's browser position while React changes the selected-mode
 * chart height. The chart group's screen matrix accounts for the wrapper,
 * SVG, and chart margins without assuming one CSS pixel equals one SVG unit.
 */
function computeTransformForClientPoint(
  xDataAstro,
  yU,
  kTarget,
  clientX,
  clientY
) {
  const chartMatrix = gRoot.node()?.getScreenCTM?.();
  if (!chartMatrix) return null;

  let inverse;
  try {
    inverse = chartMatrix.inverse();
  } catch {
    return null;
  }

  const desired = new DOMPoint(
    clientX,
    clientY
  ).matrixTransform(inverse);

  if (
    !Number.isFinite(desired.x) ||
    !Number.isFinite(desired.y)
  ) {
    return null;
  }

  return computeTransformForChartPoint(
    xDataAstro,
    yU,
    kTarget,
    desired.x,
    desired.y
  );
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
    const onLocationClusterControl =
      t.closest(".tl-pin-cluster-button") ||
      t.closest(".locationClusterBranch");
    const onMark = onText || onFather;

    if (onLocationClusterControl) {
      return false;
    }

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
    logRenderedCounts("zoom end");
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

  const xAstro = toAstronomical(d.when);
  const yU = (type === "father") ? laneYUForFather(d) : laneYUForText(d);

  // ---- NEW: if already visible AND we are not at the outest zoom tier, do nothing ----
  const tCur = lastTransformRef.current ?? d3.zoomIdentity;

  // outest tier is k < ZOOM_SEGMENT_THRESHOLD in your current zoom-mode logic
  const notOutest = tCur.k >= ZOOM_SEGMENT_THRESHOLD;

  // "Visible" under the CURRENT transform: rescale the base scales, then check pixel bounds
  const xNow = tCur.rescaleX(x);
  const yNow = tCur.rescaleY(y0);

  const px = xNow(xAstro);
  const py = yNow(yU);

  const PAD = 18; // small gutter so "barely on screen" still triggers a fly-to if desired
  const isVisible =
    px >= PAD && px <= (innerWidth - PAD) &&
    py >= PAD && py <= (innerHeight - PAD);

  if (isVisible && notOutest) {
    return; // no pan/zoom
  }

  // ---- existing behavior (zoom + pan) ----
  const kTarget = SEARCH_FLY.k;
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
  // Subsequent runs normally reuse the current transform. A direct timeline
  // selection may first compensate for the taller selected-mode axis.
  let t = lastTransformRef.current ?? d3.zoomIdentity;
  let appliedThroughZoom = false;
  let recenterTarget = null;

  /*
   * Symmetric close compensation:
   * once selection is gone and Default View is active again, preserve the
   * former selected object's browser position while the chart regains the
   * 56px previously reserved by the expanded selected axis.
   */
  const pendingDeselection = pendingDeselectionCameraRef.current;

  if (
    pendingDeselection &&
    !selectedText &&
    !selectedFather &&
    !showMap
  ) {
    const deselectedRow =
      pendingDeselection.type === "text"
        ? (textRows || []).find(
            (row) => row.id === pendingDeselection.id
          )
        : (fatherRows || []).find(
            (row) => row.id === pendingDeselection.id
          );

    if (deselectedRow) {
      const xAstro = toAstronomical(deselectedRow.when);
      const yU =
        pendingDeselection.type === "text"
          ? laneYUForText(deselectedRow)
          : laneYUForFather(deselectedRow);
      const kTarget = t.k ?? kRef.current ?? 1;

      const preserved = computeTransformForClientPoint(
        xAstro,
        yU,
        kTarget,
        pendingDeselection.clientX,
        pendingDeselection.clientY
      );

      if (preserved) {
        t = preserved;
        lastTransformRef.current = t;
        kRef.current = t.k;
        svgSel.call(zoom.transform, t);
        appliedThroughZoom = true;
      }
    }

    // One-shot: never let a stale close anchor affect later navigation.
    pendingDeselectionCameraRef.current = null;
  }

  const pendingSelection = pendingSelectionCameraRef.current;
  const selectedType = selectedText ? "text" : selectedFather ? "father" : null;
  const selectedRow = selectedText
    ? (textRows || []).find((row) => row.id === selectedText.id) || selectedText
    : selectedFather
      ? (fatherRows || []).find((row) => row.id === selectedFather.id) || selectedFather
      : null;

  const pendingMatches =
    !!pendingSelection &&
    !showMap &&
    !!selectedRow &&
    pendingSelection.type === selectedType &&
    pendingSelection.id === selectedRow.id;

  if (pendingMatches) {
    const xAstro = toAstronomical(selectedRow.when);
    const yU = selectedText
      ? laneYUForText(selectedRow)
      : laneYUForFather(selectedRow);
    const kTarget = t.k ?? kRef.current ?? 1;

    const preserved = computeTransformForClientPoint(
      xAstro,
      yU,
      kTarget,
      pendingSelection.clientX,
      pendingSelection.clientY
    );

    if (preserved) {
      t = preserved;
      lastTransformRef.current = t;
      kRef.current = t.k;
      svgSel.call(zoom.transform, t);
      appliedThroughZoom = true;
    }

    if (pendingSelection.mode === "recenter") {
      recenterTarget = computeTransformForPoint(
        xAstro,
        yU,
        kTarget
      );
    }

    pendingSelectionCameraRef.current = null;
  }

  kRef.current = t.k;

  if (!appliedThroughZoom) {
    apply(t.rescaleX(x), t.rescaleY(y0), t.k);
  }

  updateInteractivity(t.k);

  // Danger-zone selections start from the preserved pixel and then use the
  // existing fly-to motion to move into the center of the card-free space.
  if (recenterTarget) {
    svgSel
      .transition()
      .duration(SEARCH_FLY.duration)
      .ease(SEARCH_FLY.ease)
      .call(zoom.transform, recenterTarget)
      .on("end", () => {
        lastTransformRef.current = recenterTarget;
        kRef.current = recenterTarget.k;
      });
  }

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
        hideTipSel(tipSelected);

        miniTooltipLayer
          .selectAll("div.tl-mini-tooltip")
          .remove();

        selectedTooltipPlacementRef.current = {
          layoutKey: null,
          placement: null,
          width: 0,
          height: 0,
        };

        miniTooltipPlacementsRef.current.clear();
        renderSelectedTooltipRef.current = () => {};
        reapplyCurrentLayoutRef.current = () => {};
    };
}, [
  outlines,
  segments,
  textRows,
  fatherRows,        // FATHERS: ensure updates
  visTextRows,
  visFatherRows,
  selectedText,
  selectedFather,
  showMap,
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

  /*
   * The top Info Window follows the same active connected-object focus used
   * by the lines and mini-tooltips. Actual timeline/map-object hover takes
   * priority; otherwise a hovered connection link inside either card drives it.
   */
  const connectionInfoEntries = useMemo(() => {
    const selectedType = selectedText
      ? "text"
      : selectedFather
        ? "father"
        : null;

    const selectedId =
      selectedText?.id ??
      selectedFather?.id ??
      null;

    const activeHoveredTarget =
      hoveredTimelineTarget ||
      cardHoveredTarget ||
      null;

    return buildConnectionInfoWindowEntries({
      allConnections:
        allConnectionRowsRef.current || [],
      selectedType,
      selectedId,
      hoveredType:
        activeHoveredTarget?.type ?? null,
      hoveredId:
        activeHoveredTarget?.id ?? null,
    });
  }, [
    selectedText?.id,
    selectedFather?.id,
    hoveredTimelineTarget?.type,
    hoveredTimelineTarget?.id,
    cardHoveredTarget?.type,
    cardHoveredTarget?.id,
  ]);

  /*
   * Shared MarkerIcon metadata for the two endpoints in the Info Window.
   * This intentionally uses the same timeline rows as the Timeline itself, so
   * the icon shape/colors match cards and SearchBar without duplicating a
   * separate symbolic-system lookup table here.
   */
  const connectionInfoTextById = useMemo(
    () => new Map((textRows || []).map((row) => [row.id, row])),
    [textRows]
  );

  const connectionInfoFatherById = useMemo(
    () => new Map((fatherRows || []).map((row) => [row.id, row])),
    [fatherRows]
  );

  const getConnectionInfoMarkerProps = useCallback(
    (type, id) => {
      if (type === "text") {
        const row = connectionInfoTextById.get(id);
        if (!row) return null;

        return {
          type: "text",
          color: row.color || row.colors?.[0] || "#666",
          colors: row.colors || null,
        };
      }

      if (type === "father") {
        const row = connectionInfoFatherById.get(id);
        if (!row) return null;

        return {
          type: "father",
          color: row.color || row.colors?.[0] || "#666",
          colors: row.colors || null,
          founding: isYesish(row.foundingFigure),
          historic: hasHistoricTag(row.historicMythicStatusTags),
          concept: hasConceptTag(row.historicMythicStatusTags),
        };
      }

      return null;
    },
    [connectionInfoTextById, connectionInfoFatherById]
  );

  const connectionInfoAccent =
    connectionInfoEntries[0]?.color ||
    "#777777";


return (
  <>
    {typeof document !== "undefined"
      ? createPortal(
          <div
            className={`timelineSearchHost ${
              modalOpen
                ? "timelineSearchHost--selectionHidden"
                : ""
            }`}
            aria-hidden={modalOpen ? "true" : undefined}
          >
            <SearchBar
              items={searchItems}
              onSelect={handleSearchSelect}
              placeholder="Search"
              onInteract={handleSearchInteract}
            />
          </div>,
          document.body
        )
      : null}

    <div
      ref={wrapRef}
      className={[
        "timelineWrap",
        modalOpen ? "has-object-selection" : "",
        modalOpen
          ? (
              showMap && selectedMapAvailable
                ? "timelineWrap--selected-map"
                : "timelineWrap--selected-chronological"
            )
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
    {modalOpen && (
      <div
        className={`timelineConnectionInfoHost ${
          connectionInfoEntries.length
            ? "is-visible"
            : ""
        }`}
        aria-live="polite"
        aria-atomic="true"
        aria-hidden={
          connectionInfoEntries.length
            ? undefined
            : "true"
        }
      >
        {connectionInfoEntries.length > 0 && (
          <div
            className="timelineConnectionInfo"
            style={{
              "--connection-info-accent":
                connectionInfoAccent,
              "--connection-info-selected-name-font-size":
                CONNECTION_INFO_SELECTED_NAME_FONT_SIZE,
              "--connection-info-connected-name-font-size":
                CONNECTION_INFO_CONNECTED_NAME_FONT_SIZE,
              "--connection-info-selected-marker-size":
                `${CONNECTION_INFO_SELECTED_MARKER_SIZE}px`,
              "--connection-info-connected-marker-size":
                `${CONNECTION_INFO_CONNECTED_MARKER_SIZE}px`,
            }}
          >
            {connectionInfoEntries.map(
              (entry, index) => {
                const statement = entry.statement || "";
                const selectedName = entry.selectedName || "";
                const connectedName = entry.connectedName || "";

                const selectedStartsStatement =
                  !!selectedName &&
                  statement.startsWith(selectedName);

                const connectedNameIndex = connectedName
                  ? statement.lastIndexOf(connectedName)
                  : -1;

                const canStyleNames =
                  selectedStartsStatement &&
                  connectedNameIndex >= selectedName.length;

                const selectedMarkerProps =
                  getConnectionInfoMarkerProps(
                    entry.selectedType,
                    entry.selectedId
                  );

                const connectedMarkerProps =
                  getConnectionInfoMarkerProps(
                    entry.connectedType,
                    entry.connectedId
                  );

                return (
                  <div
                    className="timelineConnectionInfo__entry"
                    key={
                      entry.key ||
                      `${entry.statement}-${index}`
                    }
                  >
                    <div className="timelineConnectionInfo__statement">
                      {canStyleNames ? (
                        <>
                          <span className="timelineConnectionInfo__entity timelineConnectionInfo__entity--selected">
                            {selectedMarkerProps && (
                              <MarkerIcon
                                {...selectedMarkerProps}
                                size={CONNECTION_INFO_SELECTED_MARKER_SIZE}
                                className="timelineConnectionInfo__marker timelineConnectionInfo__marker--selected"
                              />
                            )}
                            <span className="timelineConnectionInfo__selectedName">
                              {selectedName}
                            </span>
                          </span>

                          <span className="timelineConnectionInfo__relationshipText">
                            {statement.slice(
                              selectedName.length,
                              connectedNameIndex
                            )}
                          </span>

                          <span className="timelineConnectionInfo__entity timelineConnectionInfo__entity--connected">
                            {connectedMarkerProps && (
                              <MarkerIcon
                                {...connectedMarkerProps}
                                size={CONNECTION_INFO_CONNECTED_MARKER_SIZE}
                                className="timelineConnectionInfo__marker timelineConnectionInfo__marker--connected"
                              />
                            )}
                            <span className="timelineConnectionInfo__connectedName">
                              {connectedName}
                            </span>
                          </span>

                          {statement.slice(
                            connectedNameIndex + connectedName.length
                          )}
                        </>
                      ) : (
                        <>{statement}</>
                      )}
                    </div>

                    {entry.note && (
                      <div className="timelineConnectionInfo__note">
                        {entry.note}
                      </div>
                    )}
                  </div>
                );
              }
            )}
          </div>
        )}
      </div>
    )}

    {/* Filters leave the workspace while an object card is open. */}
    <div
      className={`timelineTagPanelHost ${
        modalOpen ? "timelineTagPanelHost--selectionHidden" : ""
      }`}
      aria-hidden={modalOpen ? "true" : undefined}
    >
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
    </div>
    <TimelineMap
      ref={timelineMapRef}
      visible={showMap && selectedMapAvailable}
      selectedEntry={selectedMapEntry}
      debug={DEBUG_MAP_SYNC}
      onProjectionChange={handleMapProjectionChange}
    />

    <svg
      ref={svgRef}
      className={`timelineSvg ${
        showMap && selectedMapAvailable ? "is-map-view" : ""
      } ${modalOpen ? "isModalOpen" : ""}`}
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
<g
  ref={gridRef}
  className="grid"
  style={{ display: showMap ? "none" : undefined }}
/>
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

      {/* Unclipped vertical branch attached to a selected map-location cluster. */}
      <g
        ref={locationClusterBranchRef}
        className="locationClusterBranchLayer"
        style={{ display: "none" }}
        aria-hidden="true"
      />


      {/* 3) Underfill band beneath the bottom timeline axis (outside clip so it stays visible) */}
      <rect
        className="axisUnderfill"
        x={0}
        y={margin.top + axisY}
        width={width}
        height={margin.bottom}
        rx={0}
        style={{ display: showMap ? "none" : undefined }}
      />

      {/* Axis is outside the clipped region so it always sits on top */}
      <g
        ref={axisRef}
        className="axis"
        style={{ display: showMap ? "none" : undefined }}
      />
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
        isFolded={isCardFolded}
        setIsFolded={setIsCardFolded}
        connections={textConnectionsForCard}
        onNavigate={handleConnectionNavigate}
        hoveredTimelineTarget={hoveredTimelineTarget}
        onHoverLink={handleCardLinkHover}
        showMap={showMap}
        onShowMapChange={handleShowMapChange}
        mapAvailable={hasMapCoordinates(selectedText)}
        onClose={() => {
          prepareDeselectionCameraAnchor("text", selectedText);
          setSelectedText(null);
          setShowMore(false);
          setCardLinkHoverTarget(null);
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
        isFolded={isCardFolded}
        setIsFolded={setIsCardFolded}
        connections={fatherConnectionsForCard}
        onNavigate={handleConnectionNavigate}
        hoveredTimelineTarget={hoveredTimelineTarget}
        onHoverLink={handleCardLinkHover}
        showMap={showMap}
        onShowMapChange={handleShowMapChange}
        mapAvailable={hasMapCoordinates(selectedFather)}
        onClose={() => {
          prepareDeselectionCameraAnchor("father", selectedFather);
          setSelectedFather(null);
          setShowMore(false);
          setCardLinkHoverTarget(null);
        }}
      />
    )}

    </div>
  </>
);



}