use reqwest::Client;

use crate::core::error::AppError;

pub struct HttpClient {
    client: Client,
}

impl Clone for HttpClient {
    fn clone(&self) -> Self {
        Self {
            client: self.client.clone(),
        }
    }
}

impl HttpClient {
    pub fn new() -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(8))
            .user_agent(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            )
            .gzip(true)
            .brotli(true)
            .cookie_store(true)
            .build()
            .expect("Failed to build HTTP client");

        Self { client }
    }

    pub async fn get(
        &self,
        url: &str,
        headers: Option<&[(String, String)]>,
    ) -> Result<String, AppError> {
        let mut request = self.client.get(url);

        if let Some(headers) = headers {
            for (key, value) in headers {
                request = request.header(key, value);
            }
        }

        let response = request.send().await?;
        let body = response.text().await?;
        Ok(body)
    }

    pub async fn get_bytes(&self, url: &str) -> Result<Vec<u8>, AppError> {
        let response = self.client.get(url).send().await?;
        let bytes = response.bytes().await?.to_vec();
        Ok(bytes)
    }

    pub async fn post_json<T: serde::Serialize, R: serde::de::DeserializeOwned>(
        &self,
        url: &str,
        body: &T,
    ) -> Result<R, AppError> {
        let response = self.client.post(url).json(body).send().await?;
        let result = response.json::<R>().await?;
        Ok(result)
    }
}

impl Default for HttpClient {
    fn default() -> Self {
        Self::new()
    }
}
