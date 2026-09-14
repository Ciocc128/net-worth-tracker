"use client";

/**
 * Agentation visual-feedback toolbar, development only.
 *
 * Click an element, write a note, and the annotation (selector, bounding box, classes) reaches the
 * coding agent through the agentation MCP server on :4747 — no copy-paste of what "that button" is.
 *
 * Loaded with ssr: false because the toolbar reads window/localStorage on mount; the root layout
 * renders this component only when NODE_ENV is development, so production never requests the chunk.
 */
import dynamic from "next/dynamic";

const Agentation = dynamic(
  () => import("agentation").then((mod) => mod.Agentation),
  { ssr: false }
);

export function AgentationToolbar() {
  return <Agentation endpoint="http://localhost:4747" />;
}
