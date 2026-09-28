use base64::Engine;
use md5::Md5;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256, Sha512};
use std::fs;
use std::time::Instant;

/// Read a text file from disk.
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Calculate file hash. `algo` supports md5 / sha256 / sha512.
#[tauri::command]
pub fn calc_file_hash(path: String, algo: String) -> Result<String, String> {
    let data = fs::read(&path).map_err(|e| e.to_string())?;
    match algo.to_ascii_lowercase().as_str() {
        "md5" => Ok(hex::encode(Md5::digest(&data))),
        "sha256" => Ok(hex::encode(Sha256::digest(&data))),
        "sha512" => Ok(hex::encode(Sha512::digest(&data))),
        _ => Err(format!("unsupported algo: {algo}")),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpKv {
    pub key: String,
    pub value: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequestInput {
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: Vec<HttpKv>,
    #[serde(default)]
    pub query: Vec<HttpKv>,
    #[serde(default)]
    pub body: Option<String>,
    /// none | json | text | form
    #[serde(default)]
    pub body_type: Option<String>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponseOutput {
    pub ok: bool,
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<HttpKv>,
    pub body: String,
    pub duration_ms: u64,
    pub size_bytes: usize,
    pub final_url: String,
    pub error: Option<String>,
}

/// Send an HTTP request (Postman-like). Runs outside WebView so no CORS.
#[tauri::command]
pub async fn http_request(input: HttpRequestInput) -> Result<HttpResponseOutput, String> {
    let method = input.method.trim().to_uppercase();
    if method.is_empty() {
        return Err("method is required".into());
    }
    let raw_url = input.url.trim();
    if raw_url.is_empty() {
        return Err("url is required".into());
    }

    let timeout =
        std::time::Duration::from_millis(input.timeout_ms.unwrap_or(30_000).max(1_000));
    let client = reqwest::Client::builder()
        .timeout(timeout)
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| e.to_string())?;

    let mut url = reqwest::Url::parse(raw_url).map_err(|e| format!("invalid url: {e}"))?;
    {
        let mut pairs = url.query_pairs_mut();
        for q in input
            .query
            .iter()
            .filter(|q| q.enabled && !q.key.trim().is_empty())
        {
            pairs.append_pair(q.key.trim(), q.value.as_str());
        }
    }

    let http_method = reqwest::Method::from_bytes(method.as_bytes())
        .map_err(|_| format!("unsupported method: {method}"))?;

    let mut builder = client.request(http_method, url);

    for h in input
        .headers
        .iter()
        .filter(|h| h.enabled && !h.key.trim().is_empty())
    {
        builder = builder.header(h.key.trim(), h.value.as_str());
    }

    let body_type = input
        .body_type
        .as_deref()
        .unwrap_or("none")
        .to_ascii_lowercase();
    let body = input.body.unwrap_or_default();
    if body_type != "none" && !body.is_empty() && method != "GET" && method != "HEAD" {
        match body_type.as_str() {
            "json" => {
                if serde_json::from_str::<serde_json::Value>(&body).is_err() {
                    return Err("body is not valid JSON".into());
                }
                builder = builder
                    .header(reqwest::header::CONTENT_TYPE, "application/json")
                    .body(body);
            }
            "form" => {
                builder = builder
                    .header(
                        reqwest::header::CONTENT_TYPE,
                        "application/x-www-form-urlencoded",
                    )
                    .body(body);
            }
            _ => {
                builder = builder.body(body);
            }
        }
    }

    let started = Instant::now();
    let response = match builder.send().await {
        Ok(r) => r,
        Err(e) => {
            return Ok(HttpResponseOutput {
                ok: false,
                status: 0,
                status_text: "ERROR".into(),
                headers: vec![],
                body: String::new(),
                duration_ms: started.elapsed().as_millis() as u64,
                size_bytes: 0,
                final_url: raw_url.to_string(),
                error: Some(e.to_string()),
            });
        }
    };

    let status = response.status();
    let status_code = status.as_u16();
    let status_text = status.canonical_reason().unwrap_or("").to_string();
    let final_url = response.url().to_string();

    let mut headers = Vec::new();
    for (k, v) in response.headers().iter() {
        headers.push(HttpKv {
            key: k.to_string(),
            value: v.to_str().unwrap_or("").to_string(),
            enabled: true,
        });
    }

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    let size_bytes = bytes.len();
    let body = match String::from_utf8(bytes.to_vec()) {
        Ok(s) => {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
                serde_json::to_string_pretty(&v).unwrap_or(s)
            } else {
                s
            }
        }
        Err(_) => format!(
            "<binary {} bytes, base64>\n{}",
            size_bytes,
            base64::engine::general_purpose::STANDARD.encode(bytes.as_ref())
        ),
    };

    Ok(HttpResponseOutput {
        ok: status.is_success(),
        status: status_code,
        status_text,
        headers,
        body,
        duration_ms: started.elapsed().as_millis() as u64,
        size_bytes,
        final_url,
        error: None,
    })
}
