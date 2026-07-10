import { Component } from "react";

// Catches any render crash (e.g. an outdated tab receiving a newer server
// payload) and shows a reload prompt instead of a blank black screen.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error("App crashed:", error, info);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="app">
          <div className="card" style={{ textAlign: "center" }}>
            <h2>Something went out of sync</h2>
            <p className="subtitle" style={{ margin: "8px 0 20px" }}>
              A new version may have been deployed. Reload to continue.
            </p>
            <button className="btn" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
