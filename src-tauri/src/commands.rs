use base64::Engine;
use hmac::{Hmac, Mac};
use md5::Md5;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256, Sha512};
use std::fs;
use std::collections::HashMap;
use std::path::Path;
use std::time::Instant;
use walkdir::WalkDir;

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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileHashResult {
    path: String,
    hash: String,
    error: Option<String>,
}

#[tauri::command]
pub fn calc_files_hash(paths: Vec<String>, algo: String) -> Vec<FileHashResult> {
    paths
        .into_iter()
        .map(|path| match calc_file_hash(path.clone(), algo.clone()) {
            Ok(hash) => FileHashResult {
                path,
                hash,
                error: None,
            },
            Err(error) => FileHashResult {
                path,
                hash: String::new(),
                error: Some(error),
            },
        })
        .collect()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextFileInfo {
    size_bytes: usize,
    encoding: String,
    line_ending: String,
    line_count: usize,
}

#[tauri::command]
pub fn inspect_text_file(path: String) -> Result<TextFileInfo, String> {
    let data = fs::read(path).map_err(|e| e.to_string())?;
    let encoding = if data.starts_with(&[0xEF, 0xBB, 0xBF]) {
        "UTF-8 with BOM"
    } else if data.starts_with(&[0xFF, 0xFE]) {
        "UTF-16 LE"
    } else if data.starts_with(&[0xFE, 0xFF]) {
        "UTF-16 BE"
    } else if std::str::from_utf8(&data).is_ok() {
        "UTF-8"
    } else {
        "Unknown / binary"
    };
    let crlf = data.windows(2).filter(|pair| *pair == b"\r\n").count();
    let lf = data.iter().filter(|byte| **byte == b'\n').count();
    let cr = data.iter().filter(|byte| **byte == b'\r').count();
    let line_ending = if crlf > 0 && (lf > crlf || cr > crlf) {
        "Mixed"
    } else if crlf > 0 {
        "CRLF"
    } else if lf > 0 {
        "LF"
    } else if cr > 0 {
        "CR"
    } else {
        "None"
    };
    Ok(TextFileInfo {
        size_bytes: data.len(),
        encoding: encoding.to_string(),
        line_ending: line_ending.to_string(),
        line_count: lf.saturating_add(1),
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TcpProbeResult {
    ok: bool,
    address: String,
    duration_ms: u64,
    error: Option<String>,
}

#[tauri::command]
pub async fn dns_lookup(host: String) -> Result<Vec<String>, String> {
    let addresses = tokio::net::lookup_host((host.as_str(), 0))
        .await
        .map_err(|e| e.to_string())?;
    let mut values: Vec<String> = addresses.map(|address| address.ip().to_string()).collect();
    values.sort();
    values.dedup();
    Ok(values)
}

#[tauri::command]
pub async fn tcp_probe(host: String, port: u16, timeout_ms: u64) -> TcpProbeResult {
    let address = format!("{host}:{port}");
    let started = Instant::now();
    let result = tokio::time::timeout(
        std::time::Duration::from_millis(timeout_ms.clamp(500, 30_000)),
        tokio::net::TcpStream::connect(&address),
    )
    .await;
    match result {
        Ok(Ok(_)) => TcpProbeResult {
            ok: true,
            address,
            duration_ms: started.elapsed().as_millis() as u64,
            error: None,
        },
        Ok(Err(error)) => TcpProbeResult {
            ok: false,
            address,
            duration_ms: started.elapsed().as_millis() as u64,
            error: Some(error.to_string()),
        },
        Err(_) => TcpProbeResult {
            ok: false,
            address,
            duration_ms: started.elapsed().as_millis() as u64,
            error: Some("connection timed out".to_string()),
        },
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGroup {
    size_bytes: u64,
    hash: String,
    paths: Vec<String>,
}

#[tauri::command]
pub fn find_duplicate_files(directory: String, min_size: u64) -> Result<Vec<DuplicateGroup>, String> {
    let mut by_size: HashMap<u64, Vec<String>> = HashMap::new();
    for entry in WalkDir::new(directory).follow_links(false).into_iter().filter_map(Result::ok) {
        if !entry.file_type().is_file() {
            continue;
        }
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        if metadata.len() >= min_size {
            by_size
                .entry(metadata.len())
                .or_default()
                .push(entry.path().to_string_lossy().to_string());
        }
    }

    let mut groups = Vec::new();
    for (size_bytes, paths) in by_size.into_iter().filter(|(_, paths)| paths.len() > 1) {
        let mut by_hash: HashMap<String, Vec<String>> = HashMap::new();
        for path in paths {
            let hash = calc_file_hash(path.clone(), "sha256".to_string())?;
            by_hash.entry(hash).or_default().push(path);
        }
        for (hash, duplicate_paths) in by_hash.into_iter().filter(|(_, paths)| paths.len() > 1) {
            groups.push(DuplicateGroup {
                size_bytes,
                hash,
                paths: duplicate_paths,
            });
        }
    }
    groups.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    Ok(groups)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameItem {
    from: String,
    to: String,
}

#[tauri::command]
pub fn rename_files(items: Vec<RenameItem>) -> Result<usize, String> {
    for item in &items {
        if !Path::new(&item.from).is_file() {
            return Err(format!("source file does not exist: {}", item.from));
        }
        if item.from != item.to && Path::new(&item.to).exists() {
            return Err(format!("destination already exists: {}", item.to));
        }
    }
    let count = items.len();
    for item in items {
        if item.from != item.to {
            fs::rename(&item.from, &item.to).map_err(|e| e.to_string())?;
        }
    }
    Ok(count)
}

/// Calculate a digest for UTF-8 text.
#[tauri::command]
pub fn calc_text_hash(text: String, algo: String) -> Result<String, String> {
    let data = text.as_bytes();
    match algo.to_ascii_lowercase().as_str() {
        "md5" => Ok(hex::encode(Md5::digest(data))),
        "sha256" => Ok(hex::encode(Sha256::digest(data))),
        "sha512" => Ok(hex::encode(Sha512::digest(data))),
        _ => Err(format!("unsupported algo: {algo}")),
    }
}

/// Calculate an HMAC for UTF-8 text.
#[tauri::command]
pub fn calc_hmac(text: String, key: String, algo: String) -> Result<String, String> {
    match algo.to_ascii_lowercase().as_str() {
        "md5" => {
            let mut mac = <Hmac<Md5> as Mac>::new_from_slice(key.as_bytes())
                .map_err(|e| e.to_string())?;
            mac.update(text.as_bytes());
            Ok(hex::encode(mac.finalize().into_bytes()))
        }
        "sha256" => {
            let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(key.as_bytes())
                .map_err(|e| e.to_string())?;
            mac.update(text.as_bytes());
            Ok(hex::encode(mac.finalize().into_bytes()))
        }
        "sha512" => {
            let mut mac = <Hmac<Sha512> as Mac>::new_from_slice(key.as_bytes())
                .map_err(|e| e.to_string())?;
            mac.update(text.as_bytes());
            Ok(hex::encode(mac.finalize().into_bytes()))
        }
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

#[cfg(test)]
mod tests {
    use super::{calc_hmac, calc_text_hash};

    #[test]
    fn calculates_known_text_hashes() {
        assert_eq!(
            calc_text_hash("toolbox".to_string(), "sha256".to_string()).unwrap(),
            "dd221319b058fd80bf9028981e5d9e892d6102c48eec8b71b97863739a176874"
        );
        assert_eq!(
            calc_text_hash("toolbox".to_string(), "md5".to_string()).unwrap(),
            "0e842b75e5f8473161ee799ef5a129fd"
        );
    }

    #[test]
    fn calculates_known_hmac() {
        assert_eq!(
            calc_hmac(
                "toolbox".to_string(),
                "secret".to_string(),
                "sha256".to_string()
            )
            .unwrap(),
            "c02f4c279f543e0bf3afd395467f57cb2711f78b09d8c94e26aafae743650c9e"
        );
    }
}
