import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initFirebase } from "./firebase";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

initFirebase()
  .then(async () => {
    const { App } = await import("./App");
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((e) => {
    root.render(<p style={{ padding: 24 }}>Erro ao iniciar: {String(e?.message ?? e)}</p>);
  });

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
