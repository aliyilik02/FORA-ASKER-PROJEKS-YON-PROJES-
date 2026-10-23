import React from "react";
import { createRoot } from "react-dom/client";
import { Uygulama } from "./Uygulama";
import "./stil.css";

createRoot(document.getElementById("kok")!).render(
  <React.StrictMode>
    <Uygulama />
  </React.StrictMode>,
);
