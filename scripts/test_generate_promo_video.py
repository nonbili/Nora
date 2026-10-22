"""Encoder lifecycle regressions: python3 -m unittest discover -s scripts -p 'test_*.py'."""

import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    "promo", Path(__file__).with_name("generate-promo-video.py")
)
promo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(promo)


class VideoEncoderTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.output = Path(self.directory.name) / "video.mp4"
        self.output.write_bytes(b"previous video")

    def assert_preserved(self):
        self.assertEqual(self.output.read_bytes(), b"previous video")
        self.assertEqual(list(self.output.parent.iterdir()), [self.output])

    def test_encoder_failure_reports_large_diagnostics_and_preserves_output(self):
        command = [sys.executable, "-c", (
            "import sys; "
            "sys.stderr.write('x' * 200000 + 'ENCODER_FAILURE'); "
            "sys.exit(7)"
        )]
        with self.assertRaisesRegex(RuntimeError, r"(?s)exit 7.*ENCODER_FAILURE"):
            with promo.video_encoder(command, self.output) as pipe:
                pipe.write(b"frame" * 100000)
        self.assert_preserved()

    def test_renderer_exception_reaps_encoder_and_preserves_output(self):
        command = [sys.executable, "-c", "import sys; sys.stdin.buffer.read()"]
        with self.assertRaisesRegex(ValueError, "renderer failed"):
            with promo.video_encoder(command, self.output) as pipe:
                pipe.write(b"frame")
                raise ValueError("renderer failed")
        self.assert_preserved()

    def test_success_replaces_output_after_encoder_exits(self):
        command = [sys.executable, "-c", (
            "import sys; from pathlib import Path; "
            "Path(sys.argv[1]).write_bytes(sys.stdin.buffer.read())"
        )]
        with promo.video_encoder(command, self.output) as pipe:
            pipe.write(b"new video")
            self.assertEqual(self.output.read_bytes(), b"previous video")
        self.assertEqual(self.output.read_bytes(), b"new video")
        self.assertEqual(list(self.output.parent.iterdir()), [self.output])


if __name__ == "__main__":
    unittest.main()
