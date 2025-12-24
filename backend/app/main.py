import uuid
import os
from fastapi import FastAPI, Depends, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from .auth import basic_auth
from .models import OptionsRequest, DownloadRequest
from .db import init_db, get_db
from .downloader import get_download_options, download_video
from .config import APP_NAME, DOWNLOAD_DIR

app = FastAPI(title=APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "http://127.0.0.1:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    init_db()

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/api/options")
def options(data: OptionsRequest, user=Depends(basic_auth)):
    return get_download_options(data.url)

@app.post("/api/download")
def start_download(data: DownloadRequest, bg: BackgroundTasks, user=Depends(basic_auth)):
    db = get_db()

    row = db.execute(
        "SELECT format_id FROM options WHERE options_id=? AND option_key=?",
        (data.options_id, data.option)
    ).fetchone()

    if not row:
        raise HTTPException(status_code=400, detail="Invalid download option")

    format_id = row["format_id"]
    
    job_id = uuid.uuid4().hex
    db.execute(
        "INSERT INTO jobs (id, url, status) VALUES (?, ?, ?)",
        (job_id, data.url, "queued")
    )
    db.execute(
        "DELETE FROM options WHERE options_id=?",
        (data.options_id,)
    )
    db.commit()
    db.close()

    bg.add_task(download_video, job_id, data.url, format_id)
    return {"job_id": job_id, "status": "started"}

@app.get("/api/progress/{job_id}")
def progress(job_id: str, user=Depends(basic_auth)):
    db = get_db()
    job = db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    db.close()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return dict(job)

@app.post("/api/cancel/{job_id}")
def cancel(job_id: str, user=Depends(basic_auth)):
    db = get_db()
    db.execute(
        "UPDATE jobs SET status='cancelled' WHERE id=?",
        (job_id,)
    )
    db.commit()
    db.close()
    return {"status": "cancelled"}

@app.get("/api/file/{job_id}")
def get_file(job_id: str):
    db = get_db()
    job = db.execute("SELECT filename FROM jobs WHERE id=?", (job_id,)).fetchone()
    db.close()
    
    if not job or not job["filename"]:
        raise HTTPException(status_code=404, detail="File not found")
    
    file_path = os.path.join("",job["filename"])
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
        
    return FileResponse(file_path, filename=job["filename"], media_type='application/octet-stream')

@app.get("/api/history")
def history(user=Depends(basic_auth)):
    db = get_db()
    jobs = db.execute("SELECT * FROM jobs WHERE status='finished' ORDER BY id DESC").fetchall()
    db.close()
    return [dict(j) for j in jobs]

@app.delete("/api/job/{job_id}")
def delete_job(job_id: str, user=Depends(basic_auth)):
    import shutil
    db = get_db()
    
    # Try removing the job directory first (new isolation method)
    job_dir = os.path.join(DOWNLOAD_DIR, job_id)
    if os.path.exists(job_dir) and os.path.isdir(job_dir):
        try:
            shutil.rmtree(job_dir)
        except Exception:
            pass
    else:
        # Fallback for old files (flat structure)
        job = db.execute("SELECT filename FROM jobs WHERE id=?", (job_id,)).fetchone()
        if job and job["filename"]:
            file_path = os.path.join(DOWNLOAD_DIR, job["filename"])
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except Exception:
                    pass
    
    db.execute("DELETE FROM jobs WHERE id=?", (job_id,))
    db.commit()
    db.close()
    return {"status": "deleted"}
