import React from "react";
import { createRoot } from "react-dom/client";
import { Uygulama } from "./Uygulama";
import "./stil.css";
import "./tema-a.css";
import "./egitmen.css";

createRoot(document.getElementById("kok")!).render(
  <React.StrictMode>
    <Uygulama />
  </React.StrictMode>,
);
