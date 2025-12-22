from pydantic import BaseModel

class OptionsRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    url: str
    options_id: str
    option: str
