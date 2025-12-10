"use client";

import React, { useMemo, useEffect, useState, useRef } from "react";
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

const TYPE_OPTIONS = ["PAYMENT", "TRANSFER", "CASH_OUT", "DEBIT", "CASH_IN"];

const typeBadgesWrapperStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
  marginTop: 16,
};

const typeBadgeStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(67, 97, 238, 0.2)",
  background: "rgba(67, 97, 238, 0.08)",
  color: "#1f1f28",
  fontWeight: 600,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
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
        const types:  Record<string, string> = body.types || {};
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
    setFields((s) => s.map((f) => (f.key === key ?  { ...f, value } : f)));
  }

  function validate(): boolean {
    const errors:  string[] = [];
    fields. forEach((f) => {
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

  function buildRowObject() {
    const row: Record<string, number> = {
      type_CASH_IN: 0,
      type_CASH_OUT: 0,
      type_DEBIT: 0,
      type_PAYMENT: 0,
      type_TRANSFER: 0,
    };

    fields.forEach((f) => {
      if (f.key === "type") {
        const flag = `type_${f.value}`;
        if (flag in row) row[flag] = 1;
        return;
      }
      row[f.key] = parseFloat(f.value);
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
  function computePresetValue(key:  string): string {
    if (key === "type") return "TRANSFER";
    if (key === "amount") return "20000";
    if (key === "newbalanceOrig") return "30000";
    // fallback to default value if present, otherwise preserve existing
    return DEFAULT_VALUES[key] ?? "0";
  }

  const selectedType = fields.find((f) => f.key === "type")?.value ?? "PAYMENT";
  const typeOneHot = useMemo(() => {
    const base = {
      type_CASH_IN: 0,
      type_CASH_OUT: 0,
      type_DEBIT: 0,
      type_PAYMENT: 0,
      type_TRANSFER: 0,
    };
    const flag = `type_${selectedType}` as keyof typeof base;
    if (flag in base) base[flag] = 1;
    return base;
  }, [selectedType]);

  const controlWrapperStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 12,
  };

  const inputBaseStyle: React.CSSProperties = {
    padding: "10px 14px",
    width:  "100%",
    border: "2px solid #e2e8f0",
    borderRadius:  8,
    fontSize: 14,
    outline: "none",
    transition: "border-color 0.2s",
  };

  const selectStyle: React.CSSProperties = {
    padding: "10px 14px",
    width: "100%",
    border: "2px solid #e2e8f0",
    borderRadius: 8,
    fontSize: 14,
    outline: "none",
    background: "white",
    cursor: "pointer",
  };

  return (
    <div style={{ 
      minHeight: "100vh",
      background: "linear-gradient(135deg, #4361EE 0%, #7209B7 100%)",
      padding: "40px 20px",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"
    }}>
      <div style={{ 
        maxWidth:  920, 
        margin: "0 auto",
        background: "white",
        borderRadius: 16,
        padding: 40,
        boxShadow:  "0 20px 60px rgba(67, 97, 238, 0.3)"
      }}>
        <h1 style={{ 
          fontSize: 32,
          fontWeight: 700,
          background: "linear-gradient(135deg, #4361EE 0%, #7209B7 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          marginBottom: 8
        }}>
          Transaction Input
        </h1>

        <p style={{ color: "#64748b", marginBottom: 32, fontSize: 15 }}>
          These fields match the features used when training the model.  Keys are fixed — edit the values only.
        </p>

        {loadingFeatures ? (
          <div style={{ 
            padding: 20, 
            textAlign: "center", 
            color: "#7209B7",
            fontSize: 14
          }}>
            Loading feature metadata...
          </div>
        ) : null}

        <div style={{ 
          border: "2px solid #e2e8f0", 
          padding: 24, 
          borderRadius: 12, 
          marginBottom: 24,
          background: "#fafafa"
        }}>
          {fields.map((f, idx) => (
            <div key={f.key} style={{ 
              display: "grid", 
              gridTemplateColumns: "220px 1fr 100px", 
              gap: 16, 
              alignItems:  "center", 
              marginBottom: idx === fields.length - 1 ? 0 : 16,
              padding: 12,
              background: "white",
              borderRadius: 8,
              border: "1px solid #e2e8f0"
            }}>
              <div style={{ 
                padding: "8px 12px", 
                color: "#1e293b", 
                background:  "linear-gradient(135deg, #4361EE15 0%, #7209B715 100%)",
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 14
              }}>
                {f.key}
              </div>

              <div>
                {f.type === "numeric" ? (
                  <input
                    type="number"
                    step="any"
                    value={f.value}
                    onChange={(e) => updateFieldValue(f.key, e.target.value)}
                    style={inputBaseStyle}
                  />
                ) : (
                  <select
                    value={f.value}
                    onChange={(e) => updateFieldValue(f.key, e.target.value)}
                    style={selectStyle}
                  >
                    {TYPE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div style={{ textAlign: "right" }}>
                <span style={{ 
                  fontSize: 11, 
                  color: "#94a3b8",
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px"
                }}>
                  {f.type}
                </span>
              </div>
            </div>
          ))}
        </div>

        {validationErrors. length > 0 && (
          <div style={{ 
            marginBottom: 24, 
            padding: 16,
            background: "#fef2f2",
            border: "2px solid #fecaca",
            borderRadius: 12,
            color: "#991b1b"
          }}>
            <strong style={{ display: "block", marginBottom: 8 }}>Fix the following: </strong>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {validationErrors.map((err) => (
                <li key={err} style={{ marginBottom: 4 }}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ marginBottom: 32, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button 
            onClick={submit} 
            disabled={loading} 
            style={{ 
              padding: "12px 24px",
              background: loading ? "#94a3b8" : "linear-gradient(135deg, #4361EE 0%, #7209B7 100%)",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "transform 0.2s, box-shadow 0.2s",
              boxShadow: loading ? "none" : "0 4px 12px rgba(67, 97, 238, 0.3)"
            }}
            onMouseEnter={(e) => {
              if (! loading) {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style. boxShadow = "0 6px 20px rgba(67, 97, 238, 0.4)";
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget. style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(67, 97, 238, 0.3)";
              }
            }}
          >
            {loading ? "Predicting..." : "🔮 Predict Transaction"}
          </button>

          <button
            onClick={() => {
              setFields((s) => s.map((f) => ({ ...f, value: computePresetValue(f.key) })));
              setResult(null);
              setValidationErrors([]);
            }}
            style={{ 
              padding: "12px 24px",
              background: "white",
              color: "#4361EE",
              border:  "2px solid #4361EE",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#4361EE";
              e. currentTarget.style.color = "white";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "white";
              e.currentTarget.style.color = "#4361EE";
            }}
          >
            ⚠️ Preset Suspicious
          </button>

          <button
            onClick={() => {
              setFields((s) => s.map((f) => ({ ...f, value: DEFAULT_VALUES[f.key] ??  (f.type === "numeric" ?  "0" : "") })));
              setResult(null);
              setValidationErrors([]);
            }}
            style={{ 
              padding: "12px 24px",
              background: "white",
              color: "#64748b",
              border: "2px solid #e2e8f0",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              transition:  "all 0.2s"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#94a3b8";
              e.currentTarget.style.color = "#1e293b";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#e2e8f0";
              e.currentTarget.style.color = "#64748b";
            }}
          >
            🔄 Reset
          </button>
        </div>

        <PredictionResult result={result} />

        {/* <div
          style={{
            marginTop: 12,
            padding: 18,
            borderRadius: 18,
            border: "1px solid rgba(67, 97, 238, 0.18)",
            background: "rgba(255, 255, 255, 0.92)",
          }}
        >
          <h3 style={{ color: "#1f1f28", marginBottom: 12 }}>Encoded type flags</h3>
          <div style={typeBadgesWrapperStyle}>
            {Object.entries(typeOneHot).map(([key, value]) => (
              <div key={key} style={typeBadgeStyle}>
                <span>{key}</span>
                <span>{value}</span>
              </div>
            ))}
          </div>
        </div> */}

        {/* {result && (
          <div style={{ marginTop: 32 }}>
            <h3 style={{ 
              fontSize: 20,
              fontWeight: 600,
              color: "#1e293b",
              marginBottom: 16
            }}>
              Raw Response
            </h3>
            <pre style={{ 
              background: "#f8fafc", 
              padding: 20,
              borderRadius: 12,
              border: "2px solid #e2e8f0",
              overflow: "auto",
              fontSize:  13,
              lineHeight: 1.6,
              color: "#334155"
            }}>
              {JSON.stringify(result || {}, null, 2)}
            </pre>
          </div>
        )} */}
      </div>
    </div>
  );
}