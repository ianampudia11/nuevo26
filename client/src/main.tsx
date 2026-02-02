import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ThemeProviderWithBranding } from "@/components/ThemeProviderWithBranding";
import { initializeGoogleTranslateCompatibility } from "@/utils/google-translate-compatibility";
import { suppressAuthErrors } from "@/utils/suppress-auth-errors";


suppressAuthErrors();

initializeGoogleTranslateCompatibility();

createRoot(document.getElementById("root")!).render(
  <ThemeProviderWithBranding>
    <App />
  </ThemeProviderWithBranding>
);
