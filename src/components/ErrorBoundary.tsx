"use client";
import { Component, type ReactNode } from "react";

/** Aísla fallos de un componente (p. ej. el mapa) para que no tumben la página completa. */
export class ErrorBoundary extends Component<{ fallback: (error: Error, reset: () => void) => ReactNode; children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("[GeRiAm]", error);
  }
  reset = () => this.setState({ error: null });
  render() {
    return this.state.error ? this.props.fallback(this.state.error, this.reset) : this.props.children;
  }
}
