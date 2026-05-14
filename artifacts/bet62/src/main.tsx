import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");
if (apiBaseUrl) {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string" && input.startsWith("/api/")) {
      return originalFetch(`${apiBaseUrl}${input}`, init);
    }

    if (input instanceof Request) {
      const url = new URL(input.url);
      if (url.origin === window.location.origin && url.pathname.startsWith("/api/")) {
        const nextUrl = `${apiBaseUrl}${url.pathname}${url.search}`;
        return originalFetch(new Request(nextUrl, input), init);
      }
    }

    return originalFetch(input, init);
  };
}

createRoot(document.getElementById("root")!).render(<App />);
