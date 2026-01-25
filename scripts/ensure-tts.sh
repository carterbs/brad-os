#!/bin/sh
# Ensure TTS audio files exist, generating them if needed

STRETCH_AUDIO_DIR="packages/client/public/audio/stretching"
STRETCH_MANIFEST="$STRETCH_AUDIO_DIR/stretches.json"

MEDITATION_AUDIO_DIR="packages/client/public/audio/meditation"
MEDITATION_MANIFEST="$MEDITATION_AUDIO_DIR/meditation.json"

NEEDS_GENERATION=0

# Check if stretching manifest exists
if [ ! -f "$STRETCH_MANIFEST" ]; then
    echo "Stretching TTS audio files not found"
    NEEDS_GENERATION=1
fi

# Check if meditation manifest exists
if [ ! -f "$MEDITATION_MANIFEST" ]; then
    echo "Meditation TTS audio files not found"
    NEEDS_GENERATION=1
fi

if [ "$NEEDS_GENERATION" -eq 0 ]; then
    echo "TTS audio files already exist, skipping generation"
    exit 0
fi

echo "Generating missing TTS audio files..."

# Check for Python 3
if ! command -v python3 > /dev/null 2>&1; then
    echo "Error: python3 is required for TTS generation"
    exit 1
fi

# Install Python dependencies
echo "Installing Python dependencies..."
pip3 install -q -r scripts/requirements-tts.txt

# Generate stretching TTS if needed
if [ ! -f "$STRETCH_MANIFEST" ]; then
    echo "Generating stretching TTS audio files..."
    python3 scripts/generate-tts.py
    if [ $? -ne 0 ]; then
        echo "Error: Stretching TTS generation failed"
        exit 1
    fi
fi

# Generate meditation TTS if needed
if [ ! -f "$MEDITATION_MANIFEST" ]; then
    echo "Generating meditation TTS audio files..."
    python3 scripts/generate-tts-meditation.py
    if [ $? -ne 0 ]; then
        echo "Error: Meditation TTS generation failed"
        exit 1
    fi
fi

echo "TTS generation complete"
