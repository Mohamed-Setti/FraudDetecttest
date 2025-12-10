import type { NextApiRequest, NextApiResponse } from "next";

const BACKEND_URL = process.env.FRAUD_API_URL_SERVER ?? "http://localhost:5000";

// Ensure BACKEND_URL is set
if (!BACKEND_URL) {
  throw new Error("BACKEND_URL environment variable is not set");
}

// Ensure process and console are available in the global scope

export const config = {
  api: {
    bodyParser: false, // we forward the raw multipart form
  },
};

function sanitizeRequestHeaders(headers: NextApiRequest["headers"]) {
  const sanitized: Record<string, string> = {};
  Object.entries(headers).forEach(([key, value]) => {
    if (!value) return;
    const lowerKey = key.toLowerCase();
    // Strip hop-by-hop headers or headers that should not be forwarded
    if (["host", "content-length", "connection"].includes(lowerKey)) return;
    sanitized[lowerKey] = Array.isArray(value) ? value.join(",") : String(value);
  });
  return sanitized;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  
  console.log("backend URL:", BACKEND_URL)
  const url = `${BACKEND_URL}/predict`;
  console.log("url :", url)

  try {
    // Read request body as Buffer for non-GET/HEAD
    let incomingBuffer: Buffer | undefined;
    if (req.method && req.method !== "GET" && req.method !== "HEAD") {
      incomingBuffer = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
      });
    }

    // Convert Buffer to a BodyInit-friendly type (Uint8Array)
    let bodyToSend: BodyInit | undefined;
    if (incomingBuffer) {
      // Create an ArrayBuffer view that correctly accounts for Buffer byteOffset/length
      bodyToSend = new Uint8Array(incomingBuffer);
    }

    // Build headers to forward (sanitize a few)
    const forwardHeaders = sanitizeRequestHeaders(req.headers);
    // Ensure content-type forwarded if present
    if (!forwardHeaders["content-type"] && req.headers["content-type"]) {
      forwardHeaders["content-type"] = String(req.headers["content-type"]);
    }
    forwardHeaders["accept-encoding"] = "identity";

    // Proxy the request to the backend
    const backendResp = await fetch(url, {
      method: req.method,
      headers: forwardHeaders as HeadersInit,
      body: bodyToSend,
    });

    // Copy response headers (except hop-by-hop)
    backendResp.headers.forEach((value, name) => {
      const n = name.toLowerCase();
      if (
        [
          "transfer-encoding",
          "connection",
          "keep-alive",
          "proxy-authenticate",
          "proxy-authorization",
          "te",
          "trailer",
          "upgrade",
          "content-encoding",
        ].includes(n)
      ) {
        return;
      }
      res.setHeader(name, value);
    });

    const respBuffer = Buffer.from(await backendResp.arrayBuffer());
    res.status(backendResp.status).send(respBuffer);
  } catch (err: any) {
    console.error("proxyPredict error:", err);
    // Return a JSON error so the client can show something useful
    res.status(500).json({ error: String(err?.message ?? err) });
  }
}