#!/usr/bin/env python3
"""Minimal pinned Kokoro Mandarin runtime loader.

This module deliberately bypasses upstream package ``__init__.py`` files so the
Mandarin narration path can import ``kokoro.model`` and ``misaki.zh`` without
loading Kokoro's language-agnostic ``KPipeline`` dependency surface (notably
Misaki English G2P / spaCy). The actual model and G2P implementation still come
from clean source checkouts pinned by the Node orchestration layer.
"""

from __future__ import annotations

import importlib
from importlib.machinery import ModuleSpec
from pathlib import Path
import re
import sys
import types
from typing import Callable, Iterable

MAX_PHONEMES = 510
UNKNOWN_PHONEME = "❓"
BANNED_RUNTIME_MODULES = (
    "kokoro.pipeline",
    "misaki.en",
    "misaki.espeak",
    "spacy",
)


def _within(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def install_source_namespace(name: str, checkout: Path) -> Path:
    """Install a namespace package rooted at a pinned checkout without __init__."""
    checkout = checkout.resolve()
    package_dir = checkout / name
    init_file = package_dir / "__init__.py"
    if not package_dir.is_dir() or not init_file.is_file():
        raise RuntimeError(f"{name} package is missing from pinned checkout: {package_dir}")

    existing = sys.modules.get(name)
    if existing is not None:
        existing_file = getattr(existing, "__file__", None)
        if existing_file and _within(Path(existing_file), checkout):
            return package_dir
        raise RuntimeError(f"{name} was imported before pinned namespace installation")

    package = types.ModuleType(name)
    spec = ModuleSpec(name=name, loader=None, is_package=True)
    spec.submodule_search_locations = [str(package_dir)]
    package.__spec__ = spec
    package.__package__ = name
    package.__path__ = [str(package_dir)]
    # Record the upstream __init__ path for provenance only; it is never executed.
    package.__file__ = str(init_file)
    sys.modules[name] = package
    return package_dir


def ensure_module_from_checkout(module_file: str, checkout: Path, label: str) -> Path:
    module_path = Path(module_file).resolve()
    checkout = checkout.resolve()
    if not _within(module_path, checkout):
        raise RuntimeError(f"{label} resolved outside pinned checkout: {module_path}")
    return module_path


def assert_minimal_runtime_imports() -> None:
    loaded = sorted(name for name in BANNED_RUNTIME_MODULES if name in sys.modules)
    if loaded:
        raise RuntimeError(f"unexpected non-Mandarin runtime modules were loaded: {', '.join(loaded)}")


def load_pinned_runtime(kokoro_checkout: Path, misaki_checkout: Path):
    """Load KModel + ZHG2P directly from pinned source checkouts."""
    kokoro_checkout = kokoro_checkout.resolve()
    misaki_checkout = misaki_checkout.resolve()
    install_source_namespace("kokoro", kokoro_checkout)
    install_source_namespace("misaki", misaki_checkout)

    model_module = importlib.import_module("kokoro.model")
    zh_module = importlib.import_module("misaki.zh")
    model_path = ensure_module_from_checkout(model_module.__file__, kokoro_checkout, "kokoro.model")
    zh_path = ensure_module_from_checkout(zh_module.__file__, misaki_checkout, "misaki.zh")
    assert_minimal_runtime_imports()

    return {
        "KModel": model_module.KModel,
        "ZHG2P": zh_module.ZHG2P,
        "kokoroModulePath": str(model_path),
        "misakiModulePath": str(zh_path),
    }


def _split_at_boundaries(text: str) -> list[str]:
    # Keep punctuation attached to its preceding segment. Chinese punctuation is
    # included explicitly; upstream KPipeline only handles ASCII sentence marks.
    pieces = [piece for piece in re.split(r"(?<=[。！？!?；;，,、：:])", text) if piece]
    return pieces if len(pieces) > 1 else []


def _balanced_halves(text: str) -> tuple[str, str]:
    if len(text) < 2:
        raise RuntimeError("cannot split an over-limit one-character narration segment")
    midpoint = len(text) // 2
    # Prefer nearby whitespace, then fall back to an exact midpoint.
    candidates = [index for index, char in enumerate(text) if char.isspace()]
    if candidates:
        split_at = min(candidates, key=lambda index: abs(index - midpoint)) + 1
        if 0 < split_at < len(text):
            return text[:split_at], text[split_at:]
    return text[:midpoint], text[midpoint:]


def phonemize_losslessly(
    g2p: Callable[[str], tuple[str, object]],
    text: str,
    max_phonemes: int = MAX_PHONEMES,
) -> list[tuple[str, str]]:
    """Return lossless text/phoneme chunks; never truncate a phoneme sequence."""
    if not isinstance(text, str) or not text.strip():
        raise RuntimeError("narration text must be non-empty")

    completed: list[tuple[str, str]] = []

    def visit(segment: str) -> None:
        if not segment:
            return
        phonemes, _ = g2p(segment)
        if not phonemes:
            raise RuntimeError("Mandarin G2P returned no phonemes")
        if UNKNOWN_PHONEME in phonemes:
            raise RuntimeError("Mandarin G2P produced the unknown phoneme marker; unsupported text must be reviewed")
        if len(phonemes) <= max_phonemes:
            completed.append((segment, phonemes))
            return

        boundary_pieces = _split_at_boundaries(segment)
        if boundary_pieces:
            # Greedily keep adjacent sentence pieces together until another piece
            # would exceed the raw midpoint. Each group is then checked by G2P.
            target = max(1, len(segment) // 2)
            groups: list[str] = []
            current = ""
            for piece in boundary_pieces:
                if current and len(current) + len(piece) > target:
                    groups.append(current)
                    current = piece
                else:
                    current += piece
            if current:
                groups.append(current)
            if len(groups) > 1:
                for group in groups:
                    visit(group)
                return

        left, right = _balanced_halves(segment)
        visit(left)
        visit(right)

    # Preserve paragraph order while avoiding accidental synthesis of blank lines.
    paragraphs = [part for part in re.split(r"\n+", text) if part.strip()]
    for paragraph in paragraphs:
        visit(paragraph.strip())

    if not completed:
        raise RuntimeError("narration text produced no synthesis chunks")
    return completed


def validate_voice_pack(voice_pack, torch_module) -> None:
    if not isinstance(voice_pack, torch_module.Tensor):
        raise RuntimeError("voice pack must be a torch.Tensor")
    if voice_pack.ndim < 2:
        raise RuntimeError(f"voice pack rank is invalid: {voice_pack.ndim}")
    if voice_pack.shape[0] < MAX_PHONEMES:
        raise RuntimeError(
            f"voice pack must provide at least {MAX_PHONEMES} phoneme-length styles; got {voice_pack.shape[0]}"
        )


def voice_reference_for_phonemes(voice_pack, phonemes: str):
    if not phonemes or len(phonemes) > MAX_PHONEMES:
        raise RuntimeError(f"phoneme sequence length must be 1..{MAX_PHONEMES}; got {len(phonemes)}")
    return voice_pack[len(phonemes) - 1]
