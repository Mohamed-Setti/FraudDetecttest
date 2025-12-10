import argparse
import json
import os
import pickle
from typing import Any, Dict, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd


def load_pickle_or_joblib(path: str) -> Any:
    """Try joblib.load, then pickle.load, raise informative error on failure."""
    if not os.path.exists(path):
        raise FileNotFoundError(f"File not found: {path}")
    # Try joblib first (commonly used for sklearn pipelines/xgb wrappers)
    try:
        return joblib.load(path)
    except Exception:
        pass
    # Fall back to pickle
    try:
        with open(path, "rb") as f:
            return pickle.load(f)
    except Exception as e:
        raise RuntimeError(f"Failed to load {path} with joblib or pickle: {e}")


def load_features(path: str) -> List[str]:
    arr = np.load(path, allow_pickle=True)
    # ensure list of strings
    return [str(x) for x in arr.tolist()] if hasattr(arr, "tolist") else [str(x) for x in arr]


def load_metadata(path: str) -> Dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def prepare_input_dataframe(df: pd.DataFrame, feature_columns: List[str], metadata: Optional[Dict] = None) -> pd.DataFrame:
    """
    Ensure df has all feature_columns, reordered. Fill missing columns with sensible defaults:
    - If metadata contains 'defaults' or 'feature_defaults', use them.
    - Otherwise fill numeric with 0 and object with empty string.
    """
    meta_defaults = {}
    if metadata:
        meta_defaults = metadata.get("feature_defaults", {}) or metadata.get("defaults", {})

    # Add missing columns
    for col in feature_columns:
        if col not in df.columns:
            default = meta_defaults.get(col, np.nan)
            df[col] = default

    # Keep only feature_columns and reorder
    df = df[list(feature_columns)].copy()

    # Fill still-missing values using defaults or column dtypes
    for col in df.columns:
        if df[col].isna().any():
            if col in meta_defaults:
                df[col] = df[col].fillna(meta_defaults[col])
            else:
                # Guess based on dtype or sample value
                if pd.api.types.is_numeric_dtype(df[col]):
                    df[col] = df[col].fillna(0)
                else:
                    df[col] = df[col].fillna("")

    return df


def apply_preprocessor(preprocessor: Any, df: pd.DataFrame) -> Any:
    """
    Apply the preprocessor. Try to preserve DataFrame column names if transformer supports it.
    Returns transformed array or DataFrame (whatever transformer returns).
    """
    try:
        return preprocessor.transform(df)
    except Exception as e:
        # Some pipelines expect numpy arrays or different shapes; try passing values
        try:
            return preprocessor.transform(df.values)
        except Exception as e2:
            raise RuntimeError(f"Preprocessor.transform failed: {e}; fallback failed: {e2}")


def predict_with_model(model: Any, X: Any) -> Tuple[np.ndarray, Optional[np.ndarray]]:
    """
    Run model predictions. Returns (preds, proba) where proba is None if not available.
    Handles scikit-learn-like estimators and XGBoost Booster objects.
    """
    # scikit-learn API
    if hasattr(model, "predict_proba"):
        proba = model.predict_proba(X)
        preds = model.predict(X)
        return np.asarray(preds), np.asarray(proba)
    # scikit-learn predict only
    if hasattr(model, "predict"):
        preds = model.predict(X)
        proba = None
        return np.asarray(preds), proba
    # XGBoost raw Booster
    try:
        import xgboost as xgb

        if isinstance(model, xgb.Booster):
            dmat = xgb.DMatrix(X)
            proba = model.predict(dmat)
            # If binary classification, proba returns float per sample -> convert to shape (n,2)
            if proba.ndim == 1:
                proba = np.vstack([1 - proba, proba]).T
            preds = np.argmax(proba, axis=1)
            return preds, proba
    except Exception:
        pass

    raise RuntimeError("Model does not have a supported predict / predict_proba interface.")


def run_predictions(
    model_path: str,
    feature_path: str,
    preprocessor_path: Optional[str],
    meta_path: Optional[str],
    input_csv: str,
    output_csv: Optional[str] = None,
    sample_rows: int = 5,
) -> pd.DataFrame:
    # Load artifacts
    model = load_pickle_or_joblib(model_path)
    feature_columns = load_features(feature_path)
    preprocessor = load_pickle_or_joblib(preprocessor_path) if preprocessor_path else None
    metadata = load_metadata(meta_path) if meta_path else {}

    # Load input CSV
    df = pd.read_csv(input_csv)
    original_index = df.index

    # Prepare features
    df_prepared = prepare_input_dataframe(df, feature_columns, metadata)

    # Apply preprocessor if present
    X = apply_preprocessor(preprocessor, df_prepared) if preprocessor else df_prepared.values

    # Predict
    preds, proba = predict_with_model(model, X)

    # Build output DataFrame
    out = pd.DataFrame(index=original_index)
    out["prediction"] = preds
    if proba is not None:
        # If proba is 2D with classes, add columns
        if proba.ndim == 2 and proba.shape[1] <= 10:  # avoid too many columns
            for i in range(proba.shape[1]):
                out[f"proba_class_{i}"] = proba[:, i]
        else:
            out["proba"] = list(proba)

    # Optionally add input features to output for context (first N rows)
    sample_out = pd.concat([df.loc[: sample_rows - 1].reset_index(drop=True), out.reset_index(drop=True)], axis=1)

    # Save CSV if requested
    if output_csv:
        out.to_csv(output_csv, index=False)
    return sample_out


def main():
    parser = argparse.ArgumentParser(description="Run predictions using saved model, preprocessor, features, and metadata")
    parser.add_argument("--model", required=True, help="Path to saved model (pkl/joblib)")
    parser.add_argument("--features", required=True, help="Path to saved feature_columns.npy")
    parser.add_argument("--preprocessor", required=False, help="Path to saved preprocessor pipeline (pkl/joblib)")
    parser.add_argument("--meta", required=False, help="Path to model metadata json")
    parser.add_argument("--input", required=True, help="Input CSV file with raw data")
    parser.add_argument("--output", required=False, help="Output CSV file to write predictions")
    parser.add_argument("--sample-rows", type=int, default=5, help="How many rows to print as a sample (default=5)")
    args = parser.parse_args()

    sample_out = run_predictions(
        model_path=args.model,
        feature_path=args.features,
        preprocessor_path=args.preprocessor,
        meta_path=args.meta,
        input_csv=args.input,
        output_csv=args.output,
        sample_rows=args.sample_rows,
    )

    print("Sample prediction output (first rows):")
    print(sample_out.head(args.sample_rows).to_string(index=False))


if __name__ == "__main__":
    main()