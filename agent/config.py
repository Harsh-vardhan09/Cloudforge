from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings

AGENT_DIR = Path(__file__).resolve().parent
REPO_ROOT = AGENT_DIR.parent


class Settings(BaseSettings):
    backend_url: str = "http://localhost:5000"
    agent_port: int = 7000
    agent_jwt_token: str = ""
    heartbeat_interval: int = 15  # seconds
    max_concurrent_jobs: int = 2  # jobs per GPU node
    job_cpu_cores: float = Field(default=4.0, gt=0, le=128)
    job_memory_limit: str = "1g"
    docker_image_pull_policy: Literal["if-not-present", "always"] = "if-not-present"
    debug: bool = False
    price_per_hour: float = 0.5

    class Config:
        # Absolute paths, so the agent picks up its configuration no matter which
        # directory it is launched from. When both files exist the agent's own
        # .env wins over the repo-root one.
        env_file = (REPO_ROOT / ".env", AGENT_DIR / ".env")
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
