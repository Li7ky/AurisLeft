use moka::future::Cache;

pub struct HttpCache {
    cache: Cache<String, String>,
}

impl HttpCache {
    pub fn new(ttl_seconds: u64, max_capacity: u64) -> Self {
        let cache = Cache::builder()
            .time_to_live(std::time::Duration::from_secs(ttl_seconds))
            .max_capacity(max_capacity)
            .build();

        Self { cache }
    }

    pub async fn get(&self, key: &str) -> Option<String> {
        self.cache.get(key).await
    }

    pub async fn set(&self, key: String, value: String) {
        self.cache.insert(key, value).await;
    }

    pub fn remove(&self, key: &str) {
        let _ = self.cache.invalidate(key);
    }

    pub fn clear(&self) {
        self.cache.invalidate_all();
    }

    pub fn entry_count(&self) -> u64 {
        self.cache.entry_count()
    }
}
