import sqlite3
import os
from .config import DB_PATH

def get_db():
    # Ensure parent folder exists
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    db = get_db()
    db.executescript("""
    CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        url TEXT,
        status TEXT,
        progress TEXT,
        speed TEXT,
        eta TEXT,
        error TEXT,
        cancelled INTEGER DEFAULT 0,
        filename TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS options (
        options_id TEXT,
        option_key TEXT,
        format_id TEXT,
        PRIMARY KEY (options_id, option_key)
    );
    """)
    db.commit()
    db.close()
