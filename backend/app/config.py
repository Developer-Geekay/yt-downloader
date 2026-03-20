import os

APP_NAME = "Private Video Downloader"

IS_ELECTRON_MODE = os.getenv("ELECTRON_MODE", "false").lower() == "true"

BASIC_AUTH_USERNAME = os.getenv("VD_USER", "admin")
BASIC_AUTH_PASSWORD = os.getenv("VD_PASS", "change_this_password")

MAX_VIDEO_DURATION_SEC = 120 * 60  # 2 hours
DB_PATH = "data/app.db"
DOWNLOAD_DIR = "downloads"

