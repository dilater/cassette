import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import "./styles/globals.css";
import "./styles/aurora.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Show the window only after React has painted its first frame, preventing
// the transparent flash that occurs while the WebView is loading.
requestAnimationFrame(() => {
  getCurrentWindow().show();
});
