#!/usr/bin/env python3
"""Smoke-test the minimal pinned Mandarin runtime without model weights."""

from __future__ import annotations

import argparse
import contextlib
import importlib.metadata
import json
import platform as host_platform
from pathlib import Path
import sys

from kokoro_runtime import (
    BANNED_RUNTIME_MODULES,
    assert_minimal_runtime_imports,
    load_pinned_runtime,
    phonemize_losslessly,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--kokoro-src-dir", required=True)
    parser.add_argument("--misaki-src-dir", required=True)
    return parser.parse_args()


def package_version(name: str) -> str:
    return importlib.metadata.version(name)


def normalized_arch() -> str:
    machine = host_platform.machine().lower()
    return "x64" if machine in {"x86_64", "amd64"} else machine


def main() -> None:
    args = parse_args()
    runtime = load_pinned_runtime(Path(args.kokoro_src_dir), Path(args.misaki_src_dir))
    ZHG2P = runtime["ZHG2P"]
    with contextlib.redirect_stdout(sys.stderr):
        g2p = ZHG2P(version="1.1", en_callable=None)

    sample = "守株待兔，不能只靠运气。"
    chunks = phonemize_losslessly(g2p, sample)
    if len(chunks) != 1 or not chunks[0][1]:
        raise RuntimeError("Mandarin G2P smoke sample did not produce one non-empty chunk")

    long_sample = "耐心观察，认真判断。" * 80
    long_chunks = phonemize_losslessly(g2p, long_sample)
    if len(long_chunks) < 2:
        raise RuntimeError("lossless over-limit smoke sample was not split")
    if any(len(phonemes) > 510 for _, phonemes in long_chunks):
        raise RuntimeError("lossless smoke produced an over-limit phoneme chunk")
    if "".join(graphemes for graphemes, _ in long_chunks) != long_sample:
        raise RuntimeError("lossless smoke did not preserve narration text exactly")

    try:
        phonemize_losslessly(g2p, "AI")
    except RuntimeError as error:
        if "unknown phoneme marker" not in str(error):
            raise
    else:
        raise RuntimeError("unsupported Latin text did not fail closed")

    assert_minimal_runtime_imports()
    unexpectedly_loaded = sorted(name for name in BANNED_RUNTIME_MODULES if name in sys.modules)
    if unexpectedly_loaded:
        raise RuntimeError(f"banned runtime modules loaded: {unexpectedly_loaded}")

    report = {
        "schemaVersion": 1,
        "runtime": "kokoro-mandarin-minimal-v1",
        "pythonVersion": sys.version.split()[0],
        "platform": sys.platform,
        "arch": normalized_arch(),
        "device": "cpu",
        "versions": {
            "torch": package_version("torch"),
            "transformers": package_version("transformers"),
            "numpy": package_version("numpy"),
            "huggingface-hub": package_version("huggingface-hub"),
            "jieba": package_version("jieba"),
            "pypinyin": package_version("pypinyin"),
            "cn2an": package_version("cn2an"),
        },
        "kokoroModulePath": runtime["kokoroModulePath"],
        "misakiModulePath": runtime["misakiModulePath"],
        "samplePhonemeLength": len(chunks[0][1]),
        "longSampleChunks": len(long_chunks),
        "bannedModulesLoaded": unexpectedly_loaded,
    }
    print(json.dumps(report, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
