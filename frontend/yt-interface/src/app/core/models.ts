export interface OptionsResponse {
  options_id: string;
  title: string;
  duration: number;
  thumbnail?: string;
  video_audio: OptionItem[];
  video_only: OptionItem[];
  audio: OptionItem[];
}

export interface OptionItem {
  id: string;
  label: string;
  size?: string;
}

export interface DownloadResponse {
  job_id: string;
  status: string;
}

export interface JobStatus {
  status: string;
  progress?: string;
  speed?: string;
  eta?: string;
  id?: string;
  error?: string;
  filename?: string;
  title?: string;
}
