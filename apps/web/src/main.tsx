import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/app";
import { ThemeProvider } from "@/components/theme-provider";
import "@/styles.css";

const LogisticsPrototype = lazy(
  () => import("./canvas/logistics-layout-prototype"),
);
const showPrototype =
  import.meta.env.DEV &&
  new URLSearchParams(location.search).get("prototype") === "logistics";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element was not found");
}

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      {showPrototype ? (
        <Suspense fallback={<div>Loading the layout sketch…</div>}>
          <LogisticsPrototype />
        </Suspense>
      ) : (
        <App />
      )}
    </ThemeProvider>
  </StrictMode>,
);
