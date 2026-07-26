/*
 * Historical Map Catalog
 *
 * Fifteen editorial snapshots spanning 4100 BCE to 450 CE.
 * Each snapshot currently uses a world-scale GeoJSON source. Runtime selection
 * uses the latest snapshot not later than the selected date, preventing a map
 * from borrowing political geometry from its own future.
 * published by aourednik/historical-basemaps.
 *
 * The display year is our editorial date. sourceYear records the actual
 * geometry date supplied by the source dataset. Keeping both visible avoids
 * pretending that an approximate source file is an exact reconstruction.
 */

const HISTORICAL_BASEMAP_ROOT =
  "https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson";

export const HISTORICAL_MAP_SNAPSHOTS = [
  {
    id: "world-4100-bce",
    year: -4100,
    sourceYear: -4000,
    file: "world_bc4000.geojson",
    label: "4100 BCE",
    sourceLabel: "source geometry: 4000 BCE",
  },
  {
    id: "world-3300-bce",
    year: -3300,
    sourceYear: -3000,
    file: "world_bc3000.geojson",
    label: "3300 BCE",
    sourceLabel: "source geometry: 3000 BCE",
  },
  {
    id: "world-2600-bce",
    year: -2600,
    sourceYear: -3000,
    file: "world_bc3000.geojson",
    label: "2600 BCE",
    sourceLabel: "source geometry: 3000 BCE",
  },
  {
    id: "world-2000-bce",
    year: -2000,
    sourceYear: -2000,
    file: "world_bc2000.geojson",
    label: "2000 BCE",
    sourceLabel: "source geometry: 2000 BCE",
  },
  {
    id: "world-1600-bce",
    year: -1600,
    sourceYear: -1500,
    file: "world_bc1500.geojson",
    label: "1600 BCE",
    sourceLabel: "source geometry: 1500 BCE",
  },
  {
    id: "world-1200-bce",
    year: -1200,
    sourceYear: -1000,
    file: "world_bc1000.geojson",
    label: "1200 BCE",
    sourceLabel: "source geometry: 1000 BCE",
  },
  {
    id: "world-900-bce",
    year: -900,
    sourceYear: -1000,
    file: "world_bc1000.geojson",
    label: "900 BCE",
    sourceLabel: "source geometry: 1000 BCE",
  },
  {
    id: "world-650-bce",
    year: -650,
    sourceYear: -700,
    file: "world_bc700.geojson",
    label: "650 BCE",
    sourceLabel: "source geometry: 700 BCE",
  },
  {
    id: "world-500-bce",
    year: -500,
    sourceYear: -500,
    file: "world_bc500.geojson",
    label: "500 BCE",
    sourceLabel: "source geometry: 500 BCE",
  },
  {
    id: "world-323-bce",
    year: -323,
    sourceYear: -323,
    file: "world_bc323.geojson",
    label: "323 BCE",
    sourceLabel: "source geometry: 323 BCE",
  },
  {
    id: "world-220-bce",
    year: -220,
    sourceYear: -200,
    file: "world_bc200.geojson",
    label: "220 BCE",
    sourceLabel: "source geometry: 200 BCE",
  },
  {
    id: "world-1-ce",
    year: 1,
    sourceYear: -1,
    file: "world_bc1.geojson",
    label: "1 CE",
    sourceLabel: "source geometry: 1 BCE",
  },
  {
    id: "world-150-ce",
    year: 150,
    sourceYear: 100,
    file: "world_100.geojson",
    label: "150 CE",
    sourceLabel: "source geometry: 100 CE",
  },
  {
    id: "world-300-ce",
    year: 300,
    sourceYear: 300,
    file: "world_300.geojson",
    label: "300 CE",
    sourceLabel: "source geometry: 300 CE",
  },
  {
    id: "world-450-ce",
    year: 450,
    sourceYear: 400,
    file: "world_400.geojson",
    label: "450 CE",
    sourceLabel: "source geometry: 400 CE",
  },
].map((snapshot) => ({
  ...snapshot,
  remoteUrl: `${HISTORICAL_BASEMAP_ROOT}/${snapshot.file}`,
  localPath: `../data/historical-maps/${snapshot.file}`,
}));

export function getHistoricalSnapshotForYear(rawYear) {
  const year = Number(rawYear);

  if (!Number.isFinite(year)) {
    return HISTORICAL_MAP_SNAPSHOTS[0];
  }

  /*
   * Treat each editorial snapshot as the beginning of an interval rather than
   * choosing the numerically nearest map. This prevents a selected date from
   * borrowing political geometry from its own future. For example, 380 BCE
   * now uses the 500 BCE snapshot, not the post-Alexander 323 BCE snapshot.
   */
  if (year >= 0 && year < 1) {
    return HISTORICAL_MAP_SNAPSHOTS.find((snapshot) => snapshot.year === 1);
  }

  let selected = HISTORICAL_MAP_SNAPSHOTS[0];

  for (const candidate of HISTORICAL_MAP_SNAPSHOTS) {
    if (candidate.year > year) break;
    selected = candidate;
  }

  return selected;
}

export function formatHistoricalYear(rawYear) {
  const year = Number(rawYear);

  if (!Number.isFinite(year)) return "Unknown date";
  if (year < 0) return `${Math.abs(year)} BCE`;
  if (year > 0) return `${year} CE`;
  return "1 BCE / 1 CE";
}
