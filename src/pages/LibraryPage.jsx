import { lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";

const Timeline = lazy(() => import("../components/timeline.jsx"));

export default function LibraryPage() {
  const navigate = useNavigate();

  return (
    <div className="libraryPage">
      <Suspense
        fallback={
          <div className="libraryLoading" role="status" aria-live="polite">
            Loading Library…
          </div>
        }
      >
        <div className="viewport">
          <div className="landscape">
            <Timeline onExitLibrary={() => navigate("/library")} />
          </div>
        </div>
      </Suspense>
    </div>
  );
}
