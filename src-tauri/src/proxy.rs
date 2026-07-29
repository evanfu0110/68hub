use crate::error::{AppError, AppResult};

pub fn client_for(target_url: &str) -> AppResult<reqwest::Client> {
    #[cfg(target_os = "android")]
    {
        let _ = target_url;
        return android_client();
    }

    #[cfg(target_os = "windows")]
    {
        let mut builder = base_builder();
        if let Some(proxy_url) = proxy_for(target_url)? {
            let proxy = reqwest::Proxy::all(&proxy_url)
                .map_err(|e| AppError::ProxyResolution(e.to_string()))?;
            builder = builder.proxy(proxy);
        } else {
            builder = builder.no_proxy();
        }
        builder.build().map_err(Into::into)
    }
}

fn base_builder() -> reqwest::ClientBuilder {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("Mozilla/5.0 (68HUB/2.0)")
}

#[cfg(target_os = "android")]
fn android_client() -> AppResult<reqwest::Client> {
    use std::sync::OnceLock;

    static CLIENT: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();
    match CLIENT.get_or_init(build_android_client) {
        Ok(client) => Ok(client.clone()),
        Err(message) => Err(AppError::Network(message.clone())),
    }
}

#[cfg(target_os = "android")]
fn build_android_client() -> Result<reqwest::Client, String> {
    // Avoid rustls-platform-verifier on Android: it expects a one-time JNI init and a
    // bundled Kotlin helper. Without that setup, the first HTTPS call panics and the
    // release profile aborts the process (seen as an instant sync crash).
    let root_store = rustls::RootCertStore {
        roots: webpki_roots::TLS_SERVER_ROOTS.to_vec(),
    };
    let tls = rustls::ClientConfig::builder()
        .with_root_certificates(root_store)
        .with_no_client_auth();

    base_builder()
        .no_proxy()
        .use_preconfigured_tls(tls)
        .build()
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "windows")]
fn proxy_for(target_url: &str) -> AppResult<Option<String>> {
    use systemproxy::{Autoproxy, SystemProxy};

    let auto = Autoproxy::get_auto_proxy().map_err(|e| AppError::ProxyResolution(e.to_string()))?;
    if auto.enable {
        let directive = proxyparser::pac::evaluate_pac_for_url(&auto.url, target_url)
            .map_err(|e| AppError::ProxyResolution(e.to_string()))?;
        return parse_proxy_directive(&directive);
    }

    let proxy =
        SystemProxy::get_system_proxy().map_err(|e| AppError::ProxyResolution(e.to_string()))?;
    if !proxy.enable {
        return Ok(None);
    }
    Ok(Some(format!("http://{}:{}", proxy.host, proxy.port)))
}

#[cfg(target_os = "windows")]
fn parse_proxy_directive(value: &str) -> AppResult<Option<String>> {
    for candidate in value.split(';').map(str::trim) {
        if candidate.eq_ignore_ascii_case("DIRECT") {
            return Ok(None);
        }
        let mut parts = candidate.split_whitespace();
        let kind = parts.next().unwrap_or_default().to_ascii_uppercase();
        let address = parts.next().unwrap_or_default();
        if matches!(kind.as_str(), "PROXY" | "HTTP" | "HTTPS") && !address.is_empty() {
            return Ok(Some(format!("http://{address}")));
        }
    }
    Err(AppError::ProxyResolution(format!(
        "unsupported proxy directive: {value}"
    )))
}

#[cfg(test)]
mod tests {
    #[cfg(target_os = "windows")]
    #[test]
    fn parses_pac_directives() {
        assert_eq!(super::parse_proxy_directive("DIRECT").unwrap(), None);
        assert_eq!(
            super::parse_proxy_directive("PROXY 127.0.0.1:7890; DIRECT").unwrap(),
            Some("http://127.0.0.1:7890".into())
        );
    }

    #[test]
    fn builds_default_http_client() {
        // Ensures the desktop/default TLS path still constructs a client.
        super::client_for("https://opencode.ai")
            .expect("http client should build");
    }
}
