"""Pages regressions using disposable Git histories and simulated HTTP responses."""
import contextlib
import http.client
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(f"{name}.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


builder = load_script("build-pages")
verifier = load_script("verify-pages")
docs_verifier = load_script("verify-docs")


class ReleaseSelectionTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        directory = contextlib.chdir(temporary.name)
        directory.__enter__()
        self.addCleanup(directory.__exit__, None, None, None)
        self.git("init", "-q", "-b", "main")
        self.git("config", "user.name", "Pages test")
        self.git("config", "user.email", "pages@example.invalid")
        self.first = self.commit("first")
        self.git("tag", "v1.0.0")

    def git(self, *args):
        return subprocess.check_output(["git", *args], text=True, stderr=subprocess.PIPE).strip()

    def commit(self, message):
        self.git("commit", "-q", "--allow-empty", "-m", message)
        return self.git("rev-parse", "HEAD")

    def test_stable_release_and_newer_latest_have_distinct_commits(self):
        latest = self.commit("after release")
        self.assertEqual(builder.snapshots("main"), [
            {"channel": "stable", "version": "v1.0.0", "sha": self.first},
            {"channel": "latest", "version": "v1.0.0+", "sha": latest},
        ])

    def test_annotated_tag_and_older_trigger_do_not_downgrade(self):
        latest = self.commit("new release")
        self.git("tag", "-a", "v1.1.0", "-m", "release")
        self.git("tag", "v2.0.0-rc.1")
        builds = builder.snapshots("main", "v1.0.0")
        self.assertEqual([b["version"] for b in builds], ["v1.1.0", "v1.1.0"])
        self.assertEqual([b["sha"] for b in builds], [latest, latest])

    def test_tag_outside_main_fails_instead_of_publishing_old_stable(self):
        self.git("checkout", "-q", "-b", "other")
        self.commit("unmerged release")
        self.git("tag", "v2.0.0")
        self.git("checkout", "-q", "main")
        with self.assertRaisesRegex(RuntimeError, "not reachable"):
            builder.snapshots("main", "v2.0.0")

    def test_prerelease_trigger_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "Not a stable"):
            builder.snapshots("main", "v2.0.0-rc.1")

    def test_no_release_fails(self):
        self.git("tag", "-d", "v1.0.0")
        with self.assertRaisesRegex(RuntimeError, "No vX.Y.Z"):
            builder.snapshots("main")

    def test_artifact_manifests_match_workflow_outputs(self):
        expected = builder.snapshots("main")
        output = Path("site").resolve()

        def fake_build(snapshot, target, base):
            channel = target / snapshot["channel"]
            channel.mkdir()
            (channel / "build.json").write_text(json.dumps(snapshot))
            builder.documentation_redirects(Path("absent-source-docs"), channel / "docs", "https://wdgph.github.io/docs/panoready/" + (snapshot["version"] if snapshot["channel"] == "stable" else "latest") + "/")

        with patch.object(builder, "build", side_effect=fake_build), patch("sys.argv", [
            "build-pages.py", "--latest-ref", "main", "--output", str(output),
        ]), patch.dict(os.environ, {"GITHUB_OUTPUT": "job-output", "GITHUB_STEP_SUMMARY": "summary"}), contextlib.redirect_stdout(io.StringIO()):
            builder.main()
        job_output = dict(line.split("=", 1) for line in Path("job-output").read_text().splitlines())
        self.assertEqual(json.loads(job_output["builds"]), expected)
        self.assertEqual(job_output["source-sha"], self.first)
        for build in expected:
            self.assertEqual(json.loads((output / build["channel"] / "build.json").read_text()), build)
        self.assertIn(self.first, Path("summary").read_text())
        self.assertIn("/PanoReady/stable/", (output / "index.html").read_text())
        self.assertIn("https://wdgph.github.io/docs/panoready/v1.0.0/", (output / "docs/index.html").read_text())
        self.assertTrue((output / "404.html").is_file())
        for route in ("about", "reports"):
            self.assertIn(f"/PanoReady/stable/{route}/", (output / route / "index.html").read_text())


class ApplicationPackagingTests(unittest.TestCase):
    def test_build_packages_application_without_documentation_dependencies(self):
        snapshot = {"channel": "stable", "version": "v0.4.1", "sha": "a" * 40}
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "source"
            output = Path(tmp) / "output"
            source.mkdir()
            output.mkdir()
            (source / "next.config.ts").write_text('const path = process.env.PAGES_BASE_PATH;')
            (source / "components").mkdir()
            (source / "components/NavBar.tsx").write_text('<a href="https://wdgph.github.io/PanoReady/docs/">Docs</a>')
            (source / "workflows/stix").mkdir(parents=True)
            (source / "workflows/stix/STIXIntake.tsx").write_text('NEXT_PUBLIC_BUILD_VERSION')

            def simulate_command(args, **kwargs):
                if args[:3] == ["npm", "run", "build"]:
                    (source / "out").mkdir()
                    (source / "out/index.html").write_text('application')

            with patch.object(builder.tempfile, "TemporaryDirectory") as temporary, patch.object(builder.subprocess, "Popen") as archive, patch.object(builder.subprocess, "run", side_effect=simulate_command) as run:
                temporary.return_value.__enter__.return_value = str(source)
                archive.return_value.wait.return_value = 0
                builder.build(snapshot, output, "/PanoReady")
            commands = [call.args[0] for call in run.call_args_list]
            self.assertEqual([command for command in commands if command[0] != "tar"], [["npm", "ci"], ["npm", "run", "build"]])
            self.assertEqual((output / "stable/index.html").read_text(), 'application')
            self.assertIn("https://wdgph.github.io/docs/panoready/v0.4.1/", (output / "stable/docs/index.html").read_text())
            self.assertFalse((output / "stable/docs/assets").exists())
            self.assertIn('https://wdgph.github.io/docs/panoready/v0.4.1/', (source / "components/NavBar.tsx").read_text())


class DocumentationCompatibilityTests(unittest.TestCase):
    def test_redirects_include_public_deep_paths_without_private_names_or_assets(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "docs"
            for name in ("index.md", "guide/setup.md", "private/secret.md", "internal/notes.md", "official-template-internals.md"):
                path = source / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("Documentation source that must not be copied")
            output = Path(tmp) / "redirects"
            builder.documentation_redirects(source, output, "https://wdgph.github.io/docs/panoready/latest/")
            self.assertIn("https://wdgph.github.io/docs/panoready/latest/guide/setup/", (output / "guide/setup/index.html").read_text())
            self.assertEqual(sorted(p.relative_to(output).as_posix() for p in output.rglob("*.html")),
                             ["guide/setup/index.html", "index.html"])

    def test_matching_active_manual_is_required_before_application_publication(self):
        builds = [{"channel": "stable", "version": "v1.2.3", "sha": "a" * 40},
                  {"channel": "latest", "version": "v1.2.3+", "sha": "b" * 40}]
        version = {"version": "v1.2.3", "sha": "a" * 40, "status": "current"}
        manifest = {"preview": False, "projects": {"panoready": {"repository": "WDGPH/PanoReady", "versions": [version]}}}
        with patch.object(docs_verifier.urllib.request, "urlopen", return_value=io.BytesIO(json.dumps(manifest).encode())) as fetch, contextlib.redirect_stdout(io.StringIO()):
            docs_verifier.verify(builds)
        self.assertEqual(fetch.call_args.kwargs["timeout"], 15)
        for replacement in ([], [dict(version, sha="c" * 40)], [dict(version, status="withdrawn")]):
            with self.subTest(replacement=replacement):
                manifest["projects"]["panoready"]["versions"] = replacement
                with patch.object(docs_verifier.urllib.request, "urlopen", return_value=io.BytesIO(json.dumps(manifest).encode())):
                    with self.assertRaisesRegex(RuntimeError, "publication stopped"):
                        docs_verifier.verify(builds)

    def test_unavailable_hub_stops_publication_without_a_fallback_manual(self):
        builds = [{"channel": "stable", "version": "v1.2.3", "sha": "a" * 40}]
        with patch.object(docs_verifier.urllib.request, "urlopen", side_effect=OSError("offline")):
            with self.assertRaisesRegex(RuntimeError, "publication stopped"):
                docs_verifier.verify(builds)


class PublicVerificationTests(unittest.TestCase):
    def setUp(self):
        self.builds = [
            {"channel": "stable", "version": "v1.0.0", "sha": "a" * 40},
            {"channel": "latest", "version": "v1.0.0+", "sha": "b" * 40},
        ]

    def response(self, manifest):
        return io.BytesIO(json.dumps(manifest).encode())

    def test_stale_response_retries_both_channels_with_new_urls(self):
        stale = {**self.builds[0], "sha": "c" * 40}
        with patch.object(verifier.urllib.request, "urlopen", side_effect=[
            self.response(stale), self.response(self.builds[1]),
            *[self.response(b) for b in self.builds],
        ]) as fetch, patch.object(verifier.time, "sleep") as sleep, contextlib.redirect_stdout(io.StringIO()):
            verifier.verify("https://example.invalid/PanoReady/", self.builds, attempts=2, delay=1)
        sleep.assert_called_once_with(1)
        urls = [call.args[0].full_url for call in fetch.call_args_list]
        self.assertEqual(len(set(urls)), 4)
        self.assertTrue(all("/build.json?verify=" in url for url in urls))
        self.assertTrue(all(call.kwargs["timeout"] == 15 for call in fetch.call_args_list))

    def test_wrong_version_fails_even_with_correct_commit(self):
        stale = {**self.builds[0], "version": "v0.9.0"}
        with patch.object(verifier.urllib.request, "urlopen", side_effect=[
            self.response(stale), self.response(self.builds[1]),
        ]), patch.object(verifier.time, "sleep") as sleep, contextlib.redirect_stdout(io.StringIO()) as log:
            with self.assertRaisesRegex(RuntimeError, "publication has already occurred"):
                verifier.verify("https://example.invalid/PanoReady/", self.builds, attempts=1)
        sleep.assert_not_called()
        self.assertIn("observed", log.getvalue())
        self.assertIn("v0.9.0", log.getvalue())

    def test_network_failure_and_malformed_json_are_bounded(self):
        with patch.object(verifier.urllib.request, "urlopen", side_effect=[
            OSError("unavailable"), io.BytesIO(b"not JSON"),
        ]), contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(RuntimeError, "did not match"):
                verifier.verify("https://example.invalid/PanoReady/", self.builds, attempts=1)

    def test_truncated_http_response_retries(self):
        with patch.object(verifier.urllib.request, "urlopen", side_effect=[
            http.client.IncompleteRead(b"partial"), self.response(self.builds[1]),
            *[self.response(b) for b in self.builds],
        ]), patch.object(verifier.time, "sleep") as sleep, contextlib.redirect_stdout(io.StringIO()):
            verifier.verify("https://example.invalid/PanoReady/", self.builds, attempts=2, delay=1)
        sleep.assert_called_once_with(1)


if __name__ == "__main__":
    unittest.main()
