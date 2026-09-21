"""Build isolated release/main snapshots into one GitHub Pages artifact."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile


def run(*args, cwd=None, env=None):
    return subprocess.check_output(args, cwd=cwd, env=env, text=True).strip()


def version(ref):
    tags = run("git", "tag", "--merged", ref, "--sort=-version:refname").splitlines()
    releases = [tag for tag in tags if re.fullmatch(r"v\d+\.\d+\.\d+", tag)]
    if not releases:
        raise RuntimeError(f"No vX.Y.Z release tag reachable from {ref}")
    tag = releases[0]
    sha = run("git", "rev-parse", f"{ref}^{{commit}}")
    tagged_sha = run("git", "rev-parse", f"{tag}^{{commit}}")
    return tag, sha, tag + ("+" if sha != tagged_sha else "")


def prepare(source, base_path):
    # v0.1.0 predates the deployment environment variables. Patch only the
    # deployment path and presentation in the disposable release checkout.
    config = source / "next.config.ts"
    text = config.read_text()
    legacy = 'const pagesBasePath = "/PanoReady";'
    if legacy in text:
        config.write_text(text.replace(legacy, f"const pagesBasePath = {json.dumps(base_path)};"))
    elif "PAGES_BASE_PATH" not in text:
        raise RuntimeError("Unsupported release Next.js configuration")
    nav = source / "components/NavBar.tsx"
    text = nav.read_text()
    text = text.replace('href="https://wdgph.github.io/PanoReady/docs/"', 'href={`${process.env.NEXT_PUBLIC_PAGES_BASE_PATH || "/PanoReady"}/docs/`}')
    nav.write_text(text)
    intake = source / "workflows/stix/STIXIntake.tsx"
    text = intake.read_text()
    if "NEXT_PUBLIC_BUILD_VERSION" not in text:
        if 'Built by Wellington-Dufferin-Guelph Public Health · MIT License' not in text:
            raise RuntimeError("Unsupported release footer")
        text = text.replace("</footer>", '<div style={{ marginTop: 6 }}>{process.env.NEXT_PUBLIC_BUILD_VERSION} · {process.env.NEXT_PUBLIC_BUILD_SHA}</div>\n</footer>', 1)
        intake.write_text(text)



def build(ref, channel, output, base):
    _, sha, label = version(ref)
    with tempfile.TemporaryDirectory(prefix=f"panoready-{channel}-") as tmp:
        source = Path(tmp)
        archive = subprocess.Popen(["git", "archive", sha], stdout=subprocess.PIPE)
        subprocess.run(["tar", "-x", "-C", tmp], stdin=archive.stdout, check=True)
        archive.stdout.close()
        if archive.wait() != 0:
            raise RuntimeError("git archive failed")
        path = f"{base}/{channel}"
        prepare(source, path)
        env = dict(os.environ, GITHUB_PAGES="true", PAGES_BASE_PATH=path,
                   NEXT_PUBLIC_PAGES_BASE_PATH=path,
                   NEXT_PUBLIC_BUILD_VERSION=label, NEXT_PUBLIC_BUILD_SHA=sha[:8])
        subprocess.run(["npm", "ci"], cwd=tmp, check=True)
        subprocess.run(["npm", "run", "build"], cwd=tmp, env=env, check=True)
        # Each snapshot gets its own Python dependencies as well as npm packages.
        subprocess.run(["python", "-m", "venv", str(source / ".docs-venv")], check=True)
        python = str(source / ".docs-venv/bin/python")
        requirements = (source / "requirements-docs.txt").read_text()
        hash_flags = ["--require-hashes"] if "--hash=" in requirements else []
        subprocess.run([python, "-m", "pip", "install", *hash_flags, "--only-binary=:all:", "-r", "requirements-docs.txt"], cwd=tmp, check=True)
        config = source / "mkdocs.yml"
        config.write_text(re.sub(r"(?m)^site_url:.*$", f"site_url: https://wdgph.github.io{path}/docs/", config.read_text()))
        subprocess.run([python, "-m", "mkdocs", "build", "--strict", "--site-dir", "out/docs"], cwd=tmp, check=True)
        (source / "out/build.json").write_text(json.dumps({"version": label, "sha": sha, "channel": channel}) + "\n")
        shutil.copytree(source / "out", output / channel)


def redirect(destination):
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>PanoReady</title>
<meta http-equiv="refresh" content="0;url={destination}">
<script>location.replace({json.dumps(destination)} + location.search + location.hash)</script>
</head><body><a href="{destination}">Open PanoReady</a></body></html>'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--latest-ref", default="origin/main")
    parser.add_argument("--base-path", default="/PanoReady")
    parser.add_argument("--output", default="pages-out")
    args = parser.parse_args()
    if not re.fullmatch(r"/[A-Za-z0-9_-]+", args.base_path):
        parser.error("base-path must be a single repository path")
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    stable, _, _ = version(args.latest_ref)
    build(stable, "stable", output, args.base_path)
    build(args.latest_ref, "latest", output, args.base_path)
    # Preserve the old application and documentation entry points.
    for route in ("", "about", "reports", "docs"):
        target = output / route
        target.mkdir(exist_ok=True)
        (target / "index.html").write_text(redirect(f"{args.base_path}/stable/{route + '/' if route else ''}"))
    (output / ".nojekyll").touch()


if __name__ == "__main__":
    main()
