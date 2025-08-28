import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import durations from "../data/durations.json";
import "../styles/timeline.css";

/* ===== BCE/CE helpers (no year 0) ===== */
const toAstronomical = (y) => (y <= 0 ? y + 1 : y);
const fromAstronomical = (a) => (a <= 0 ? a - 1 : a);
const formatYear = (y) => (y < 0 ? `${Math.abs(y)} BCE` : y > 0 ? `${y} CE` : "—");

/* ===== Colors for Symbolic Systems ===== */
const SymbolicSystemColorPairs = {
  Sumerian: "#1D4ED8",
  Akkadian: "#7C4DFF",
  Egyptian: "#FF3B30",
  "Ancient Egyptian": "#FF3B30",
};

/* ===== Label sizing vs zoom ===== */
const LABEL_BASE_PX = 11;

/* ===== NEW: render + hover constants ===== */
const BASE_OPACITY = 0.3;
const HOVER_OPACITY = 1;
const AUTHOR_BASE_STROKE = 2;    // at k = 1
const TEXT_BASE_R = 3.5;         // at k = 1
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ===== Small utils ===== */
const hashString = (str) => {
  let h = 2166136261 >>> 0; // FNV-ish
  for (let i = 0; i < (str || "").length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 2 ** 32; // 0..1
};
function getTextDate(row) {
  const v = Number(row?.["Dataviz date"]);
  return Number.isFinite(v) ? v : NaN;
}
function pickSystemColor(tagsStr) {
  if (!tagsStr) return "#444";
  const parts = String(tagsStr).split(",").map((s) => s.trim());
  for (const p of parts) if (SymbolicSystemColorPairs[p]) return SymbolicSystemColorPairs[p];
  return "#444";
}

/* ===== Dynamic dataset discovery ===== */
function useDiscoveredDatasets() {
  const authorModules =
    import.meta.glob("../data/**/*_authors.json", { eager: true, import: "default" }) || {};
  const textModules =
    import.meta.glob("../data/**/*_texts.json", { eager: true, import: "default" }) || {};
  const folderOf = (p) => {
    const m = p.match(/\/data\/([^/]+)\//);
    return m ? m[1] : null;
  };
  const folders = new Set([
    ...Object.keys(authorModules).map(folderOf),
    ...Object.keys(textModules).map(folderOf),
  ]);

  const registry = [];
  folders.forEach((folder) => {
    if (!folder) return;
    const durationId = `${folder}-composite`;
    const authors = Object.entries(authorModules)
      .filter(([p]) => folderOf(p) === folder)
      .flatMap(([, data]) => (Array.isArray(data) ? data : []));
    const texts = Object.entries(textModules)
      .filter(([p]) => folderOf(p) === folder)
      .flatMap(([, data]) => (Array.isArray(data) ? data : []));
    registry.push({ folder, durationId, authors, texts });
  });
  return registry;
}

export default function Timeline() {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const axisRef = useRef(null);
  const gridRef = useRef(null);
  const outlinesRef = useRef(null);
  const segmentsRef = useRef(null);
  const authorsRef = useRef(null);
  const textsRef = useRef(null);

  /* ---- Responsive sizing ---- */
  const [size, setSize] = useState({ width: 800, height: 400 });
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
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const axisY = innerHeight;

  /* ---- Time domain & base scales ---- */
  const domainHuman = useMemo(() => [-7000, 2025], []);
  const domainAstro = useMemo(() => domainHuman.map(toAstronomical), [domainHuman]);

  const x = useMemo(
    () => d3.scaleLinear().domain(domainAstro).range([0, innerWidth]),
    [domainAstro, innerWidth]
  );
  const y0 = useMemo(
    () => d3.scaleLinear().domain([0, innerHeight]).range([0, innerHeight]),
    [innerHeight]
  );

  /* ---- Ticks ---- */
  const tickAstro = useMemo(() => {
    const human = [];
    for (let y = -7000; y <= 2000; y += 500) if (y !== 0) human.push(y);
    const astro = human.map(toAstronomical);
    astro.push(0.5);
    astro.sort((a, b) => a - b);
    return astro;
  }, []);
  const formatTick = (a) => (Math.abs(a - 0.5) < 1e-6 ? "0" : formatYear(fromAstronomical(a)));

  /* ---- Prepare composite OUTLINES ---- */
  const DEFAULT_BAR_PX = 24;
  const outlines = useMemo(() => {
    const rows = durations
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
        return { id: d.id, name: d.name, color: d.color || "#999", start, end, y, h };
      });
    return rows;
  }, [durations, innerHeight]);

  /* ---- Segment hover rects ---- */
  const segments = useMemo(() => {
    const rows = [];
    for (const d of durations) {
      if (!Array.isArray(d.segments)) continue;
      const color = d.color || "#999";
      const y = d.yRel != null ? d.yRel * innerHeight : d.y != null ? d.y : 0;
      const h =
        d.hRel != null ? d.hRel * innerHeight : d.height != null ? d.height : DEFAULT_BAR_PX;

      d.segments.forEach((s, i) => {
        rows.push({
          id: `${d.id}__seg_${i}`,
          parentId: d.id,
          parentColor: color,
          start: s.start,
          end: s.end,
          y,
          h,
          label: s.label,
          tag: s.tag,
          note: s.note,
        });
      });
    }
    return rows;
  }, [durations, innerHeight]);

  /* ---- Datasets ---- */
  const datasetRegistry = useDiscoveredDatasets();

  /* ---- Authors & Texts rows ---- */
  const { authorRows, textRows } = useMemo(() => {
    const outlinesById = new Map(outlines.map((o) => [o.id, o]));
    const rowsA = [];
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

      const authorY = new Map();

      // AUTHORS
      for (const a of ds.authors || []) {
        const name = a?.Author ?? a?.author ?? "";
        const birth = Number(a?.Dataviz_birth);
        const death = Number(a?.Dataviz_death);
        if (!Number.isFinite(birth) || !Number.isFinite(death)) continue;
        const color = pickSystemColor(a?.["Symbolic System Tags"]);
        const y = yForKey(name);
        authorY.set(name, y);
        rowsA.push({
          id: `${ds.durationId}__author__${name || hashString(JSON.stringify(a))}`,
          durationId: ds.durationId,
          name,
          start: birth,
          end: death,
          y,
          color,
        });
      }

      // TEXTS
      for (const t of ds.texts || []) {
        const authorName = t?.Author ?? t?.author ?? "";
        const title = t?.Title ?? t?.title ?? t?.Name ?? "";
        const when = getTextDate(t);
        if (!Number.isFinite(when)) continue;
        const color = pickSystemColor(t?.["Symbolic System Tags"]);
        const y =
          authorName && authorY.has(authorName)
            ? authorY.get(authorName)
            : yForKey(authorName || title || `text-${hashString(JSON.stringify(t))}`);
        rowsT.push({
          id: `${ds.durationId}__text__${title || hashString(JSON.stringify(t))}__${when}`,
          durationId: ds.durationId,
          title,
          authorName,
          when,
          y,
          color,
        });
      }
    }

    // Clamp to band extent
    const bandExtent = new Map(
      outlines.map((o) => [o.id, { min: Math.min(o.start, o.end), max: Math.max(o.start, o.end) }])
    );
    const filtA = rowsA.filter((r) => {
      const e = bandExtent.get(r.durationId);
      return e ? r.end >= e.min && r.start <= e.max : true;
    });
    const filtT = rowsT.filter((r) => {
      const e = bandExtent.get(r.durationId);
      return e ? r.when >= e.min && r.when <= e.max : true;
    });

    return { authorRows: filtA, textRows: filtT };
  }, [datasetRegistry, outlines]);

  /* ========= Draw/Update ========= */
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    const gRoot = svg.select("g.chart");
    const gAxis = d3.select(axisRef.current);
    const gGrid = d3.select(gridRef.current);
    const gOut = d3.select(outlinesRef.current);
    const gSeg = d3.select(segmentsRef.current);
    const gAuthors = d3.select(authorsRef.current);
    const gTexts = d3.select(textsRef.current);

    gRoot.attr("transform", `translate(${margin.left},${margin.top})`);

    const axisFor = (scale) => d3.axisBottom(scale).tickValues(tickAstro).tickFormat(formatTick);
    const gridFor = (scale) =>
      d3.axisBottom(scale).tickValues(tickAstro).tickSize(-innerHeight).tickFormat(() => "");

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

    // OUTLINES
    const outlineSel = gOut
      .selectAll("g.durationOutline")
      .data(outlines, (d) => d.id)
      .join((enter) => {
        const g = enter.append("g").attr("class", "durationOutline").attr("data-id", (d) => d.id);

        g.append("rect")
          .attr("class", "outlineRect")
          .attr("fill", "none")
          .attr("stroke", (d) => d.color)
          .attr("stroke-width", 1.5)
          .attr("vector-effect", "non-scaling-stroke")
          .attr("shape-rendering", "geometricPrecision")
          .attr("opacity", 0.3);

        g.append("text")
          .attr("class", "durationLabel")
          .attr("dy", "0.32em")
          .style("dominant-baseline", "middle")
          .attr("fill", (d) => d.color)
          .attr("opacity", 0.3)
          .style("font-weight", 600)
          .style("pointer-events", "none")
          .text((d) => d.name);

        return g;
      });

    // AUTHORS (lifespan lines)
    const authorSel = gAuthors
      .selectAll("line.author")
      .data(authorRows, (d) => d.id)
      .join(
        (enter) =>
          enter
            .append("line")
            .attr("class", "author")
            .attr("vector-effect", "non-scaling-stroke")
            .attr("stroke-linecap", "round")
            .attr("stroke", (d) => d.color || "#222")
            .attr("opacity", BASE_OPACITY), // NEW
        (update) => update,
        (exit) => exit.remove()
      );

    // TEXTS (dots)
    const textSel = gTexts
      .selectAll("circle.textDot")
      .data(textRows, (d) => d.id)
      .join(
        (enter) =>
          enter
            .append("circle")
            .attr("class", "textDot")
            .attr("stroke", "#fff")
            .attr("stroke-width", 1)
            .attr("fill", (d) => d.color || "#444")
            .attr("opacity", BASE_OPACITY), // NEW
        (update) => update,
        (exit) => exit.remove()
      );

    // --- Helpers for hover logic ---
    const overlaps = (a0, a1, b0, b1) => Math.max(a0, b0) <= Math.min(a1, b1);

    function setHoverForSegment(seg, isOn) {
      const { start, end, parentId } = seg;

      // highlight only items that land inside the hovered segment's time range
      authorSel
        .filter((d) => overlaps(Math.min(d.start, d.end), Math.max(d.start, d.end), start, end))
        .attr("opacity", isOn ? HOVER_OPACITY : BASE_OPACITY);

      textSel
        .filter((d) => d.when >= start && d.when <= end)
        .attr("opacity", isOn ? HOVER_OPACITY : BASE_OPACITY);

      // dim the rest when hovering (optional; comment out if you prefer non-dimming)
      authorSel
        .filter((d) => !overlaps(Math.min(d.start, d.end), Math.max(d.start, d.end), start, end))
        .attr("opacity", isOn ? BASE_OPACITY : BASE_OPACITY);

      textSel
        .filter((d) => !(d.when >= start && d.when <= end))
        .attr("opacity", isOn ? BASE_OPACITY : BASE_OPACITY);

      // labels of the parent duration
      gOut
        .selectAll("g.durationOutline")
        .filter((o) => o.id === parentId)
        .select("text.durationLabel")
        .attr("opacity", isOn ? 1 : 0.3);
    }

    // SEGMENTS (hover hits)
    const segSel = gSeg
      .selectAll("rect.segmentHit")
      .data(segments, (d) => d.id)
      .join((enter) =>
        enter
          .append("rect")
          .attr("class", "segmentHit")
          .attr("fill", "transparent")
          .attr("pointer-events", "all")
          .attr("stroke", "none")
          .attr("stroke-width", 1.5)
          .attr("vector-effect", "non-scaling-stroke")
          .attr("shape-rendering", "geometricPrecision")
          .on("mouseenter", function (event, d) {
            d3.select(this).attr("stroke", d.parentColor).attr("opacity", 1);
            setHoverForSegment(d, true); // NEW
          })
          .on("mouseleave", function (event, d) {
            d3.select(this).attr("stroke", "none").attr("opacity", null);
            setHoverForSegment(d, false); // NEW (restore)
          })
      );

    function apply(zx, zy, k = 1) {
      // Axis & grid
      gAxis.attr("transform", `translate(${margin.left},${margin.top + axisY})`).call(axisFor(zx));
      gGrid.attr("transform", `translate(0,${axisY})`).call(gridFor(zx));
      snapGrid(zx);

      // Outlines
      outlineSel.select("rect.outlineRect").each(function (d) {
        const x0 = zx(toAstronomical(d.start));
        const x1 = zx(toAstronomical(d.end));
        const yTop = zy(d.y);
        const hPix = zy(d.y + d.h) - zy(d.y);
        d3.select(this)
          .attr("x", Math.min(x0, x1))
          .attr("y", yTop)
          .attr("width", Math.abs(x1 - x0))
          .attr("height", hPix);
      });

      // Labels (zoom-relative font size)
      const fontPx = LABEL_BASE_PX * k;
      outlineSel.each(function (d) {
        const g = d3.select(this);
        const x0 = zx(toAstronomical(d.start));
        const x1 = zx(toAstronomical(d.end));
        const yTop = zy(d.y);
        const hPix = zy(d.y + d.h) - zy(d.y);
        g.select("text.durationLabel")
          .attr("x", Math.min(x0, x1) + 4)
          .attr("y", yTop + hPix / 3)
          .style("font-size", `${fontPx}px`);
      });

      // Segment hover rects
      segSel.each(function (d) {
        const x0 = zx(toAstronomical(d.start));
        const x1 = zx(toAstronomical(d.end));
        const yTop = zy(d.y);
        const hPix = zy(d.y + d.h) - zy(d.y);
        d3.select(this)
          .attr("x", Math.min(x0, x1))
          .attr("y", yTop)
          .attr("width", Math.abs(x1 - x0))
          .attr("height", hPix);
      });

      // Authors (lifespan lines) — positions + ZOOMED SIZE
      const strokeW = clamp(AUTHOR_BASE_STROKE * k, 1, 6); // NEW
      authorSel.each(function (d) {
        const x0 = zx(toAstronomical(d.start));
        const x1 = zx(toAstronomical(d.end));
        const yPix = zy(d.y);
        d3.select(this)
          .attr("x1", Math.min(x0, x1))
          .attr("x2", Math.max(x0, x1))
          .attr("y1", yPix)
          .attr("y2", yPix)
          .attr("stroke-width", strokeW); // NEW
      });

      // Texts (dots) — positions + ZOOMED SIZE
      const r = clamp(TEXT_BASE_R * k, 2, 12); // NEW
      textSel.each(function (d) {
        const cx = zx(toAstronomical(d.when));
        const cy = zy(d.y);
        d3.select(this).attr("cx", cx).attr("cy", cy).attr("r", r); // NEW
      });
    }

    // Zoom behavior
    const MIN_ZOOM = 0.9;
    const MAX_ZOOM = 22;

    const zoom = d3
      .zoom()
      .scaleExtent([MIN_ZOOM, MAX_ZOOM])
      .translateExtent([
        [0, 0],
        [innerWidth, innerHeight],
      ])
      .extent([
        [0, 0],
        [innerWidth, innerHeight],
      ])
      .on("zoom", (event) => {
        const t = event.transform;
        const zx = t.rescaleX(x);
        const zy = t.rescaleY(y0);
        apply(zx, zy, t.k);
      });

    const svgSel = d3.select(svgRef.current).call(zoom);

    // Initial zoom (centered)
    const s = MIN_ZOOM;
    const tx = (innerWidth - innerWidth * s) / 2;
    const ty = (innerHeight - innerHeight * s) / 2;
    svgSel.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(s));

    return () => d3.select(svgRef.current).on(".zoom", null);
  }, [
    outlines,
    segments,
    authorRows,
    textRows,
    width,
    height,
    innerWidth,
    innerHeight,
    axisY,
    margin.left,
    margin.top,
    tickAstro,
    x,
    y0,
  ]);

  return (
    <div ref={wrapRef} className="timelineWrap" style={{ width: "100%", height: "100%" }}>
      <svg ref={svgRef} className="timelineSvg" width={width} height={height}>
        <g className="chart" transform={`translate(${margin.left},${margin.top})`}>
          <g ref={gridRef} className="grid" />
          <g ref={outlinesRef} className="durations" />
          <g ref={segmentsRef} className="segments" />
          <g ref={authorsRef} className="authors" />
          <g ref={textsRef} className="texts" />
        </g>
        <g ref={axisRef} className="axis" />
      </svg>
    </div>
  );
}
