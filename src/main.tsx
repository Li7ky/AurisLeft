import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { subscribePlayerEvents } from "./store/playerStore";
import { subscribeDownloadEvents } from "./store/downloadStore";
import "./styles/global.css";

subscribePlayerEvents();
subscribeDownloadEvents();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
