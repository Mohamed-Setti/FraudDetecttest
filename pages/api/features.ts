import type { NextApiRequest, NextApiResponse } from "next";

const BACKEND_URL = process.env.BACKEND_URL || "https://xgboost-faud-detect.onrender.com";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const resp = await fetch(`${BACKEND_URL}/features`);
    const body = await resp.json();
    res.status(resp.status).json(body);
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message ?? err) });
  }
}