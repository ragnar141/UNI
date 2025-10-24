import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import "../styles/tagPanel.css";

/* Simple portal so the dropdown renders at <body> level */
function MenuPortal({ children }) {
  return createPortal(children, document.body);
}

/**
 * TagPanel — controlled filter panel (dropdowns portaled to <body>)
 * Props:
 *  - groups: [{ key, label, appliesTo, allTags: string[] }]
 *  - selectedByGroup: { [key: string]: Set<string> }
 *  - onChange: (nextSelectedByGroup) => void
 */
export default function TagPanel({ groups, selectedByGroup, onChange }) {
  const [openKey, setOpenKey] = useState(null);   // which group's menu is open
  const [isOpen, setIsOpen] = useState(false);    // slide-out state (false = hidden)

  const panelRef = useRef(null);
  const menuRef = useRef(null);                   // portal menu container
  const btnRefs = useRef(new Map());              // trigger buttons by group key (kept, even if not used for position)

  // Floating menu position (fixed coords)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 320 });

  // ---- Tweakables (keep MENU_WIDTH in sync with CSS) ----
  const MENU_WIDTH = 320;
  const GAP = 12;          // base gap between panel and menu
  const EXTRA_LEFT = 16;   // push a bit further left

  // Convert Sets to quick lookup for rendering (memoized)
  const selectedMaps = useMemo(() => {
    const m = new Map();
    for (const g of groups) {
      const set = selectedByGroup[g.key] || new Set();
      m.set(g.key, set);
    }
    return m;
  }, [groups, selectedByGroup]);

  const toggleMenu = (key) => {
    setOpenKey((prev) => {
      const nextKey = prev === key ? null : key;
      if (nextKey) positionMenu(); // position relative to the PANEL, not the button
      return nextKey;
    });
  };

  const handleToggleTag = (groupKey, tag) => {
    const current = selectedByGroup[groupKey] || new Set();
    const next = new Set(current);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    onChange({ ...selectedByGroup, [groupKey]: next });
  };

  const handleAll = (groupKey, allTags) => {
    onChange({ ...selectedByGroup, [groupKey]: new Set(allTags) });
  };

  const handleNone = (groupKey) => {
    onChange({ ...selectedByGroup, [groupKey]: new Set() });
  };

  const handleTogglePanel = () => {
    if (isOpen) setOpenKey(null);
    setIsOpen((v) => !v);
  };

  // Close on outside click + Esc (CAPTURE phase so nothing can block it)
  // Still respects clicks inside the panel or the portaled dropdown.
  useEffect(() => {
    if (!isOpen) return;

    const onDocDown = (e) => {
      const panelEl = panelRef.current;
      const portalEl = menuRef.current;

      // If click is inside the panel OR inside the portaled menu, ignore
      if ((panelEl && panelEl.contains(e.target)) || (portalEl && portalEl.contains(e.target))) {
        return;
      }

      // Otherwise close everything
      setIsOpen(false);
      setOpenKey(null);
    };

    const onKey = (e) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setOpenKey(null);
      }
    };

    document.addEventListener("pointerdown", onDocDown, true); // capture
    document.addEventListener("keydown", onKey, true);

    return () => {
      document.removeEventListener("pointerdown", onDocDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [isOpen]);

  // Reposition the floating menu on scroll/resize while open
  useEffect(() => {
    if (!openKey) return;
    const onWin = () => positionMenu();
    window.addEventListener("scroll", onWin, true);
    window.addEventListener("resize", onWin);
    return () => {
      window.removeEventListener("scroll", onWin, true);
      window.removeEventListener("resize", onWin);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey]);

  // ---- Forced order + two section labels ----
  const ORDER = [
    "__regular__",
    "artsSciences",
    "literaryForms",
    "literaryContent",
    "socioPolitical",
    "__special__",
    "comtean",
    "metaphysical",
    "jungian",
    "neumann",
  ];

  const groupsByKey = useMemo(() => new Map(groups.map((g) => [g.key, g])), [groups]);

  const orderedGroups = useMemo(() => {
    const seen = new Set();
    const out = [];

    for (const key of ORDER) {
      if (key === "__regular__") {
        out.push({ __section: true, label: "Regular Tags", key });
        continue;
      }
      if (key === "__special__") {
        out.push({ __section: true, label: "Specialized Tags", key });
        continue;
      }
      const g = groupsByKey.get(key);
      if (g) {
        out.push(g);
        seen.add(key);
      }
    }
    for (const g of groups) {
      if (!seen.has(g.key)) out.push(g);
    }
    return out;
  }, [groups, groupsByKey]);

  // ---- Floating menu positioning (relative to the PANEL, not the button) ----
  function positionMenu() {
    const panelEl = panelRef.current;
    if (!panelEl) return;

    const panelRect = panelEl.getBoundingClientRect();

    // Horizontal: anchor to the panel's LEFT edge with extra left offset
    const width = MENU_WIDTH;
    let left = panelRect.left - width - GAP - EXTRA_LEFT;

    // Vertical: center on the entire panel
    let topCenter = panelRect.top + panelRect.height / 2;

    // Keep inside viewport horizontally
    const minLeft = 4;
    if (left < minLeft) left = minLeft;

    // Keep the "center line" within viewport a bit (menu has max-height)
    const minCenter = 12;
    const maxCenter = window.innerHeight - 12;
    if (topCenter < minCenter) topCenter = minCenter;
    if (topCenter > maxCenter) topCenter = maxCenter;

    setMenuPos({ top: topCenter, left, width });
  }

  return (
  <div
    id="tagPanel"
    ref={panelRef}
    className={`tagPanelWrap ${isOpen ? "tagPanelWrap--open" : "tagPanelWrap--closed"}`}
    aria-hidden={!isOpen}
    onMouseDown={(e) => e.stopPropagation()} // keep internal clicks internal
  >
    {/* FILTERS tab (always rendered so it can animate) */}
    <button
      type="button"
      className="tagPanel__tab"
      aria-expanded={isOpen}
      aria-controls="tagPanel"
      aria-hidden={isOpen}
      tabIndex={isOpen ? -1 : 0}
      onClick={() => {
        setIsOpen(true);
        setOpenKey(null);
      }}
      title="Toggle filters"
    >
      FILTERS
    </button>

    {/* Panel X close (only visible when open) */}
    {isOpen && (
      <button
        type="button"
        className="tagPanel__close tagPanel__panelClosePos"
        aria-label="Close filters"
        title="Close"
        onClick={() => {
          setIsOpen(false);
          setOpenKey(null);
        }}
      >
        ×
      </button>
    )}

    {/* Panel content */}
    <div className="tagPanel__content">
      {orderedGroups.map((g) => {
        if (g.__section) {
          return (
            <div key={g.key} className="tagPanel__sectionLabel">
              {g.label}
            </div>
          );
        }

        const set = selectedMaps.get(g.key) || new Set();
        const total = g.allTags.length;
        const count = set.size;
        const isDropdownOpen = openKey === g.key;

        return (
          <div key={g.key} style={{ position: "relative" }}>
            <button
              type="button"
              ref={(el) => {
                if (el) btnRefs.current.set(g.key, el);
                else btnRefs.current.delete(g.key);
              }}
              onClick={() => toggleMenu(g.key)}
              className="tagPanel__btn"
              aria-expanded={isDropdownOpen}
              aria-controls={`menu-${g.key}`}
            >
              {g.label} {renderCountBadge(count, total)}
            </button>

            {/* FLOATING DROPDOWN: portaled to <body> with position:fixed */}
            {isDropdownOpen && (
              <MenuPortal>
                <div
                  ref={menuRef}
                  id={`menu-${g.key}`}
                  role="menu"
                  className="tagPanel__dropdown"
                  style={{
                    position: "fixed",
                    top: `${menuPos.top}px`,
                    left: `${menuPos.left}px`,
                    width: `${menuPos.width}px`,
                    maxHeight: "calc(100vh - 32px)",
                    overflow: "auto",
                    zIndex: 9999,
                    transform: "translateY(-50%)", // center vertically to the panel middle
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="tagPanel__menuHeader">
                    <span style={{ fontWeight: 600 }}>{g.label}</span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={() => handleAll(g.key, g.allTags)}
                        className="tagPanel__miniBtn"
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => handleNone(g.key)}
                        className="tagPanel__miniBtn"
                      >
                        None
                      </button>
                      <button
                        type="button"
                        className="tagPanel__close"
                        aria-label="Close menu"
                        title="Close"
                        onClick={() => setOpenKey(null)}
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  <div className="tagPanel__menuList">
                    {g.allTags.map((tag) => {
                      const checked = set.has(tag);
                      return (
                        <label key={tag} className="tagPanel__row">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleTag(g.key, tag)}
                          />
                          <span style={{ marginLeft: 8 }}>{tag}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </MenuPortal>
            )}
          </div>
        );
      })}
    </div>
  </div>
);

}

/* badge helper */
function renderCountBadge(count, total) {
  const text = `${count}/${total}`;
  return (
    <span className="tagPanel__badge" aria-label={`${count} of ${total} selected`}>
      {text}
    </span>
  );
}
