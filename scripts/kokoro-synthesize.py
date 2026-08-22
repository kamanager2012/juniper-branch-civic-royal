#!/usr/bin/env python3
"""Synthesize pinned Kokoro Mandarin narration to staging WAV files.

This engine deliberately does not know about release provenance or narration state.
The Node orchestrator validates provider/runtime identity, encodes MP3, writes the
contemporaneous receipt, and commits outputs atomically.
"""

from __future__ import annotations

import argparse
import array
import json
import os
from pathlib import Path
import sys
import wave

MODEL_REPOSITORY = "hexgrad/Kokoro-82M-v1.1-zh"
SAMPLE_RATE = 24000
VOICE_FILE = "voices/zf_001.pt"
MODEL_FILE = "kokoro-v1_1-zh.pth"
CONFIG_FILE = "config.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--assets-dir", required=True)
    parser.add_argument("--kokoro-src-dir", required=True)
    parser.add_argument("--misaki-src-dir", required=True)
    parser.add_argument("--device", choices=("cpu", "cuda"), default="cpu")
    return parser.parse_args()


def prepend_source_checkout(path: Path) -> None:
    sys.path.insert(0, str(path.resolve()))


def ensure_module_from_checkout(module_file: str, checkout: Path, label: str) -> None:
    module_path = Path(module_file).resolve()
    checkout_path = checkout.resolve()
    try:
        module_path.relative_to(checkout_path)
    except ValueError as exc:
        raise RuntimeError(f"{label} resolved outside pinned checkout: {module_path}") from exc


def write_pcm16_wav(path: Path, audio, torch_module) -> int:
    samples = (
        audio.detach()
        .to("cpu")
        .clamp(-1.0, 1.0)
        .mul(32767.0)
        .round()
        .to(dtype=torch_module.int16)
        .tolist()
    )
    pcm = array.array("h", samples)
    if sys.byteorder != "little":
        pcm.byteswap()

    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(SAMPLE_RATE)
        handle.writeframes(pcm.tobytes())
    return len(samples)


def synthesize() -> dict:
    args = parse_args()
    assets_dir = Path(args.assets_dir).resolve()
    kokoro_src = Path(args.kokoro_src_dir).resolve()
    misaki_src = Path(args.misaki_src_dir).resolve()
    manifest_path = Path(args.manifest).resolve()

    prepend_source_checkout(kokoro_src)
    prepend_source_checkout(misaki_src)

    import torch  # type: ignore
    import kokoro  # type: ignore
    import misaki  # type: ignore
    from kokoro import KModel, KPipeline  # type: ignore

    ensure_module_from_checkout(kokoro.__file__, kokoro_src, "kokoro")
    ensure_module_from_checkout(misaki.__file__, misaki_src, "misaki")

    if args.device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA was requested but torch.cuda.is_available() is false")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    entries = manifest.get("entries")
    if not isinstance(entries, list) or not entries:
        raise RuntimeError("manifest.entries must contain at least one narration item")

    config_path = assets_dir / CONFIG_FILE
    model_path = assets_dir / MODEL_FILE
    voice_path = assets_dir / VOICE_FILE
    for required in (config_path, model_path, voice_path):
        if not required.is_file():
            raise RuntimeError(f"required pinned asset is missing: {required}")

    torch.set_grad_enabled(False)
    torch.manual_seed(0)
    if args.device == "cuda":
        torch.cuda.manual_seed_all(0)

    model = KModel(
        repo_id=MODEL_REPOSITORY,
        config=str(config_path),
        model=str(model_path),
    ).to(args.device).eval()
    pipeline = KPipeline(
        lang_code="z",
        repo_id=MODEL_REPOSITORY,
        model=model,
        device=args.device,
    )

    completed = []
    silence = torch.zeros(int(SAMPLE_RATE * 0.12), dtype=torch.float32)

    for entry in entries:
        key = entry.get("key")
        text = entry.get("text")
        wav_path_value = entry.get("wavPath")
        if not isinstance(key, str) or not isinstance(text, str) or not text.strip() or not isinstance(wav_path_value, str):
            raise RuntimeError("each manifest entry requires key, non-empty text, and wavPath")

        wav_path = Path(wav_path_value).resolve()
        chunks = []
        for result in pipeline(text, voice=str(voice_path), speed=1.0):
            if result.audio is not None and result.audio.numel() > 0:
                chunks.append(result.audio.detach().to("cpu").float())
        if not chunks:
            raise RuntimeError(f"{key}: Kokoro returned no audio")

        if len(chunks) == 1:
            audio = chunks[0]
        else:
            joined = []
            for index, chunk in enumerate(chunks):
                if index:
                    joined.append(silence)
                joined.append(chunk)
            audio = torch.cat(joined)

        sample_count = write_pcm16_wav(wav_path, audio, torch)
        completed.append(
            {
                "key": key,
                "wavPath": str(wav_path),
                "samples": sample_count,
                "durationSeconds": sample_count / SAMPLE_RATE,
            }
        )

    return {
        "schemaVersion": 1,
        "engine": "kokoro-local-waveform-v1",
        "pythonVersion": sys.version.split()[0],
        "torchVersion": str(torch.__version__),
        "device": args.device,
        "sampleRateHz": SAMPLE_RATE,
        "kokoroModulePath": str(Path(kokoro.__file__).resolve()),
        "misakiModulePath": str(Path(misaki.__file__).resolve()),
        "count": len(completed),
        "items": completed,
    }


def main() -> None:
    os.environ.setdefault("PYTHONDONTWRITEBYTECODE", "1")
    report = synthesize()
    print(json.dumps(report, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
