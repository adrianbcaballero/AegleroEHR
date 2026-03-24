import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///dev.db")
SECRET_KEY = os.getenv("SECRET_KEY", "dev_secret")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

SESSION_TIMEOUT_MINUTES = int(os.getenv("SESSION_TIMEOUT_MINUTES", "15"))
MAX_FAILED_LOGINS = int(os.getenv("MAX_FAILED_LOGINS", "5"))
ACCOUNT_LOCKOUT_MINUTES = int(os.getenv("ACCOUNT_LOCKOUT_MINUTES", "15"))

# In production set COOKIE_SECURE=true (requires HTTPS)
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"

# Number of trusted reverse proxies in front of the app.
# 0 = no proxy (local dev) — use remote_addr directly, ignore X-Forwarded-For
# 1 = one proxy (AWS ALB, nginx) — trust only the last X-Forwarded-For entry
TRUSTED_PROXY_COUNT = int(os.getenv("TRUSTED_PROXY_COUNT", "0"))