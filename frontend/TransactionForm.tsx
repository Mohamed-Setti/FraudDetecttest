"use client";

import React, { useEffect, useState, useRef } from "react";
import PredictionResult from "./PredictionResult";

type FieldSpec = {
  key: string;
  type: "categorical" | "numeric";
  value: string;
  options?: string[]; // for categorical selects
};

const TRAINING_FEATURES = [
  "type",
  "step",
  "amount",
  "oldbalanceOrg",
  "newbalanceOrig",
  "oldbalanceDest",
  "newbalanceDest",
];

const DEFAULT_VALUES: Record<string, string> = {
  type: "PAYMENT",
  step: "1",
  amount: "100.0",
  oldbalanceOrg: "1000.0",
  newbalanceOrig: "900.0",
  oldbalanceDest: "2000.0",
  newbalanceDest: "2100.0",
};

export default function TransactionForm() {
  const [fields, setFields] = useState<FieldSpec[]>(
    TRAINING_FEATURES.map((k) => ({
      key: k,
      type: k === "type" ? "categorical" : "numeric",
      value: DEFAULT_VALUES[k] ?? "",
    }))
  );
  const [loadingFeatures, setLoadingFeatures] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const mounted = useRef(true);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  useEffect(() => {
    mounted.current = true;
    async function fetchFeatures() {
      try {
        const resp = await fetch("/api/features");
        if (!resp.ok) throw new Error("no features endpoint");
        const body = await resp.json();
        const features: string[] = body.preprocessor_expected_features ?? body.features ?? TRAINING_FEATURES;
        const types: Record<string, string> = body.types || {};
        const catValues: Record<string, any> = body.categorical_values || body.feature_values || {};

        // Build fields from backend-provided feature order (or fallback)
        const newFields: FieldSpec[] = features.map((k: string) => {
          const inferredType = types[k] === "categorical" || k === "type" ? "categorical" : "numeric";
          const defaultValue = DEFAULT_VALUES[k] ?? (inferredType === "numeric" ? "0" : "");
          return {
            key: k,
            type: inferredType,
            value: defaultValue,
            options: catValues[k] && Array.isArray(catValues[k]) ? catValues[k] : undefined,
          };
        });

        if (mounted.current) {
          setFields(newFields);
        }
      } catch (e) {
        // If the features endpoint fails, keep the training defaults already set
        console.warn("Could not fetch /api/features:", e);
      } finally {
        if (mounted.current) setLoadingFeatures(false);
      }
    }
    fetchFeatures();
    return () => {
      mounted.current = false;
    };
  }, []);

  function updateFieldValue(key: string, value: string) {
    setFields((s) => s.map((f) => (f.key === key ? { ...f, value } : f)));
  }

  function validate(): boolean {
    const errors: string[] = [];
    fields.forEach((f) => {
      if (f.type === "numeric") {
        if (f.value === "" || Number.isNaN(Number(f.value))) {
          errors.push(`${f.key} must be a number`);
        }
      } else {
        // categorical: require non-empty
        if (f.value === "") {
          errors.push(`${f.key} is required`);
        }
      }
    });
    setValidationErrors(errors);
    return errors.length === 0;
  }

  function buildRowObject(): Record<string, any> {
    const row: Record<string, any> = {};
    fields.forEach((f) => {
      if (f.type === "numeric") {
        const n = f.value === "" ? null : Number(f.value);
        row[f.key] = Number.isNaN(n) ? null : n;
      } else {
        row[f.key] = f.value;
      }
    });
    return row;
  }

  async function submit() {
    setResult(null);
    if (!validate()) return;
    setLoading(true);
    try {
      const row = buildRowObject();
      const form = new FormData();
      form.append("json_rows", JSON.stringify([row]));
      const resp = await fetch("/api/proxyPredict", {
         method: "POST", body: form 
        });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || `Status ${resp.status}`);
      }
      const json = await resp.json();
      if (mounted.current) setResult(json);
    } catch (err: any) {
      alert("Prediction error: " + (err?.message ?? err));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  // helper to compute preset values cleanly (avoids long inline ternary chains)
  function computePresetValue(key: string): string {
    if (key === "type") return "TRANSFER";
    if (key === "amount") return "20000";
    if (key === "newbalanceOrig") return "30000";
    // fallback to default value if present, otherwise preserve existing
    return DEFAULT_VALUES[key] ?? "0";
  }

  return (
    <div style={{ padding: 20, fontFamily: "Arial, sans-serif", maxWidth: 920 }}>
      <h1>Transaction input (model features)</h1>

      <p>These fields match the features used when training the model. Keys are fixed — edit the values only.</p>

      {loadingFeatures ? (
        <div>Loading feature metadata...</div>
      ) : null}

      <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 6, marginBottom: 12 }}>
        {fields.map((f) => (
          <div key={f.key} style={{ display: "grid", gridTemplateColumns: "220px 1fr 160px", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <div style={{ padding: 6, color: "#333", background: "#fafafa", borderRadius: 4 }}>
              <strong>{f.key}</strong>
            </div>

            <div>
              {f.type === "numeric" ? (
                <input
                  type="number"
                  step="any"
                  value={f.value}
                  onChange={(e) => updateFieldValue(f.key, e.target.value)}
                  style={{ padding: 8, width: "100%" }}
                />
              ) : f.options && f.options.length > 0 ? (
                <select value={f.value} onChange={(e) => updateFieldValue(f.key, e.target.value)} style={{ padding: 8, width: "100%" }}>
                  <option value="">-- select --</option>
                  {f.options.map((opt) => (
                    <option key={String(opt)} value={String(opt)}>{String(opt)}</option>
                  ))}
                </select>
              ) : (
                <select value={f.value} onChange={(e) => updateFieldValue(f.key, e.target.value)} style={{ padding: 8, width: "100%" }}>
                  <option value="PAYMENT">PAYMENT</option>
                  <option value="TRANSFER">TRANSFER</option>
                  <option value="CASH_OUT">CASH_OUT</option>
                  <option value="DEBIT">DEBIT</option>
                  <option value="CASH_IN">CASH_IN</option>
                </select>
              )}
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "#666" }}>{f.type}</div>
            </div>
          </div>
        ))}
      </div>

      {validationErrors.length > 0 && (
        <div style={{ marginBottom: 12, color: "darkred" }}>
          <strong>Fix the following:</strong>
          <ul>
            {validationErrors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <button onClick={submit} disabled={loading} style={{ padding: "8px 14px" }}>
          {loading ? "Predicting..." : "Predict transaction"}
        </button>

        
        <button
          onClick={() => {
            // preset suspicious example quickly (keeps keys)
            setFields((s) => s.map((f) => ({ ...f, value: computePresetValue(f.key) })));
            setResult(null);
            setValidationErrors([]);
          }}
          style={{ marginLeft: 8 }}
        >
          Preset suspicious
        </button>
        <button
          onClick={() => {
            // reset to defaults
            setFields((s) => s.map((f) => ({ ...f, value: DEFAULT_VALUES[f.key] ?? (f.type === "numeric" ? "0" : "") })));
            setResult(null);
            setValidationErrors([]);
          }}
          style={{ marginLeft: 8 }}
        >
          Reset
        </button>
      </div>

      <PredictionResult result={result} />

      <div style={{ marginTop: 16 }}>
        <h3>Raw response</h3>
        <pre style={{ background: "#f7f7f7", padding: 12 }}>
          {JSON.stringify(result || {}, null, 2)}
        </pre>
      </div>
    </div>
  );
}