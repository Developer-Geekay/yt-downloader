import os

# Base directory of the backend app
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_ROOT = os.path.dirname(BASE_DIR)

APP_NAME = "Private Video Downloader"

# Electron Mode
IS_ELECTRON_MODE = os.getenv("ELECTRON_MODE", "false").lower() == "true"

# Auth
BASIC_AUTH_USERNAME = os.getenv("VD_USER", "admin")
BASIC_AUTH_PASSWORD = os.getenv("VD_PASS", "change_this_password")

# Limits
MAX_VIDEO_DURATION_SEC = 2 * 3600  # 2 hours

# Paths
# Electron passes these via environment variables if configured
ENV_DOWNLOAD_DIR = os.getenv("VD_DOWNLOAD_DIR")
ENV_TEMP_DIR = os.getenv("VD_TEMP_DIR")
ENV_DB_PATH = os.getenv("VD_DB_PATH")

DOWNLOAD_DIR = ENV_DOWNLOAD_DIR if ENV_DOWNLOAD_DIR else os.path.join(BASE_DIR, "downloads")
TEMP_DIR = ENV_TEMP_DIR if ENV_TEMP_DIR else os.path.join(BASE_DIR, "temp")
DB_PATH = ENV_DB_PATH if ENV_DB_PATH else os.path.join(BASE_DIR, "data", "app.db")

# Ensure directories exist
for path_to_check in [os.path.dirname(DB_PATH), DOWNLOAD_DIR, TEMP_DIR]:
    if path_to_check and not os.path.exists(path_to_check):
        os.makedirs(path_to_check, exist_ok=True)

# FFmpeg Location (Self-contained)
def find_binary(name):
    # Try direct path
    direct = os.path.join(PROJECT_ROOT, "resources", name, f"{name}.exe" if os.name == "nt" else name)
    if os.path.exists(direct):
        return direct
    
    # Search recursively in resources/name
    search_dir = os.path.join(PROJECT_ROOT, "resources", name)
    if os.path.exists(search_dir):
        for root, dirs, files in os.walk(search_dir):
            target = f"{name}.exe" if os.name == "nt" else name
            if target in files:
                return os.path.join(root, target)
    return name # Fallback to system path

FFMPEG_LOCATION = find_binary("ffmpeg")




