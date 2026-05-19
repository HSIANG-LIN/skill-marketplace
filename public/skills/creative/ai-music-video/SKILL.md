---
name: ai-music-video
description: "End-to-end AI music video production pipeline — generate music with ACE-Step 1.5, create visuals with ComfyUI + Illustrious XL, animate with Hyperframes, composite with FFmpeg."
version: 1.1.0
author: hermes
license: MIT
platforms: [linux, wsl2]
compatibility: "Requires NVIDIA GPU ≥8GB VRAM for ACE-Step (2B turbo) + ComfyUI/SDXL. Python 3.12+, Node.js ≥22, FFmpeg, Bun runtime."
prerequisites:
  commands: ["python3", "node", "ffmpeg", "git", "curl"]
  packages: ["uv", "bun"]
---

# AI Music Video Pipeline

Generate a complete music video from a single text description, using only local
open-source tools:

```
🎵 ACE-Step 1.5 Turbo     (music generation, local GPU)
       ↓
🖼️ Illustrious XL via     (image generation via ComfyUI)
       ComfyUI
       ↓
✨ Hyperframes             (HTML + GSAP animation, FFmpeg render)
       ↓
🎞️ FFmpeg                 (final composite)
```

## Architecture

The pipeline runs entirely locally on a single NVIDIA GPU (~8GB VRAM minimum).
Each step runs sequentially, so VRAM is freed between stages.

| Component | VRAM | Purpose |
|-----------|------|---------|
| ACE-Step 1.5 Turbo (2B) | ~4 GB | Music generation, REST API on :8001 |
| ComfyUI + Illustrious XL | ~6-7 GB | Text-to-image, API on :8188 |
| Hyperframes | 0 (CPU) | HTML → video animation, CLI tool |
| 🎞️ FFmpeg                 | 0 | Final audio/video composite |
| 📤 YouTube API             | 0 | Auto-upload (optional) |

## Project Structure

```
mv-pipeline/
├── music-engine/       # ACE-Step 1.5 repo (git clone)
├── frames-engine/      # Hyperframes repo (git clone)
├── comfyui/            # ComfyUI (via comfy-cli: ~/comfy/ComfyUI)
├── workflows/          # ComfyUI API workflow JSONs
│   └── illustrious_txt2img.json
├── music/              # ACE-Step music outputs (*.mp3)
├── images/             # Illustrious XL image outputs (*.png)
├── frames/             # Hyperframes MV composition project
│   └── lofi-mv/        # Lo-fi MV composition template
├── output/             # Final MV render (*.mp4)
├── config/             # YouTube OAuth tokens + credentials
├── docs/
│   └── YOUTUBE_SETUP.md
├── prompt-lib/         # Scene prompt library (markdown)
├── scripts/            # Pipeline automation scripts (all working)
│   ├── pipeline.sh          # One-shot: do everything
│   ├── generate_music.sh    # Step 1: ACE-Step API call
│   ├── generate_image.sh    # Step 2: ComfyUI API call
│   └── render_mv.sh         # Step 3: Hyperframes + FFmpeg
└── README.md
```

## Setup

### 1. ACE-Step 1.5 (Music Generation)

```bash
git clone https://github.com/ace-step/ACE-Step-1.5.git music-engine
cd music-engine
uv sync                          # install deps (first run: 10-20min, 20GB+ cache)
# Launch API server:
uv run acestep-api               # REST API on http://127.0.0.1:8001
# Or UI:
uv run acestep                   # Gradio UI on http://127.0.0.1:7860
```

**API Workflow (3-step pattern):**

ACE-Step uses an asynchronous generation pattern — NOT a single `/generate` endpoint:

1. **Submit task**: `POST /release_task` with `sample_query` + `thinking: true`
2. **Poll for completion**: `POST /query_result` with `task_id_list`
3. **Download audio**: `GET /v1/audio?path={path_from_result}`

**Example curl:**

```bash
# Step 1: Submit task
curl -X POST http://127.0.0.1:8001/release_task \
  -H 'Content-Type: application/json' \
  -d '{
    "sample_query": "lo-fi, female vocal, warm sunset, coastal vibe",
    "thinking": true,
    "audio_duration": 45,
    "inference_steps": 8,
    "model": "acestep-v15-turbo"
  }'
# Response: {"data": {"task_id": "xxx", "status": "queued"}}

# Step 2: Poll until status=1 (succeeded)
curl -X POST http://127.0.0.1:8001/query_result \
  -H 'Content-Type: application/json' \
  -d '{"task_id_list": ["xxx"]}'
# Response: {"data": [{"status": 1, "result": "[{\"file\": \"/v1/audio?path=...\"}]"}]}

# Step 3: Download
curl -o output.mp3 http://127.0.0.1:8001/v1/audio?path=...
```

**Key parameters (Turbo model):**

| Param | Recommended | Notes |
|-------|-------------|-------|
| `inference_steps` | 8 | 超過 8 步音頻會破音 |
| `thinking` | true | 啟用 5Hz LM 生成 audio codes |
| `model` | `acestep-v15-turbo` | Turbo 2B 模型 |
| `sample_query` | text | 自然語言描述，自動產生歌詞 |
| `audio_duration` | 45 / 180 | 短版或完整歌曲 |
| `use_random_seed` | false | 配合 `seed` 參數固定結果 |

VRAM guide: 8GB → 2B turbo + 0.6B LM (PT backend). For higher quality, 16GB+ → XL turbo.

**📦 Disk footprint & cleanup:** See `references/vram-disk-management.md` for model weight sizes, WSL disk footprint, and safe cleanup commands (uv cache, checkpoints, venv).

**⚠️ Critical: Force the 0.6B LM on 8GB GPUs.**

ACE-Step auto-detects tier3 (6-8GB) but loads the 1.7B LM by default (3.5GB). On 8GB VRAM, 1.7B LM + 2B DiT = OOM from KV cache exhaustion.

```bash
# Correct startup for 8GB:
ACESTEP_LM_MODEL=acestep-5Hz-lm-0.6B uv run acestep-api

# Delete unused 1.7B LM to save 3.5GB disk:
rm -rf checkpoints/acestep-5Hz-lm-1.7B
```

**NEVER use `thinking: false` (no LM mode)** — it reports `status=success` but returns an empty audio file. The LM is required for actual audio output, even at its smallest.

See `references/gpu-memory-8gb.md` for detailed timing and performance data.

### 2. ComfyUI + Illustrious XL (Image Generation)

```bash
# Install comfy-cli
uv tool install comfy-cli
comfy --skip-prompt tracking disable

# Install ComfyUI
comfy --skip-prompt install --nvidia

# If launch fails with ModuleNotFoundError, restore deps:
comfy --skip-prompt install --nvidia --restore

# Download Illustrious XL model (~6.5 GB)
cd ~/comfy/ComfyUI/models/checkpoints
wget "https://huggingface.co/OnomaAIResearch/Illustrious-xl-early-release-v0/resolve/main/Illustrious-XL-v0.1.safetensors"

# Launch
comfy launch --background        # http://127.0.0.1:8188
```

**Example prompt patterns (from Siami article):**
- Sunset window: `sitting by window, holding warm coffee mug, looking outside at beautiful sunset over the sea, golden hour, orange and purple sky, ocean view, peaceful expression, soft smile, steam rising, warm glowing light, cozy, lo-fi aesthetic`
- Rainy cafe: `sitting by café window, rainy day outside, raindrops on window, warm glowing indoor lights, holding warm coffee mug, open book on table, gazing outside thoughtfully, cozy atmosphere, warm yellow light, cool blue exterior`
- Art studio: `sitting at wooden desk, holding paintbrush, watercolor painting on paper, focusing on painting, cup of coffee beside her, artistic atmosphere, warm afternoon sunlight`

### 3. Hyperframes (Animation Framework)

Hyperframes is NOT published on npm — must clone and build from source. Uses **bun** (not npm/pnpm).

```bash
# Install bun
npm install -g bun

# Clone + build
git clone https://github.com/heygen-com/hyperframes.git frames-engine
cd frames-engine
bun install              # install workspace deps
bun run build            # build all packages (CLI, core, engine, producer, etc.)

# Verify CLI
./packages/cli/dist/cli.js --help
```

**Creating a composition:**

```bash
cd ~/mv-pipeline/frames
npx hyperframes init mv-name   # scaffolds index.html, assets/, package.json
# OR manually create index.html with data-* attributes + GSAP timeline
```

Hyperframes composition key conventions:
- HTML file with `data-composition-id`, `data-start`, `data-duration`, `data-width`, `data-height` on the stage div
- Each media element needs `class="clip"` + `data-start` + `data-duration` + `data-track-index`
- GSAP timeline must be `paused: true` and pushed to `window.__timelines`
- Background music: `<audio data-start="0" data-duration="N" data-track-index="X" data-volume="1.0" src="assets/music.mp3">`
- Render: `npx hyperframes render` → outputs MP4

### 4. Pipeline Automation (Working Scripts)

All scripts live on disk at `~/mv-pipeline/scripts/`. They handle the full workflow end-to-end.

**`scripts/pipeline.sh`** — recommended entry point:
```bash
cd ~/mv-pipeline
./scripts/pipeline.sh "海岸線夕陽 Lo-fi, 女聲" Koyu_MV [--seed 42] [--upload]
```
- Accepts `--seed` for reproducible results
- Accepts `--upload` to auto-upload to YouTube after render
- Runs all 3 steps sequentially: music → image → MV

**`scripts/generate_music.sh`** — calls ACE-Step REST API (requires ACE-Step running on :8001):
```bash
./scripts/generate_music.sh "coastal sunset lo-fi, female vocal" 45
```

**`scripts/generate_image.sh`** — calls ComfyUI API (requires ComfyUI on :8188):
- Loads `workflows/illustrious_txt2img.json`
- Injects prompt + seed
- Submits to ComfyUI API via POST /prompt
- Polls /history/{prompt_id} until complete
- Copies output PNG to `images/` dir

**`scripts/render_mv.sh`** — Hyperframes + FFmpeg composite:
- Copies latest music + image to `frames/lofi-mv/assets/`
- Dynamically updates `index.html` data-duration to match music length
- Runs Hyperframes CLI render (if available)
- FFmpeg fallback: loop background image + music → final MP4
- Output: `output/{NAME}_final.mp4`

### 5. YouTube Upload (Optional)

**`scripts/youtube_upload.py`** — OAuth2-based YouTube upload:
```bash
# One-time auth (opens browser):
python3 scripts/youtube_upload.py --auth-only

# Upload video:
python3 scripts/youtube_upload.py output/Koyu_MV_final.mp4 \
  --title "My MV" --privacy unlisted
```
- Uses `config/client_secret.json` and `config/youtube_token.json`
- Supports token refresh automatically
- See `docs/YOUTUBE_SETUP.md` for Google Cloud Console setup guide
- Installed dependencies: `google-api-python-client`, `google-auth-oauthlib`

## MV Composition Template (index.html)

Minimum viable HTML for a lo-fi MV composition:

```html
<div id="stage" data-composition-id="lofi-mv" data-start="0" data-duration="45"
     data-width="1920" data-height="1080">
  <!-- Background image -->
  <img id="bg-image" class="clip" data-start="0" data-duration="45"
       data-track-index="1" src="assets/background.png" />
  <!-- Vignette overlay -->
  <div id="vignette" class="clip" data-start="0" data-duration="45"
       data-track-index="0"></div>
  <!-- Lyrics -->
  <div class="lyric-line" id="lyric-1">午後的窗邊</div>
  <!-- Audio -->
  <audio data-start="0" data-duration="45" data-track-index="2"
         data-volume="1.0" src="assets/music.mp3"></audio>
</div>

<script>
const tl = gsap.timeline({ paused: true });
window.__timelines = [tl];
tl.to('#lyric-1', { opacity: 1, duration: 1.5 }, 5);
</script>
```

Essential Hyperframes composition elements for a lo-fi MV:
- Warm vignette overlay (radial gradient)
- Vinyl record rotation animation (GSAP rotation + conic-gradient)
- Title fade-in/out (0-5s range)
- Lyrics line-by-line reveal (timed to music sections)
- Floating light particles (scattered GSAP animation)
- Bottom progress bar (clickable for seeking)
- Warm color palette (#F5E6D3 cream tones)

## Prompt Library Format

Store scene configs in `prompt-lib/*.md`:

```markdown
# Scene Name

## Music Prompt
```
style: lo-fi, chillhop, warm sunset
tags: female vocal, soft female singing, warm female voice, lofi beat
duration: 45s
```

## Image Prompt
```
sitting by window, sunset over sea, cozy, lo-fi aesthetic, warm colors
```

## Hyperframes Notes
- warm vignette, vinyl rotation, lyrics floating
```

## Known Pitfalls

1. **VRAM contention** — ACE-Step and ComfyUI both want GPU. Run sequentially, not simultaneously. Pipeline is sequential by design.

2. **ACE-Step steps cap** — Turbo model MUST use steps=8. Exceeding 8 causes audio distortion. Standard model uses steps=50.

3. **Female vocal tags** — To get vocals instead of instrumental, include ALL three: `female vocal, soft female singing, warm female voice`. One alone may not trigger voice generation.

4. **Lyrics principle** — Keep lyrics abstract and image-based (window coffee, shoreline breeze, afternoon light). Avoid direct emotional terms like "love you", "miss you" — ACE-Step performs better with evocative imagery.

5. **Hyperframes build required** — The CLI is NOT published to npm. You must `git clone + bun install + bun run build` from the repo. The CLI binary is at `packages/cli/dist/cli.js`.

6. **ComfyUI dependency restoration** — Initial `comfy install` may leave missing deps. If `comfy launch` fails with `ModuleNotFoundError`, run `comfy --skip-prompt install --nvidia --restore`.

7. **ACE-Step model weights lazy-download on first API request** — `uv sync` downloads code, configs, and Python deps but does NOT download model weights. The `checkpoints/` directory will contain code/config files (small) but the actual `.safetensors` weight files (~10GB total: 4.79G turbo + 3.71G lm-1.7B + 1.19G embedding + 0.34G vae) only download on the FIRST API request to `acestep-api`. Expect 10-20 minutes of download time when submitting the first task. The server logs will show `[Model Download] Downloading from HuggingFace...` with progress bars.

8. **Fixed seed for character consistency** — If generating multiple images for the same MV, use a fixed seed in ComfyUI to maintain character appearance across frames.

9. **ComfyUI must be running before generate_image.sh** — Run `comfy launch --background` first. The script submits to `http://127.0.0.1:8188` and will fail with connection refused if ComfyUI isn't up.

10. **ACE-Step uv sync is slow** — First `uv sync` downloads PyTorch + CUDA + diffusers + transformers (~20GB cache). Expect 10-20 minutes on a typical connection. Do NOT interrupt it.

11. **ACE-Step uv sync is VERY slow (first run)** — Downloads PyTorch 2.10 + CUDA 12.8 + diffusers + transformers + triton + gradio. Expect ~15-20 minutes, ~20GB cache. Use `background=true` and `notify_on_complete=true`. Do NOT interrupt — the venv will be empty/invalid otherwise.

12. **ComfyUI can reuse ACE-Step's venv (avoids separate torch install)** — If `comfy launch` fails with `ModuleNotFoundError: No module named 'torch'` (because ComfyUI has no venv), use ACE-Step's venv which has torch 2.10.0+cu128. Steps:
    ```bash
    # Install missing deps into ACE-Step venv:
    cd ~/mv-pipeline/music-engine
    uv pip install --python .venv/bin/python comfy-aimdo 2>&1 | tail -3
    uv pip install --python .venv/bin/python -r ~/comfy/ComfyUI/requirements.txt --no-build-isolation
    
    # Launch ComfyUI with ACE-Step's python:
    cd ~/comfy/ComfyUI && ~/mv-pipeline/music-engine/.venv/bin/python main.py --listen 127.0.0.1 --port 8188
    ```
    Known missing deps chain when doing this: `sqlalchemy` → `alembic` → `comfy-aimdo` → `torchsde` → full `requirements.txt`. Install the full requirements to avoid whack-a-mole.

13. **8GB GPU: ComfyUI and ACE-Step cannot run simultaneously** — Confirmed on RTX 3050 OEM (8GB VRAM):
    - ComfyUI + Illustrious XL (6.6GB model): ✅ works at 512×512, ~30s per image
    - ACE-Step 2B turbo + 0.6B LM: ✅ works (~4GB with CPU offload)
    - ✗ Both simultaneously: VRAM OOM. Pipeline is sequential by design.
    - The pipeline scripts handle this correctly (generate_music → kill → generate_image → render), but if manually testing, shut down one server before starting the other.

14. **YouTube OAuth is one-time** — First upload requires browser interaction for OAuth consent. After that, the refresh token is stored in `config/youtube_token.json` and subsequent uploads are fully automated.

15. **Never use shell string substitution on JSON** — Injecting variables with `sed` or `${VAR}` into JSON strings will break quotes, whitespace, and special characters. Always use Python `json.dumps()` to programmatically modify workflow JSON before submitting to APIs like ComfyUI or ACE-Step. The scripts use Python for this — follow that pattern.

16. **ComfyUI API requires "prompt" envelope** — The POST body to `/prompt` must be `{"prompt": {workflow_dict}}`, not the raw workflow dict.
