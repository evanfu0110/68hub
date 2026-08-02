use crate::error::AppResult;

#[cfg(target_os = "android")]
use crate::error::AppError;

pub fn client_for(_target_url: &str) -> AppResult<reqwest::Client> {
    #[cfg(target_os = "android")]
    {
        return android_client();
    }

    #[cfg(not(target_os = "android"))]
    base_builder()
        .no_proxy()
        .build()
        .map_err(Into::into)
}

fn base_builder() -> reqwest::ClientBuilder {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("Mozilla/5.0 (68HUB Android/2.0)")
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
    // Use Mozilla roots instead of rustls-platform-verifier so HTTPS works without
    // an additional Android JNI/Kotlin verifier setup.
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

#[cfg(test)]
mod tests {
    #[test]
    fn builds_http_client_for_tests() {
        super::client_for("https://opencode.ai").expect("http client should build");
    }
}
