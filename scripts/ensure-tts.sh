#!/bin/bash
# Ensure TTS audio files exist, generating them if needed

AUDIO_DIR="packages/client/public/audio/stretching"
MANIFEST="$AUDIO_DIR/stretches.json"

# Check if manifest exists (indicates TTS has been generated)
if [ -f "$MANIFEST" ]; then
    echo "TTS audio files already exist, skipping generation"
    exit 0
fi

echo "TTS audio files not found, generating..."

# Check for Python 3
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 is required for TTS generation"
    exit 1
fi

# Install Python dependencies
echo "Installing Python dependencies..."
pip3 install -q -r scripts/requirements-tts.txt

# Generate TTS files
echo "Generating TTS audio files..."
python3 scripts/generate-tts.py

if [ $? -eq 0 ]; then
    echo "TTS generation complete"
else
    echo "Error: TTS generation failed"
    exit 1
fi
