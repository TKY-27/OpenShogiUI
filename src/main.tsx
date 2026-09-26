import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import "./index.css";
import { applyDocumentLanguage, DEFAULT_LOCALE } from "./localization";

applyDocumentLanguage(DEFAULT_LOCALE);

const container = document.getElementById("root");

if (container === null) {
  throw new Error("OpenShogiAI root element is missing");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
