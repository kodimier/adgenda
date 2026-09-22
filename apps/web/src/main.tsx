/**
 * Adgenda
 * Copyright (C) 2026 Victor Paschoal (kodimier)
 * Desenvolvido por Victor Paschoal (alt: kodimier) kodimier@gmail.com
 *
 * GNU Affero General Public License v3.0 only.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
