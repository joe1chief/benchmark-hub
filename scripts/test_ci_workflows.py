import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = ROOT / ".github" / "workflows"


class CiWorkflowContractTests(unittest.TestCase):
    def setUp(self):
        self.ci = (WORKFLOWS / "ci.yml").read_text(encoding="utf-8")
        self.deploy = (WORKFLOWS / "deploy.yml").read_text(encoding="utf-8")

    def test_main_push_is_not_hidden_behind_path_filters(self):
        push_block = self.ci.split("  push:", 1)[1].split("\npermissions:", 1)[0]
        self.assertNotIn("\n    paths:", push_block)

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

    def test_deploy_runs_only_after_successful_main_push_ci(self):
        self.assertIn("workflow_run:", self.deploy)
        self.assertIn('workflows: ["CI — Validate & Build Check"]', self.deploy)
        self.assertIn("branches:\n      - main", self.deploy)
        self.assertIn("github.event.workflow_run.conclusion == 'success'", self.deploy)
        self.assertIn("github.event.workflow_run.event == 'push'", self.deploy)
        self.assertIn("github.event.workflow_run.head_branch == 'main'", self.deploy)
        self.assertNotIn("\n  push:", self.deploy)

    def test_deploy_checks_out_the_verified_sha(self):
        self.assertIn("github.event.workflow_run.head_sha", self.deploy)
        self.assertNotIn("ref: main", self.deploy)

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
        self.assertIn("DRAWIO_DESKTOP_VERSION=30.0.2", installer)
        self.assertIn(
            "cb44a6770c7dcaef9adbf370beb365b740bde8c4c6e2de9d7a56824cd9ea49af",
            installer,
        )
        self.assertIn("IMPORTER_DRAWIO_E2E_CLI=", installer)
        self.assertIn("CI_DRAWIO_DESKTOP_CLI=", installer)
        self.assertNotRegex(installer, r"(?m)^\s*printf 'DRAWIO_DESKTOP_CLI=")
        self.assertIn("scripts/ci/install_drawio_toolchain.sh", self.ci)

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
        self.assertIn("smoke_drawio_desktop.mjs", self.ci)
        self.assertNotIn("DRAWIO_DESKTOP_CLI:", self.ci)

    def test_linux_drawio_wrapper_uses_xvfb(self):
        wrapper = (
            ROOT / "scripts" / "ci" / "drawio-desktop-ci.sh"
        ).read_text(encoding="utf-8")
        self.assertIn("xvfb-run", wrapper)
        self.assertIn("/usr/bin/drawio", wrapper)

    def test_a10h_accepts_the_ci_drawio_desktop_path(self):
        test_source = (
            ROOT
            / "scripts"
            / "benchmark_build_process"
            / "paper_review_site_a10h.scoped.test.mjs"
        ).read_text(encoding="utf-8")
        self.assertIn("process.env.DRAWIO_DESKTOP_CLI", test_source)

    def test_google_font_import_precedes_tailwind_imports(self):
        stylesheet = (ROOT / "client" / "src" / "index.css").read_text(
            encoding="utf-8"
        )
        google_import = stylesheet.index("@import url(")
        tailwind_import = stylesheet.index('@import "tailwindcss"')
        self.assertLess(google_import, tailwind_import)


if __name__ == "__main__":
    unittest.main()
