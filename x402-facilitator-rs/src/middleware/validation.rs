//! Request Validation Middleware
//! 
//! Validates request bodies using the validator crate

#![allow(dead_code)]

use axum::{
    extract::{rejection::JsonRejection, FromRequest, Request},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::de::DeserializeOwned;
use validator::Validate;

use crate::types::ErrorResponse;
/// Validated JSON extractor
/// Combines JSON parsing with validator validation
#[derive(Debug, Clone, Copy, Default)]
pub struct ValidatedJson<T>(pub T);

#[axum::async_trait]
impl<T, S> FromRequest<S> for ValidatedJson<T>
where
    T: DeserializeOwned + Validate,
    S: Send + Sync,
{
    type Rejection = Response;

    async fn from_request(req: Request, state: &S) -> Result<Self, Self::Rejection> {
        // First, try to parse JSON
        let Json(value) = Json::<T>::from_request(req, state)
            .await
            .map_err(|rejection: JsonRejection| {
                let message = match &rejection {
                    JsonRejection::JsonDataError(e) => {
                        format!("Invalid JSON data: {}", e)
                    }
                    JsonRejection::JsonSyntaxError(e) => {
                        format!("Invalid JSON syntax: {}", e)
                    }
                    JsonRejection::MissingJsonContentType(e) => {
                        format!("Missing Content-Type: application/json header: {}", e)
                    }
                    JsonRejection::BytesRejection(e) => {
                        format!("Failed to read request body: {}", e)
                    }
                    _ => "Unknown JSON parsing error".to_string(),
                };

                (
                    StatusCode::BAD_REQUEST,
                    Json(ErrorResponse::new("Bad Request", message)),
                ).into_response()
            })?;

        // Then validate using validator
        value.validate().map_err(|e| {
            let errors: Vec<String> = e
                .field_errors()
                .into_iter()
                .flat_map(|(field, errors)| {
                    errors.iter().map(move |error| {
                        match &error.message {
                            Some(msg) => format!("{}: {}", field, msg),
                            None => format!("{}: validation failed", field),
                        }
                    })
                })
                .collect();

            let message = if errors.is_empty() {
                "Validation failed".to_string()
            } else {
                errors.join("; ")
            };

            (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse::new("Validation Error", message)),
            ).into_response()
        })?;

        Ok(ValidatedJson(value))
    }
}

/// Validation error helper
pub fn validation_error(message: impl Into<String>) -> Response {
    (
        StatusCode::BAD_REQUEST,
        Json(ErrorResponse::new("Validation Error", message.into())),
    ).into_response()
}
