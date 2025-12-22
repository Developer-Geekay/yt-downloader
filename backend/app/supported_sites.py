import re
import yt_dlp.extractor as extractors

def get_supported_domains():
    domains = set()

    for ie in extractors.gen_extractors():
        pattern = getattr(ie, "_VALID_URL", None)
        if not pattern:
            continue

        try:
            regex = re.compile(pattern)
            domains.add(regex.pattern)
        except Exception:
            pass

    return list(domains)
