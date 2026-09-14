import { Preferences } from "@satisfactory-belt/preferences";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { createBrowserPreferenceStore } from "./lib/browser-preference-store";

import "./index.css";

const root = document.querySelector<HTMLDivElement>("#root");

if (!root) {
  throw new Error("Root element not found");
}

const preferences = new Preferences(createBrowserPreferenceStore(), (error) => {
  console.warn("Unable to persist user preferences; this session remains usable.", error);
});

createRoot(root).render(
  <StrictMode>
    <App preferences={preferences} />
  </StrictMode>,
);
