//! Webhook Service
//! 
//! Handles sending webhook notifications to merchants with retry logic
//! and delivery tracking.

use crate::config::Config;
use crate::services::Database;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::{debug, error, info, warn};
use uuid::Uuid;
use tokio::time::{sleep, Duration};

/// Webhook event types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WebhookEventType {
    TransactionCreated,
    TransactionCompleted,
    TransactionFailed,
    TransactionPending,
}

impl std::fmt::Display for WebhookEventType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::TransactionCreated => write!(f, "transaction.created"),
            Self::TransactionCompleted => write!(f, "transaction.completed"),
            Self::TransactionFailed => write!(f, "transaction.failed"),
            Self::TransactionPending => write!(f, "transaction.pending"),
        }
    }
}

/// Webhook payload sent to merchants
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookPayload {
    pub event: String,
    pub delivery_id: String,
    pub timestamp: String,
    pub data: WebhookData,
}

/// Transaction data in webhook
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookData {
    pub transaction_id: i64,
    pub transaction_hash: Option<String>,
    pub status: String,
    pub network: String,
    pub asset: String,
    pub amount: String,
    pub payer_address: String,
    pub recipient_address: String,
    pub resource: Option<String>,
}

/// Webhook service for sending notifications
pub struct WebhookService {
    config: Arc<Config>,
    database: Arc<Database>,
    client: Client,
}

impl WebhookService {
    pub fn new(config: Arc<Config>, database: Arc<Database>) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_millis(config.webhook_timeout_ms))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            config,
            database,
            client,
        }
    }

    /// Send a webhook notification for a transaction
    pub async fn send_transaction_webhook(
        &self,
        api_key: &str,
        webhook_url: &str,
        event_type: WebhookEventType,
        transaction_id: i64,
        transaction_hash: Option<&str>,
        status: &str,
        network: &str,
        asset: &str,
        amount: &str,
        payer_address: &str,
        recipient_address: &str,
        resource: Option<&str>,
    ) {
        let delivery_id = Uuid::new_v4().to_string();
        let event_str = event_type.to_string();
        
        let payload = WebhookPayload {
            event: event_str.clone(),
            delivery_id: delivery_id.clone(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            data: WebhookData {
                transaction_id,
                transaction_hash: transaction_hash.map(String::from),
                status: status.to_string(),
                network: network.to_string(),
                asset: asset.to_string(),
                amount: amount.to_string(),
                payer_address: payer_address.to_string(),
                recipient_address: recipient_address.to_string(),
                resource: resource.map(String::from),
            },
        };

        // Serialize payload for request_body logging
        let payload_json = serde_json::to_string(&payload).ok();

        // Log initial delivery attempt
        if let Err(e) = self.database.log_webhook_delivery_v2(
            api_key,
            Some(transaction_id),
            &delivery_id,
            &event_str,
            webhook_url,
            payload_json.as_deref(),
            None,
            None,
            "pending",
            1,
            None,
        ).await {
            warn!("Failed to log webhook delivery: {}", e);
        }

        // Try sending with retries
        let max_attempts = self.config.webhook_retry_attempts;
        let retry_delays = &self.config.webhook_retry_delays;
        
        for attempt in 1..=max_attempts {
            match self.send_webhook_request(webhook_url, &payload).await {
                Ok(status_code) => {
                    info!(
                        "✅ Webhook delivered: {} -> {} (status: {}, attempt: {})",
                        event_str, webhook_url, status_code, attempt
                    );
                    
                    // Update delivery status to success
                    if let Err(e) = self.database.log_webhook_delivery_v2(
                        api_key,
                        Some(transaction_id),
                        &delivery_id,
                        &event_str,
                        webhook_url,
                        payload_json.as_deref(),
                        Some(status_code as i32),
                        None, // response_body
                        "delivered",
                        attempt as i32,
                        None,
                    ).await {
                        warn!("Failed to update webhook delivery status: {}", e);
                    }
                    return;
                }
                Err(error) => {
                    warn!(
                        "❌ Webhook failed: {} -> {} (attempt {}/{}, error: {})",
                        event_str, webhook_url, attempt, max_attempts, error
                    );
                    
                    // Update with retry status
                    let status = if attempt == max_attempts { "failed" } else { "retrying" };
                    if let Err(e) = self.database.log_webhook_delivery_v2(
                        api_key,
                        Some(transaction_id),
                        &delivery_id,
                        &event_str,
                        webhook_url,
                        payload_json.as_deref(),
                        None,
                        None,
                        status,
                        attempt as i32,
                        Some(&error),
                    ).await {
                        warn!("Failed to update webhook delivery status: {}", e);
                    }

                    // Sleep before retry (if not last attempt)
                    if attempt < max_attempts {
                        let delay_idx = (attempt - 1) as usize;
                        let delay = retry_delays.get(delay_idx).copied().unwrap_or(5000);
                        debug!("Retrying webhook in {}ms...", delay);
                        sleep(Duration::from_millis(delay)).await;
                    }
                }
            }
        }

        error!(
            "🚨 Webhook delivery failed after {} attempts: {} -> {}",
            max_attempts, event_str, webhook_url
        );
    }

    /// Send the actual HTTP request
    async fn send_webhook_request(&self, url: &str, payload: &WebhookPayload) -> Result<u16, String> {
        let response = self.client
            .post(url)
            .header("Content-Type", "application/json")
            .header("X-Webhook-Event", &payload.event)
            .header("X-Delivery-ID", &payload.delivery_id)
            .json(payload)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let status = response.status();
        
        if status.is_success() {
            Ok(status.as_u16())
        } else {
            Err(format!("HTTP {}: {}", status.as_u16(), status.canonical_reason().unwrap_or("Unknown")))
        }
    }
}
