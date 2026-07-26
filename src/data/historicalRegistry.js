import PLACES_REGISTRY from "./historicalPlacesRegistry.json";
import POLITIES_REGISTRY from "./historicalPolitiesRegistry.json";
import MAP_DISPLAY from "./historicalMapDisplay.json";

const places = Array.isArray(PLACES_REGISTRY?.places)
  ? PLACES_REGISTRY.places
  : [];

const polities = Array.isArray(POLITIES_REGISTRY?.polities)
  ? POLITIES_REGISTRY.polities
  : [];

const polityById = new Map(polities.map((polity) => [polity.id, polity]));

const STRONG_RELATIONS = new Set([
  "capital",
  "sovereign",
  "direct-control",
  "provincial-center",
  "client",
  "dependent",
  "local-control",
]);

const EXCLUSIVE_RELATIONS = new Set(["capital", "sovereign"]);

const GENERIC_POLITY_WORDS = new Set([
  "the",
  "empire",
  "kingdom",
  "kingdoms",
  "state",
  "states",
  "dynasty",
  "dynasties",
  "realm",
  "realms",
  "polity",
  "polities",
  "republic",
  "league",
  "confederacy",
  "confederation",
  "period",
]);

const FEATURE_POLITY_ALIASES = [
  { pattern: /achaemenid|persian empire/i, ids: ["achaemenid-empire"] },
  { pattern: /alexander|macedonian empire/i, ids: ["macedonian-empire", "macedonian-hellenistic-greece"] },
  { pattern: /roman empire/i, ids: ["roman-empire"] },
  { pattern: /eastern roman|byzantine/i, ids: ["eastern-roman-empire"] },
  { pattern: /western roman/i, ids: ["western-roman-empire"] },
  { pattern: /parthian|arsacid/i, ids: ["parthian-empire"] },
  { pattern: /sasanian|sassanid/i, ids: ["sasanian-empire"] },
  { pattern: /neo[- ]?assyrian/i, ids: ["neo-assyrian-empire"] },
  { pattern: /neo[- ]?babylonian/i, ids: ["neo-babylonian-empire"] },
  { pattern: /maurya/i, ids: ["maurya-empire"] },
  { pattern: /gupta/i, ids: ["gupta-empire"] },
  { pattern: /han/i, ids: ["han-empire"] },
  { pattern: /qin/i, ids: ["qin-empire"] },
  { pattern: /ptolema/i, ids: ["ptolemaic-kingdom"] },
  { pattern: /seleucid/i, ids: ["seleucid-empire"] },
  { pattern: /carthag/i, ids: ["carthaginian-state"] },
];

function readYear(value) {
  if (value == null || String(value).trim() === "") return null;
  const year = Number(value);
  return Number.isFinite(year) ? year : null;
}

export function containsHistoricalYear(fromValue, toValue, rawYear) {
  const year = readYear(rawYear);
  if (year === null) return false;

  const from = readYear(fromValue);
  const to = readYear(toValue);

  if (from !== null && year < from) return false;
  if (to !== null && year >= to) return false;
  return true;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantTokens(value) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token && !GENERIC_POLITY_WORDS.has(token));
}

function tokenSimilarity(a, b) {
  const left = new Set(significantTokens(a));
  const right = new Set(significantTokens(b));
  if (!left.size || !right.size) return 0;

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }

  return intersection / Math.max(left.size, right.size);
}

function getActivePhase(place, rawYear) {
  const year = readYear(rawYear);
  if (year === null || !Array.isArray(place?.phases)) return null;

  return (
    place.phases.find((phase) =>
      containsHistoricalYear(phase.from, phase.to, year)
    ) || null
  );
}

function getActiveLocation(place, rawYear) {
  const year = readYear(rawYear);
  const candidates = Array.isArray(place?.locations) ? place.locations : [];

  if (year !== null) {
    const dated = candidates.find((location) =>
      containsHistoricalYear(location.from, location.to, year)
    );
    if (dated) return dated;
  }

  return candidates[0] || null;
}

function getZoomForImportance(importance) {
  const rawValue = MAP_DISPLAY?.zoomLevels?.[importance];
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

export function getPolityById(polityId) {
  return polityById.get(polityId) || null;
}

export function getActivePolities(rawYear) {
  const year = readYear(rawYear);
  if (year === null) return [];

  return polities.filter((polity) =>
    containsHistoricalYear(polity.from, polity.to, year)
  );
}

export function matchFeaturePolity(featureName, rawYear) {
  const name = String(featureName || "").trim();
  if (!name) return null;

  const activePolities = getActivePolities(rawYear);
  const activeById = new Map(activePolities.map((polity) => [polity.id, polity]));

  for (const alias of FEATURE_POLITY_ALIASES) {
    if (!alias.pattern.test(name)) continue;

    const match = alias.ids
      .map((id) => activeById.get(id))
      .find(Boolean);

    /* The name matched a specific polity family, but that polity is inactive. */
    return match || null;
  }

  const normalizedFeature = normalizeText(name);
  let best = null;
  let bestScore = 0;

  for (const polity of activePolities) {
    const normalizedPolity = normalizeText(polity.displayName);
    let score = 0;

    if (normalizedFeature === normalizedPolity) {
      score = 100;
    } else if (
      normalizedFeature.includes(normalizedPolity) ||
      normalizedPolity.includes(normalizedFeature)
    ) {
      score = 82;
    } else {
      score = tokenSimilarity(name, polity.displayName) * 70;
    }

    if (score > bestScore) {
      best = polity;
      bestScore = score;
    }
  }

  return bestScore >= 42 ? best : null;
}

export function getHistoricalPlaceRecords(rawYear) {
  const year = readYear(rawYear);
  if (year === null) return [];

  return places
    .filter((place) => place.recordStatus !== "alias")
    .map((place) => {
      const location = getActiveLocation(place, year);
      if (!location) return null;

      const phase = getActivePhase(place, year);
      const hasResearchedPhases = Array.isArray(place.phases) && place.phases.length > 0;

      if (hasResearchedPhases && !phase) return null;

      const importance = phase?.importance || "detail";
      const minZoom = getZoomForImportance(importance);
      if (!Number.isFinite(minZoom)) return null;

      const localArcIds = Array.isArray(phase?.localArcIds)
        ? phase.localArcIds
        : Array.isArray(place.arcHints)
          ? place.arcHints
          : [];

      return {
        id: place.id,
        renderingIdentityId: place.renderingIdentityId || place.id,
        sourceIndex: Number(place.sourceIndex || 0),
        name: phase?.displayName || place.canonicalName,
        canonicalName: place.canonicalName,
        modernName: place.modernEquivalent,
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
        precision: location.precision || "unknown",
        kind: place.kind || "uncertain-place",
        type:
          place.kind === "city"
            ? "city"
            : place.kind === "sanctuary"
              ? "sanctuary"
              : place.kind === "site"
                ? "site"
                : place.kind === "region" || place.kind === "historical-region"
                  ? "region"
                  : "uncertain-place",
        tier: importance,
        importance,
        minZoom,
        preferredSide: place.legacyDisplayHint?.preferredSide || "auto",
        arcId: localArcIds[0] || null,
        localArcIds,
        settlementStatus: phase?.settlementStatus || "active",
        politicalStatus: Array.isArray(phase?.politicalStatus)
          ? phase.politicalStatus
          : [],
        confidence: phase?.confidence || "low",
        researchStatus: phase?.researchStatus || place.researchStatus || "unreviewed",
        unreviewed: !hasResearchedPhases,
        phase,
      };
    })
    .filter(Boolean);
}

export function getValidationAnchors(rawYear) {
  return getHistoricalPlaceRecords(rawYear)
    .filter((place) => !place.unreviewed)
    .filter((place) => place.confidence === "high" || place.confidence === "medium")
    .flatMap((place) => {
      const strongStatuses = place.politicalStatus.filter((status) =>
        STRONG_RELATIONS.has(status.relation)
      );

      if (!strongStatuses.length) return [];

      return [
        {
          placeId: place.id,
          name: place.name,
          latitude: place.latitude,
          longitude: place.longitude,
          localArcIds: place.localArcIds,
          confidence: place.confidence,
          affiliations: strongStatuses,
          hasExclusiveAffiliation: strongStatuses.some((status) =>
            EXCLUSIVE_RELATIONS.has(status.relation)
          ),
        },
      ];
    });
}

export function getHistoricalZoomLevels() {
  return MAP_DISPLAY?.zoomLevels || {};
}

export function getHistoricalDisplayConfig() {
  return MAP_DISPLAY;
}

export { PLACES_REGISTRY, POLITIES_REGISTRY, MAP_DISPLAY };
