import datetime as dt
import importlib.util
import os
import re
import signal
import stat
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path
from unittest import mock


RUNNER = Path(__file__).with_name("run.py")


def load_runner():
    spec = importlib.util.spec_from_file_location("info_gap_runner", RUNNER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RunnerContract(unittest.TestCase):
    def test_runner_exists(self):
        self.assertTrue(RUNNER.is_file(), "runner is not implemented yet")

    def test_repository_root_is_two_parents_above_runner(self):
        runner = load_runner()
        self.assertEqual(runner.REPO_ROOT, RUNNER.resolve().parents[2])


class RunnerBehavior(unittest.TestCase):
    def setUp(self):
        self.runner = load_runner()
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.info = root / "news" / "info-gap"
        self.reports = self.info
        self.logs = self.info / ".logs"
        self.staging = self.info / ".staging"
        self.info.mkdir(parents=True)
        self.prompt = root / "prompt.md"
        self.prompt.write_text(
            "window={WINDOW_START}..{WINDOW_END} date={RUN_DATE} "
            "history={HISTORY} output={OUTPUT_PATH}\n",
            encoding="utf-8",
        )
        self.patch = root / "model.patch.yml"
        self.patch.write_text("model: deepseek-flash\n", encoding="utf-8")
        self.desktop_patch = root / "cordis.patch.yml"
        self.desktop_patch.write_text("provider: desktop\n", encoding="utf-8")
        self.runner.REPO_ROOT = root
        self.runner.INFO_GAP_ROOT = self.info
        self.runner.REPORT_ROOT = self.reports
        self.runner.LOG_ROOT = self.logs
        self.runner.STAGING_ROOT = self.staging
        self.runner.PROMPT_PATH = self.prompt
        self.runner.MODEL_PATCH = self.patch
        self.runner.DESKTOP_PATCH = self.desktop_patch
        self.runner.DSH_CLI = root / "fake-dsh"
        self.runner.KILL_GRACE_SECONDS = 0.1

    def tearDown(self):
        self.tmp.cleanup()

    def _valid(self, date="2026-12-27", url="https://example.com/tool"):
        return (
            f"# 信息差轻副业雷达（{date}）\n"
            "> 本次使用模型：deepseek-flash\n\n"
            "## 本期结论\n结论。\n\n"
            "## 机会清单\n"
            "### [机会 1]\n"
            f"- 项目 URL：{url}\n"
            "- 做法键：key-a\n"
            "- 目标受众：受众 A\n"
            "来源：" + url + "\n\n"
            "## 30 分钟起步清单\n- 第一步\n\n"
            "## 来源与核验\n- " + url + "\n\n"
            "<!-- INFO_GAP_REPORT_COMPLETE -->\n"
        )

    def _fake_dsh(self, body, sleep=None, fork_child=False):
        script = self.info.parent.parent / "fake_dsh.py"
        extra = ""
        if sleep is not None:
            extra += f"\nimport time\ntime.sleep({sleep!r})\n"
        if fork_child:
            extra += textwrap.dedent(
                """
                import os, time
                child = os.fork()
                if child == 0:
                    time.sleep(10)
                    os._exit(0)
                os._exit(0)
                """
            )
        script.write_text(
            "#!/usr/bin/env python3\n"
            "import re, sys\n"
            "prompt = sys.argv[-1]\n"
            "m = re.search(r'输出路径：([^\\n]+)', prompt)\n"
            "if m:\n"
            "    open(m.group(1).strip(), 'w', encoding='utf-8').write(" + repr(body) + ")\n"
            + extra,
            encoding="utf-8",
        )
        script.chmod(script.stat().st_mode | stat.S_IXUSR)
        self.runner.DSH_CLI = script
        return script

    def _run(self, *args, **kwargs):
        return self.runner.main(list(args), **kwargs)

    def test_build_command_uses_exact_profile_patch_permission_order(self):
        prompt = "PROMPT"
        self.assertEqual(
            self.runner.build_command(prompt),
            [
                str(self.runner.DSH_CLI),
                "--profile",
                "headless",
                "--patch",
                str(self.runner.DESKTOP_PATCH),
                "--patch",
                str(self.runner.MODEL_PATCH),
                "--permission-mode",
                "workspace-write",
                "--approval-policy",
                "never",
                prompt,
            ],
        )

    def test_configuration_requires_desktop_patch(self):
        self._fake_dsh(self._valid())
        self.runner.DESKTOP_PATCH = self.info / "missing-cordis.patch.yml"
        with mock.patch.object(self.runner.subprocess, "Popen") as popen:
            code = self._run("--date", "2026-12-27")
        self.assertNotEqual(code, 0)
        popen.assert_not_called()

    def test_cross_year_window_and_target(self):
        start, end = self.runner.compute_window(dt.date(2027, 1, 2))
        self.assertEqual(start, dt.date(2026, 12, 27))
        self.assertEqual(end, dt.date(2027, 1, 2))
        self.assertEqual(
            self.runner.report_path(dt.date(2027, 1, 2)),
            self.reports / "2027" / "20270102.md",
        )

    def test_history_preserves_all_card_index_fields_for_three_long_cards(self):
        cards = []
        for index in range(1, 4):
            url = f"https://example.com/project-{index}"
            cards.append(
                f"### [机会 {index}]\n"
                f"- 项目 URL：{url}\n"
                f"- 做法键：method-{index}\n"
                f"- 目标受众：audience-{index}\n"
                + ("正文。" * 1800)
            )
        text = self._valid().replace("### [机会 1]\n- 项目 URL：https://example.com/tool\n- 做法键：key-a\n- 目标受众：受众 A\n", "\n".join(cards) + "\n", 1)
        path = self.reports / "2026" / "20261227.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        history = self.runner.load_history(dt.date(2026, 12, 27))
        for index in range(1, 4):
            self.assertIn(f"method-{index}", history.text)
            self.assertIn(f"https://example.com/project-{index}", history.text)
        self.assertLessEqual(len(history.text), 10000)

    def test_history_uses_only_eight_valid_nonfuture_strict_reports(self):
        for offset in range(12):
            day = dt.date(2026, 12, 27) - dt.timedelta(days=offset)
            path = self.reports / f"{day.year}" / f"{day:%Y%m%d}.md"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(self._valid(day.isoformat()), encoding="utf-8")
        (self.reports / "2027" / "20270103.md").parent.mkdir(exist_ok=True)
        (self.reports / "2027" / "20270103.md").write_text(
            self._valid("2027-01-03"), encoding="utf-8"
        )
        (self.reports / "2026" / "20261226-failed.md").write_text(
            self._valid("2026-12-26"), encoding="utf-8"
        )
        (self.reports / "2026" / "not-a-date.md").write_text(
            self._valid("2026-12-26"), encoding="utf-8"
        )
        history = self.runner.load_history(dt.date(2026, 12, 27))
        self.assertEqual(len(history.items), 8)
        self.assertIn("20261227.md", history.text)
        self.assertNotIn("20261219.md", history.text)
        self.assertNotIn("20270103.md", history.text)
        self.assertIn("https://example.com/tool", history.text)

    def test_history_requires_year_directory_to_match_report_date(self):
        wrong = self.reports / "2025" / "20261227.md"
        wrong.parent.mkdir(parents=True)
        wrong.write_text(self._valid("2026-12-27"), encoding="utf-8")
        history = self.runner.load_history(dt.date(2026, 12, 27))
        self.assertNotIn("20261227.md", history.text)

    def test_history_preserves_every_opportunity_index_when_body_is_long(self):
        cards = []
        for number in range(1, 4):
            cards.append(
                f"### [机会 {number}]\n"
                f"- 项目 URL：https://example.com/tool-{number}\n"
                f"- 做法键：method-{number}\n"
                f"- 目标受众：audience-{number}\n"
                + ("长正文。" * 900)
            )
        report = (
            "# 信息差轻副业雷达（2026-12-27）\n"
            "> 本次使用模型：deepseek-flash\n\n"
            "## 本期结论\n结论。\n\n"
            "## 机会清单\n" + "\n\n".join(cards) + "\n\n"
            "## 30 分钟起步清单\n- 第一步\n\n"
            "## 来源与核验\n- https://example.com/tool-1\n\n"
            "<!-- INFO_GAP_REPORT_COMPLETE -->\n"
        )
        path = self.reports / "2026" / "20261227.md"
        path.parent.mkdir(parents=True)
        path.write_text(report, encoding="utf-8")
        history = self.runner.load_history(dt.date(2026, 12, 28))
        for number in range(1, 4):
            self.assertIn(f"项目 URL：https://example.com/tool-{number}", history.text)
            self.assertIn(f"做法键：method-{number}", history.text)
            self.assertIn(f"目标受众：audience-{number}", history.text)

    def test_validator_rejects_more_than_three_cards_and_bad_card_urls(self):
        good = self._valid()
        cards = []
        for number in range(1, 5):
            cards.append(
                f"### [机会 {number}]\n"
                f"- 项目 URL：https://example.com/tool-{number}\n"
                f"- 做法键：key-{number}\n"
                f"- 目标受众：受众 {number}\n"
                "卡片正文。"
            )
        four_cards = good.replace(
            "### [机会 1]\n- 项目 URL：https://example.com/tool\n- 做法键：key-a\n- 目标受众：受众 A\n来源：https://example.com/tool",
            "\n".join(cards),
        )
        self.assertTrue(self.runner.validate_report(four_cards, dt.date(2026, 12, 27)))
        bad_url = good.replace("- 项目 URL：https://example.com/tool", "- 项目 URL：not-a-url")
        self.assertTrue(self.runner.validate_report(bad_url, dt.date(2026, 12, 27)))
        indented = good.replace("- 项目 URL：https://example.com/tool", "  - 项目 URL：https://example.com/tool")
        self.assertTrue(self.runner.validate_report(indented, dt.date(2026, 12, 27)))
        indented_heading = good.replace("### [机会 1]", "  ### [机会 1]")
        self.assertTrue(self.runner.validate_report(indented_heading, dt.date(2026, 12, 27)))

    def test_validator_requires_all_sections_marker_date_model_body_and_http_url(self):
        good = self._valid()
        self.assertEqual(self.runner.validate_report(good, dt.date(2026, 12, 27)), [])
        for bad in (
            good.replace("## 来源与核验", "## 来源", 1),
            good.replace("deepseek-flash", "other-model", 1),
            good.replace("2026-12-27", "2026-12-28", 1),
            good.replace("https://example.com/tool", "not-a-url"),
            good.replace("https://example.com/tool", "https://"),
            good.replace("https://example.com/tool", "https://?"),
            good.replace("## 本期结论\n结论。", "## 本期结论\n<!-- INFO_GAP_REPORT_COMPLETE -->"),
            "前置噪声\n" + good,
            good.replace("> 本次使用模型：deepseek-flash", "前置说明\n> 本次使用模型：deepseek-flash", 1),
            good.replace("<!-- INFO_GAP_REPORT_COMPLETE -->", ""),
        ):
            self.assertTrue(self.runner.validate_report(bad, dt.date(2026, 12, 27)))

    def test_normal_run_acquires_lock_before_reading_history(self):
        events = []
        lock = mock.Mock()
        self._fake_dsh(self._valid())
        original_load = self.runner.load_history
        original_acquire = self.runner._acquire_lock
        def record_load(run_date):
            events.append("history")
            return original_load(run_date)
        def record_acquire(path):
            events.append("lock")
            return original_acquire(path)
        with mock.patch.object(self.runner, "_acquire_lock", side_effect=record_acquire):
            with mock.patch.object(self.runner, "load_history", side_effect=record_load):
                code = self._run("--date", "2026-12-27")
        self.assertEqual(code, 0)
        self.assertLess(events.index("lock"), events.index("history"))

    def test_dry_run_prints_complete_prompt_without_side_effects_or_child(self):
        before = set(self.info.rglob("*"))
        with mock.patch.object(self.runner.subprocess, "Popen") as popen, mock.patch(
            "builtins.print"
        ) as printer:
            code = self._run("--dry-run", "--date", "2026-12-27")
        self.assertEqual(code, 0)
        popen.assert_not_called()
        self.assertEqual(before, set(self.info.rglob("*")))
        output = "\n".join(str(call.args[0]) for call in printer.call_args_list)
        self.assertIn("2026-12-21", output)
        self.assertIn("deepseek-flash", output)
        self.assertIn("window=2026-12-21..2026-12-27", output)
        self.assertIn("输出路径：", output)

    def test_success_stages_valid_report_and_atomically_publishes(self):
        self._fake_dsh(self._valid())
        code = self._run("--date", "2026-12-27")
        target = self.reports / "2026" / "20261227.md"
        self.assertEqual(code, 0)
        self.assertEqual(target.read_text(encoding="utf-8"), self._valid())
        self.assertTrue(self.logs.exists())
        self.assertFalse(self.staging / "20261227" / "report.md" == target)

    def test_cleanup_failure_after_publish_is_warning_only_and_keeps_stage(self):
        self._fake_dsh(self._valid())
        with mock.patch.object(self.runner, "_cleanup_stage", side_effect=OSError("busy")):
            with mock.patch.object(self.runner, "print") as printer:
                code = self._run("--date", "2026-12-27")
        target = self.reports / "2026" / "20261227.md"
        self.assertEqual(code, 0)
        self.assertEqual(target.read_text(encoding="utf-8"), self._valid())
        self.assertTrue(list(self.staging.iterdir()))
        output = "\n".join(str(call.args[0]) for call in printer.call_args_list)
        self.assertIn("警告", output)

    def test_log_symlink_is_rejected_without_modifying_external_file(self):
        self._fake_dsh(self._valid())
        self.logs.mkdir(parents=True)
        outside = Path(self.tmp.name) / "outside.log"
        outside.write_text("keep", encoding="utf-8")
        (self.logs / "dsh-output.log").symlink_to(outside)
        code = self._run("--date", "2026-12-27")
        self.assertNotEqual(code, 0)
        self.assertEqual(outside.read_text(encoding="utf-8"), "keep")

    def test_cleanup_error_after_publish_is_warning_not_failure(self):
        self._fake_dsh(self._valid())
        with mock.patch.object(self.runner, "_cleanup_stage", side_effect=OSError("cleanup blocked")):
            code = self._run("--date", "2026-12-27")
        target = self.reports / "2026" / "20261227.md"
        self.assertEqual(code, 0)
        self.assertEqual(target.read_text(encoding="utf-8"), self._valid())

    def test_staged_source_is_revalidated_before_atomic_publish(self):
        self._fake_dsh(self._valid())
        original = self.runner._validate_stage_path
        with mock.patch.object(self.runner, "_validate_stage_path", wraps=original) as validate:
            code = self._run("--date", "2026-12-27")
        self.assertEqual(code, 0)
        self.assertGreaterEqual(validate.call_count, 2)

    def test_nonzero_child_preserves_old_success_and_failure_artifacts(self):
        target = self.reports / "2026" / "20261227.md"
        target.parent.mkdir(parents=True)
        old = self._valid()
        target.write_text(old, encoding="utf-8")
        script = self.info.parent.parent / "fail_dsh.py"
        script.write_text("#!/usr/bin/env python3\nimport sys\nsys.exit(7)\n", encoding="utf-8")
        script.chmod(script.stat().st_mode | stat.S_IXUSR)
        self.runner.DSH_CLI = script
        code = self._run("--date", "2026-12-27")
        self.assertEqual(code, 7)
        self.assertEqual(target.read_text(encoding="utf-8"), old)
        self.assertTrue(list(self.staging.rglob("失败说明.md")))

    def test_same_day_success_is_in_history_before_it_is_hidden(self):
        target = self.reports / "2026" / "20261227.md"
        target.parent.mkdir(parents=True)
        old = self._valid()
        target.write_text(old, encoding="utf-8")
        marker = self.info.parent.parent / "same-day-history.txt"
        script = self.info.parent.parent / "same_day_dsh.py"
        script.write_text(
            "#!/usr/bin/env python3\n"
            "import re, sys\n"
            f"prompt = sys.argv[-1]\nmarker = {str(marker)!r}\n"
            "if 'key-a' in prompt and 'https://example.com/tool' in prompt:\n"
            "    open(marker, 'w').write('found')\n"
            "output = re.search(r'输出路径：([^\\n]+)', prompt).group(1).strip()\n"
            f"open(output, 'w', encoding='utf-8').write({self._valid()!r})\n",
            encoding="utf-8",
        )
        script.chmod(script.stat().st_mode | stat.S_IXUSR)
        self.runner.DSH_CLI = script
        self.assertEqual(self._run("--date", "2026-12-27"), 0)
        self.assertEqual(marker.read_text(encoding="utf-8"), "found")

    def test_failure_restores_success_when_model_deletes_staging_directory(self):
        target = self.reports / "2026" / "20261227.md"
        target.parent.mkdir(parents=True)
        old = self._valid()
        target.write_text(old, encoding="utf-8")
        script = self.info.parent.parent / "delete_stage_dsh.py"
        script.write_text(
            "#!/usr/bin/env python3\n"
            "import re, shutil, sys\n"
            "output = re.search(r'输出路径：([^\\n]+)', sys.argv[-1]).group(1).strip()\n"
            "shutil.rmtree(__import__('pathlib').Path(output).parent)\n"
            "raise SystemExit(7)\n",
            encoding="utf-8",
        )
        script.chmod(script.stat().st_mode | stat.S_IXUSR)
        self.runner.DSH_CLI = script
        self.assertEqual(self._run("--date", "2026-12-27"), 7)
        self.assertEqual(target.read_text(encoding="utf-8"), old)

    def test_failed_child_cannot_create_direct_target_when_no_success_exists(self):
        target = self.reports / "2026" / "20261227.md"
        target.parent.mkdir(parents=True)
        script = self.info.parent.parent / "create_fail_dsh.py"
        script.write_text(
            "#!/usr/bin/env python3\n"
            "from pathlib import Path\n"
            f"Path({str(target)!r}).write_text('corrupted', encoding='utf-8')\n"
            "raise SystemExit(7)\n",
            encoding="utf-8",
        )
        script.chmod(script.stat().st_mode | stat.S_IXUSR)
        self.runner.DSH_CLI = script
        code = self._run("--date", "2026-12-27")
        self.assertEqual(code, 7)
        self.assertFalse(target.exists())

    def test_failed_child_cannot_overwrite_existing_success_directly(self):
        target = self.reports / "2026" / "20261227.md"
        target.parent.mkdir(parents=True)
        old = self._valid()
        target.write_text(old, encoding="utf-8")
        script = self.info.parent.parent / "overwrite_fail_dsh.py"
        script.write_text(
            "#!/usr/bin/env python3\n"
            "from pathlib import Path\n"
            f"target = Path({str(target)!r})\n"
            "if target.exists(): target.write_text('corrupted', encoding='utf-8')\n"
            "raise SystemExit(7)\n",
            encoding="utf-8",
        )
        script.chmod(script.stat().st_mode | stat.S_IXUSR)
        self.runner.DSH_CLI = script
        code = self._run("--date", "2026-12-27")
        self.assertEqual(code, 7)
        self.assertEqual(target.read_text(encoding="utf-8"), old)

    def test_existing_success_is_hidden_from_model_until_validated_publish(self):
        target = self.reports / "2026" / "20261227.md"
        target.parent.mkdir(parents=True)
        old = self._valid()
        target.write_text(old, encoding="utf-8")
        marker = self.info.parent.parent / "model-saw-existing-report.txt"
        script = self.info.parent.parent / "visibility_dsh.py"
        script.write_text(
            "#!/usr/bin/env python3\n"
            "from pathlib import Path\n"
            f"target = Path({str(target)!r})\n"
            f"marker = Path({str(marker)!r})\n"
            "if target.exists(): marker.write_text('visible', encoding='utf-8')\n"
            "raise SystemExit(7)\n",
            encoding="utf-8",
        )
        script.chmod(script.stat().st_mode | stat.S_IXUSR)
        self.runner.DSH_CLI = script
        code = self._run("--date", "2026-12-27")
        self.assertEqual(code, 7)
        self.assertFalse(marker.exists())
        self.assertEqual(target.read_text(encoding="utf-8"), old)

    def test_failed_child_cannot_tamper_with_hidden_backup(self):
        target = self.reports / "2026" / "20261227.md"
        target.parent.mkdir(parents=True)
        old = self._valid()
        target.write_text(old, encoding="utf-8")
        script = self.info.parent.parent / "tamper_backup_dsh.py"
        script.write_text(
            "#!/usr/bin/env python3\n"
            "import re\n"
            "from pathlib import Path\n"
            "output = Path(re.search(r'输出路径：([^\\n]+)', __import__('sys').argv[-1]).group(1).strip())\n"
            "backup = output.parent / 'previous-success.md'\n"
            "if backup.exists(): backup.write_text('tampered', encoding='utf-8')\n"
            "raise SystemExit(7)\n",
            encoding="utf-8",
        )
        script.chmod(script.stat().st_mode | stat.S_IXUSR)
        self.runner.DSH_CLI = script
        code = self._run("--date", "2026-12-27")
        self.assertEqual(code, 7)
        self.assertEqual(target.read_text(encoding="utf-8"), old)

    def test_failed_child_cannot_replace_existing_success_with_symlink_backup(self):
        target = self.reports / "2026" / "20261227.md"
        target.parent.mkdir(parents=True)
        old = self._valid()
        target.write_text(old, encoding="utf-8")
        outside = self.tmp.name + "/outside-backup"
        Path(outside).write_text("outside", encoding="utf-8")
        script = self.info.parent.parent / "symlink_backup_dsh.py"
        script.write_text(
            "#!/usr/bin/env python3\n"
            "import re, sys\n"
            "from pathlib import Path\n"
            "output = Path(re.search(r'输出路径：([^\\n]+)', sys.argv[-1]).group(1).strip())\n"
            "backup = output.parent / 'previous-success.md'\n"
            "if backup.exists(): backup.unlink()\n"
            f"backup.symlink_to({outside!r})\n"
            "raise SystemExit(7)\n",
            encoding="utf-8",
        )
        script.chmod(script.stat().st_mode | stat.S_IXUSR)
        self.runner.DSH_CLI = script
        code = self._run("--date", "2026-12-27")
        self.assertEqual(code, 7)
        self.assertEqual(target.read_text(encoding="utf-8"), old)
        self.assertEqual(Path(outside).read_text(encoding="utf-8"), "outside")

    def test_failed_child_cannot_replace_existing_success_with_directory(self):
        target = self.reports / "2026" / "20261227.md"
        target.parent.mkdir(parents=True)
        old = self._valid()
        target.write_text(old, encoding="utf-8")
        script = self.info.parent.parent / "directory_fail_dsh.py"
        script.write_text(
            "#!/usr/bin/env python3\n"
            "from pathlib import Path\n"
            f"target = Path({str(target)!r})\n"
            "target.mkdir()\n"
            "raise SystemExit(7)\n",
            encoding="utf-8",
        )
        script.chmod(script.stat().st_mode | stat.S_IXUSR)
        self.runner.DSH_CLI = script
        code = self._run("--date", "2026-12-27")
        self.assertEqual(code, 7)
        self.assertEqual(target.read_text(encoding="utf-8"), old)

    def test_zero_exit_without_output_is_failure(self):
        script = self.info.parent.parent / "empty_dsh.py"
        script.write_text("#!/usr/bin/env python3\n", encoding="utf-8")
        script.chmod(script.stat().st_mode | stat.S_IXUSR)
        self.runner.DSH_CLI = script
        self.assertNotEqual(self._run("--date", "2026-12-27"), 0)
        self.assertFalse((self.reports / "2026" / "20261227.md").exists())

    def test_invalid_staged_report_does_not_replace_old_success(self):
        target = self.reports / "2026" / "20261227.md"
        target.parent.mkdir(parents=True)
        old = self._valid()
        target.write_text(old, encoding="utf-8")
        self._fake_dsh(old.replace("## 来源与核验", "## 来源", 1))
        self.assertNotEqual(self._run("--date", "2026-12-27"), 0)
        self.assertEqual(target.read_text(encoding="utf-8"), old)
        self.assertTrue(list(self.staging.rglob("失败说明.md")))

    def test_timeout_waits_for_orphaned_child_after_group_leader_exits(self):
        self._fake_dsh(self._valid(), fork_child=True)
        self.runner.KILL_GRACE_SECONDS = 0.05
        with mock.patch.object(self.runner, "default_timeout", return_value=0.1):
            code = self._run("--date", "2026-12-27")
        self.assertEqual(code, 124)
        self.assertFalse((self.reports / "2026" / "20261227.md").exists())

    def test_timeout_terminates_tracked_detached_setsid_descendant(self):
        marker = self.info.parent.parent / "detached-child.pid"
        script = self.info.parent.parent / "setsid_dsh.py"
        child_code = (
            "import os, signal, time\n"
            "os.setsid()\n"
            f"open({str(marker)!r}, 'w').write(str(os.getpid()))\n"
            "signal.signal(signal.SIGTERM, lambda *_: exit(0))\n"
            "time.sleep(30)\n"
        )
        script.write_text(
            "#!/usr/bin/env python3\n"
            "import subprocess, sys, time\n"
            f"subprocess.Popen([sys.executable, '-c', {child_code!r}])\n"
            "for _ in range(100):\n"
            f"    if __import__('os').path.exists({str(marker)!r}): break\n"
            "    time.sleep(0.01)\n"
            "time.sleep(30)\n",
            encoding="utf-8",
        )
        script.chmod(script.stat().st_mode | stat.S_IXUSR)
        self.runner.DSH_CLI = script
        self.runner.KILL_GRACE_SECONDS = 0.05
        with mock.patch.object(self.runner, "default_timeout", return_value=0.25):
            code = self._run("--date", "2026-12-27")
        self.assertEqual(code, 124)
        if marker.exists():
            pid = int(marker.read_text(encoding="utf-8"))
            with self.assertRaises(ProcessLookupError):
                os.kill(pid, 0)

    def test_invalid_timeout_does_not_start_child_or_create_runtime_dirs(self):
        self.runner.DSH_CLI = self._fake_dsh(self._valid())
        before = set(self.info.rglob("*"))
        with mock.patch.dict(os.environ, {"DSH_INFO_GAP_TIMEOUT": "not-positive"}, clear=False), mock.patch.object(
            self.runner.subprocess, "Popen"
        ) as popen:
            code = self._run("--date", "2026-12-27")
        self.assertNotEqual(code, 0)
        popen.assert_not_called()
        self.assertEqual(before, set(self.info.rglob("*")))

    def test_missing_configuration_is_explicit_failure_without_child(self):
        self.runner.DSH_CLI = self.info / "missing-dsh"
        with mock.patch.object(self.runner.subprocess, "Popen") as popen:
            code = self._run("--date", "2026-12-27")
        self.assertNotEqual(code, 0)
        popen.assert_not_called()

    def test_mutex_returns_75_without_starting_child(self):
        self._fake_dsh(self._valid())
        self.logs.mkdir()
        import fcntl

        lock_path = self.logs / "run.lock"
        with lock_path.open("w") as held:
            fcntl.flock(held.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            with mock.patch.object(self.runner.subprocess, "Popen") as popen:
                code = self._run("--date", "2026-12-27")
            popen.assert_not_called()
        self.assertEqual(code, 75)

    def test_symlink_log_is_rejected_without_modifying_outside_file(self):
        self._fake_dsh(self._valid())
        self.logs.mkdir(parents=True)
        outside = Path(self.tmp.name) / "outside-log.txt"
        outside.write_text("keep", encoding="utf-8")
        (self.logs / "dsh-output.log").symlink_to(outside)
        code = self._run("--date", "2026-12-27")
        self.assertNotEqual(code, 0)
        self.assertEqual(outside.read_text(encoding="utf-8"), "keep")

    def test_symlink_target_is_rejected_without_replacing_outside_file(self):
        self._fake_dsh(self._valid())
        outside = Path(self.tmp.name) / "outside.md"
        outside.write_text("keep", encoding="utf-8")
        year = self.reports / "2026"
        year.mkdir()
        target = year / "20261227.md"
        target.symlink_to(outside)
        code = self._run("--date", "2026-12-27")
        self.assertNotEqual(code, 0)
        self.assertEqual(outside.read_text(encoding="utf-8"), "keep")

    def test_symlinked_parent_cannot_redirect_runtime_state_outside_repo_root(self):
        self._fake_dsh(self._valid())
        alternate_root = Path(self.tmp.name) / "alternate-root"
        alternate_root.mkdir()
        outside = Path(self.tmp.name) / "outside-runtime"
        outside.mkdir()
        (alternate_root / "news").symlink_to(outside, target_is_directory=True)
        self.runner.REPO_ROOT = alternate_root
        self.runner.INFO_GAP_ROOT = alternate_root / "news" / "info-gap"
        self.runner.REPORT_ROOT = self.runner.INFO_GAP_ROOT
        self.runner.LOG_ROOT = self.runner.INFO_GAP_ROOT / ".logs"
        self.runner.STAGING_ROOT = self.runner.INFO_GAP_ROOT / ".staging"
        code = self._run("--date", "2026-12-27")
        self.assertNotEqual(code, 0)
        self.assertFalse((outside / "info-gap").exists())

    def test_timeout_returns_124_and_does_not_publish(self):
        self._fake_dsh(self._valid(), sleep=2)
        self.runner.KILL_GRACE_SECONDS = 0.05
        with mock.patch.object(self.runner, "default_timeout", return_value=0.1):
            code = self._run("--date", "2026-12-27")
        self.assertEqual(code, 124)
        self.assertFalse((self.reports / "2026" / "20261227.md").exists())


if __name__ == "__main__":
    unittest.main()
