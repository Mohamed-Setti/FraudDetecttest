import os
import json

import numpy as np
import pandas as pd
import pytest

from predict import (
    apply_preprocessor,
    load_features,
    load_metadata,
    load_pickle_or_joblib,
    prepare_input_dataframe,
    predict_with_model,
)


# Paths expected to be present in the working directory for the tests
MODEL_PATH = "xgb_fraud_model_no_smote.pkl"
FEATURE_PATH = "feature_columns.npy"
PREPROCESSOR_PATH = "preprocess_pipeline.pkl"
META_PATH = "model_meta.json"


def skip_if_missing(path):
    if not os.path.exists(path):
        pytest.skip(f"Missing artifact: {path}")


def test_artifacts_loadable():
    skip_if_missing(MODEL_PATH)
    skip_if_missing(FEATURE_PATH)

    model = load_pickle_or_joblib(MODEL_PATH)
    features = load_features(FEATURE_PATH)

    # Preprocessor and metadata are optional
    if os.path.exists(PREPROCESSOR_PATH):
        preproc = load_pickle_or_joblib(PREPROCESSOR_PATH)
        assert preproc is not None
    if os.path.exists(META_PATH):
        meta = load_metadata(META_PATH)
        assert isinstance(meta, dict)

    assert model is not None
    assert isinstance(features, list)
    assert len(features) > 0


def test_predict_on_synthetic_row():
    skip_if_missing(MODEL_PATH)
    skip_if_missing(FEATURE_PATH)

    # Load model and features
    model = load_pickle_or_joblib(MODEL_PATH)
    features = load_features(FEATURE_PATH)

    # Create a synthetic DataFrame with one row, using zeros / empty strings
    sample = {f: 0 for f in features}
    df = pd.DataFrame([sample])

    # If preprocessor exists, run it
    if os.path.exists(PREPROCESSOR_PATH):
        preproc = load_pickle_or_joblib(PREPROCESSOR_PATH)
        X = apply_preprocessor(preproc, df)
    else:
        X = df.values

    preds, proba = predict_with_model(model, X)

    # Basic assertions about shapes and types
    assert preds.shape[0] == 1
    if proba is not None:
        # probabilities should sum to ~1 per row (if 2D)
        if proba.ndim == 2:
            np.testing.assert_allclose(proba.sum(axis=1), np.ones(proba.shape[0]), rtol=1e-4, atol=1e-6)


def test_prepare_input_with_metadata_defaults():
    skip_if_missing(FEATURE_PATH)
    # create minimal metadata with defaults for a subset
    features = load_features(FEATURE_PATH)
    meta = {"feature_defaults": {features[0]: 123, features[1]: "foo"}}
    # input missing all features
    df = pd.DataFrame([{}])
    prepared = prepare_input_dataframe(df, features, metadata=meta)
    # check that default applied for first two features and that all expected columns present
    assert features[0] in prepared.columns and features[1] in prepared.columns
    assert prepared[features[0]].iloc[0] == 123
    assert prepared[features[1]].iloc[0] == "foo"
    assert list(prepared.columns) == features