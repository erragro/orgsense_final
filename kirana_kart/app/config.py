"""
app/config.py
=============
Centralised configuration via Pydantic BaseSettings.

All environment variables are declared here with types, defaults,
and validation. Modules import the `settings` singleton — no more
scattered os.getenv() calls throughout the codebase.

Usage:
    from app.config import settings

    engine = create_engine(settings.database_url)
    r = redis.from_url(settings.redis_url)

Priority (highest → lowest):
    1. Environment variables
    2. .env file in project root
    3. Defaults declared here

Validation is performed at import time. Missing required fields
(e.g. LLM_API_KEY) raise a ValidationError before the server starts.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Optional

from pydantic import Field, computed_field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    All runtime configuration for Kirana Kart.

    Fields map 1-to-1 to environment variable names (case-insensitive).
    Pydantic coerces types automatically (e.g. DB_PORT="5432" → int 5432).
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",          # ignore unknown env vars gracefully
    )

    # ============================================================
    # DATABASE
    # ============================================================

    db_host: str = Field(default="localhost", alias="DB_HOST")
    db_port: int = Field(default=5432,        alias="DB_PORT")
    db_name: str = Field(default="orgintelligence", alias="DB_NAME")
    db_user: str = Field(default="orguser",   alias="DB_USER")
    db_password: str = Field(default="",      alias="DB_PASSWORD")
    db_schema: str = Field(default="kirana_kart", alias="DB_SCHEMA")

    # SQLAlchemy pool settings
    db_pool_size: int = Field(default=10,     alias="DB_POOL_SIZE")
    db_max_overflow: int = Field(default=20,  alias="DB_MAX_OVERFLOW")
    db_pool_timeout: int = Field(default=30,  alias="DB_POOL_TIMEOUT")
    db_pool_recycle: int = Field(default=3600, alias="DB_POOL_RECYCLE")

    # Read-only credentials for the BI Agent — defaults to main user if not set.
    # In production set BI_DB_USER=bi_readonly / BI_DB_PASSWORD=<pass> to
    # restrict BI query execution to a SELECT-only role.
    bi_db_user: str = Field(default="", alias="BI_DB_USER")
    bi_db_password: str = Field(default="", alias="BI_DB_PASSWORD")

    @computed_field
    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg2://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    @computed_field
    @property
    def bi_database_url(self) -> str:
        """Read-only connection URL for the BI Agent query engine."""
        user = self.bi_db_user or self.db_user
        password = self.bi_db_password or self.db_password
        return (
            f"postgresql+psycopg2://{user}:{password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    # ============================================================
    # REDIS
    # ============================================================

    redis_url: str = Field(
        default="redis://localhost:6379/0",
        alias="REDIS_URL",
    )
    redis_max_connections: int = Field(
        default=20,
        alias="REDIS_MAX_CONNECTIONS",
    )
    # Cluster mode: comma-separated "host:port" pairs.
    # When set, RedisCluster is used instead of a single-node pool.
    # Example: "redis-node-1:6379,redis-node-2:6379,redis-node-3:6379"
    redis_cluster_nodes: str = Field(
        default="",
        alias="REDIS_CLUSTER_NODES",
    )

    celery_broker_url: str = Field(
        default="redis://localhost:6379/1",
        alias="CELERY_BROKER_URL",
    )
    celery_result_backend: str = Field(
        default="redis://localhost:6379/1",
        alias="CELERY_RESULT_BACKEND",
    )

    @computed_field
    @property
    def redis_cluster_enabled(self) -> bool:
        return bool(self.redis_cluster_nodes.strip())

    # ============================================================
    # LLM / AI
    # ============================================================

    llm_api_base_url: str = Field(
        default="https://api.openai.com/v1",
        alias="LLM_API_BASE_URL",
    )
    llm_api_key: str = Field(
        default="",
        alias="LLM_API_KEY",
    )

    # Model assignments per pipeline stage
    model1: str = Field(default="gpt-4o-mini", alias="MODEL1")   # Stage 0: Classification
    model2: str = Field(default="gpt-4.1",     alias="MODEL2")   # Stage 1: Evaluation
    model3: str = Field(default="o3-mini",      alias="MODEL3")  # Stage 2: Validation
    model4: str = Field(default="gpt-4o",       alias="MODEL4")  # Stage 3: Response gen

    # ============================================================
    # VECTOR DB (WEAVIATE)
    # ============================================================

    weaviate_host: str = Field(default="127.0.0.1", alias="WEAVIATE_HOST")
    weaviate_http_port: int = Field(default=8080,   alias="WEAVIATE_HTTP_PORT")
    weaviate_grpc_port: int = Field(default=50051,  alias="WEAVIATE_GRPC_PORT")
    weaviate_api_key: str = Field(default="",       alias="WEAVIATE_API_KEY")
    embedding_model: str = Field(
        default="text-embedding-3-large",
        alias="EMBEDDING_MODEL",
    )

    # ============================================================
    # AUTHENTICATION — legacy token (kept for backward compat)
    # ============================================================

    admin_token: str = Field(default="", alias="ADMIN_TOKEN")

    # ============================================================
    # AUTHENTICATION — JWT
    # ============================================================

    jwt_secret_key: str = Field(
        default="REDACTED",
        alias="JWT_SECRET_KEY",
    )
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    jwt_access_expire_minutes: int = Field(default=60, alias="JWT_ACCESS_EXPIRE_MINUTES")
    jwt_refresh_expire_days: int = Field(default=30, alias="JWT_REFRESH_EXPIRE_DAYS")

    # Bootstrap super-admin created on first startup (if no users exist)
    bootstrap_admin_email: str = Field(default="admin@kirana.local", alias="BOOTSTRAP_ADMIN_EMAIL")
    bootstrap_admin_password: str = Field(default="REDACTED", alias="BOOTSTRAP_ADMIN_PASSWORD")
    bootstrap_admin_name: str = Field(default="Super Admin", alias="BOOTSTRAP_ADMIN_NAME")

    # OAuth: backend callback base URL and frontend URL
    oauth_redirect_base_url: str = Field(default="http://localhost:8001", alias="OAUTH_REDIRECT_BASE_URL")
    frontend_url: str = Field(default="http://localhost:5173", alias="FRONTEND_URL")

    # GitHub OAuth
    github_client_id: str = Field(default="", alias="GITHUB_CLIENT_ID")
    github_client_secret: str = Field(default="", alias="GITHUB_CLIENT_SECRET")

    # Google OAuth
    google_client_id: str = Field(default="", alias="GOOGLE_CLIENT_ID")
    google_client_secret: str = Field(default="", alias="GOOGLE_CLIENT_SECRET")

    # Microsoft OAuth
    microsoft_client_id: str = Field(default="", alias="MICROSOFT_CLIENT_ID")
    microsoft_client_secret: str = Field(default="", alias="MICROSOFT_CLIENT_SECRET")

    # ============================================================
    # WORKER
    # ============================================================

    process_batch_size: int = Field(default=10, alias="PROCESS_BATCH_SIZE")
    # How often the background vector worker polls (seconds)
    vector_worker_poll_interval: int = Field(
        default=10,
        alias="VECTOR_WORKER_POLL_INTERVAL",
    )

    # ============================================================
    # OBSERVABILITY
    # ============================================================

    # OpenTelemetry collector endpoint (gRPC).
    # Leave empty to disable OTLP export (traces still captured locally).
    otlp_endpoint: str = Field(default="", alias="OTLP_ENDPOINT")

    # Set to "false" to disable the /metrics Prometheus endpoint.
    prometheus_enabled: bool = Field(default=True, alias="PROMETHEUS_ENABLED")

    # Service name surfaced in traces and metrics labels.
    service_name: str = Field(
        default="kirana-kart-governance",
        alias="SERVICE_NAME",
    )
    service_version: str = Field(default="3.3.0", alias="SERVICE_VERSION")

    # Fraction of traces to sample (0.0–1.0). 1.0 = 100% (dev default).
    # Lower in production (e.g. 0.1) to control collector load.
    otel_sample_rate: float = Field(default=1.0, alias="OTEL_SAMPLE_RATE")

    # Deployment environment tag attached to every span and metric.
    deployment_env: str = Field(default="development", alias="DEPLOYMENT_ENV")

    # ============================================================
    # LOGGING
    # ============================================================

    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    # "json" for production structured logs; "text" for human-readable dev output.
    log_format: str = Field(default="json", alias="LOG_FORMAT")

    # ============================================================
    # PII ENCRYPTION (field-level AES for customer PII at rest)
    # ============================================================

    # 32-byte hex key for AES-256 field encryption.
    # Generate: python -c "import secrets; print(secrets.token_hex(32))"
    # REQUIRED in production — app will refuse to start without it.
    pii_encryption_key: str = Field(default="", alias="PII_ENCRYPTION_KEY")

    # ============================================================
    # EMAIL / SMTP
    # ============================================================

    # Set SMTP_HOST to enable outbound email (CRM customer replies, alerts).
    # Leave empty to disable email sending (safe default for dev/test).
    smtp_host: str = Field(default="", alias="SMTP_HOST")
    smtp_port: int = Field(default=587, alias="SMTP_PORT")
    # Sender login credentials (Gmail: use an App Password, not account password)
    smtp_user: str = Field(default="", alias="SMTP_USER")
    smtp_pass: str = Field(default="", alias="SMTP_PASS")
    # Display "From" address — can differ from smtp_user when using Gmail Send As
    smtp_from: str = Field(default="", alias="SMTP_FROM")

    # ============================================================
    # DATA GOVERNANCE
    # ============================================================

    # ISO 3166-1 alpha-2 region code where data is physically stored.
    # DPDP Act requires Indian data to be stored in India ("IN").
    data_region: str = Field(default="IN", alias="DATA_REGION")

    # ============================================================
    # VALIDATION
    # ============================================================

    @model_validator(mode="after")
    def warn_missing_llm_key(self) -> "Settings":
        """Warn (not error) if LLM key is missing — tests run without it."""
        if not self.llm_api_key:
            import warnings
            warnings.warn(
                "LLM_API_KEY is not set. LLM pipeline stages will fail at runtime.",
                RuntimeWarning,
                stacklevel=2,
            )
        return self

    @model_validator(mode="after")
    def enforce_production_secrets(self) -> "Settings":
        """
        Refuse to start in production if insecure defaults are still set.
        Prevents accidental deployment with placeholder credentials.
        """
        _DEFAULT_JWT = "REDACTED"

        if self.deployment_env == "production":
            if self.jwt_secret_key == _DEFAULT_JWT or len(self.jwt_secret_key) < 32:
                raise ValueError(
                    "JWT_SECRET_KEY must be a strong random secret in production. "
                    "Generate one with: python -c \"import secrets; print(secrets.token_hex(64))\""
                )
            if not self.pii_encryption_key or len(self.pii_encryption_key) < 32:
                raise ValueError(
                    "PII_ENCRYPTION_KEY must be set in production (min 32 hex chars). "
                    "Generate with: python -c \"import secrets; print(secrets.token_hex(32))\""
                )
            if self.bootstrap_admin_password == "REDACTED":
                raise ValueError(
                    "BOOTSTRAP_ADMIN_PASSWORD must be changed from the default in production."
                )
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Return the cached Settings singleton.

    Use this function to access settings in code that cannot
    easily accept a Settings dependency (e.g. module-level code).
    For FastAPI dependency injection, use:

        from app.config import Settings, get_settings
        from fastapi import Depends

        def endpoint(settings: Settings = Depends(get_settings)):
            ...
    """
    return Settings()


# Module-level singleton for direct import convenience.
settings: Settings = get_settings()
