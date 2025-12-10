```markdown
Next.js + Python (FastAPI) model inference example

Overview
- backend/: FastAPI service that loads your Python model artifacts and exposes /predict.
- frontend/: Next.js app that uploads a CSV or JSON rows to the backend via a proxy API route.

Put your artifacts in backend/:
- xgb_fraud_model_no_smote.pkl
- feature_columns.npy
- preprocess_pipeline.pkl (optional)
- model_meta.json (optional)

Backend
1. Enter backend/ and create a venv:
   python -m venv .venv
   source .venv/bin/activate   # Windows: .venv\\Scripts\\activate
   pip install -r requirements.txt

2. Start the server:
   uvicorn app:app --reload --host 0.0.0.0 --port 8000

API:
- POST /predict
  - multipart/form-data:
    - file: CSV file
    - OR json_rows: JSON array of row objects
  - Returns JSON { predictions: [...], proba: [...], sample_inputs: [...] }

Frontend
1. In frontend/:
   npm install
   npm run dev

2. The Next.js app proxies requests to BACKEND_URL (defaults to http://localhost:8000). Set BACKEND_URL in .env.local if needed.

Usage
- Open http://localhost:3000
- Upload a CSV with columns matching your feature_columns.npy (or leave missing — defaults from model_meta.json will be applied)
- Click Upload & Predict

Notes & next steps
- In production you probably want to:
  - Secure the backend and restrict CORS/origins.
  - Add authentication and rate limiting.
  - Add batching, streaming responses for large files.
  - Expose metrics and logging.
- Alternatively you can containerize the backend using the provided Dockerfile and orchestrate with Docker Compose or Kubernetes.

If you want, I can:
- Provide a docker-compose.yml to run frontend + backend together.
- Add an evaluation endpoint that accepts labeled CSV and returns metrics (ROC AUC, confusion matrix).
- Harden the API (timeouts, input validation) and add typed responses (Pydantic models).
```