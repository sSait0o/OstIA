from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    host: str = "0.0.0.0"
    port: int = 8001
    allowed_origins: list[str] = ["http://localhost:4200"]

    class Config:
        env_file = ".env"


settings = Settings()
