# Optional local historical map files

The component works immediately by lazy-loading the source GeoJSON files from
`aourednik/historical-basemaps`.

To remove the runtime network dependency, download any or all catalog files into
this directory without renaming them. `timelineMap.jsx` uses `import.meta.glob`
and automatically prefers a matching local file over the remote URL.

Expected filenames include:

- `world_bc4000.geojson`
- `world_bc3000.geojson`
- `world_bc2000.geojson`
- `world_bc1500.geojson`
- `world_bc1000.geojson`
- `world_bc700.geojson`
- `world_bc500.geojson`
- `world_bc323.geojson`
- `world_bc200.geojson`
- `world_bc1.geojson`
- `world_100.geojson`
- `world_300.geojson`
- `world_400.geojson`

Some editorial snapshots intentionally reuse the nearest available source file.
