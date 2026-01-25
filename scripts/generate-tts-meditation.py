#!/usr/bin/env python3
"""
TTS Generation Script for Guided Meditation

Parses meditation script files, generates TTS audio using Kokoro-82M,
and outputs a JSON manifest with session definitions.

Usage:
    python3 scripts/generate-tts-meditation.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

# Paths
PROJECT_ROOT = Path(__file__).parent.parent
MEDITATION_DEFS_DIR = PROJECT_ROOT / "thoughts" / "shared" / "plans" / "meditation"
OUTPUT_DIR = PROJECT_ROOT / "packages" / "client" / "public" / "audio" / "meditation"

# TTS Settings
VOICE = "af_heart"
SPEED = 0.95  # Slightly slower for meditation


def parse_meditation_file(filepath: Path) -> tuple[str, dict[str, str]]:
    """Parse a meditation script file.

    Returns:
        Tuple of (session_id, dict of clip_id -> text)
    """
    content = filepath.read_text().strip()
    lines = content.split("\n")

    # First line is the header
    header = lines[0].strip()
    session_id = filepath.stem  # e.g., "basic-breathing"

    clips = {}
    current_section = None

    for line in lines[1:]:
        line = line.strip()

        # Skip empty lines and delimiters
        if not line or line == "----":
            continue

        # Section headers
        if line.startswith("## "):
            current_section = line[3:].strip().lower()
            continue

        # Clip definition: "clip-id: Text to speak"
        if ":" in line and not line.startswith("#"):
            clip_id, text = line.split(":", 1)
            clip_id = clip_id.strip()
            text = text.strip()
            if clip_id and text:
                clips[clip_id] = text

    return session_id, clips


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


def generate_bell(output_path: Path) -> bool:
    """Generate a gentle bell/chime sound.

    Creates a synthesized singing bowl sound using sine waves with harmonics.
    """
    if output_path.exists():
        print(f"  SKIP (exists): {output_path.name}")
        return False

    try:
        import numpy as np
        import soundfile as sf

        sample_rate = 24000
        duration = 4.0  # 4 seconds

        t = np.linspace(0, duration, int(sample_rate * duration), dtype=np.float32)

        # Singing bowl frequencies (fundamental + harmonics)
        frequencies = [261.63, 523.25, 784.88, 1046.50]  # C4 and harmonics
        amplitudes = [1.0, 0.5, 0.25, 0.125]

        # Generate harmonic-rich tone
        signal = np.zeros_like(t)
        for freq, amp in zip(frequencies, amplitudes):
            signal += amp * np.sin(2 * np.pi * freq * t)

        # Apply envelope: quick attack, long decay
        attack = 0.02  # 20ms attack
        decay_start = 0.1
        attack_samples = int(attack * sample_rate)
        decay_samples = int((duration - decay_start) * sample_rate)

        envelope = np.ones_like(t)
        # Attack
        envelope[:attack_samples] = np.linspace(0, 1, attack_samples)
        # Decay (exponential)
        decay_start_sample = int(decay_start * sample_rate)
        envelope[decay_start_sample:] = np.exp(-3 * np.linspace(0, 1, len(envelope) - decay_start_sample))

        signal *= envelope

        # Normalize
        signal = signal / np.max(np.abs(signal)) * 0.7

        output_path.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(output_path), signal, sample_rate)
        print(f"  GENERATED: {output_path.name}")
        return True

    except ImportError as e:
        print(f"  ERROR: Missing dependency: {e}")
        return False


def build_manifest(session_id: str, clips: dict[str, str]) -> dict:
    """Build the meditation.json manifest structure."""

    # Session base path
    base = f"sessions/{session_id}"

    # Define fixed cues and interjection windows for each duration variant
    manifest = {
        "sessions": [
            {
                "id": session_id,
                "name": "Basic Breathing",
                "description": "A gentle breathing meditation to calm your mind.",
                "variants": [
                    # 5-minute variant
                    {
                        "durationMinutes": 5,
                        "phases": [
                            {
                                "type": "intro",
                                "durationSeconds": 30,
                                "fixedCues": [
                                    {"atSeconds": 0, "audioFile": f"{base}/intro-welcome.wav"}
                                ]
                            },
                            {
                                "type": "breathing",
                                "durationSeconds": 240,
                                "fixedCues": [
                                    {"atSeconds": 0, "audioFile": f"{base}/breathing-settle.wav"},
                                    {"atSeconds": 20, "audioFile": f"{base}/breathing-rhythm.wav"}
                                ],
                                "interjectionWindows": [
                                    {
                                        "earliestSeconds": 80,
                                        "latestSeconds": 120,
                                        "audioPool": [
                                            f"{base}/breathing-reminder-1.wav",
                                            f"{base}/breathing-reminder-2.wav",
                                            f"{base}/breathing-reminder-3.wav"
                                        ]
                                    },
                                    {
                                        "earliestSeconds": 180,
                                        "latestSeconds": 220,
                                        "audioPool": [f"{base}/breathing-deepen.wav"]
                                    }
                                ]
                            },
                            {
                                "type": "closing",
                                "durationSeconds": 30,
                                "fixedCues": [
                                    {"atSeconds": 0, "audioFile": f"{base}/closing-transition.wav"},
                                    {"atSeconds": 15, "audioFile": f"{base}/closing-gratitude.wav"}
                                ]
                            }
                        ]
                    },
                    # 10-minute variant
                    {
                        "durationMinutes": 10,
                        "phases": [
                            {
                                "type": "intro",
                                "durationSeconds": 60,
                                "fixedCues": [
                                    {"atSeconds": 0, "audioFile": f"{base}/intro-welcome.wav"},
                                    {"atSeconds": 30, "audioFile": f"{base}/intro-posture.wav"}
                                ]
                            },
                            {
                                "type": "breathing",
                                "durationSeconds": 480,
                                "fixedCues": [
                                    {"atSeconds": 0, "audioFile": f"{base}/breathing-settle.wav"},
                                    {"atSeconds": 25, "audioFile": f"{base}/breathing-rhythm.wav"}
                                ],
                                "interjectionWindows": [
                                    {"earliestSeconds": 60, "latestSeconds": 90, "audioPool": [f"{base}/breathing-reminder-1.wav", f"{base}/breathing-reminder-2.wav", f"{base}/breathing-reminder-3.wav"]},
                                    {"earliestSeconds": 140, "latestSeconds": 180, "audioPool": [f"{base}/breathing-reminder-1.wav", f"{base}/breathing-reminder-2.wav", f"{base}/breathing-reminder-3.wav"]},
                                    {"earliestSeconds": 220, "latestSeconds": 260, "audioPool": [f"{base}/breathing-midpoint.wav"]},
                                    {"earliestSeconds": 320, "latestSeconds": 380, "audioPool": [f"{base}/breathing-reminder-1.wav", f"{base}/breathing-reminder-2.wav", f"{base}/breathing-reminder-3.wav"]},
                                    {"earliestSeconds": 420, "latestSeconds": 460, "audioPool": [f"{base}/breathing-deepen.wav"]}
                                ]
                            },
                            {
                                "type": "closing",
                                "durationSeconds": 60,
                                "fixedCues": [
                                    {"atSeconds": 0, "audioFile": f"{base}/closing-transition.wav"},
                                    {"atSeconds": 20, "audioFile": f"{base}/closing-awakening.wav"},
                                    {"atSeconds": 40, "audioFile": f"{base}/closing-gratitude.wav"}
                                ]
                            }
                        ]
                    },
                    # 20-minute variant
                    {
                        "durationMinutes": 20,
                        "phases": [
                            {
                                "type": "intro",
                                "durationSeconds": 60,
                                "fixedCues": [
                                    {"atSeconds": 0, "audioFile": f"{base}/intro-welcome.wav"},
                                    {"atSeconds": 30, "audioFile": f"{base}/intro-posture.wav"}
                                ]
                            },
                            {
                                "type": "breathing",
                                "durationSeconds": 1080,
                                "fixedCues": [
                                    {"atSeconds": 0, "audioFile": f"{base}/breathing-settle.wav"},
                                    {"atSeconds": 30, "audioFile": f"{base}/breathing-rhythm.wav"}
                                ],
                                "interjectionWindows": [
                                    {"earliestSeconds": 90, "latestSeconds": 130, "audioPool": [f"{base}/breathing-reminder-1.wav", f"{base}/breathing-reminder-2.wav", f"{base}/breathing-reminder-3.wav"]},
                                    {"earliestSeconds": 200, "latestSeconds": 260, "audioPool": [f"{base}/breathing-reminder-1.wav", f"{base}/breathing-reminder-2.wav", f"{base}/breathing-reminder-3.wav"]},
                                    {"earliestSeconds": 320, "latestSeconds": 380, "audioPool": [f"{base}/breathing-midpoint.wav"]},
                                    {"earliestSeconds": 460, "latestSeconds": 540, "audioPool": [f"{base}/breathing-reminder-1.wav", f"{base}/breathing-reminder-2.wav", f"{base}/breathing-reminder-3.wav"]},
                                    {"earliestSeconds": 620, "latestSeconds": 700, "audioPool": [f"{base}/breathing-deepen.wav"]},
                                    {"earliestSeconds": 780, "latestSeconds": 860, "audioPool": [f"{base}/breathing-reminder-1.wav", f"{base}/breathing-reminder-2.wav", f"{base}/breathing-reminder-3.wav"]},
                                    {"earliestSeconds": 920, "latestSeconds": 1000, "audioPool": [f"{base}/breathing-reminder-1.wav", f"{base}/breathing-reminder-2.wav", f"{base}/breathing-reminder-3.wav"]},
                                    {"earliestSeconds": 1020, "latestSeconds": 1060, "audioPool": [f"{base}/breathing-deepen.wav"]}
                                ]
                            },
                            {
                                "type": "closing",
                                "durationSeconds": 60,
                                "fixedCues": [
                                    {"atSeconds": 0, "audioFile": f"{base}/closing-transition.wav"},
                                    {"atSeconds": 20, "audioFile": f"{base}/closing-awakening.wav"},
                                    {"atSeconds": 40, "audioFile": f"{base}/closing-gratitude.wav"}
                                ]
                            }
                        ]
                    }
                ]
            }
        ],
        "shared": {
            "bell": "shared/bell.wav",
            "silence": "shared/silence-1s.wav"
        }
    }

    return manifest


def main():
    print("=" * 60)
    print("TTS Generation Script for Guided Meditation")
    print("=" * 60)

    # Ensure output directory exists
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Parse meditation script files
    print("\n[1/4] Parsing meditation scripts...")
    script_files = sorted(MEDITATION_DEFS_DIR.glob("*.md"))

    if not script_files:
        print("  ERROR: No meditation script files found in:")
        print(f"    {MEDITATION_DEFS_DIR}")
        return

    all_clips = {}
    for filepath in script_files:
        session_id, clips = parse_meditation_file(filepath)
        print(f"  {session_id}: {len(clips)} clips")
        all_clips[session_id] = clips

    # Generate shared audio
    print("\n[2/4] Generating shared audio...")
    generate_bell(OUTPUT_DIR / "shared" / "bell.wav")
    generate_silence(OUTPUT_DIR / "shared" / "silence-1s.wav", 1.0)

    # Generate per-session clips
    print("\n[3/4] Generating meditation narration clips...")
    generated_count = 0
    skipped_count = 0

    for session_id, clips in all_clips.items():
        print(f"\n  {session_id}:")
        session_dir = OUTPUT_DIR / "sessions" / session_id

        for clip_id, text in clips.items():
            output_path = session_dir / f"{clip_id}.wav"
            if generate_tts_clip(text, output_path):
                generated_count += 1
            else:
                skipped_count += 1

    # Build and write manifest
    print("\n[4/4] Writing manifest...")

    # For now we only have one session type
    first_session_id = list(all_clips.keys())[0]
    first_clips = all_clips[first_session_id]
    manifest = build_manifest(first_session_id, first_clips)

    manifest_path = OUTPUT_DIR / "meditation.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"  Written: {manifest_path}")

    # Summary
    print("\n" + "=" * 60)
    print("Summary:")
    print(f"  Audio clips generated: {generated_count}")
    print(f"  Audio clips skipped (existing): {skipped_count}")
    print(f"  Manifest: {manifest_path}")
    print("=" * 60)


if __name__ == "__main__":
    main()
