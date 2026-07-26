/*
 * Map-specific historical context derived from durations.json and editorial
 * map review. durations.json remains read-only: this module interprets it but
 * does not alter its records.
 */

export const CIVILIZATIONAL_ARCS = {
  egyptian: { id: "egyptian", label: "Egyptian", color: "#E53935" },
  mesopotamian: { id: "mesopotamian", label: "Mesopotamian", color: "#1E5BFF" },
  anatolian: { id: "anatolian", label: "Anatolian", color: "#E86A0C" },
  levantine: { id: "levantine", label: "Levantine", color: "#7C4DFF" },
  persian: { id: "persian", label: "Persian / Iranian", color: "#00BFA6" },
  greek: { id: "greek", label: "Greek / Hellenistic", color: "#0095FF" },
  northAfrican: { id: "northAfrican", label: "North African / Punic", color: "#8E2BC0" },
  roman: { id: "roman", label: "Roman / Italic", color: "#C4002F" },
  indian: { id: "indian", label: "Indian", color: "#2F2A6D" },
  chinese: { id: "chinese", label: "Chinese", color: "#A33A2B" },
};

const COLOR_TO_ARC = Object.values(CIVILIZATIONAL_ARCS).reduce(
  (result, arc) => ({ ...result, [arc.color.toUpperCase()]: arc.id }),
  {}
);

/* The yRel values are the canonical geographical lanes in durations.json. */
export const DURATION_LANES = {
  italic: { yRel: 0.18, defaultArcId: "roman" },
  northAfrican: { yRel: 0.241, defaultArcId: "northAfrican" },
  greek: { yRel: 0.272, defaultArcId: "greek" },
  anatolian: { yRel: 0.333, defaultArcId: "anatolian" },
  egyptian: { yRel: 0.354, defaultArcId: "egyptian" },
  levantine: { yRel: 0.415, defaultArcId: "levantine" },
  mesopotamian: { yRel: 0.456, defaultArcId: "mesopotamian" },
  persian: { yRel: 0.537, defaultArcId: "persian" },
  indian: { yRel: 0.717, defaultArcId: "indian" },
  chinese: { yRel: 0.778, defaultArcId: "chinese" },
};

function readYear(value) {
  if (value == null || String(value).trim() === "") return null;
  const year = Number(value);
  return Number.isFinite(year) ? year : null;
}

function containsYear(start, end, year) {
  const from = readYear(start);
  const to = readYear(end);

  if (from !== null && year < from) return false;
  if (to !== null && year >= to) return false;
  return true;
}

function findLaneId(record) {
  const yRel = Number(record?.yRel);
  if (!Number.isFinite(yRel)) return null;

  return (
    Object.entries(DURATION_LANES).find(
      ([, lane]) => Math.abs(lane.yRel - yRel) < 0.0005
    )?.[0] || null
  );
}

export function getActiveDurationContexts(durations, rawYear) {
  const year = readYear(rawYear);
  if (year === null || !Array.isArray(durations)) return [];

  return durations.flatMap((record) => {
    const laneId = findLaneId(record);
    if (!laneId) return [];

    const activeSegment = Array.isArray(record.segments)
      ? record.segments.find((segment) =>
          containsYear(segment.start, segment.end, year)
        )
      : null;

    if (!activeSegment) return [];

    return [
      {
        recordId: record.id,
        laneId,
        arcId:
          COLOR_TO_ARC[String(record.color || "").toUpperCase()] ||
          DURATION_LANES[laneId].defaultArcId,
        color: record.color,
        name: record.name,
        expandedName: record["expanded name"],
        segmentLabel: activeSegment.label,
        segmentStart: activeSegment.start,
        segmentEnd: activeSegment.end,
      },
    ];
  });
}

/*
 * Map-only bridges for chronological gaps that are intentionally still absent
 * from durations.json. These do not mutate or pretend to update that file.
 */
const MAP_LANE_FALLBACKS = {
  italic: [
    { from: 395, to: 476, arcId: "roman", label: "Western Roman Empire" },
  ],
  northAfrican: [
    { from: 395, to: 439, arcId: "roman", label: "Roman North Africa" },
    { from: 439, to: 534, arcId: "northAfrican", label: "Vandal Kingdom" },
  ],
  greek: [
    { from: 395, to: 650, arcId: "roman", label: "Eastern Roman provinces" },
  ],
  anatolian: [
    { from: 395, to: 650, arcId: "roman", label: "Eastern Roman Empire" },
  ],
  egyptian: [
    { from: 395, to: 650, arcId: "roman", label: "Eastern Roman Egypt" },
  ],
  levantine: [
    { from: 395, to: 650, arcId: "roman", label: "Eastern Roman Levant" },
  ],
  chinese: [
    { from: 420, to: 550, arcId: "chinese", label: "Northern and Southern Dynasties" },
  ],
  persian: [
    { from: -247, to: 224, arcId: "persian", label: "Parthian / Arsacid Iran" },
    { from: 224, to: 651, arcId: "persian", label: "Sasanian Iran" },
  ],
  mesopotamian: [
    { from: -141, to: 224, arcId: "persian", label: "Parthian Mesopotamia" },
    { from: 224, to: 651, arcId: "persian", label: "Sasanian Mesopotamia" },
  ],
};

export function getActiveLaneContext(laneId, contexts, rawYear) {
  const direct = Array.isArray(contexts)
    ? contexts.find((context) => context.laneId === laneId)
    : null;

  if (direct) return direct;

  const year = readYear(rawYear);
  if (year === null) return null;

  const fallback = MAP_LANE_FALLBACKS[laneId]?.find((item) =>
    containsYear(item.from, item.to, year)
  );

  return fallback
    ? {
        laneId,
        arcId: fallback.arcId,
        color: CIVILIZATIONAL_ARCS[fallback.arcId]?.color,
        segmentLabel: fallback.label,
        mapOnlyFallback: true,
      }
    : null;
}

const ARC_NAME_PATTERNS = [
  {
    arcId: "roman",
    pattern:
      /\b(roman|rome|etrusc|latin|italic|ostrogoth|visigoth|western roman|eastern roman|byzantine)\b/i,
  },
  {
    arcId: "greek",
    pattern:
      /\b(greek|hellen|macedon|ptolema|seleucid|athens|sparta|corinth|thebes|achaean|aetolian|ionia|greco[- ]bactrian|antigonid|pergamon|attalid)\b/i,
  },
  {
    arcId: "persian",
    pattern:
      /\b(elam|median|media|persia|persian|achaemenid|parthia|parthian|arsacid|sasanian|sassanid|persis)\b/i,
  },
  {
    arcId: "egyptian",
    pattern: /\b(egypt|egyptian|saite|hyksos|nubia|kush|kushite|meroe|napata)\b/i,
  },
  {
    arcId: "mesopotamian",
    pattern:
      /\b(sumer|sumerian|akkad|akkadian|babylon|babylonian|assyria|assyrian|ur iii|isin|larsa|kassite|chaldean|mesopotamia)\b/i,
  },
  {
    arcId: "anatolian",
    pattern:
      /\b(hittite|hatti|luwian|phrygia|phrygian|lydia|lydian|urartu|urartian|caria|lycia|cilicia|bithynia|cappadocia|pontus|anatolia)\b/i,
  },
  {
    arcId: "levantine",
    pattern:
      /\b(canaan|canaanite|phoenicia|phoenician|israel|israelite|judah|judea|judaea|aram|aramaean|aramean|edom|moab|ammon|nabat|saba|sabaean|levant|ugarit)\b/i,
  },
  {
    arcId: "northAfrican",
    pattern:
      /\b(carthage|carthaginian|punic|numidia|numidian|mauretania|mauretanian|libyan|berber|gaetuli)\b/i,
  },
  {
    arcId: "indian",
    pattern:
      /\b(indus|harappan|vedic|india|indian|magadha|nanda|maurya|mauryan|shunga|satavahana|kushan|gupta|gandhara|kalinga|chola|chera|pandya|vajji|kosala|avanti)\b/i,
  },
  {
    arcId: "chinese",
    pattern:
      /\b(china|chinese|xia|shang|zhou|qin|han|chu|qi|zhao|wei|yan|jin|wu|shu|northern wei|liu song|xiongnu|warring states)\b/i,
  },
];

export function getArcIdForHistoricalName(name) {
  const value = String(name || "");
  return ARC_NAME_PATTERNS.find((entry) => entry.pattern.test(value))?.arcId || null;
}

/* Core geography only. Large imperial polygons are classified by name first. */
export function getGeographicLaneId(longitude, latitude) {
  const lon = Number(longitude);
  const lat = Number(latitude);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;

  if (lon >= 92 && lon <= 126 && lat >= 18 && lat <= 46) return "chinese";
  if (lon >= 66 && lon <= 93 && lat >= 5 && lat <= 37) return "indian";
  if (lon >= 45 && lon <= 72 && lat >= 24 && lat <= 43) return "persian";
  if (lon >= 40 && lon <= 50 && lat >= 28 && lat <= 38) return "mesopotamian";
  if (lon >= 33 && lon <= 41 && lat >= 27 && lat <= 38) return "levantine";
  if (lon >= 24 && lon <= 36 && lat >= 20 && lat <= 32) return "egyptian";
  if (lon >= 26 && lon <= 43 && lat >= 35 && lat <= 43.5) return "anatolian";
  if (lon >= 18 && lon <= 30 && lat >= 34 && lat <= 43) return "greek";
  if (lon >= 5 && lon <= 20 && lat >= 36 && lat <= 48) return "italic";
  if (lon >= -12 && lon <= 26 && lat >= 20 && lat <= 38) return "northAfrican";
  return null;
}

export function getFeatureArcId({ name, longitude, latitude, contexts, year }) {
  const namedArc = getArcIdForHistoricalName(name);
  if (namedArc) return namedArc;

  const laneId = getGeographicLaneId(longitude, latitude);
  if (!laneId) return null;

  return (
    getActiveLaneContext(laneId, contexts, year)?.arcId ||
    DURATION_LANES[laneId]?.defaultArcId ||
    null
  );
}

export function colorWithAlpha(hex, alpha) {
  const normalized = String(hex || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export const MAP_REGION_LABELS = [
  { id: "north-africa", name: "NORTH AFRICA", longitude: 9, latitude: 29.5, laneId: "northAfrican", tier: "macro" },
  { id: "italic-world", name: "ITALIC WORLD", longitude: 12.5, latitude: 43.4, laneId: "italic", tier: "macro" },
  { id: "aegean-world", name: "AEGEAN WORLD", longitude: 23.7, latitude: 38.3, laneId: "greek", tier: "macro" },
  { id: "anatolia", name: "ANATOLIA", longitude: 34.5, latitude: 39.3, laneId: "anatolian", tier: "macro" },
  { id: "nile-valley", name: "NILE VALLEY", longitude: 31.0, latitude: 26.7, laneId: "egyptian", tier: "macro" },
  { id: "levant", name: "LEVANT", longitude: 36.1, latitude: 33.4, laneId: "levantine", tier: "macro" },
  { id: "mesopotamia", name: "MESOPOTAMIA", longitude: 44.7, latitude: 33.5, laneId: "mesopotamian", tier: "macro" },
  { id: "iranian-plateau", name: "IRANIAN PLATEAU", longitude: 55.3, latitude: 32.3, laneId: "persian", tier: "macro" },
  { id: "central-asia", name: "CENTRAL ASIA", longitude: 67.2, latitude: 40.0, laneId: "persian", tier: "macro" },
  { id: "indian-subcontinent", name: "INDIAN SUBCONTINENT", longitude: 78.5, latitude: 21.6, laneId: "indian", tier: "macro" },
  { id: "north-china-plain", name: "NORTH CHINA PLAIN", longitude: 113.4, latitude: 35.3, laneId: "chinese", tier: "macro" },

  { id: "sicily", name: "Sicily", longitude: 14.0, latitude: 37.4, laneId: "italic", tier: "subregion" },
  { id: "magna-graecia", name: "Magna Graecia", longitude: 16.4, latitude: 39.4, laneId: "greek", tier: "subregion", from: -800, to: -100 },
  { id: "mainland-greece", name: "Mainland Greece", longitude: 22.2, latitude: 39.1, laneId: "greek", tier: "subregion" },
  { id: "crete", name: "Crete", longitude: 25.0, latitude: 35.2, laneId: "greek", tier: "subregion" },
  { id: "ionia", name: "Ionia", longitude: 27.2, latitude: 38.1, laneId: "greek", tier: "subregion", from: -1200, to: 450 },
  { id: "lower-egypt", name: "Lower Egypt", longitude: 30.9, latitude: 30.5, laneId: "egyptian", tier: "subregion" },
  { id: "upper-egypt", name: "Upper Egypt", longitude: 32.5, latitude: 25.8, laneId: "egyptian", tier: "subregion" },
  { id: "nubia", name: "Nubia", longitude: 31.8, latitude: 20.1, laneId: "egyptian", tier: "subregion" },
  { id: "phoenicia", name: "Phoenicia", longitude: 35.5, latitude: 34.0, laneId: "levantine", tier: "subregion", from: -1500, to: -64 },
  { id: "judea", name: "Judea", longitude: 35.1, latitude: 31.7, laneId: "levantine", tier: "subregion", from: -1000, to: 450 },
  { id: "syria", name: "Syria", longitude: 37.2, latitude: 35.0, laneId: "levantine", tier: "subregion", from: -2000, to: 450 },
  { id: "sumer", name: "Sumer", longitude: 45.7, latitude: 31.3, laneId: "mesopotamian", tier: "subregion", from: -4000, to: -1750 },
  { id: "babylonia", name: "Babylonia", longitude: 44.8, latitude: 32.5, laneId: "mesopotamian", tier: "subregion", from: -2000, to: 300 },
  { id: "assyria", name: "Assyria", longitude: 43.4, latitude: 35.7, laneId: "mesopotamian", tier: "subregion", from: -2200, to: -600 },
  { id: "susiana", name: "Susiana", longitude: 48.4, latitude: 32.1, laneId: "persian", tier: "subregion", from: -5000, to: 450 },
  { id: "persis", name: "Persis", longitude: 52.8, latitude: 29.8, laneId: "persian", tier: "subregion", from: -800, to: 450 },
  { id: "media", name: "Media", longitude: 48.8, latitude: 35.0, laneId: "persian", tier: "subregion", from: -900, to: 450 },
  { id: "parthia", name: "Parthia", longitude: 57.3, latitude: 36.4, laneId: "persian", tier: "subregion", from: -300, to: 224 },
  { id: "bactria", name: "Bactria", longitude: 66.8, latitude: 36.7, laneId: "persian", tier: "subregion", from: -1200, to: 450 },
  { id: "gandhara", name: "Gandhāra", longitude: 71.9, latitude: 33.8, laneId: "indian", tier: "subregion", from: -1100, to: 450 },
  { id: "sapta-sindhu", name: "Sapta Sindhu", longitude: 73.7, latitude: 31.4, laneId: "indian", tier: "subregion", from: -1700, to: -800 },
  { id: "kuru-pancala", name: "Kuru–Pañcāla", longitude: 77.4, latitude: 29.2, laneId: "indian", tier: "subregion", from: -1200, to: -300 },
  { id: "magadha", name: "Magadha", longitude: 85.3, latitude: 25.3, laneId: "indian", tier: "subregion", from: -700, to: 550 },
  { id: "tamilakam", name: "Tamilakam", longitude: 78.7, latitude: 10.8, laneId: "indian", tier: "subregion", from: -500, to: 550 },
  { id: "yellow-river", name: "Yellow River heartland", longitude: 112.3, latitude: 35.2, laneId: "chinese", tier: "subregion" },
  { id: "wei-river", name: "Wei River valley", longitude: 108.7, latitude: 34.4, laneId: "chinese", tier: "subregion", from: -1200, to: 450 },
  { id: "lower-yangtze", name: "Lower Yangtze", longitude: 119.0, latitude: 31.2, laneId: "chinese", tier: "subregion", from: -800, to: 450 },
];

/*
 * Mandatory labels ensure essential world-scale polities never disappear due
 * to missing source names, fragmented polygons, poor centroids, or collision
 * filtering. Dates are broad overview-map ranges.
 */
export const EDITORIAL_POLITY_LABELS = [
  { id: "predynastic-egypt", name: "Predynastic Egypt", longitude: 31.1, latitude: 26.7, from: -4100, to: -3100, arcId: "egyptian", tier: "major" },
  { id: "uruk-network", name: "Uruk city-state network", longitude: 45.5, latitude: 32.0, from: -3700, to: -2900, arcId: "mesopotamian", tier: "major" },
  { id: "proto-elamite", name: "Proto-Elamite centers", longitude: 51.0, latitude: 30.8, from: -3100, to: -2700, arcId: "persian", tier: "regional" },
  { id: "early-harappan", name: "Early Harappan centers", longitude: 71.5, latitude: 28.8, from: -3300, to: -2600, arcId: "indian", tier: "major" },
  { id: "old-kingdom", name: "Old Kingdom Egypt", longitude: 30.8, latitude: 27.4, from: -2686, to: -2181, arcId: "egyptian", tier: "major" },
  { id: "sumerian-city-states", name: "Sumerian city-states", longitude: 45.7, latitude: 31.5, from: -2900, to: -2334, arcId: "mesopotamian", tier: "major" },
  { id: "akkadian-empire", name: "Akkadian Empire", longitude: 44.7, latitude: 33.0, from: -2334, to: -2154, arcId: "mesopotamian", tier: "major" },
  { id: "ur-iii", name: "Ur III state", longitude: 45.6, latitude: 31.0, from: -2112, to: -2004, arcId: "mesopotamian", tier: "major" },
  { id: "indus-civilization", name: "Indus Valley Civilization", longitude: 70.7, latitude: 27.5, from: -2600, to: -1900, arcId: "indian", tier: "major" },
  { id: "middle-kingdom-egypt", name: "Middle Kingdom Egypt", longitude: 31.2, latitude: 26.9, from: -2055, to: -1650, arcId: "egyptian", tier: "major" },
  { id: "old-babylonian", name: "Old Babylonian kingdoms", longitude: 44.8, latitude: 32.5, from: -2004, to: -1595, arcId: "mesopotamian", tier: "major" },
  { id: "minoans", name: "Minoan Crete", longitude: 25.0, latitude: 35.2, from: -2100, to: -1450, arcId: "greek", tier: "regional" },
  { id: "hyksos-egypt", name: "Hyksos Lower Egypt", longitude: 31.5, latitude: 30.5, from: -1650, to: -1550, arcId: "levantine", tier: "regional" },
  { id: "hittite-kingdom", name: "Hittite Kingdom", longitude: 34.7, latitude: 39.5, from: -1650, to: -1200, arcId: "anatolian", tier: "major" },
  { id: "new-kingdom-egypt", name: "New Kingdom Egypt", longitude: 31.1, latitude: 26.5, from: -1550, to: -1069, arcId: "egyptian", tier: "major" },
  { id: "mycenaean-kingdoms", name: "Mycenaean kingdoms", longitude: 22.7, latitude: 37.6, from: -1600, to: -1100, arcId: "greek", tier: "major" },
  { id: "shang", name: "Shang realm", longitude: 113.5, latitude: 35.6, from: -1600, to: -1046, arcId: "chinese", tier: "major" },
  { id: "middle-assyrian", name: "Middle Assyrian state", longitude: 43.7, latitude: 35.2, from: -1400, to: -912, arcId: "mesopotamian", tier: "regional" },
  { id: "western-zhou", name: "Western Zhou", longitude: 108.7, latitude: 34.4, from: -1046, to: -771, arcId: "chinese", tier: "major" },
  { id: "neo-assyrian", name: "Neo-Assyrian Empire", longitude: 43.8, latitude: 35.0, from: -911, to: -609, arcId: "mesopotamian", tier: "major" },
  { id: "urartu", name: "Kingdom of Urartu", longitude: 44.7, latitude: 39.1, from: -860, to: -590, arcId: "anatolian", tier: "regional" },
  { id: "phrygia", name: "Phrygian Kingdom", longitude: 31.7, latitude: 39.5, from: -900, to: -695, arcId: "anatolian", tier: "regional" },
  { id: "israel", name: "Kingdom of Israel", longitude: 35.2, latitude: 32.3, from: -930, to: -722, arcId: "levantine", tier: "regional" },
  { id: "judah", name: "Kingdom of Judah", longitude: 35.1, latitude: 31.7, from: -930, to: -586, arcId: "levantine", tier: "regional" },
  { id: "neo-babylonian", name: "Neo-Babylonian Empire", longitude: 44.6, latitude: 32.7, from: -626, to: -539, arcId: "mesopotamian", tier: "major" },
  { id: "lydia", name: "Kingdom of Lydia", longitude: 28.2, latitude: 38.8, from: -700, to: -546, arcId: "anatolian", tier: "regional" },
  { id: "median", name: "Median realm", longitude: 48.8, latitude: 35.0, from: -700, to: -550, arcId: "persian", tier: "regional" },
  { id: "saite-egypt", name: "Saite Egypt", longitude: 30.8, latitude: 29.5, from: -664, to: -525, arcId: "egyptian", tier: "regional" },
  { id: "achaemenid", name: "Achaemenid Empire", longitude: 51.5, latitude: 32.7, from: -550, to: -330, arcId: "persian", tier: "major" },
  { id: "carthaginian", name: "Carthaginian sphere", longitude: 9.5, latitude: 35.0, from: -650, to: -146, arcId: "northAfrican", tier: "major" },
  { id: "greek-poleis", name: "Greek poleis", longitude: 22.9, latitude: 38.3, from: -800, to: -338, arcId: "greek", tier: "major" },
  { id: "mahajanapadas", name: "Mahājanapadas", longitude: 81.2, latitude: 26.3, from: -600, to: -322, arcId: "indian", tier: "major" },
  { id: "warring-states", name: "Warring States", longitude: 113.3, latitude: 34.8, from: -476, to: -221, arcId: "chinese", tier: "major" },
  { id: "macedonian", name: "Macedonian Empire", longitude: 52.0, latitude: 31.7, from: -336, to: -323, arcId: "greek", tier: "major" },
  { id: "ptolemaic", name: "Ptolemaic Kingdom", longitude: 30.8, latitude: 27.4, from: -323, to: -30, arcId: "greek", tier: "major" },
  { id: "seleucid", name: "Seleucid Empire", longitude: 52.0, latitude: 34.0, from: -312, to: -141, arcId: "greek", tier: "major" },
  { id: "antigonid", name: "Antigonid Macedon", longitude: 22.5, latitude: 40.2, from: -294, to: -168, arcId: "greek", tier: "regional" },
  { id: "maurya", name: "Maurya Empire", longitude: 79.5, latitude: 24.0, from: -322, to: -185, arcId: "indian", tier: "major" },
  { id: "qin", name: "Qin Empire", longitude: 108.8, latitude: 34.3, from: -221, to: -206, arcId: "chinese", tier: "major" },
  { id: "roman-republic", name: "Roman Republic", longitude: 13.0, latitude: 41.5, from: -509, to: -27, arcId: "roman", tier: "major" },
  { id: "han", name: "Han Empire", longitude: 109.8, latitude: 34.2, from: -206, to: 220, arcId: "chinese", tier: "major" },
  { id: "parthian", name: "Parthian Empire", longitude: 54.0, latitude: 34.0, from: -141, to: 224, arcId: "persian", tier: "major" },
  { id: "roman-empire", name: "Roman Empire", longitude: 18.5, latitude: 41.5, from: -27, to: 395, arcId: "roman", tier: "major" },
  { id: "satavahana", name: "Satavahana realm", longitude: 78.0, latitude: 18.5, from: -100, to: 250, arcId: "indian", tier: "regional" },
  { id: "kushan", name: "Kushan Empire", longitude: 70.5, latitude: 34.0, from: 30, to: 375, arcId: "indian", tier: "major" },
  { id: "aksum", name: "Kingdom of Aksum", longitude: 38.5, latitude: 14.5, from: 100, to: 450, arcId: "egyptian", tier: "regional" },
  { id: "sasanian", name: "Sasanian Empire", longitude: 53.0, latitude: 33.5, from: 224, to: 651, arcId: "persian", tier: "major" },
  { id: "three-kingdoms", name: "Three Kingdoms", longitude: 112.0, latitude: 31.5, from: 220, to: 280, arcId: "chinese", tier: "major" },
  { id: "jin-china", name: "Jin China", longitude: 112.0, latitude: 33.5, from: 280, to: 420, arcId: "chinese", tier: "major" },
  { id: "gupta", name: "Gupta Empire", longitude: 80.0, latitude: 25.2, from: 320, to: 550, arcId: "indian", tier: "major" },
  { id: "eastern-roman", name: "Eastern Roman Empire", longitude: 29.5, latitude: 40.0, from: 395, to: 650, arcId: "roman", tier: "major" },
  { id: "western-roman", name: "Western Roman Empire", longitude: 11.5, latitude: 43.0, from: 395, to: 476, arcId: "roman", tier: "major" },
  { id: "northern-wei", name: "Northern Wei", longitude: 112.0, latitude: 38.0, from: 386, to: 535, arcId: "chinese", tier: "regional" },
  { id: "liu-song", name: "Liu Song", longitude: 117.0, latitude: 29.5, from: 420, to: 479, arcId: "chinese", tier: "regional" },
  { id: "hunnic", name: "Hunnic Empire", longitude: 22.0, latitude: 48.0, from: 434, to: 453, arcId: null, tier: "regional" },
  { id: "vandal", name: "Vandal Kingdom", longitude: 9.8, latitude: 35.5, from: 439, to: 534, arcId: "northAfrican", tier: "regional" },
  { id: "visigothic", name: "Visigothic Kingdom", longitude: 2.0, latitude: 44.5, from: 418, to: 507, arcId: "roman", tier: "regional" },
];

export function isMapContextActive(item, rawYear) {
  const year = readYear(rawYear);
  if (year === null) return false;
  return containsYear(item?.from, item?.to, year);
}

export function getArcColor(arcId) {
  return CIVILIZATIONAL_ARCS[arcId]?.color || null;
}
