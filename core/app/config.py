from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    host: str = "0.0.0.0"
    port: int = 8001
    allowed_origins: list[str] = ["http://localhost:4200"]


settings = Settings()
