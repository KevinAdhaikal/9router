import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "material-symbols/outlined.css";
import "@/app/globals.css";
import { ThemeProvider } from "@/shared/components/ThemeProvider";
import { RuntimeI18nProvider } from "@/i18n/RuntimeI18nProvider";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <RuntimeI18nProvider>
        <App />
      </RuntimeI18nProvider>
    </ThemeProvider>
  </React.StrictMode>
);
