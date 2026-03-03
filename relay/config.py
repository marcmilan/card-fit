from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    twilio_account_sid: str = Field(..., env="TWILIO_ACCOUNT_SID")
    twilio_auth_token: str = Field(..., env="TWILIO_AUTH_TOKEN")
    twilio_from_number: str = Field(..., env="TWILIO_FROM_NUMBER")
    relay_secret: str = Field(..., env="RELAY_SECRET")
    allowed_origin: str = Field("*", env="ALLOWED_ORIGIN")

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
