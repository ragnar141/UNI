// components/MarkerIcon.jsx
export default function MarkerIcon({ type, color, colors, founding, historic }) {
  const vb = "0 0 16 16";

  // Fathers: right-pointing triangle, bigger if founding; optional white midline if historic
  if (type === "father") {
    const r = founding ? 5.5 : 4.0;
    const cx = 8, cy = 8;
    const xL = cx - r, xR = cx + r, yT = cy - r, yB = cy + r, yM = cy;

    return (
      <svg viewBox={vb} width="16" height="16" focusable="false" aria-hidden="true">
        <path d={`M ${xL} ${yT} L ${xL} ${yB} L ${xR} ${yM} Z`} fill={color || "#666"} />
        {historic && (
          <line
            x1={cx} x2={cx}
            y1={cy - r} y2={cy + r}
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
          />
        )}
      </svg>
    );
  }

  // Texts: multi-color pie if 2+ colors; else solid circle
  const palette = Array.isArray(colors) ? colors.filter(Boolean) : null;
  if (palette && palette.length > 1) {
    const n = palette.length;
    const cx = 8, cy = 8, r = 5.5;
    const arcs = [];

    if (n === 2) {
      arcs.push(arcPath(cx, cy, r, 0, Math.PI));            // right half
      arcs.push(arcPath(cx, cy, r, Math.PI, 2 * Math.PI));  // left half
    } else {
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * 2 * Math.PI - Math.PI / 2;
        const a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
        arcs.push(arcPath(cx, cy, r, a0, a1));
      }
    }

    return (
      <svg viewBox={vb} width="16" height="16" focusable="false" aria-hidden="true">
        {arcs.map((d, i) => <path key={i} d={d} fill={palette[i]} />)}
      </svg>
    );
  }

  return (
    <svg viewBox={vb} width="16" height="16" focusable="false" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" fill={color || "#666"} />
    </svg>
  );
}

function arcPath(cx, cy, r, a0, a1) {
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const sweep = 1; // clockwise
  const span = ((a1 - a0) + 2 * Math.PI) % (2 * Math.PI);
  const largeArc = span > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${largeArc} ${sweep} ${x1} ${y1} Z`;
}
