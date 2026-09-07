import copy
import json
import re
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = ROOT / ".github" / "workflows"


class CiWorkflowContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Reuse the repository's locked YAML parser, including YAML 1.2's "on" key.
        result = subprocess.run(
            ["node", "--input-type=module", "-e", """
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
const names = ['ci.yml', 'deploy.yml', 'drawio-export.yml'];
console.log(JSON.stringify(Object.fromEntries(names.map(name =>
  [name, parse(readFileSync(`.github/workflows/${name}`, 'utf8'))]))));
"""], cwd=ROOT, check=True, capture_output=True, text=True,
        )
        cls.workflows = json.loads(result.stdout)

    def assert_required_commands(self, job, commands, condition=None):
        self.assertNotIn("if", job)
        self.assertNotIn("continue-on-error", job)
        for command in commands:
            matches = [step for step in job["steps"]
                       if command in step.get("run", "").splitlines()]
            self.assertEqual(len(matches), 1, command)
            step = matches[0]
            self.assertEqual(step.get("if"), condition, command)
            self.assertNotIn("continue-on-error", step)
            self.assertNotIn("||", step["run"])
            self.assertNotIn("set +e", step["run"])
            self.assertNotIn("exit 0", step["run"])
            self.assertLessEqual(job["steps"].index(step), next(
                (i for i, item in enumerate(job["steps"])
                 if item.get("run") == "pnpm build:ghpages"), len(job["steps"])))

    def assert_website_gates(self, workflow):
        jobs = workflow["jobs"]
        self.assertEqual(set(jobs), {"validate-data", "typecheck", "html-flowchart", "build-check"})
        build = jobs["build-check"]
        self.assertEqual(set(build["needs"]), {"validate-data", "typecheck", "html-flowchart"})
        self.assertNotIn("if", build)
        self.assert_required_commands(build, ["pnpm build:ghpages"])
        for job in jobs.values():
            self.assertEqual(job["runs-on"], "ubuntu-latest")
            self.assertNotIn("continue-on-error", job)
            self.assertNotIn("if", job)
            for step in job["steps"]:
                self.assertNotIn("continue-on-error", step)
        self.assertEqual(jobs["html-flowchart"]["name"], "HTML Flowchart Validation")
        self.assert_required_commands(jobs["validate-data"], ["python3 scripts/validate_benchmarks.py --html"])
        self.assert_required_commands(jobs["typecheck"], ["pnpm exec tsc --noEmit", "pnpm test:build-process"])
        self.assert_required_commands(jobs["html-flowchart"], [
            "node --test scripts/benchmark_build_process/check_arch_sources.test.mjs",
            "pnpm check:build-process-source", "pnpm audit:build-process", "pnpm test:html-flowchart",
        ])

    def setUp(self):
        self.ci = (WORKFLOWS / "ci.yml").read_text(encoding="utf-8")
        self.deploy = (WORKFLOWS / "deploy.yml").read_text(encoding="utf-8")
        self.exports = (WORKFLOWS / "drawio-export.yml").read_text(encoding="utf-8")

    def test_main_push_and_pull_requests_are_not_hidden_behind_path_filters(self):
        triggers = self.workflows["ci.yml"]["on"]
        for trigger in ("push", "pull_request"):
            self.assertEqual(triggers[trigger], {"branches": ["main"]})

    def test_html_source_and_semantic_checks_gate_website_build(self):
        self.assert_website_gates(self.workflows["ci.yml"])

    def test_website_gate_rejects_missing_or_bypassed_checks(self):
        mutations = [
            lambda w: w["jobs"]["html-flowchart"]["steps"].remove(next(step for step in w["jobs"]["html-flowchart"]["steps"] if step.get("run") == "pnpm audit:build-process")),
            lambda w: next(step for step in w["jobs"]["validate-data"]["steps"] if step.get("run") == "python3 scripts/validate_benchmarks.py --html").update({"run": "python3 scripts/validate_benchmarks.py"}),
            lambda w: w["jobs"]["build-check"]["needs"].remove("html-flowchart"),
            lambda w: w["jobs"]["build-check"].update({"if": "${{ always() }}"}),
            lambda w: next(step for step in w["jobs"]["build-check"]["steps"] if step.get("run") == "pnpm build:ghpages").update({"if": "false"}),
            lambda w: w["jobs"]["html-flowchart"].update({"continue-on-error": True}),
            lambda w: w["jobs"]["html-flowchart"]["steps"][-1].update({"if": "false"}),
            lambda w: w["jobs"]["html-flowchart"]["steps"][-1].update({"run": "pnpm test:html-flowchart || true"}),
            lambda w: w["jobs"]["html-flowchart"]["steps"][-1].update({"continue-on-error": True}),
        ]
        for index, mutate in enumerate(mutations):
            with self.subTest(mutation=index):
                workflow = copy.deepcopy(self.workflows["ci.yml"])
                mutate(workflow)
                with self.assertRaises(AssertionError):
                    self.assert_website_gates(workflow)

    def test_website_workflows_have_no_external_export_toolchain(self):
        for workflow in (self.ci, self.deploy):
            self.assertNotRegex(workflow, r"(?i)drawio|desktop|macos|imagemagick|paper_review_site_a\*")

    def test_manual_deployment_runs_all_local_gates_before_build(self):
        job = copy.deepcopy(self.workflows["deploy.yml"]["jobs"]["build-and-deploy"])
        job.pop("if")  # Trigger eligibility is checked independently below.
        self.assert_required_commands(job, [
            "pnpm check:build-process-source", "pnpm audit:build-process", "pnpm test:html-flowchart",
            "pnpm exec tsc --noEmit", "pnpm test:build-process",
        ], condition="github.event_name == 'workflow_dispatch'")
        self.assert_required_commands(job, ["python3 scripts/validate_benchmarks.py --html", "pnpm build:ghpages"])
        self.assertNotIn("continue-on-error", job)
        for step in job["steps"]:
            self.assertNotIn("continue-on-error", step)

    def test_ci_uses_read_only_repository_permissions(self):
        permissions = self.ci.split("permissions:", 1)[1].split("\njobs:", 1)[0]
        self.assertIn("contents: read", permissions)
        self.assertNotIn("pull-requests: write", permissions)

    def test_all_actions_are_pinned_to_full_commit_shas(self):
        workflow_text = "\n".join(
            path.read_text(encoding="utf-8")
            for path in sorted(WORKFLOWS.glob("*.yml"))
        )
        uses = re.findall(r"^\s*uses:\s*([^\s#]+)", workflow_text, flags=re.MULTILINE)
        self.assertTrue(uses)
        for action in uses:
            with self.subTest(action=action):
                self.assertRegex(action, r"^[^@]+@[0-9a-f]{40}$")

    def test_deploy_runs_only_after_successful_same_repo_main_push_ci_or_manual(self):
        workflow = self.workflows["deploy.yml"]
        self.assertEqual(set(workflow["on"]), {"workflow_run", "workflow_dispatch"})
        self.assertEqual(workflow["on"]["workflow_run"], {
            "workflows": ["CI — Validate & Build Check"],
            "types": ["completed"], "branches": ["main"],
        })
        condition = workflow["jobs"]["build-and-deploy"]["if"]
        self.assertEqual(" ".join(condition.split()), " ".join("""
            github.event_name == 'workflow_dispatch' ||
            (
              github.event.workflow_run.conclusion == 'success' &&
              github.event.workflow_run.event == 'push' &&
              github.event.workflow_run.head_branch == 'main' &&
              github.event.workflow_run.head_repository.full_name == github.repository
            )
        """.split()))

    def test_deploy_checks_out_and_publishes_the_verified_sha(self):
        job = self.workflows["deploy.yml"]["jobs"]["build-and-deploy"]
        self.assertEqual(job["env"]["DEPLOY_SHA"], "${{ github.event.workflow_run.head_sha || github.sha }}")
        checkouts = [step for step in job["steps"] if step.get("uses", "").startswith("actions/checkout@")]
        self.assertEqual(len(checkouts), 1)
        self.assertEqual(checkouts[0]["with"]["ref"], "${{ env.DEPLOY_SHA }}")
        self.assertEqual(job["steps"][0], checkouts[0])
        publisher = next(step for step in job["steps"] if step.get("uses", "").startswith("peaceiris/actions-gh-pages@"))
        self.assertEqual(publisher["with"]["publish_dir"], "./dist-ghpages")
        self.assertEqual(publisher["with"]["publish_branch"], "gh-pages")
        self.assertIn("${{ env.DEPLOY_SHA }}", publisher["with"]["commit_message"])
        build_index = next(i for i, step in enumerate(job["steps"]) if step.get("run") == "pnpm build:ghpages")
        self.assertLess(build_index, job["steps"].index(publisher))
        self.assertNotIn("if", publisher)
        self.assertNotIn("continue-on-error", publisher)

    def test_workflows_never_push_back_to_main(self):
        for path in sorted(WORKFLOWS.glob("*.yml")):
            with self.subTest(path=path.name):
                self.assertNotIn("git push", path.read_text(encoding="utf-8"))

    def test_redundant_scheduled_deployer_is_removed(self):
        self.assertFalse((WORKFLOWS / "sync-and-deploy.yml").exists())

    def test_dependabot_monitors_actions_and_pnpm_dependencies(self):
        dependabot = (ROOT / ".github" / "dependabot.yml").read_text(
            encoding="utf-8"
        )
        self.assertIn('package-ecosystem: "github-actions"', dependabot)
        self.assertIn('package-ecosystem: "npm"', dependabot)

    def test_drawio_toolchain_is_pinned_and_exported(self):
        installer = (
            ROOT / "scripts" / "ci" / "install_drawio_toolchain.sh"
        ).read_text(encoding="utf-8")
        self.assertIn(
            "15fbbc71ea13696d7c4e9d2fe7e668919e8608ea",
            installer,
        )
        self.assertIn("DRAWIO_SKILL_COMMIT=15fbbc71ea13696d7c4e9d2fe7e668919e8608ea", installer)
        self.assertIn("DRAWIO_DESKTOP_VERSION=30.0.2", installer)
        self.assertIn(
            "cb44a6770c7dcaef9adbf370beb365b740bde8c4c6e2de9d7a56824cd9ea49af",
            installer,
        )
        self.assertIn("IMPORTER_DRAWIO_E2E_CLI=", installer)
        self.assertIn("CI_DRAWIO_DESKTOP_CLI=", installer)
        self.assertNotRegex(installer, r"(?m)^\s*printf 'DRAWIO_DESKTOP_CLI=")

    def test_drawio_dependencies_install_from_the_locked_repository_root(self):
        installer = (
            ROOT / "scripts" / "ci" / "install_drawio_toolchain.sh"
        ).read_text(encoding="utf-8")
        self.assertIn('npm ci --prefix "${skill_checkout}"\n', installer)

    def test_linux_desktop_smoke_is_separate_from_platform_byte_fidelity(self):
        smoke_test = (
            ROOT / "scripts" / "ci" / "smoke_drawio_desktop.mjs"
        ).read_text(encoding="utf-8")
        self.assertIn("CI_DRAWIO_DESKTOP_CLI", smoke_test)
        self.assertNotIn("smoke_drawio_desktop.mjs", self.ci)
        self.assertNotIn("DRAWIO_DESKTOP_CLI:", self.ci)

    def test_linux_drawio_wrapper_uses_xvfb(self):
        wrapper = (
            ROOT / "scripts" / "ci" / "drawio-desktop-ci.sh"
        ).read_text(encoding="utf-8")
        self.assertIn("xvfb-run", wrapper)
        self.assertIn("/usr/bin/drawio", wrapper)

    def test_macos_drawio_fidelity_job_runs_desktop_tests(self):
        installer = (
            ROOT / "scripts" / "ci" / "install_drawio_toolchain_macos.sh"
        ).read_text(encoding="utf-8")
        package = (ROOT / "package.json").read_text(encoding="utf-8")
        self.assertIn("DRAWIO_SKILL_COMMIT=15fbbc71ea13696d7c4e9d2fe7e668919e8608ea", installer)
        self.assertIn("DRAWIO_DESKTOP_VERSION=30.0.2", installer)
        self.assertIn(
            "cabbb29b250468d906c2cdd3a3920d96783d3af70871f17b8eed0cd3fa8d2cbf",
            installer,
        )
        self.assertIn("IMPORTER_DRAWIO_E2E_CLI=", installer)
        self.assertIn("DRAWIO_DESKTOP_CLI=", installer)
        self.assertIn("brew install imagemagick", installer)
        self.assertIn('test -x "${image_compare}"', installer)
        self.assertIn("IMAGEMAGICK_COMPARE=", installer)
        self.assertIn("IMAGEMAGICK_FONT=", installer)
        self.assertIn("drawio-fidelity-shards:", self.exports)
        self.assertIn("drawio-fidelity:", self.exports)
        self.assertIn("name: Draw.io Export Fidelity (macOS)", self.exports)
        self.assertIn("runs-on: macos-26", self.exports)
        self.assertIn("shard: [1, 2, 3, 4, 5, 6, 7, 8]", self.exports)
        self.assertIn("--test-shard=${{ matrix.shard }}/8", self.exports)
        self.assertIn("needs: drawio-fidelity-shards", self.exports)
        self.assertIn("SHARD_RESULT:", self.exports)
        self.assertIn("scripts/ci/install_drawio_toolchain_macos.sh", self.exports)
        self.assertIn("scripts/ci/diagnose_drawio_png_macos.sh", self.exports)
        self.assertIn(
            "node --test --test-concurrency=1\n"
            "          --test-shard=${{ matrix.shard }}/8",
            self.exports,
        )
        self.assertIn(
            '"test:drawio-fidelity": '
            '"node --test --test-concurrency=1 '
            'scripts/benchmark_build_process/paper_review_site_a*.scoped.test.mjs"',
            package,
        )

    def test_optional_exports_are_manual_read_only_and_keep_full_suite(self):
        workflow = self.workflows["drawio-export.yml"]
        self.assertEqual(set(workflow["on"]), {"workflow_dispatch"})
        self.assertEqual(workflow["permissions"], {"contents": "read"})
        self.assertEqual(set(workflow["jobs"]), {"drawio-fidelity-shards", "drawio-fidelity"})
        shards = workflow["jobs"]["drawio-fidelity-shards"]
        self.assertNotIn("needs", shards)
        self.assertEqual(shards["runs-on"], "macos-26")
        self.assertEqual(shards["strategy"], {"fail-fast": False, "matrix": {"shard": list(range(1, 9))}})
        self.assert_required_commands(shards, [
            "bash scripts/ci/install_drawio_toolchain_macos.sh",
            "node scripts/benchmark_build_process/audit_build_process_assets.mjs",
            "node --test --test-concurrency=1 --test-shard=${{ matrix.shard }}/8 scripts/benchmark_build_process/paper_review_site_a*.scoped.test.mjs",
        ])
        self.assertNotIn("--test-name-pattern", self.exports)
        aggregate = workflow["jobs"]["drawio-fidelity"]
        self.assertEqual(aggregate["needs"], "drawio-fidelity-shards")
        self.assertEqual(aggregate["if"], "${{ always() }}")
        self.assertNotIn("continue-on-error", aggregate)
        check = aggregate["steps"][0]
        self.assertEqual(check["env"]["SHARD_RESULT"], "${{ needs.drawio-fidelity-shards.result }}")
        self.assertIn('test "$SHARD_RESULT" = "success"', check["run"].splitlines())
        self.assertNotIn("continue-on-error", check)
        self.assertNotIn("if", check)
        self.assertNotIn("||", check["run"])
        self.assertNotIn("workflow_call", self.exports)

    def test_active_suite_does_not_register_superseded_test_cases(self):
        test_sources = "\n".join(
            path.read_text(encoding="utf-8")
            for path in sorted(
                (ROOT / "scripts" / "benchmark_build_process").glob("*.test.mjs")
            )
        )
        self.assertNotIn(
            "Superseded by the later A8/A9 paper-review contract",
            test_sources,
        )

    def test_active_suite_does_not_compare_png_container_bytes(self):
        test_sources = "\n".join(
            path.read_text(encoding="utf-8")
            for path in sorted(
                (ROOT / "scripts" / "benchmark_build_process").glob(
                    "paper_review_site_a*.scoped.test.mjs"
                )
            )
        )
        self.assertNotRegex(
            test_sources,
            r"assert\.deepEqual\(\s*readFileSync\((?:generatedPng|png)\)",
        )

    def test_active_suite_uses_portable_svg_fidelity(self):
        test_sources = "\n".join(
            path.read_text(encoding="utf-8")
            for path in sorted(
                (ROOT / "scripts" / "benchmark_build_process").glob(
                    "paper_review_site_a*.scoped.test.mjs"
                )
            )
        )
        self.assertIn("assertSvgFidelity(", test_sources)
        self.assertNotRegex(
            test_sources,
            r"assert\.equal\(\s*readFileSync\((?:generatedSvg|svg),\s*'utf8'\)",
        )

    def test_a10h_accepts_the_ci_drawio_desktop_path(self):
        test_source = (
            ROOT
            / "scripts"
            / "benchmark_build_process"
            / "paper_review_site_a10h.scoped.test.mjs"
        ).read_text(encoding="utf-8")
        self.assertIn("process.env.DRAWIO_DESKTOP_CLI", test_source)

    def test_a10r_accepts_the_ci_image_magick_font(self):
        test_source = (
            ROOT
            / "scripts"
            / "benchmark_build_process"
            / "paper_review_site_a10r.scoped.test.mjs"
        ).read_text(encoding="utf-8")
        self.assertIn("process.env.IMAGEMAGICK_FONT", test_source)

    def test_google_font_import_precedes_tailwind_imports(self):
        stylesheet = (ROOT / "client" / "src" / "index.css").read_text(
            encoding="utf-8"
        )
        google_import = stylesheet.index("@import url(")
        tailwind_import = stylesheet.index('@import "tailwindcss"')
        self.assertLess(google_import, tailwind_import)


if __name__ == "__main__":
    unittest.main()
