# TTS Decision: Kokoro-82M for Narrated Stretching Sessions

## Context

Evaluated 4 open-source TTS models for an upcoming feature: narrated stretching/exercise sessions that read exercise instructions aloud during workouts.

## Models Tested

| Model | License | CPU RTF | Quality | Verdict |
|-------|---------|---------|---------|---------|
| **Kokoro-82M** | Apache 2.0 | 6.18x real-time | Excellent | **Selected** |
| Pocket TTS (Kyutai) | MIT | 2.95x real-time | Good | Runner-up |
| Piper TTS | MIT/GPL | Fast (untested) | Good | Too fragile API |
| MeloTTS | MIT | Untested (deps issues) | Unknown | Dependency conflicts |

## Why Kokoro

- **Speed**: 6x real-time on CPU (generated 12.85s of audio in 2.08s)
- **Quality**: Natural-sounding female voice (`af_heart`), best of the group
- **Size**: Only 82M parameters, lightweight
- **License**: Apache 2.0 (fully permissive, commercial-friendly)
- **Docker**: Works in containerized environments via ONNX
- **API simplicity**: Clean Python generator-based interface

## Integration Requirements

### Dependencies to Add

```
kokoro>=0.9.2
soundfile
```

Kokoro pulls in PyTorch, transformers, espeak-ng, and spacy as transitive deps. Total install is ~1-2GB. Consider pre-building a Docker layer for these.

### Basic Usage Pattern

```python
from kokoro import KPipeline
import soundfile as sf
import numpy as np

pipeline = KPipeline(lang_code='a')  # American English

# Generate audio for an exercise instruction
generator = pipeline(text, voice='af_heart', speed=1.0)
chunks = [audio for _, _, audio in generator]
full_audio = np.concatenate(chunks)

sf.write('output.wav', full_audio, 24000)
```

### What We Need to Build

1. **TTS service module** - Wraps Kokoro pipeline, handles model loading (lazy-load on first use since it takes ~2s)
2. **Audio file caching** - Pre-generate and cache WAV files for each exercise description so TTS only runs once per unique text
3. **API endpoint** - `GET /api/exercises/:id/audio` that returns cached WAV (or generates on first request)
4. **Client-side playback** - Audio player component that plays exercise narration during stretching sessions, coordinated with the rest timer
5. **Docker updates** - Add espeak-ng system package and Kokoro Python deps to the server Dockerfile

### Architecture Considerations

- **Pre-generation vs on-demand**: Pre-generate audio when exercises are created/updated. 12s of audio takes ~2s to generate, acceptable for a background job but not for request latency.
- **Storage**: WAV files at 24kHz mono are ~50KB/s. A typical exercise description produces 10-15s of audio (~500-750KB). Compress to MP3/OGG for client delivery.
- **Model loading**: First load downloads ~200MB of model weights from HuggingFace. Cache in a Docker volume or bake into the image.
- **Voice options**: Kokoro has 54 voices. Start with `af_heart` (American female), could offer voice selection later.
