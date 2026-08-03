import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./theme.css";
import "./styles/shell.css";
import "./styles/hero.css";
import "./styles/cards.css";
import "./styles/panels.css";
import "./i18n/config";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", height: "100vh", gap: "12px",
          background: "#05070B", color: "#F4F7FB",
          fontFamily: "system-ui, sans-serif", padding: "24px", textAlign: "center",
        }}>
          <div style={{ fontSize: "32px" }}>⚠</div>
          <div style={{ fontSize: "16px", fontWeight: 700 }}>Something went wrong</div>
          <div style={{ fontSize: "13px", color: "rgba(244,247,251,0.8)", maxWidth: "480px", lineHeight: 1.6 }}>
            {this.state.error.message}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: "8px", padding: "8px 20px", borderRadius: "8px",
              border: "none", background: "#FFA94D",
              color: "#07090E", fontSize: "13px", fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >Reload app</button>
        </div>
      );
    }
    return this.props.children;
  }
}

document.documentElement.dataset.theme = "dark";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
