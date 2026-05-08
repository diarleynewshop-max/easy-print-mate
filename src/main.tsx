import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { loadLocalData } from "./services/storage";

loadLocalData().finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
