"use client";

import React from "react";

type Props = {
  result: any;
  labels?: string[]; // optional mapping from backend or model_meta.json
};

export default function PredictionResult({ result, labels = ["legit", "fraud"] }: Props) {
  if (!result) return null;

  const pred = result.predictions?.[0];
  const proba = result.proba?.[0];
  const probForPred =
    Array.isArray(proba) && typeof pred === "number" ? proba[pred] : Array.isArray(proba) ? Math.max(...proba) : proba;

  const label = typeof pred === "number" ? (result.class_labels ? result.class_labels[pred] ?? String(pred) : labels[pred] ?? String(pred)) : String(pred);
  const pct = probForPred != null ? `${(Number(probForPred) * 100).toFixed(1)}%` : "N/A";

  const color = label === "1" || label.toLowerCase().includes("fraud") ? "#fff2f0" : "#f6fff6";

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ padding: 12, borderRadius: 6, background: color }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div>
            <strong>Predicted:</strong> {label}
          </div>
          <div>
            <strong>Confidence:</strong> {pct}
          </div>
        </div>
        {result.predicted_probability !== undefined && (
          <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>
            predicted_probability (mapped): {Array.isArray(result.predicted_probability) ? result.predicted_probability[0] : result.predicted_probability}
          </div>
        )}
      </div>

      {/* {result.sample_inputs && (
        <div style={{ marginTop: 10 }}>
          <h4>Input (sample)</h4>
          <pre style={{ whiteSpace: "pre-wrap", background: "#fff", padding: 8, borderRadius: 6 }}>
            {JSON.stringify(result.sample_inputs[0], null, 2)}
          </pre>
        </div>
      )} */}
    </div>
  );
}