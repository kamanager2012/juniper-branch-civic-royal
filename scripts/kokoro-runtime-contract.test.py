#!/usr/bin/env python3
from __future__ import annotations

import importlib
from pathlib import Path
import sys
import tempfile
import unittest

from kokoro_runtime import install_source_namespace, phonemize_losslessly


class KokoroRuntimeContractTests(unittest.TestCase):
    def test_namespace_loader_does_not_execute_upstream_init(self):
        with tempfile.TemporaryDirectory() as temp:
            checkout = Path(temp)
            package_dir = checkout / "fixturepkg"
            package_dir.mkdir()
            (package_dir / "__init__.py").write_text("raise RuntimeError('must not execute')\n", encoding="utf-8")
            (package_dir / "model.py").write_text("VALUE = 7\n", encoding="utf-8")
            try:
                install_source_namespace("fixturepkg", checkout)
                module = importlib.import_module("fixturepkg.model")
                self.assertEqual(module.VALUE, 7)
            finally:
                for name in [key for key in sys.modules if key == "fixturepkg" or key.startswith("fixturepkg.")]:
                    sys.modules.pop(name, None)

    def test_lossless_split_preserves_text_and_limit(self):
        def fake_g2p(text: str):
            return "x" * (len(text) * 4), None

        text = "耐心观察，认真判断。" * 80
        chunks = phonemize_losslessly(fake_g2p, text, max_phonemes=40)
        self.assertGreater(len(chunks), 1)
        self.assertEqual("".join(graphemes for graphemes, _ in chunks), text)
        self.assertTrue(all(0 < len(phonemes) <= 40 for _, phonemes in chunks))

    def test_unknown_phoneme_fails_closed(self):
        def fake_g2p(_text: str):
            return "❓", None

        with self.assertRaisesRegex(RuntimeError, "unknown phoneme marker"):
            phonemize_losslessly(fake_g2p, "AI")


if __name__ == "__main__":
    unittest.main()
