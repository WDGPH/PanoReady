"""Verify public Pages channel manifests against the artifact's expected builds."""
import argparse
import http.client
import json
import time
import urllib.parse
import urllib.request
import uuid


def verify(url, builds, attempts=12, delay=10):
    for attempt in range(1, attempts + 1):
        errors = []
        for expected in builds:
            manifest_url = f"{url.rstrip('/')}/{expected['channel']}/build.json"
            request = urllib.request.Request(
                f"{manifest_url}?verify={uuid.uuid4().hex}",
                headers={"Cache-Control": "no-cache", "User-Agent": "PanoReady-Pages-verification"},
            )
            try:
                with urllib.request.urlopen(request, timeout=15) as response:
                    observed = json.load(response)
                if observed != expected:
                    errors.append(f"{manifest_url}: expected {expected}, observed {observed}")
            except (OSError, ValueError, http.client.HTTPException) as error:
                errors.append(f"{manifest_url}: {error}")
        if not errors:
            print("Verified stable and latest public build manifests.", flush=True)
            return
        print(f"Verification attempt {attempt}/{attempts}:\n" + "\n".join(errors), flush=True)
        if attempt < attempts:
            time.sleep(delay)
    raise RuntimeError("Public Pages manifests did not match the deployed artifact; publication has already occurred")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--expected", required=True, help="Build-job JSON output, independent of the public site")
    args = parser.parse_args()
    if urllib.parse.urlsplit(args.url).scheme != "https":
        parser.error("url must use HTTPS")
    builds = json.loads(args.expected)
    if not isinstance(builds, list) or len(builds) != 2 or {b["channel"] for b in builds} != {"stable", "latest"}:
        parser.error("expected must contain stable and latest build manifests")
    verify(args.url, builds)


if __name__ == "__main__":
    main()
