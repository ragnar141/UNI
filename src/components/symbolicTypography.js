/*
 * Symbolic-system typography + card MarkerIcon metadata for TextCard/FatherCard.
 *
 * timeline.jsx does not need to know about either feature. This helper reads the
 * same raw *_texts.json / *_fathers.json datasets, reconstructs timeline.jsx's
 * stable object ids, and exposes:
 *   - typography classes for selected / connected object names
 *   - MarkerIcon props for connected objects
 *
 * Multiple symbolic systems:
 * The FIRST recognized symbolic-system tag wins for typography. Marker icons,
 * however, preserve ALL recognized symbolic-system colors, just like timeline.jsx.
 */

const TYPOGRAPHY_GROUPS = {
  classical: [
    "Mycenaean",
    "Hellenic",
    "Hellenistic",
    "Orphic",
    "Roman",
    "Etruscan",
    "Oscan-Italic",
    "Umbrian",
  ],

  mesopotamian: [
    "Sumerian",
    "Akkadian",
    "Babylonian",
    "Assyrian",
  ],

  levantine: [
    "Canaanite",
    "Phoenician",
    "Aramaic",
    "Yahwistic",
    "Berber",
    "Egyptian",
  ],

  iranian: [
    "Persian",
    "Indo-Iranian",
    "Zoroastrian",
    "Elamite",
    "Achaemenid",
    "Iranian",
    "Islamic",
  ],

  anatolian: [
    "Phrygian",
    "Luwian",
    "Hittite",
    "Hurrian",
    "Lydian",
  ],

  indic: [
    "Indian",
    "Vedic",
    "Brahmanical",
    "Upaniṣadic",
    "Śramaṇa",
    "Buddhist",
    "Tamil",
    "Purāṇic",
    "Yogic",
    "Sāṃkhya",
  ],

  chinese: [
    "Shang–Zhou",
    "Daoism",
    "Confucianism",
    "Bingjia (military strategy)",
    "Fa-jia (Legalism)",
  ],

  lateAntique: [
    "Hermetic",
    "Gnostic",
    "Christian",
  ],
};

/*
 * Mirrors timeline.jsx's SymbolicSystemColorPairs so MarkerIcon can render
 * exactly the same symbolic-system color language without modifying timeline.jsx.
 * Keep this map in sync if a symbolic-system color is changed there later.
 */
const SYMBOLIC_SYSTEM_COLORS = {
  Persian: "#00BFA6",
  "Indo-Iranian": "#2CCB7C",
  Zoroastrian: "#FFA319",
  Elamite: "#2AA6A1",
  Achaemenid: "#008E9B",
  Sumerian: "#000000ff",
  Babylonian: "#1A49D6",
  Assyrian: "#C1121F",
  Canaanite: "#6F2DBD",
  Akkadian: "#10B981",
  Aramaic: "#9E6CFF",
  Yahwistic: "#1E88E5",
  Egyptian: "#E53935",
  Phrygian: "#D22F27",
  Luwian: "#D99C4A",
  Hittite: "#B14D1E",
  Hurrian: "#1F9EDC",
  Lydian: "#D4AF37",
  Mycenaean: "#B36A1B",
  Hellenic: "#0057D9",
  Hellenistic: "#1BB5AC",
  Orphic: "#CDA434",
  Hermetic: "#8EA1B2",
  Gnostic: "#6E3AA6",
  Berber: "#0066CC",
  Phoenician: "#9A1B6A",
  Etruscan: "#C4742C",
  "Oscan-Italic": "#6B8E23",
  Umbrian: "#1E7A3F",
  Christian: "#5E2D91",
  Roman: "#C4002F",
  Islamic: "#006A52",
  Iranian: "#1C39BB",
  Indian: "#2F2A6D",
  Vedic: "#8C1D18",
  Brahmanical: "#5A3E1B",
  Upaniṣadic: "#4B3F72",
  Śramaṇa: "#7A7A7A",
  Buddhist: "#D8A23A",
  Tamil: "#1E4F3A",
  Purāṇic: "#9C1F3B",
  Yogic: "#2E6F95",
  Sāṃkhya: "#3D3A2A",
  "Shang–Zhou": "#6B5B3E",
  Daoism: "#2F7D6A",
  Confucianism: "#2B4C7E",
  "Bingjia (military strategy)": "#3A4A5A",
  "Fa-jia (Legalism)": "#2E2E38",
};

const normalizeSystem = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\s_–—-]+/g, "-");

const SYSTEM_TO_GROUP = new Map();
for (const [group, systems] of Object.entries(TYPOGRAPHY_GROUPS)) {
  for (const system of systems) {
    SYSTEM_TO_GROUP.set(normalizeSystem(system), group);
  }
}

const SYSTEM_TO_COLOR = new Map(
  Object.entries(SYMBOLIC_SYSTEM_COLORS).map(([system, color]) => [
    normalizeSystem(system),
    color,
  ])
);

function splitSystems(raw) {
  return String(raw || "")
    .split(/[;,|]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part !== "-" && part !== "—");
}

function pickSystemColors(rawSystems) {
  const seen = new Set();
  const colors = [];

  for (const tag of splitSystems(rawSystems)) {
    const color = SYSTEM_TO_COLOR.get(normalizeSystem(tag));
    if (!color || seen.has(color)) continue;
    seen.add(color);
    colors.push(color);
  }

  return colors;
}

export function getTypographyGroupForSystems(rawSystems) {
  for (const tag of splitSystems(rawSystems)) {
    const group = SYSTEM_TO_GROUP.get(normalizeSystem(tag));
    if (group) return group;
  }

  return "literary";
}

export function getTypographyClassForSystems(rawSystems) {
  const group = getTypographyGroupForSystems(rawSystems);
  return `objectFont objectFont--${group}`;
}

function folderOf(path) {
  const match = String(path || "").match(/\/data\/([^/]+)\//);
  return match ? match[1] : null;
}

function getTextDate(row) {
  const value = Number(row?.["Dataviz date"]);
  return Number.isFinite(value) ? value : NaN;
}

function getFatherDate(row) {
  for (const key of ["Dataviz", "Dataviz column", "Dataviz date"]) {
    const value = Number(row?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return NaN;
}

function isYesish(value) {
  const text = String(value || "").trim().toLowerCase();
  return text === "yes" || text === "y" || text === "true" || text === "1";
}

function hasStatusTag(rawTags, wanted) {
  const needle = String(wanted || "").trim().toLowerCase();
  return String(rawTags || "")
    .split(/[;,|]/)
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .includes(needle);
}

const systemByObjectKey = new Map();
const groupsByNameKey = new Map();
const markerByObjectKey = new Map();
const markerCandidatesByNameKey = new Map();

function registerNameGroup(type, name, rawSystems) {
  const cleanName = String(name || "").trim().toLowerCase();
  if (!cleanName) return;

  const group = getTypographyGroupForSystems(rawSystems);
  if (group === "literary") return;

  const key = `${type}:${cleanName}`;
  const groups = groupsByNameKey.get(key) || new Set();
  groups.add(group);
  groupsByNameKey.set(key, groups);
}

function markerSignature(marker) {
  return JSON.stringify({
    type: marker.type,
    color: marker.color,
    colors: marker.colors,
    founding: marker.founding,
    historic: marker.historic,
    concept: marker.concept,
  });
}

function registerMarker(type, id, name, marker) {
  markerByObjectKey.set(`${type}:${id}`, marker);

  const cleanName = String(name || "").trim().toLowerCase();
  if (!cleanName) return;

  const key = `${type}:${cleanName}`;
  const bySignature = markerCandidatesByNameKey.get(key) || new Map();
  bySignature.set(markerSignature(marker), marker);
  markerCandidatesByNameKey.set(key, bySignature);
}

function buildObjectLookups() {
  const textModules =
    import.meta.glob("../data/**/*_texts.json", {
      eager: true,
      import: "default",
    }) || {};

  const fatherModules =
    import.meta.glob("../data/**/*_fathers.json", {
      eager: true,
      import: "default",
    }) || {};

  for (const [path, data] of Object.entries(textModules)) {
    const folder = folderOf(path);
    if (!folder || !Array.isArray(data)) continue;

    const durationId = `${folder}-composite`;

    for (const row of data) {
      const title = String(row?.["Name"] || "").trim();
      const when = getTextDate(row);
      if (!title || !Number.isFinite(when)) continue;

      const rawSystems = String(row?.["Symbolic System Tags"] || "").trim();
      const id = `${durationId}__text__${title}__${when}`;
      const colors = pickSystemColors(rawSystems);

      systemByObjectKey.set(`text:${id}`, rawSystems);
      registerNameGroup("text", title, rawSystems);
      registerMarker("text", id, title, {
        type: "text",
        color: colors[0] || "#666",
        colors,
        founding: false,
        historic: false,
        concept: false,
      });
    }
  }

  for (const [path, data] of Object.entries(fatherModules)) {
    const folder = folderOf(path);
    if (!folder || !Array.isArray(data)) continue;

    const durationId = `${folder}-composite`;

    for (const row of data) {
      const name = String(row?.["Name"] || "").trim();
      const when = getFatherDate(row);
      if (!name || !Number.isFinite(when)) continue;

      const rawSystems = String(
        row?.["Symbolic System"] || row?.["Symbolic System Tags"] || ""
      ).trim();
      const historicMythicStatusTags = String(
        row?.["Historic-Mythic Status Tags"] || ""
      ).trim();
      const foundingFigure = String(row?.["Founding Figure?"] || "").trim();
      const id = `${durationId}__father__${name}__${when}`;
      const colors = pickSystemColors(rawSystems);

      systemByObjectKey.set(`father:${id}`, rawSystems);
      registerNameGroup("father", name, rawSystems);
      registerMarker("father", id, name, {
        type: "father",
        color: colors[0] || "#666",
        colors,
        founding: isYesish(foundingFigure),
        historic: hasStatusTag(historicMythicStatusTags, "historic"),
        concept: hasStatusTag(historicMythicStatusTags, "concept"),
      });
    }
  }
}

buildObjectLookups();

function normalizeTargetType(rawType) {
  const type = String(rawType || "").trim().toLowerCase();
  return type === "figure" ? "father" : type;
}

export function getTypographyClassForTarget(target) {
  const type = normalizeTargetType(target?.type);
  const id = String(target?.id ?? "").trim();

  if ((type === "text" || type === "father") && id) {
    const rawSystems = systemByObjectKey.get(`${type}:${id}`);
    if (rawSystems != null) {
      return getTypographyClassForSystems(rawSystems);
    }
  }

  // Safety fallback: only use name lookup when every object with that same
  // type/name resolves to the same typography group. Ambiguous names fall back
  // to the neutral literary family instead of guessing.
  const name = String(target?.name || "").trim().toLowerCase();
  const nameGroups = groupsByNameKey.get(`${type}:${name}`);

  if (nameGroups?.size === 1) {
    const [group] = Array.from(nameGroups);
    return `objectFont objectFont--${group}`;
  }

  return "objectFont objectFont--literary";
}

export function getMarkerPropsForTarget(target) {
  const type = normalizeTargetType(target?.type);
  const id = String(target?.id ?? "").trim();

  if ((type === "text" || type === "father") && id) {
    const exact = markerByObjectKey.get(`${type}:${id}`);
    if (exact) return exact;
  }

  // Same conservative fallback rule as typography: only use the name when all
  // objects sharing that type/name also share identical MarkerIcon metadata.
  const name = String(target?.name || "").trim().toLowerCase();
  const candidates = markerCandidatesByNameKey.get(`${type}:${name}`);

  if (candidates?.size === 1) {
    return Array.from(candidates.values())[0];
  }

  return {
    type: type === "father" ? "father" : "text",
    color: "#666",
    colors: ["#666"],
    founding: false,
    historic: false,
    concept: false,
  };
}
