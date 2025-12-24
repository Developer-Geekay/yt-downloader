import re
import uuid
import yt_dlp
import yt_dlp.extractor as extractors
from .db import get_db
from .config import MAX_VIDEO_DURATION_SEC, DOWNLOAD_DIR

def clean(msg: str):
    return re.sub(r'\x1B\[[0-?]*[ -/]*[@-~]', '', msg)

def validate_url(url: str):
    for ie in extractors.gen_extractors():
        if ie.suitable(url):
            return
    raise Exception("URL not supported by yt-dlp")

def get_download_options(url: str):
    validate_url(url)

    with yt_dlp.YoutubeDL({"quiet": True, "skip_download": True}) as ydl:
        try:
            info = ydl.extract_info(url, download=False)
        except Exception as e:
            raise Exception(clean(str(e)))

    if info.get("duration", 0) > MAX_VIDEO_DURATION_SEC:
        raise Exception("Video duration exceeds limit")

    options_id = uuid.uuid4().hex
    db = get_db()

    response = {
        "options_id": options_id,
        "title": info.get("title"),
        "duration": info.get("duration"),
        "video_audio": [],
        "video_only": [],
        "audio": []
    }

    seen_ids = set()
    for f in info.get("formats", []):
        fid = f.get("format_id")
        v, a = f.get("vcodec"), f.get("acodec")
        h, abr = f.get("height"), f.get("abr")

        if v != "none" and a != "none" and h:
            key = f"va_{h}"
            label = f"{h}p"
            category = "video_audio"
        elif v != "none" and a == "none" and h:
            key = f"vo_{h}"
            label = f"{h}p"
            category = "video_only"
        elif v == "none" and a != "none":
            key = f"a_{int(abr or 0)}"
            label = f"{int(abr or 0)} kbps"
            category = "audio"
        else:
            continue
        
        if key in seen_ids:
            continue
        seen_ids.add(key)
        
        response[category].append({"id": key, "label": label})

        db.execute(
            "INSERT OR IGNORE INTO options VALUES (?, ?, ?)",
            (options_id, key, fid)
        )

    db.commit()
    db.close()
    return response

def download_video(job_id: str, url: str, format_id: str):
    import os

    def hook(d):
        db = get_db()
        # Check for cancellation
        status_row = db.execute("SELECT status FROM jobs WHERE id=?", (job_id,)).fetchone()
        if status_row and status_row["status"] == "cancelled":
            db.close()
            raise Exception("Download cancelled by user")

        if d["status"] == "downloading":
             db.execute(
                "UPDATE jobs SET status=?, progress=?, speed=?, eta=? WHERE id=?",
                (
                    "downloading", 
                    clean(d.get("_percent_str", "0%")), 
                    clean(d.get("_speed_str", "N/A")), 
                    clean(d.get("_eta_str", "N/A")), 
                    job_id
                )
            )
        db.commit()
        db.close()

    ydl_opts = {
        "format": format_id,
        "outtmpl": f"{DOWNLOAD_DIR}/{job_id}/%(title).200s [%(id)s].%(ext)s",
        "restrictfilenames": True,
        "windowsfilenames": True,
        "progress_hooks": [hook],
        "quiet": True,
        "noplaylist": True,
        "merge_output_format": "mp4",
        "no_continue": True,
        "overwrites": True
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # 1. Get info to calculate filename
            info = ydl.extract_info(url, download=False)
            
            # 2. Calculate final filename (forcing mp4 due to merge_output_format)
            # Note: prepare_filename returns full path, we need relative to DOWNLOAD_DIR
            full_path = ydl.prepare_filename(info)
            filename = os.path.basename(full_path)
            base, _ = os.path.splitext(filename)
            
            # Storing relative path: job_id/filename.mp4
            final_filename = f"{job_id}/{base}.mp4"

            # 3. Perform download
            ydl.download([url])
            
            # 4. Update DB only after success
            db = get_db()
            db.execute(
                "UPDATE jobs SET status=?, progress=?, filename=? WHERE id=?",
                ("finished", "100%", final_filename, job_id)
            )
            db.commit()
            db.close()
            
    except Exception as e:
        msg = clean(str(e))
        db = get_db()
        # Don't overwrite cancelled status with error
        current = db.execute("SELECT status FROM jobs WHERE id=?", (job_id,)).fetchone()
        if current and current["status"] != "cancelled":
             db.execute(
                "UPDATE jobs SET status=?, error=? WHERE id=?",
                ("error", msg, job_id)
            )
        db.commit()
        db.close()
