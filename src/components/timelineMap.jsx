import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as d3 from "d3";
import { feature, mesh } from "topojson-client";
import countries50m from "world-atlas/countries-50m.json";
import {
  formatHistoricalYear,
  getHistoricalSnapshotForYear,
} from "../data/historicalMapCatalog";
import DURATIONS from "../data/durations.json";
import {
  DURATION_LANES,
  EDITORIAL_POLITY_LABELS,
  MAP_REGION_LABELS,
  getActiveDurationContexts,
  getActiveLaneContext,
  getArcColor,
  getFeatureArcId,
  getGeographicLaneId,
  isMapContextActive,
} from "../data/historicalMapContext";
import {
  getHistoricalPlaceRecords,
  getValidationAnchors,
  matchFeaturePolity,
} from "../data/historicalRegistry";
import "../styles/timelineMap.css";

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 600;
const MAP_PADDING = 18;

/* Map camera controls. */
const MIN_MAP_SCALE = 1;
const MAX_MAP_SCALE = 40;

/*
 * Map View opens at its maximum camera zoom. The selected geographic point is
 * translated back under the exact browser pixel occupied by the chronological
 * pin, so changing views does not move the selected object.
 */
const INITIAL_MAP_SCALE = MAX_MAP_SCALE;

/*
 * Continuous duration-linked civilization fill controls.
 *
 * The arc tint stays at full outer-map strength through outerHoldUntil,
 * then fades smoothly to middleOpacity by middleEnd and to deepOpacity by
 * deepEnd. Using a live interpolated opacity avoids class-boundary flicker.
 */
const CIVILIZATION_FILL = {
  outerHoldUntil: 5.5,
  middleEnd: 12,
  deepEnd: 24,
  outerOpacity: 0.10,
  middleOpacity: 0.055,
  deepOpacity: 0.008,
};

/*
 * Safe deep-zoom civilization-border treatment.
 *
 * This does not generate or clip any new geography. It only makes the existing
 * historical path progressively fades away as the camera enters the deepest
 * zoom range. At zoom 24 and above no duration-linked colored border remains.
 * Because the same already-rendered SVG paths stay mounted, drag and zoom
 * performance remain equivalent to the current stable map.
 */
const CIVILIZATION_BORDER = {
  startZoom: 14,
  fullZoom: 24,
  outer: {
    polityStrokeWidth: 2.6,
    regionStrokeWidth: 2.35,
    contextStrokeWidth: 1.9,
    polityUnderstrokeWidth: 3.4,
    regionUnderstrokeWidth: 3.0,
    contextUnderstrokeWidth: 2.4,
    polityStrokeOpacity: 0.50,
    regionStrokeOpacity: 0.54,
    contextStrokeOpacity: 0.44,
    polityUnderstrokeOpacity: 0.22,
    regionUnderstrokeOpacity: 0.17,
    contextUnderstrokeOpacity: 0.12,
    precision1Opacity: 0.50,
    precision2Opacity: 0.55,
    precision3Opacity: 0.60,
  },
  deep: {
    /*
     * At zoom 24 and deeper, duration-linked civilization outlines are fully
     * invisible. The paths remain mounted, so this adds no geometry work and
     * does not alter panning/zooming performance.
     */
    polityStrokeWidth: 0.95,
    regionStrokeWidth: 0.85,
    contextStrokeWidth: 0.72,
    polityUnderstrokeWidth: 1.35,
    regionUnderstrokeWidth: 1.2,
    contextUnderstrokeWidth: 1.0,
    polityStrokeOpacity: 0,
    regionStrokeOpacity: 0,
    contextStrokeOpacity: 0,
    polityUnderstrokeOpacity: 0,
    regionUnderstrokeOpacity: 0,
    contextUnderstrokeOpacity: 0,
    precision1Opacity: 0,
    precision2Opacity: 0,
    precision3Opacity: 0,
  },
};

/*
 * Historical layer controls.
 *
 * SHOW_CONTEXT_REGIONS:
 *   true  = render non-polity cultural/ethnographic regions faintly
 *   false = render only features classified as likely polities
 *
 * The source dataset mixes political and cultural regions. Keeping this
 * switch explicit prevents the rendering code from silently presenting every
 * polygon as a modern-style state.
 */
const SHOW_CONTEXT_REGIONS = true;

/*
 * Historical polygon/polity label visibility windows.
 *
 * Each tier now has both a minimum and a maximum camera zoom. The windows
 * overlap slightly so the map does not become empty while one level hands off
 * to the next. Increase a max value to keep that broad tier visible longer;
 * decrease it to make the deep map quieter.
 */
const HISTORICAL_LABEL_ZOOM_RANGE = {
  major: { min: 1, max: 5.5 },
  regional: { min: 3.5, max: 12 },
  local: { min: 8, max: 20 },
};

/* Projected-area thresholds used to classify large and small labels. */
const HISTORICAL_MAJOR_AREA_PX2 = 2500;
const HISTORICAL_REGIONAL_AREA_PX2 = 430;

/* Maximum labels retained after collision filtering. */
const HISTORICAL_LABEL_LIMIT = 90;

/*
 * Location and geographical-label layers.
 *
 * The 354-row project registry contains cities, sites, and regional anchors.
 * Each row carries its own minZoom so dense local material only appears when
 * enough space exists.
 */
const HISTORICAL_LOCATION_LABEL_LIMIT = 170;

/*
 * Historical-location label distance from its marker dot, measured in stable
 * screen pixels. These are the main values to tweak.
 *
 * left:  label sits to the LEFT of its dot; larger = farther left
 * right: label sits to the RIGHT of its dot; larger = farther right
 * above: label sits ABOVE its dot; larger = farther upward
 * below: label sits BELOW its dot; larger = farther downward
 *
 * Current values reproduce the original map behavior. Try, for example:
 *   left/right: 9 or 10
 *   above: 12
 *   below: 13
 */
const HISTORICAL_LOCATION_LABEL_DISTANCE = {
  left: 14,
  right: 13,
  above: 15,
  below: 13,
};

/* Broad geographic labels disappear before city-level detail dominates. */
const MAP_REGION_LABEL_ZOOM_RANGE = {
  macro: { min: 1.05, max: 4.5 },
  subregion: { min: 3.2, max: 10 },
};

/*
 * Historical place-label windows. Registry minZoom values are still honored;
 * these ranges add the missing upper boundary and a tier-wide minimum floor.
 * At the opening zoom of 40, only the detail tier remains eligible.
 */
const HISTORICAL_LOCATION_ZOOM_RANGE = {
  world: { min: 1.2, max: 3.8 },
  major: { min: 1.8, max: 7.5 },
  regional: { min: 4, max: 14 },
  local: { min: 7, max: 26 },
  detail: { min: 12, max: Number.POSITIVE_INFINITY },
};

const WORLD_SPHERE = { type: "Sphere" };

const COUNTRY_FEATURES = feature(
  countries50m,
  countries50m.objects.countries
).features;

const COUNTRY_BORDERS = mesh(
  countries50m,
  countries50m.objects.countries,
  (a, b) => a !== b
);

/*
 * Optional local files are automatically preferred over remote loading.
 * Drop files into src/data/historical-maps/ using the catalog filenames.
 */
const LOCAL_HISTORICAL_MAP_LOADERS = import.meta.glob(
  "../data/historical-maps/*.geojson"
);

const historicalMapCache = new Map();

const STRONG_POLITY_PATTERN =
  /\b(empire|kingdom|kingdoms|republic|dynasty|state|states|city[- ]states?|league|confeder(?:acy|ation)|caliphate|khaganate|sultanate|principality|satrapy|realm|commonwealth)\b/i;

const CONTEXT_REGION_PATTERN =
  /\b(hunter|gatherer|forager|farmers?|pastoral|nomads?|tribes?|peoples?|culture|cultures|neolithic|mesolithic|bronze age|iron age|aboriginal|austronesians?|bantu|j[ōo]mon|yayoi|khoisan|saami|guanches|dravidians?|sinic|paleo-|proto-|maize|manioc|rice farmers?|shellfish|fishing peoples?)\b/i;

const EXPLICIT_POLITY_PATTERN =
  /\b(egypt|elam|ur|assyria|babylonia|hittites?|kush|saba|urartu|lydia|media|persia|achaemenid|carthage|rome|roman|macedon|athens|sparta|corinth|qin|han|zhou|chu|zhao|qi|yan|wei|maurya|magadha|nanda|kalinga|gandhara|parthia|seleucid|ptolemaic|bactria|numidia|aksum|axum|sassanid|sasanian|gupta|xiongnu)\b/i;

/* Manual label points can be added when a polygon centroid is unsatisfactory. */
const HISTORICAL_LABEL_OVERRIDES = {
  // "world-500-bce": {
  //   "Achaemenid Empire": { longitude: 52.5, latitude: 31.5, tier: "major" },
  // },
};

function readNumber(value) {
  if (value == null || String(value).trim() === "") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function interpolateLinear(value, start, end, from, to) {
  if (end <= start) return to;
  const t = clamp((value - start) / (end - start), 0, 1);
  return from + (to - from) * t;
}

function getCivilizationFillOpacity(zoom) {
  const z = Number.isFinite(zoom) ? zoom : INITIAL_MAP_SCALE;

  if (z <= CIVILIZATION_FILL.outerHoldUntil) {
    return CIVILIZATION_FILL.outerOpacity;
  }

  if (z <= CIVILIZATION_FILL.middleEnd) {
    return interpolateLinear(
      z,
      CIVILIZATION_FILL.outerHoldUntil,
      CIVILIZATION_FILL.middleEnd,
      CIVILIZATION_FILL.outerOpacity,
      CIVILIZATION_FILL.middleOpacity
    );
  }

  if (z <= CIVILIZATION_FILL.deepEnd) {
    return interpolateLinear(
      z,
      CIVILIZATION_FILL.middleEnd,
      CIVILIZATION_FILL.deepEnd,
      CIVILIZATION_FILL.middleOpacity,
      CIVILIZATION_FILL.deepOpacity
    );
  }

  return CIVILIZATION_FILL.deepOpacity;
}

function getCivilizationBorderVariables(zoom) {
  const z = Number.isFinite(zoom) ? zoom : INITIAL_MAP_SCALE;
  const t = clamp(
    (z - CIVILIZATION_BORDER.startZoom) /
      Math.max(0.001, CIVILIZATION_BORDER.fullZoom - CIVILIZATION_BORDER.startZoom),
    0,
    1
  );

  const mix = (key) =>
    CIVILIZATION_BORDER.outer[key] +
    (CIVILIZATION_BORDER.deep[key] - CIVILIZATION_BORDER.outer[key]) * t;

  return {
    "--civilization-polity-stroke-width": `${mix("polityStrokeWidth")}px`,
    "--civilization-region-stroke-width": `${mix("regionStrokeWidth")}px`,
    "--civilization-context-stroke-width": `${mix("contextStrokeWidth")}px`,
    "--civilization-understroke-width": `${mix("polityUnderstrokeWidth")}px`,
    "--civilization-region-understroke-width": `${mix("regionUnderstrokeWidth")}px`,
    "--civilization-context-understroke-width": `${mix("contextUnderstrokeWidth")}px`,
    "--source-arc-polity-stroke-opacity": mix("polityStrokeOpacity"),
    "--source-arc-region-stroke-opacity": mix("regionStrokeOpacity"),
    "--source-arc-context-stroke-opacity": mix("contextStrokeOpacity"),
    "--source-arc-polity-understroke-opacity": mix("polityUnderstrokeOpacity"),
    "--source-arc-region-understroke-opacity": mix("regionUnderstrokeOpacity"),
    "--source-arc-context-understroke-opacity": mix("contextUnderstrokeOpacity"),
    "--source-arc-precision1-stroke-opacity": mix("precision1Opacity"),
    "--source-arc-precision2-stroke-opacity": mix("precision2Opacity"),
    "--source-arc-precision3-stroke-opacity": mix("precision3Opacity"),
  };
}

function isZoomInRange(zoom, range) {
  if (!range) return false;
  return zoom >= range.min && zoom < range.max;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeName(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateMapLabel(value, maxLength = 42) {
  const text = normalizeName(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function getLocationData(entry) {
  if (!entry) return null;

  const latitude = readNumber(
    entry.Latitude ?? entry.latitude ?? entry.lat
  );

  const longitude = readNumber(
    entry.Longitude ?? entry.longitude ?? entry.lng ?? entry.lon
  );

  if (latitude === null || longitude === null) return null;

  return {
    latitude,
    longitude,
  };
}

function getEntryYear(entry) {
  if (!entry) return null;

  const candidates = [
    entry.when,
    entry["Dataviz date"],
    entry["Dataviz"],
    entry["Dataviz column"],
    entry.year,
    entry.Year,
  ];

  for (const candidate of candidates) {
    const year = readNumber(candidate);
    if (year !== null) return year;
  }

  return null;
}

function getHistoricalFeatureName(rawFeature) {
  const properties = rawFeature?.properties || {};

  return normalizeName(
    properties.NAME ??
      properties.Name ??
      properties.name ??
      properties.LABEL ??
      properties.label
  );
}

function classifyHistoricalEntity(name) {
  if (!name || name === "?" || name === "-") return "empty";
  if (STRONG_POLITY_PATTERN.test(name)) return "polity";
  if (EXPLICIT_POLITY_PATTERN.test(name)) return "polity";
  if (CONTEXT_REGION_PATTERN.test(name)) return "context";
  return "region";
}

function getBorderPrecision(rawFeature) {
  const rawValue = Number(
    rawFeature?.properties?.BORDERPRECISION ??
      rawFeature?.properties?.borderPrecision ??
      1
  );

  return Number.isFinite(rawValue)
    ? clamp(Math.round(rawValue), 1, 3)
    : 1;
}

function getLabelTier(area, kind) {
  if (area >= HISTORICAL_MAJOR_AREA_PX2) return "major";
  if (area >= HISTORICAL_REGIONAL_AREA_PX2) return "regional";

  /* Context regions do not receive dense local labels by default. */
  if (kind === "context") return "regional";
  return "local";
}

async function loadHistoricalSnapshot(snapshot) {
  if (!snapshot) return null;

  const cacheKey = snapshot.file;
  if (historicalMapCache.has(cacheKey)) {
    return historicalMapCache.get(cacheKey);
  }

  const promise = (async () => {
    const localLoader =
      LOCAL_HISTORICAL_MAP_LOADERS[snapshot.localPath];

    if (localLoader) {
      const module = await localLoader();
      return module?.default ?? module;
    }

    const response = await fetch(snapshot.remoteUrl, {
      mode: "cors",
      cache: "force-cache",
    });

    if (!response.ok) {
      throw new Error(
        `Historical map request failed: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  })();

  historicalMapCache.set(cacheKey, promise);

  try {
    return await promise;
  } catch (error) {
    historicalMapCache.delete(cacheKey);
    throw error;
  }
}

function getCollisionDistance(label) {
  const textWidthEstimate = Math.max(56, label.name.length * 6.4);

  if (label.tier === "major") {
    return Math.max(92, textWidthEstimate);
  }

  if (label.tier === "regional") {
    return Math.max(70, textWidthEstimate * 0.82);
  }

  return Math.max(48, textWidthEstimate * 0.65);
}

function isLocationActiveAtYear(location, year) {
  if (!location || !Number.isFinite(year)) return false;

  const from = readNumber(location.from);
  const to = readNumber(location.to);

  if (from !== null && year < from) return false;
  if (to !== null && year > to) return false;

  return true;
}

function estimateLocationLabelWidth(location) {
  const multiplier =
    location.tier === "world"
      ? 7.2
      : location.tier === "major"
        ? 6.8
        : 6.1;
  return Math.max(38, location.name.length * multiplier);
}

function featureContainsCoordinate(rawFeature, longitude, latitude) {
  if (!rawFeature) return false;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return false;

  try {
    return d3.geoContains(rawFeature, [longitude, latitude]);
  } catch {
    return false;
  }
}

function boxesOverlap(a, b, padding = 2) {
  return !(
    a.right + padding < b.left ||
    a.left - padding > b.right ||
    a.bottom + padding < b.top ||
    a.top - padding > b.bottom
  );
}

function hashString(value) {
  let hash = 0;
  const input = String(value || "");

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function getLocationSideOrder(location) {
  const base = ["right", "left", "above", "below"];

  if (location.preferredSide && location.preferredSide !== "auto") {
    return [
      location.preferredSide,
      ...base.filter((side) => side !== location.preferredSide),
    ];
  }

  const offset = hashString(location.id) % base.length;
  return [...base.slice(offset), ...base.slice(0, offset)];
}

function buildLocationLabelPlacement(location, screenX, screenY, side) {
  const width = estimateLocationLabelWidth(location);
  const height =
    location.tier === "world"
      ? 14
      : location.tier === "major"
        ? 13
        : 12;

  const { left, right, above, below } =
    HISTORICAL_LOCATION_LABEL_DISTANCE;

  if (side === "left") {
    return {
      side,
      textX: -left,
      textY: 0,
      textAnchor: "end",
      box: {
        /* Move the collision box together with the rendered label. */
        left: screenX - width - left,
        right: screenX - left + 2,
        top: screenY - height / 2,
        bottom: screenY + height / 2,
      },
    };
  }

  if (side === "above") {
    return {
      side,
      textX: 0,
      textY: -above,
      textAnchor: "middle",
      box: {
        left: screenX - width / 2,
        right: screenX + width / 2,
        /* Preserve the original collision-box proportions as the gap changes. */
        top: screenY - height - above - 1,
        bottom: screenY - above + 4,
      },
    };
  }

  if (side === "below") {
    return {
      side,
      textX: 0,
      textY: below,
      textAnchor: "middle",
      box: {
        left: screenX - width / 2,
        right: screenX + width / 2,
        /* Preserve the original collision-box proportions as the gap changes. */
        top: screenY + below - 5,
        bottom: screenY + height + below - 1,
      },
    };
  }

  return {
    side: "right",
    textX: right,
    textY: 0,
    textAnchor: "start",
    box: {
      /* Move the collision box together with the rendered label. */
      left: screenX + right - 2,
      right: screenX + width + right,
      top: screenY - height / 2,
      bottom: screenY + height / 2,
    },
  };
}

const TimelineMap = forwardRef(function TimelineMap(
  {
    visible = true,
    selectedEntry = null,
    debug = false,
    onProjectionChange = null,
  },
  ref
) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const cameraRef = useRef(null);
  const zoomBehaviorRef = useRef(null);

  const projectionRef = useRef(null);
  const locationRef = useRef(null);
  const visibleRef = useRef(visible);
  const debugRef = useRef(debug);
  const onProjectionChangeRef = useRef(onProjectionChange);

  /* Persistent geographic camera for the entire Map View session. */
  const viewportTransformRef = useRef(d3.zoomIdentity);
  const viewportInitializedRef = useRef(false);

  /*
   * The first rendered map uses fallback dimensions until ResizeObserver has
   * measured the real container. Initializing against that temporary
   * projection makes the selected pin jump on first activation. Camera setup
   * is therefore blocked until a real measurement has arrived.
   */
  const sizeMeasuredRef = useRef(false);
  const initialAnchorClientRef = useRef(null);
  const viewportUserMovedRef = useRef(false);

  const [hasMeasuredSize, setHasMeasuredSize] = useState(false);
  const [size, setSize] = useState({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  });

  /*
   * Keep React's label-detail and inverse-label-size calculations synchronized
   * with the camera before its first visible frame. Starting this state at 1
   * caused a brief large-region-only label frame while the camera was already
   * being initialized at maximum zoom.
   */
  const [viewportScale, setViewportScale] = useState(INITIAL_MAP_SCALE);
  const [historicalGeoJson, setHistoricalGeoJson] = useState(null);
  const [historicalStatus, setHistoricalStatus] = useState("idle");
  const [historicalError, setHistoricalError] = useState("");

  const location = useMemo(
    () => getLocationData(selectedEntry),
    [selectedEntry]
  );

  const selectedYear = useMemo(
    () => getEntryYear(selectedEntry),
    [selectedEntry]
  );

  const activeDurationContexts = useMemo(
    () => getActiveDurationContexts(DURATIONS, selectedYear),
    [selectedYear]
  );

  const selectedLaneId = useMemo(
    () =>
      location
        ? getGeographicLaneId(location.longitude, location.latitude)
        : null,
    [location]
  );

  const selectedLaneContext = useMemo(
    () =>
      selectedLaneId
        ? getActiveLaneContext(
            selectedLaneId,
            activeDurationContexts,
            selectedYear
          )
        : null,
    [selectedLaneId, activeDurationContexts, selectedYear]
  );

  const historicalSnapshot = useMemo(
    () => getHistoricalSnapshotForYear(selectedYear),
    [selectedYear]
  );

  const registryHistoricalLocations = useMemo(
    () => getHistoricalPlaceRecords(selectedYear),
    [selectedYear]
  );

  const validationAnchors = useMemo(
    () => getValidationAnchors(selectedYear),
    [selectedYear]
  );

  const shouldMount = visible && Boolean(location);

  visibleRef.current = visible;
  debugRef.current = debug;
  locationRef.current = location;
  onProjectionChangeRef.current = onProjectionChange;

  useEffect(() => {
    if (!shouldMount) return undefined;

    const element = containerRef.current;
    if (!element) return undefined;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();

      if (rect.width <= 0 || rect.height <= 0) return;

      sizeMeasuredRef.current = true;
      setHasMeasuredSize(true);

      setSize((previous) => {
        if (
          Math.abs(previous.width - rect.width) < 0.25 &&
          Math.abs(previous.height - rect.height) < 0.25
        ) {
          return previous;
        }

        return {
          width: rect.width,
          height: rect.height,
        };
      });
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);

    return () => observer.disconnect();
  }, [shouldMount]);

  useEffect(() => {
    if (!shouldMount || !historicalSnapshot) return undefined;

    let cancelled = false;

    setHistoricalStatus("loading");
    setHistoricalError("");

    loadHistoricalSnapshot(historicalSnapshot)
      .then((geoJson) => {
        if (cancelled) return;
        setHistoricalGeoJson(geoJson);
        setHistoricalStatus("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setHistoricalGeoJson(null);
        setHistoricalStatus("error");
        setHistoricalError(
          error instanceof Error ? error.message : String(error)
        );
      });

    return () => {
      cancelled = true;
    };
  }, [shouldMount, historicalSnapshot]);

  const { width, height } = size;

  const projection = useMemo(() => {
    return d3
      .geoNaturalEarth1()
      .fitExtent(
        [
          [MAP_PADDING, MAP_PADDING],
          [
            Math.max(MAP_PADDING + 1, width - MAP_PADDING),
            Math.max(MAP_PADDING + 1, height - MAP_PADDING),
          ],
        ],
        WORLD_SPHERE
      );
  }, [width, height]);

  projectionRef.current = projection;

  const pathGenerator = useMemo(
    () => d3.geoPath(projection),
    [projection]
  );

  const countryPaths = useMemo(() => {
    return COUNTRY_FEATURES.map((country, index) => ({
      key: `${country.id ?? "country"}-${index}`,
      d: pathGenerator(country) || "",
    }));
  }, [pathGenerator]);

  const spherePath = useMemo(
    () => pathGenerator(WORLD_SPHERE) || "",
    [pathGenerator]
  );

  const borderPath = useMemo(
    () => pathGenerator(COUNTRY_BORDERS) || "",
    [pathGenerator]
  );

  const historicalFeatures = useMemo(() => {
    const rawFeatures = Array.isArray(historicalGeoJson?.features)
      ? historicalGeoJson.features
      : [];

    return rawFeatures
      .map((rawFeature, index) => {
        const name = getHistoricalFeatureName(rawFeature);
        const kind = classifyHistoricalEntity(name);

        if (kind === "empty") return null;
        if (kind === "context" && !SHOW_CONTEXT_REGIONS) return null;

        const d = pathGenerator(rawFeature) || "";
        if (!d) return null;

        const area = Math.abs(pathGenerator.area(rawFeature));
        const centroid = pathGenerator.centroid(rawFeature);
        const geographicCentroid = d3.geoCentroid(rawFeature);
        const precision = getBorderPrecision(rawFeature);

        const matchedPolity = matchFeaturePolity(name, selectedYear);

        const arcId =
          matchedPolity?.arcId ||
          getFeatureArcId({
            name,
            longitude: geographicCentroid?.[0],
            latitude: geographicCentroid?.[1],
            contexts: activeDurationContexts,
            year: selectedYear,
          });

        const arcColor = getArcColor(arcId);

        const matchedPolityId = matchedPolity?.id || null;
        const ownAnchors = matchedPolityId
          ? validationAnchors.filter((anchor) =>
              anchor.affiliations.some(
                (status) => status.polityId === matchedPolityId
              )
            )
          : [];

        const ownAnchorsInside = ownAnchors.filter((anchor) =>
          featureContainsCoordinate(
            rawFeature,
            anchor.longitude,
            anchor.latitude
          )
        );

        const contradictoryAnchors = matchedPolityId
          ? validationAnchors.filter((anchor) => {
              if (!anchor.hasExclusiveAffiliation) return false;

              const belongsToMatchedPolity = anchor.affiliations.some(
                (status) => status.polityId === matchedPolityId
              );

              if (belongsToMatchedPolity) return false;
              if (arcId && anchor.localArcIds.includes(arcId)) return false;

              return featureContainsCoordinate(
                rawFeature,
                anchor.longitude,
                anchor.latitude
              );
            })
          : [];

        const validationState = contradictoryAnchors.length
          ? "contradicted"
          : ownAnchorsInside.length
            ? "validated"
            : matchedPolityId
              ? "unverified"
              : "unmatched";

        return {
          key: `${historicalSnapshot?.id || "historical"}-${name}-${index}`,
          name,
          kind,
          precision,
          area,
          tier: getLabelTier(area, kind),
          d,
          centroid,
          geographicCentroid,
          arcId,
          arcColor,
          strokeColor:
            validationState === "contradicted"
              ? "rgba(50, 50, 50, 0.78)"
              : arcColor || undefined,
          matchedPolityId,
          validationState,
          contradictoryAnchorNames: contradictoryAnchors.map(
            (anchor) => anchor.name
          ),
          partOf: normalizeName(rawFeature?.properties?.PARTOF),
          subject: normalizeName(rawFeature?.properties?.SUBJECTO),
          rawFeature,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const kindRank = { context: 0, region: 1, polity: 2 };
        const rankDifference =
          (kindRank[a.kind] ?? 9) - (kindRank[b.kind] ?? 9);

        return rankDifference || b.area - a.area;
      });
  }, [
    historicalGeoJson,
    historicalSnapshot,
    pathGenerator,
    activeDurationContexts,
    selectedYear,
    validationAnchors,
  ]);

  const historicalLabels = useMemo(() => {
    const overrideSet =
      HISTORICAL_LABEL_OVERRIDES[historicalSnapshot?.id] || {};

    const editorialCandidates = EDITORIAL_POLITY_LABELS
      .filter((item) => isMapContextActive(item, selectedYear))
      .filter((item) =>
        isZoomInRange(
          viewportScale,
          HISTORICAL_LABEL_ZOOM_RANGE[item.tier || "regional"]
        )
      )
      .map((item) => {
        const point = projection([item.longitude, item.latitude]);
        if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
          return null;
        }

        return {
          ...item,
          key: `editorial-${item.id}`,
          x: point[0],
          y: point[1],
          kind: "polity",
          area: Number.POSITIVE_INFINITY,
          arcColor: getArcColor(item.arcId),
          editorial: true,
        };
      })
      .filter(Boolean);

    /* Keep only the largest geometry for duplicate source names. */
    const largestByName = new Map();

    for (const item of historicalFeatures) {
      if (item.validationState === "contradicted") continue;
      if (item.kind === "context" && item.tier === "local") continue;

      const previous = largestByName.get(item.name);
      if (!previous || item.area > previous.area) {
        largestByName.set(item.name, item);
      }
    }

    const editorialNameSet = new Set(
      editorialCandidates.map((item) => item.name.toLocaleLowerCase())
    );

    const automaticCandidates = Array.from(largestByName.values())
      .filter(
        (item) =>
          !editorialNameSet.has(item.name.toLocaleLowerCase())
      )
      .map((item) => {
        const override = overrideSet[item.name];
        let point = item.centroid;

        if (
          override &&
          Number.isFinite(Number(override.longitude)) &&
          Number.isFinite(Number(override.latitude))
        ) {
          point = projection([
            Number(override.longitude),
            Number(override.latitude),
          ]);
        }

        if (
          !Array.isArray(point) ||
          !Number.isFinite(point[0]) ||
          !Number.isFinite(point[1])
        ) {
          return null;
        }

        return {
          ...item,
          x: point[0],
          y: point[1],
          tier: override?.tier || item.tier,
          editorial: false,
        };
      })
      .filter(Boolean)
      .filter((label) =>
        isZoomInRange(
          viewportScale,
          HISTORICAL_LABEL_ZOOM_RANGE[label.tier]
        )
      );

    const tierRank = { major: 0, regional: 1, local: 2 };
    const candidates = [...editorialCandidates, ...automaticCandidates].sort(
      (a, b) => {
        if (a.editorial !== b.editorial) return a.editorial ? -1 : 1;
        const rankDifference =
          (tierRank[a.tier] ?? 9) - (tierRank[b.tier] ?? 9);
        return rankDifference || b.area - a.area;
      }
    );

    const accepted = [];

    for (const candidate of candidates) {
      const requiredDistance = getCollisionDistance(candidate);

      const collides = accepted.some((placed) => {
        const distanceOnScreen =
          Math.hypot(
            candidate.x - placed.x,
            candidate.y - placed.y
          ) * viewportScale;

        const pairDistance = Math.max(
          requiredDistance,
          getCollisionDistance(placed)
        );

        return distanceOnScreen < pairDistance;
      });

      if (!collides) accepted.push(candidate);
      if (accepted.length >= HISTORICAL_LABEL_LIMIT) break;
    }

    return accepted;
  }, [
    historicalFeatures,
    historicalSnapshot,
    projection,
    viewportScale,
    selectedYear,
  ]);

  const historicalRegionLabels = useMemo(() => {
    const candidates = MAP_REGION_LABELS
      .filter((item) => isMapContextActive(item, selectedYear))
      .filter((item) =>
        isZoomInRange(
          viewportScale,
          MAP_REGION_LABEL_ZOOM_RANGE[item.tier] ||
            MAP_REGION_LABEL_ZOOM_RANGE.subregion
        )
      )
      .map((item) => {
        const point = projection([item.longitude, item.latitude]);
        if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
          return null;
        }

        const laneContext = getActiveLaneContext(
          item.laneId,
          activeDurationContexts,
          selectedYear
        );

        const defaultArcId = DURATION_LANES[item.laneId]?.defaultArcId;
        const arcId = laneContext?.arcId || defaultArcId || null;

        return {
          ...item,
          key: `region-${item.id}`,
          x: point[0],
          y: point[1],
          arcId,
          arcColor: getArcColor(arcId),
        };
      })
      .filter(Boolean)
      .sort((a, b) =>
        a.tier === b.tier ? 0 : a.tier === "macro" ? -1 : 1
      );

    const occupied = historicalLabels.map((label) => ({
      left: label.x * viewportScale - Math.max(56, label.name.length * 6.4) / 2,
      right: label.x * viewportScale + Math.max(56, label.name.length * 6.4) / 2,
      top: label.y * viewportScale - 8,
      bottom: label.y * viewportScale + 8,
    }));

    const accepted = [];

    for (const candidate of candidates) {
      const widthEstimate = Math.max(60, candidate.name.length * 7);
      const heightEstimate = candidate.tier === "macro" ? 17 : 13;
      const screenX = candidate.x * viewportScale;
      const screenY = candidate.y * viewportScale;
      const box = {
        left: screenX - widthEstimate / 2,
        right: screenX + widthEstimate / 2,
        top: screenY - heightEstimate / 2,
        bottom: screenY + heightEstimate / 2,
      };

      if (![...occupied, ...accepted.map((item) => item.box)].some(
        (other) => boxesOverlap(box, other, 5)
      )) {
        accepted.push({ ...candidate, box });
      }
    }

    return accepted;
  }, [
    selectedYear,
    projection,
    viewportScale,
    historicalLabels,
    activeDurationContexts,
  ]);

  const historicalLocations = useMemo(() => {
    if (!Number.isFinite(selectedYear)) return [];

    const tierRank = { world: 0, major: 1, regional: 2, local: 3, detail: 4 };

    const textObstacles = [...historicalLabels, ...historicalRegionLabels].map(
      (label) => {
        const widthEstimate = Math.max(56, label.name.length * 6.4);
        const heightEstimate =
          label.tier === "major" || label.tier === "macro" ? 15 : 13;
        const screenX = label.x * viewportScale;
        const screenY = label.y * viewportScale;

        return {
          tier: label.tier,
          left: screenX - widthEstimate / 2,
          right: screenX + widthEstimate / 2,
          top: screenY - heightEstimate / 2,
          bottom: screenY + heightEstimate / 2,
        };
      }
    );

    const canonicalSeen = new Set();

    const candidates = registryHistoricalLocations
      .filter((item) => {
        const tier = item.tier || "detail";
        const range =
          HISTORICAL_LOCATION_ZOOM_RANGE[tier] ||
          HISTORICAL_LOCATION_ZOOM_RANGE.detail;
        const registryMinZoom = Number(item.minZoom);
        const effectiveMinZoom = Number.isFinite(registryMinZoom)
          ? Math.max(range.min, registryMinZoom)
          : range.min;

        return (
          viewportScale >= effectiveMinZoom &&
          viewportScale < range.max
        );
      })
      .sort((a, b) => {
        const rankDifference =
          (tierRank[a.tier] ?? 9) - (tierRank[b.tier] ?? 9);

        if (rankDifference) return rankDifference;

        const researchedDifference =
          Number(!b.unreviewed) - Number(!a.unreviewed);

        return researchedDifference || a.sourceIndex - b.sourceIndex;
      })
      .filter((item) => {
        if (!item.renderingIdentityId) return true;
        if (canonicalSeen.has(item.renderingIdentityId)) return false;
        canonicalSeen.add(item.renderingIdentityId);
        return true;
      })
      .map((item) => {
        const point = projection([item.longitude, item.latitude]);

        if (
          !Array.isArray(point) ||
          !Number.isFinite(point[0]) ||
          !Number.isFinite(point[1])
        ) {
          return null;
        }

        return {
          ...item,
          x: point[0],
          y: point[1],
          screenX: point[0] * viewportScale,
          screenY: point[1] * viewportScale,
        };
      })
      .filter(Boolean);

    const placedLocationBoxes = [];
    const result = [];

    for (const item of candidates) {
      const relevantTextObstacles =
        item.tier === "world" || item.tier === "major"
          ? textObstacles.filter(
              (obstacle) =>
                obstacle.tier === "major" || obstacle.tier === "macro"
            )
          : textObstacles;

      const obstacleBoxes = [
        ...relevantTextObstacles,
        ...placedLocationBoxes,
      ];

      let placement = null;

      for (const side of getLocationSideOrder(item)) {
        const candidatePlacement = buildLocationLabelPlacement(
          item,
          item.screenX,
          item.screenY,
          side
        );

        const collides = obstacleBoxes.some((obstacle) =>
          boxesOverlap(candidatePlacement.box, obstacle, 2)
        );

        if (!collides) {
          placement = candidatePlacement;
          break;
        }
      }

      if (placement) placedLocationBoxes.push(placement.box);

      result.push({ ...item, placement });
      if (result.length >= HISTORICAL_LOCATION_LABEL_LIMIT) break;
    }

    return result;
  }, [
    selectedYear,
    projection,
    viewportScale,
    historicalLabels,
    historicalRegionLabels,
    registryHistoricalLocations,
  ]);

  const notifyTimeline = useCallback(() => {
    onProjectionChangeRef.current?.();
  }, []);

  const hideViewport = useCallback(() => {
    cameraRef.current?.setAttribute("visibility", "hidden");
  }, []);

  const applyViewportTransform = useCallback(
    (transform, { notify = true } = {}) => {
      if (!transform) return false;

      viewportTransformRef.current = transform;
      setViewportScale((previous) =>
        Math.abs(previous - transform.k) >= 0.015
          ? transform.k
          : previous
      );

      const camera = cameraRef.current;
      if (camera) {
        camera.setAttribute("transform", transform.toString());
        camera.setAttribute(
          "visibility",
          viewportInitializedRef.current ? "visible" : "hidden"
        );
      }

      if (notify) {
        notifyTimeline();
      }

      if (debugRef.current) {
        console.log("[MAP VIEWPORT]", {
          x: round(transform.x),
          y: round(transform.y),
          k: round(transform.k, 3),
          historicalSnapshot: historicalSnapshot?.id,
        });
      }

      return true;
    },
    [notifyTimeline, historicalSnapshot]
  );

  const buildAnchoredViewportTransform = useCallback(
    (position, scale = INITIAL_MAP_SCALE) => {
      const clientX = readNumber(position?.clientX);
      const clientY = readNumber(position?.clientY);

      const svg = svgRef.current;
      const currentProjection = projectionRef.current;
      const currentLocation = locationRef.current;

      if (
        clientX === null ||
        clientY === null ||
        !sizeMeasuredRef.current ||
        !visibleRef.current ||
        !svg ||
        !currentProjection ||
        !currentLocation
      ) {
        return null;
      }

      const projected = currentProjection([
        currentLocation.longitude,
        currentLocation.latitude,
      ]);

      const screenMatrix = svg.getScreenCTM?.();

      if (!projected || !screenMatrix) return null;

      let inverse;
      try {
        inverse = screenMatrix.inverse();
      } catch {
        return null;
      }

      const localTarget = new DOMPoint(
        clientX,
        clientY
      ).matrixTransform(inverse);

      return d3.zoomIdentity
        .translate(
          localTarget.x - scale * projected[0],
          localTarget.y - scale * projected[1]
        )
        .scale(scale);
    },
    []
  );

  /* Center on the selected object only once, when Map View opens. */
  const ensureViewportInitialized = useCallback(
    (position) => {
      if (viewportInitializedRef.current) return true;

      const transform = buildAnchoredViewportTransform(
        position,
        INITIAL_MAP_SCALE
      );

      if (!transform) return false;

      const clientX = readNumber(position?.clientX);
      const clientY = readNumber(position?.clientY);

      initialAnchorClientRef.current = {
        clientX,
        clientY,
      };
      viewportUserMovedRef.current = false;
      viewportInitializedRef.current = true;

      const svg = svgRef.current;
      if (!svg) return false;

      d3.select(svg).property("__zoom", transform);
      applyViewportTransform(transform, { notify: true });

      return true;
    },
    [applyViewportTransform, buildAnchoredViewportTransform]
  );

  const resetViewport = useCallback(() => {
    viewportInitializedRef.current = false;
    viewportTransformRef.current = d3.zoomIdentity;
    initialAnchorClientRef.current = null;
    viewportUserMovedRef.current = false;
    sizeMeasuredRef.current = false;
    setHasMeasuredSize(false);
    // The camera remains hidden while reset. Pre-seed the next Map View
    // session with its actual opening zoom so no low-zoom label frame flashes.
    setViewportScale(INITIAL_MAP_SCALE);

    const svg = svgRef.current;
    if (svg) {
      d3.select(svg).property("__zoom", d3.zoomIdentity);
    }

    hideViewport();
  }, [hideViewport]);

  const isViewportInitialized = useCallback(
    () => viewportInitializedRef.current,
    []
  );

  /*
   * Project longitude/latitude through the camera's ACTUAL live SVG matrix.
   *
   * Do not reconstruct this position from viewportTransformRef plus the root
   * SVG matrix. CSS, SVG presentation attributes, and browser matrix handling
   * can otherwise disagree about the camera transform origin. Reading the
   * camera group's CTM makes Timeline markers use the exact same transform as
   * the visible historical map.
   */
  const projectLocationToClient = useCallback(
    (longitude, latitude) => {
      const lon = readNumber(longitude);
      const lat = readNumber(latitude);

      if (
        lon === null ||
        lat === null ||
        !visibleRef.current ||
        !viewportInitializedRef.current
      ) {
        return null;
      }

      const svg = svgRef.current;
      const camera = cameraRef.current;
      const currentProjection = projectionRef.current;

      if (!svg || !camera || !currentProjection) return null;

      const projected = currentProjection([lon, lat]);
      const cameraScreenMatrix = camera.getScreenCTM?.();
      const svgScreenMatrix = svg.getScreenCTM?.();

      if (!projected || !cameraScreenMatrix || !svgScreenMatrix) {
        return null;
      }

      const clientTarget = new DOMPoint(
        projected[0],
        projected[1]
      ).matrixTransform(cameraScreenMatrix);

      let svgLocalTarget;
      try {
        svgLocalTarget = clientTarget.matrixTransform(
          svgScreenMatrix.inverse()
        );
      } catch {
        return null;
      }

      return {
        clientX: clientTarget.x,
        clientY: clientTarget.y,
        mapX: svgLocalTarget.x,
        mapY: svgLocalTarget.y,
      };
    },
    []
  );

  useImperativeHandle(
    ref,
    () => ({
      ensureViewportInitialized,
      resetViewport,
      isViewportInitialized,
      projectLocationToClient,
      getViewportTransform: () => viewportTransformRef.current,
      getHistoricalSnapshot: () => historicalSnapshot,
    }),
    [
      ensureViewportInitialized,
      resetViewport,
      isViewportInitialized,
      projectLocationToClient,
      historicalSnapshot,
    ]
  );

  /* Map SVG owns drag and wheel/pinch gestures. */
  useEffect(() => {
    if (!shouldMount) return undefined;

    const svg = svgRef.current;
    if (!svg) return undefined;

    const selection = d3.select(svg);

    const zoom = d3
      .zoom()
      .scaleExtent([MIN_MAP_SCALE, MAX_MAP_SCALE])
      .extent([
        [0, 0],
        [width, height],
      ])
      .translateExtent([
        [-width * 0.35, -height * 0.35],
        [width * 1.35, height * 1.35],
      ])
      .filter((event) => {
        if (event.type === "dblclick") return false;
        if (event.type === "mousedown") return event.button === 0;
        return true;
      })
      .on("start", (event) => {
        if (event?.sourceEvent) {
          viewportUserMovedRef.current = true;
        }
        containerRef.current?.classList.add("is-panning");
      })
      .on("zoom", (event) => {
        viewportInitializedRef.current = true;
        applyViewportTransform(event.transform, { notify: true });
      })
      .on("end", () => {
        containerRef.current?.classList.remove("is-panning");
      });

    zoomBehaviorRef.current = zoom;

    selection
      .call(zoom)
      .property("__zoom", viewportTransformRef.current);

    return () => {
      selection.on(".zoom", null);
      zoomBehaviorRef.current = null;
      containerRef.current?.classList.remove("is-panning");
    };
  }, [
    shouldMount,
    width,
    height,
    applyViewportTransform,
  ]);

  /*
   * Projection resize changes geographic conversion. During first-open setup,
   * keep rebuilding the transform around the original chronological pin pixel
   * until the user actually pans or zooms. This removes the one-time jump that
   * occurred when the fallback projection was replaced by the measured one.
   */
  useLayoutEffect(() => {
    if (!shouldMount || !hasMeasuredSize) return;

    if (viewportInitializedRef.current) {
      const anchoredTransform =
        !viewportUserMovedRef.current && initialAnchorClientRef.current
          ? buildAnchoredViewportTransform(
              initialAnchorClientRef.current,
              INITIAL_MAP_SCALE
            )
          : null;

      const nextTransform =
        anchoredTransform || viewportTransformRef.current;

      const svg = svgRef.current;
      if (svg) {
        d3.select(svg).property("__zoom", nextTransform);
      }

      applyViewportTransform(nextTransform, { notify: true });
    } else {
      notifyTimeline();
    }
  }, [
    shouldMount,
    hasMeasuredSize,
    projection,
    width,
    height,
    applyViewportTransform,
    buildAnchoredViewportTransform,
    notifyTimeline,
  ]);

  /* Selection changes update timeline markers but not the map camera. */
  useLayoutEffect(() => {
    if (!shouldMount) return;
    notifyTimeline();
  }, [
    shouldMount,
    location,
    notifyTimeline,
  ]);

  /* Turning Map View off ends the camera session. */
  useEffect(() => {
    if (!visible) {
      resetViewport();
    }
  }, [visible, resetViewport]);

  if (!shouldMount) return null;

  const inverseViewportScale = 1 / Math.max(viewportScale, 0.001);

  const civilizationFillOpacity = getCivilizationFillOpacity(viewportScale);
  const civilizationBorderVariables = getCivilizationBorderVariables(viewportScale);

  return (
    <div
      ref={containerRef}
      className={[
        "timelineMap",
        "timelineMap--visible",
        historicalStatus === "loading"
          ? "timelineMap--historicalLoading"
          : "",
        historicalStatus === "error"
          ? "timelineMap--historicalError"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={`Interactive historical map for ${formatHistoricalYear(
        selectedYear
      )}`}
      style={{
        "--civilization-fill-opacity": civilizationFillOpacity,
        ...civilizationBorderVariables,
      }}
    >
      <svg
        ref={svgRef}
        className="timelineMap__svg"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        <g
          ref={cameraRef}
          className="timelineMap__camera"
          /*
           * Keep React and D3 synchronized. Historical label updates cause
           * React renders during zoom; without this prop React can reconcile
           * away D3's imperative camera transform while Timeline markers keep
           * using viewportTransformRef, producing progressive pin drift.
           */
          transform={viewportTransformRef.current.toString()}
          visibility={
            viewportInitializedRef.current ? "visible" : "hidden"
          }
        >
          <path
            className="timelineMap__ocean"
            d={spherePath}
          />

          <g className="timelineMap__modernLand" aria-hidden="true">
            {countryPaths.map((country) => (
              <path
                key={country.key}
                className="timelineMap__country"
                d={country.d}
              />
            ))}
          </g>

          <path
            className="timelineMap__modernBorders"
            d={borderPath}
            aria-hidden="true"
          />

          <g className="timelineMap__historicalRegions">
            {historicalFeatures.map((item) => (
              <g
                key={item.key}
                className={[
                  "timelineMap__historicalRegionGroup",
                  `timelineMap__historicalRegionGroup--${item.kind}`,
                  `timelineMap__historicalRegionGroup--${item.validationState}`,
                ].join(" ")}
                data-name={item.name}
                /*
                 * Only expose data-arc when the resolved arc has an actual
                 * civilization color. This prevents uncolored context IDs from
                 * receiving the white/arc-linked territory treatment.
                 */
                data-arc={item.arcColor ? item.arcId : undefined}
                data-polity={item.matchedPolityId || undefined}
                data-validation={item.validationState}
                style={
                  item.arcColor
                    ? { "--historical-region-arc-color": item.arcColor }
                    : undefined
                }
              >
                <path
                  className="timelineMap__historicalRegionUnderstroke"
                  d={item.d}
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  className={[
                    "timelineMap__historicalRegion",
                    `timelineMap__historicalRegion--${item.kind}`,
                    `timelineMap__historicalRegion--precision${item.precision}`,
                    `timelineMap__historicalRegion--${item.validationState}`,
                  ].join(" ")}
                  d={item.d}
                  vectorEffect="non-scaling-stroke"
                  style={
                    item.strokeColor
                      ? { stroke: item.strokeColor }
                      : undefined
                  }
                  data-part-of={item.partOf || undefined}
                  data-subject={item.subject || undefined}
                >
                  <title>
                    {`${item.name}${
                      item.partOf ? ` · part of ${item.partOf}` : ""
                    }${
                      item.contradictoryAnchorNames.length
                        ? ` · geometry conflicts with: ${item.contradictoryAnchorNames.join(", ")}`
                        : ""
                    }`}
                  </title>
                </path>
              </g>
            ))}
          </g>

          <g className="timelineMap__geographicRegionLabels">
            {historicalRegionLabels.map((label) => (
              <g
                key={label.key}
                className={[
                  "timelineMap__geographicRegionLabel",
                  `timelineMap__geographicRegionLabel--${label.tier}`,
                ].join(" ")}
                transform={`translate(${label.x} ${label.y}) scale(${inverseViewportScale})`}
              >
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {label.name}
                </text>
              </g>
            ))}
          </g>

          <g className="timelineMap__historicalLabels">
            {historicalLabels.map((label) => (
              <g
                key={`label-${label.key}`}
                className={[
                  "timelineMap__historicalLabel",
                  `timelineMap__historicalLabel--${label.tier}`,
                  `timelineMap__historicalLabel--${label.kind}`,
                  label.editorial
                    ? "timelineMap__historicalLabel--editorial"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                transform={`translate(${label.x} ${label.y}) scale(${inverseViewportScale})`}
                data-arc={label.arcId || undefined}
              >
                <text textAnchor="middle" dominantBaseline="central">
                  {label.name}
                </text>
              </g>
            ))}
          </g>

          <g className="timelineMap__historicalLocations">
            {historicalLocations.map((item) => (
              <g
                key={`location-${item.id}`}
                className={[
                  "timelineMap__historicalLocation",
                  `timelineMap__historicalLocation--${item.tier}`,
                  `timelineMap__historicalLocation--${item.type}`,
                  `timelineMap__historicalLocation--${item.precision}`,
                  `timelineMap__historicalLocation--status-${item.settlementStatus}`,
                  item.unreviewed
                    ? "timelineMap__historicalLocation--unreviewed"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                transform={`translate(${item.x} ${item.y}) scale(${inverseViewportScale})`}
                data-placement={item.placement?.side || undefined}
                data-modern-name={item.modernName}
                data-arc={item.arcId || undefined}
                data-precision={item.precision}
              >
                {item.type === "city" ? (
                  <circle
                    r={
                      item.tier === "world"
                        ? 3.1
                        : item.tier === "major"
                          ? 2.75
                          : 2.05
                    }
                  />
                ) : null}

                {item.type === "sanctuary" ? (
                  <circle className="timelineMap__historicalLocationRing" r="3" />
                ) : null}

                {item.type === "site" ? (
                  <circle className="timelineMap__historicalLocationRing" r="2.4" />
                ) : null}

                {item.type === "uncertain-place" ? (
                  <circle
                    className="timelineMap__historicalLocationRing timelineMap__historicalLocationRing--uncertain"
                    r="3"
                  />
                ) : null}

                {item.placement ? (
                  <text
                    x={item.placement.textX}
                    y={item.placement.textY}
                    textAnchor={item.placement.textAnchor}
                    dominantBaseline="central"
                  >
                    {item.name}
                  </text>
                ) : null}

                <title>
                  {`${item.name} · ${item.modernName} · ${item.settlementStatus} · ${item.precision}`}
                </title>
              </g>
            ))}
          </g>
        </g>

        <g className="timelineMap__snapshotBadge" aria-live="polite">
          <rect x="12" y="12" width="310" height="60" rx="7" />
          <text x="23" y="30" className="timelineMap__snapshotTitle">
            {formatHistoricalYear(selectedYear)}
          </text>
          <text x="23" y="46" className="timelineMap__snapshotSourceYear">
            {historicalSnapshot
              ? `map snapshot ${historicalSnapshot.label} · ${historicalSnapshot.sourceLabel}`
              : "historical geometry"}
          </text>
          <text x="23" y="62" className="timelineMap__snapshotContext">
            {truncateMapLabel(
              selectedLaneContext?.segmentLabel ||
                "regional chronology unavailable"
            )}
          </text>
        </g>

        {historicalStatus === "loading" ? (
          <text
            className="timelineMap__statusMessage"
            x="12"
            y={height - 18}
          >
            Loading historical boundaries…
          </text>
        ) : null}

        {historicalStatus === "error" ? (
          <text
            className="timelineMap__statusMessage timelineMap__statusMessage--error"
            x="12"
            y={height - 18}
          >
            {historicalError || "Historical boundaries unavailable."}
          </text>
        ) : null}

        {/* Transparent gesture surface above map geometry. */}
        <rect
          className="timelineMap__interactionSurface"
          x="0"
          y="0"
          width={width}
          height={height}
        />
      </svg>
    </div>
  );
});

export default TimelineMap;