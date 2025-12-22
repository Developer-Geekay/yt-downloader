import uuid

jobs = {}

def create_job(options_map=None):
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "status": "created",
        "progress": None,
        "speed": None,
        "eta": None,
        "error": None,
        "cancelled": False,
        "options": options_map or {}
    }
    return job_id

def update_job(job_id, data):
    if job_id in jobs:
        jobs[job_id].update(data)

def get_job(job_id):
    return jobs.get(job_id)

def cancel_job(job_id):
    if job_id in jobs:
        jobs[job_id]["cancelled"] = True
        jobs[job_id]["status"] = "cancelled"
        return True
    return False
