const http = require("http");
const https = require("https");
const { URL } = require("url");

async function httpRequest(input) {
  const method = String(input.method || "GET").trim().toUpperCase();
  const rawUrl = String(input.url || "").trim();
  if (!method) throw new Error("method is required");
  if (!rawUrl) throw new Error("url is required");
  const timeoutMs = Math.max(1000, Number(input.timeoutMs || 30000));
  const u = new URL(rawUrl);
  for (const q of (input.query || []).filter((x) => x && x.enabled && String(x.key || "").trim())) {
    u.searchParams.append(String(q.key).trim(), String(q.value || ""));
  }
  const headers = {};
  for (const h of (input.headers || []).filter((x) => x && x.enabled && String(x.key || "").trim())) {
    headers[String(h.key).trim()] = String(h.value || "");
  }
  let body = input.body || "";
  const bodyType = String(input.bodyType || "none").toLowerCase();
  if (bodyType !== "none" && body && method !== "GET" && method !== "HEAD") {
    if (bodyType === "json") {
      JSON.parse(body);
      if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) headers["Content-Type"] = "application/json";
    } else if (bodyType === "form") {
      if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
  } else {
    body = "";
  }
  const lib = u.protocol === "https:" ? https : http;
  const started = Date.now();
  return await new Promise((resolve) => {
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const outHeaders = Object.entries(res.headers || {}).map(([key, value]) => ({
            key,
            value: Array.isArray(value) ? value.join(", ") : String(value ?? ""),
            enabled: true,
          }));
          resolve({
            ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 400,
            status: res.statusCode || 0,
            statusText: res.statusMessage || "",
            headers: outHeaders,
            body: buf.toString("utf8"),
            durationMs: Date.now() - started,
            sizeBytes: buf.length,
            finalUrl: u.toString(),
            error: null,
          });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", (e) => {
      resolve({
        ok: false,
        status: 0,
        statusText: "ERROR",
        headers: [],
        body: "",
        durationMs: Date.now() - started,
        sizeBytes: 0,
        finalUrl: rawUrl,
        error: String(e && e.message ? e.message : e),
      });
    });
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  const cases = JSON.parse(process.argv[2] || "[]");
  const out = [];
  for (const c of cases) {
    const res = await httpRequest(c);
    out.push({
      name: c.name || c.url,
      ok: res.ok,
      status: res.status,
      durationMs: res.durationMs,
      sizeBytes: res.sizeBytes,
      error: res.error,
      bodyPreview: (res.body || "").slice(0, 240),
      url: res.finalUrl,
    });
  }
  process.stdout.write(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
