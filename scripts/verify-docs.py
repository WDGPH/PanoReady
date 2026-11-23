"""Require the stable application's matching manual before publishing the app."""
import argparse
import http.client
import json
import urllib.request
import uuid

HUB_MANIFEST = "https://docs.phiz.ca/build-manifest.json"


def verify(builds):
    stable = next(build for build in builds if build["channel"] == "stable")
    request = urllib.request.Request(
        HUB_MANIFEST + "?verify=" + uuid.uuid4().hex,
        headers={"Cache-Control": "no-cache", "User-Agent": "PanoReady-documentation-check"},
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            manifest = json.load(response)
        project = manifest["projects"]["panoready"]
        versions = project["versions"]
        matching = any(version["version"] == stable["version"] and version["sha"] == stable["sha"]
                       and version["status"] in {"current", "historical"} for version in versions)
        if manifest.get("preview") is not False or project["repository"] != "WDGPH/PanoReady" or not matching:
            raise ValueError("The matching active release manual is not public")
    except (OSError, ValueError, KeyError, TypeError, http.client.HTTPException) as error:
        raise RuntimeError(
            f"Application publication stopped: documentation for {stable['version']} at {stable['sha']} "
            "must be public in the hub first. Rerun Application Pages after the release import is deployed."
        ) from error
    print("Verified the matching tagged manual is public before application publication.", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected", required=True, help="The build job's expected application manifests")
    args = parser.parse_args()
    builds = json.loads(args.expected)
    if not isinstance(builds, list) or len(builds) != 2 or {b["channel"] for b in builds} != {"stable", "latest"}:
        parser.error("expected must contain stable and latest build manifests")
    verify(builds)


if __name__ == "__main__":
    main()
