import { NavLink } from "react-router-dom";

function navClass({ isActive }) {
  return `siteNav__link${isActive ? " siteNav__link--active" : ""}`;
}

export default function Navbar() {
  return (
    <header className="siteNav">
      <nav className="siteNav__inner" aria-label="Primary navigation">
        <div className="siteNav__left">
          <NavLink
            to="/about"
            className={({ isActive }) =>
              `siteNav__link siteNav__link--mark${isActive ? " siteNav__link--active" : ""}`
            }
            aria-label="Home"
            title="Home"
          >
            ∅
          </NavLink>

          <NavLink to="/courses" className={navClass}>
            Courses
          </NavLink>

          <NavLink to="/contact" className={navClass}>
            Contact
          </NavLink>
        </div>

        <div className="siteNav__right">
          <span className="siteNav__divider" aria-hidden="true" />
          <NavLink
            to="/library"
            className={({ isActive }) =>
              `siteNav__link siteNav__link--library${isActive ? " siteNav__link--active" : ""}`
            }
          >
            Library
          </NavLink>
        </div>
      </nav>
    </header>
  );
}
