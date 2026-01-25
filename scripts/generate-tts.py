#!/usr/bin/env python3
"""
TTS Generation Script for Narrated Stretching

Parses stretch definition files, detects bilateral stretches,
generates TTS audio using Kokoro-82M, and outputs a JSON manifest.

Usage:
    python3 scripts/generate-tts.py
"""

from __future__ import annotations

import json
import os
import re
import shutil
from pathlib import Path
from typing import Optional, Tuple, List, Dict

# Paths
PROJECT_ROOT = Path(__file__).parent.parent
STRETCH_DEFS_DIR = PROJECT_ROOT / "thoughts" / "shared" / "plans" / "stretching"
IMAGES_SOURCE_DIR = STRETCH_DEFS_DIR / "images"
OUTPUT_DIR = PROJECT_ROOT / "packages" / "client" / "public" / "audio" / "stretching"

# TTS Settings
VOICE = "af_heart"
SPEED = 1.0

# Bilateral detection keywords
BILATERAL_PATTERNS = [
    r"\bone\s+(leg|arm|knee|foot|side|hand)\b",
    r"\bopposite\b",
    r"\bother\s+side\b",
    r"\bswitch\s+sides?\b",
    r"\balternate\b",
    r"\beach\s+side\b",
]


def slugify(name: str) -> str:
    """Convert stretch name to file-safe slug.

    Rules:
    1. Lowercase the entire name
    2. Strip apostrophes entirely (both straight ' and curly ')
    3. Replace spaces and non-alphanumeric with hyphens
    4. Collapse consecutive hyphens
    5. Trim leading/trailing hyphens
    """
    slug = name.lower()
    # Strip all types of apostrophes/quotes (straight and curly)
    slug = re.sub(r"['\u2019\u2018\u0027]", "", slug)
    slug = re.sub(r"[^a-z0-9]+", "-", slug)  # Replace non-alphanumeric
    slug = re.sub(r"-+", "-", slug)  # Collapse consecutive hyphens
    slug = slug.strip("-")  # Trim leading/trailing
    return slug


def is_bilateral(description: str) -> bool:
    """Detect if a stretch is bilateral based on description keywords."""
    text = description.lower()
    for pattern in BILATERAL_PATTERNS:
        if re.search(pattern, text):
            return True
    return False


def find_image(region: str, name: str) -> tuple[str | None, str | None]:
    """Find an image file for a stretch, trying multiple naming conventions.

    Returns:
        Tuple of (source_filename, slug_for_output) or (None, None) if not found.

    The existing images use different conventions than our spec:
    - Singular region names (calf, glute) instead of plural (calves, glutes)
    - Spaces in some names (hip flexor instead of hip_flexors)
    - Apostrophe kept as '-s-' instead of stripped
    """
    slug = slugify(name)

    # Region name alternatives (the images use these prefixes)
    region_alternatives = {
        "calves": ["calf", "calves"],
        "glutes": ["glute", "glutes"],
        "hamstrings": ["hamstring", "hamstrings"],
        "quads": ["quad", "quads"],
        "shoulders": ["shoulder", "shoulders"],
        "hip_flexors": ["hip flexor", "hip-flexor", "hip_flexors"],
    }
    regions_to_try = region_alternatives.get(region, [region])

    # Slug alternatives
    # Legacy: apostrophe kept as '-s-' (e.g., child-s-pose)
    legacy_slug = name.lower()
    legacy_slug = re.sub(r"['\u2019\u2018\u0027]s\b", "-s", legacy_slug)
    legacy_slug = re.sub(r"[^a-z0-9]+", "-", legacy_slug)
    legacy_slug = re.sub(r"-+", "-", legacy_slug)
    legacy_slug = legacy_slug.strip("-")

    slugs_to_try = [slug]
    if legacy_slug != slug:
        slugs_to_try.append(legacy_slug)

    # Try all combinations
    for reg in regions_to_try:
        for s in slugs_to_try:
            candidate = f"{reg}-{s}.png"
            if (IMAGES_SOURCE_DIR / candidate).exists():
                return candidate, slug  # Return source name but use canonical slug

    return None, None


def parse_stretch_file(filepath: Path) -> tuple[str, list[dict]]:
    """Parse a stretch definition file.

    Returns:
        Tuple of (region_name, list of stretch dicts)
    """
    content = filepath.read_text().strip()
    lines = content.split("\n")

    # First line is the header (e.g., "Neck Stretches")
    header = lines[0].strip()
    region = filepath.stem  # e.g., "neck" from "neck.md"

    # Join remaining lines and split by delimiter
    remaining = "\n".join(lines[1:])
    stretch_blocks = remaining.split("----")

    stretches = []
    for block in stretch_blocks:
        block = block.strip()
        if not block:
            continue

        # Format: "Name: Description"
        if ":" not in block:
            print(f"  WARNING: Skipping malformed block in {filepath.name}: {block[:50]}...")
            continue

        name, description = block.split(":", 1)
        name = name.strip()
        description = description.strip()

        slug = slugify(name)
        stretch_id = f"{region}-{slug}" if not slug.startswith(region) else slug

        # Find image (tries multiple naming conventions)
        image_source, _ = find_image(region, name)

        stretches.append({
            "id": stretch_id,
            "name": name,
            "description": description,
            "bilateral": is_bilateral(description),
            "image": f"{region}/{slug}.png" if image_source else None,
            "audioFiles": {
                "begin": f"{region}/{slug}-begin.wav"
            },
            "_image_source": image_source,
            "_slug": slug,
        })

    return region, stretches


def generate_tts_clip(text: str, output_path: Path) -> bool:
    """Generate a TTS audio clip using Kokoro.

    Returns True if generated, False if skipped (already exists).
    """
    if output_path.exists():
        print(f"  SKIP (exists): {output_path.name}")
        return False

    try:
        import soundfile as sf
        from kokoro import KPipeline

        # Initialize pipeline (cached after first call)
        if not hasattr(generate_tts_clip, "_pipeline"):
            print("  Initializing Kokoro TTS pipeline...")
            generate_tts_clip._pipeline = KPipeline(lang_code="a")

        pipeline = generate_tts_clip._pipeline

        # Generate audio
        generator = pipeline(text, voice=VOICE, speed=SPEED)

        # Collect all audio samples
        samples = []
        for _, _, audio in generator:
            samples.append(audio)

        if not samples:
            print(f"  ERROR: No audio generated for: {text[:50]}...")
            return False

        # Concatenate and save
        import numpy as np
        full_audio = np.concatenate(samples)

        output_path.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(output_path), full_audio, 24000)
        print(f"  GENERATED: {output_path.name}")
        return True

    except ImportError as e:
        print(f"  ERROR: Missing dependency: {e}")
        print("  Install with: pip install -r scripts/requirements-tts.txt")
        return False
    except Exception as e:
        print(f"  ERROR generating {output_path.name}: {e}")
        return False


def generate_silence(output_path: Path, duration_seconds: float = 1.0) -> bool:
    """Generate a silent audio file."""
    if output_path.exists():
        print(f"  SKIP (exists): {output_path.name}")
        return False

    try:
        import numpy as np
        import soundfile as sf

        sample_rate = 24000
        samples = np.zeros(int(sample_rate * duration_seconds), dtype=np.float32)

        output_path.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(output_path), samples, sample_rate)
        print(f"  GENERATED: {output_path.name}")
        return True

    except ImportError as e:
        print(f"  ERROR: Missing dependency: {e}")
        return False


def copy_image(source_name: str, dest_path: Path) -> bool:
    """Copy an image from source to destination."""
    source_path = IMAGES_SOURCE_DIR / source_name
    if not source_path.exists():
        return False

    dest_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_path, dest_path)
    print(f"  COPIED: {source_name} -> {dest_path.name}")
    return True


def main():
    print("=" * 60)
    print("TTS Generation Script for Narrated Stretching")
    print("=" * 60)

    # Ensure output directory exists
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Parse all stretch files
    print("\n[1/4] Parsing stretch definitions...")
    manifest = {
        "regions": {},
        "shared": {
            "switchSides": "shared/switch-sides.wav",
            "halfway": "shared/halfway.wav",
            "sessionComplete": "shared/session-complete.wav",
            "silence": "shared/silence-1s.wav",
        }
    }

    stretch_files = sorted(STRETCH_DEFS_DIR.glob("*.md"))
    total_stretches = 0
    bilateral_count = 0

    for filepath in stretch_files:
        region, stretches = parse_stretch_file(filepath)
        print(f"  {region}: {len(stretches)} stretches")

        # Clean up internal fields for manifest
        clean_stretches = []
        for s in stretches:
            clean = {k: v for k, v in s.items() if not k.startswith("_")}
            clean_stretches.append(clean)
            total_stretches += 1
            if s["bilateral"]:
                bilateral_count += 1

        manifest["regions"][region] = {"stretches": clean_stretches}

    print(f"\n  Total: {total_stretches} stretches ({bilateral_count} bilateral)")

    # Generate shared clips
    print("\n[2/4] Generating shared audio clips...")
    shared_clips = [
        ("Switch sides.", OUTPUT_DIR / "shared" / "switch-sides.wav"),
        ("Halfway.", OUTPUT_DIR / "shared" / "halfway.wav"),
        ("Stretching complete. Great job.", OUTPUT_DIR / "shared" / "session-complete.wav"),
    ]

    for text, path in shared_clips:
        generate_tts_clip(text, path)

    # Generate silence
    generate_silence(OUTPUT_DIR / "shared" / "silence-1s.wav", 1.0)

    # Generate per-stretch clips and copy images
    print("\n[3/4] Generating per-stretch audio and copying images...")
    generated_count = 0
    skipped_count = 0
    images_copied = 0

    for filepath in stretch_files:
        region, stretches = parse_stretch_file(filepath)
        print(f"\n  {region}:")

        for stretch in stretches:
            # Generate TTS
            narration_text = f"{stretch['name']}. {stretch['description']}"
            output_path = OUTPUT_DIR / region / f"{stretch['_slug']}-begin.wav"

            if generate_tts_clip(narration_text, output_path):
                generated_count += 1
            else:
                skipped_count += 1

            # Copy image if exists
            if stretch["_image_source"]:
                image_dest = OUTPUT_DIR / region / f"{stretch['_slug']}.png"
                if copy_image(stretch["_image_source"], image_dest):
                    images_copied += 1

    # Write manifest
    print("\n[4/4] Writing manifest...")
    manifest_path = OUTPUT_DIR / "stretches.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"  Written: {manifest_path}")

    # Summary
    print("\n" + "=" * 60)
    print("Summary:")
    print(f"  Audio clips generated: {generated_count}")
    print(f"  Audio clips skipped (existing): {skipped_count}")
    print(f"  Images copied: {images_copied}")
    print(f"  Manifest: {manifest_path}")
    print("=" * 60)


if __name__ == "__main__":
    main()
