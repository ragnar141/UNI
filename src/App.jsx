import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import AboutPage from "./pages/AboutPage.jsx";
import LibraryGatewayPage from "./pages/LibraryGatewayPage.jsx";
import LibraryPage from "./pages/LibraryPage.jsx";
import CoursesPage from "./pages/CoursesPage.jsx";
import ContactPage from "./pages/ContactPage.jsx";

export default function App() {
  const { pathname } = useLocation();
  const isImmersiveLibrary = pathname === "/library/archive";

  return (
    <div className={`siteShell${isImmersiveLibrary ? " siteShell--library" : ""}`}>
      {!isImmersiveLibrary && <Navbar />}

      <main className="siteMain">
        <Routes>
          <Route path="/" element={<Navigate to="/about" replace />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/courses" element={<CoursesPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/library" element={<LibraryGatewayPage />} />
          <Route path="/library/archive" element={<LibraryPage />} />
          <Route path="*" element={<Navigate to="/about" replace />} />
        </Routes>
      </main>
    </div>
  );
}
