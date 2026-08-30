# Lumina ✦

> **Lumina** is a zero-latency, private local AI client built for dedicated hardware acceleration. Featuring instant VRAM pinning, real-time GPU telemetry, multimodal vision, a fullscreen audio-reactive voice mode, and 12 bespoke themes, it delivers high-performance sovereign intelligence in an ultra-clean, minimalist interface.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python: 3.12+](https://img.shields.io/badge/Python-3.12+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg)](https://fastapi.tiangolo.com/)
[![NVIDIA CUDA](https://img.shields.io/badge/NVIDIA-NVML%20Supported-76B900.svg)](https://developer.nvidia.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose%20Ready-2496ED.svg)](https://www.docker.com/)

---

## ⚡ Core Features

### 1. Minimalist, Clutter-Free Canvas
- **Distraction-Free Workspace**: The main chat viewport contains only the essential controls: model selector, voice launcher, hamburger drawer trigger, settings gear, the message feed, and the clean input box.
- **Collapsible Slide-Out Drawer**: All configuration, telemetry, history search, and power-user utilities tuck neatly away on desktop and mobile.

### 2. Zero Cold-Start VRAM Pinning & Instant Flush
- **Persistent GPU Residency**: Ollama models remain pinned in GPU memory (`keep_alive: -1`) for instantaneous sub-100ms first-token generation.
- **One-Click VRAM Purge**: Free gigabytes of VRAM on demand with the "Free VRAM" trigger (`keep_alive: 0`) without restarting containers or disrupting other services.

### 3. Dynamic Multi-GPU Hardware Telemetry
- Real-time NVML hardware metrics dynamically sampled for all detected NVIDIA GPUs.
- Per-GPU metrics: Core compute load %, VRAM allocation bar, operating temperatures (°C), and live power draw in Watts.
- Host system overview: CPU utilization % and system RAM metrics.

### 4. Gemini Live Fullscreen Voice Mode
- Immersive audio-reactive conversational loop with continuous Speech-to-Text (STT) and dynamic Text-to-Speech (TTS).
- Theme-synchronized canvas visualizer displaying radiant glowing speech orbs, harmonic waveform animations, and live transcription subtitles.
- In 8-bit mode, transitions to stepped arcade diamond waveform geometry and CRT scanline styling.

### 5. 12 Bespoke System Themes
Comprehensive theme re-skinning across the entire interface (chat, sidebar, drawer, modals, code blocks, and voice overlay):
- **Lumina Dark (Default)**: Deep midnight indigo and refined cyan.
- **Cyberpunk**: Neon cyan, electric yellow, and pulsing magenta.
- **Matrix**: Phosphor terminal green on deep black.
- **8-Bit Retro Arcade**: Pixelated typography, chunky borders, and arcade scanlines.
- **Synthwave**: 80s neon magenta, sunset violet, and gridlines.
- **Aurora**: Arctic emerald, cyan, and northern lights gradients.
- **AMOLED**: True pure black `#000000` for OLED displays.
- **Solarized Dark, Crimson Nocturne, Sakura Dream, Deep Abyss, Clean Monochrome**.

### 6. Multimodal Vision & Document Ingestion
- Drag-and-drop or file-picker upload for images (PNG, JPG, WebP) and documents (TXT, MD, CSV, JSON, PDF).
- Multimodal preview chips with one-click dismiss before sending.
- Seamless compatibility with vision-capable models (e.g., Llama 3.2 Vision, Moondream, Gemma).

### 7. In-Chat Ergonomics & Sampling Controls
- **Stop Generation**: Responsive abort button powered by `AbortController` cleanly halting inference while preserving all streamed tokens.
- **Contextual Actions (Hover / Tap)**:
  - *Assistant*: 1-click clipboard copy, toggle between rendered Markdown and raw monospace source, and turn regeneration.
  - *User*: Edit prompt button to modify prior turns and re-execute.
- **System Persona Presets**: Instantly toggle between *Default*, *Senior Engineer*, *Creative Writer*, *Data Extractor*, or define a *Custom System Instruction*.
- **Granular Inference Sliders**: Adjust Context Window (`num_ctx`), Temperature (`temperature`), Top-P (`top_p`), and Repetition Penalty (`repeat_penalty`) with real-time numeric readouts and default reset.
- **Data Portability**: 1-click export of the active conversation to formatted Markdown (`.md`) or raw structured JSON (`.json`).

---

## 🚀 Quick Start

### Option A: Docker Compose (Recommended)

Run Lumina alongside Ollama with full NVIDIA GPU acceleration:

```bash
git clone https://github.com/Johny2x4/Lumina.git
cd Lumina
docker compose up -d
```

Open your browser to: **`http://localhost:3000`**

### Option B: Local Python Development

#### 1. Clone & Install Dependencies
```bash
git clone https://github.com/Johny2x4/Lumina.git
cd Lumina
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

#### 2. Start Lumina
```bash
# Point to your running Ollama instance (defaults to http://localhost:11434)
export OLLAMA_BASE_URL=http://localhost:11434

# Run with Uvicorn
python -m uvicorn backend.main:app --host 0.0.0.0 --port 3000
```

Access the UI at: **`http://localhost:3000`**

---

## ⚙️ Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Target Ollama API host (e.g. `http://ollama:11434` or remote IP) |
| `PORT` | `3000` | Port for the Lumina web server |

---

## 🏛️ Architecture

```
                      ┌─────────────────────────────────┐
                      │    Client Browser / Mobile PWA  │
                      └────────────────┬────────────────┘
                                       │ HTTP / WebSockets
                                       ▼
                      ┌─────────────────────────────────┐
                      │        Lumina FastApi App       │
                      │  - Static Single-Page App       │
                      │  - WebSocket Telemetry Sampler  │
                      │  - Streaming Ollama Proxy       │
                      └───┬─────────────────────────┬───┘
                          │                         │
            NVML / psutil │                         │ HTTP Stream
                          ▼                         ▼
             ┌─────────────────────────┐   ┌─────────────────────────┐
             │ NVIDIA GPUs (RTX / Data)│   │      Ollama Engine      │
             │ Core Load, VRAM, Temp   │   │  Llama 3.2, Gemma, etc. │
             └─────────────────────────┘   └─────────────────────────┘
```

---

## 🔒 Security & Privacy

- **Zero Cloud Leakage**: All inference occurs strictly on your local hardware.
- **Zero Database Bloat**: Conversations and settings are stored locally in the browser (`localStorage`), with an Incognito toggle for ephemeral sessions.
- **Tailscale & Reverse Proxy Compatible**: Ready for remote access over private mesh networks without public port forwarding.

---

## 📄 License

Distributed under the **MIT License**. See [LICENSE](LICENSE) for details.

Developed with ✦ by **[Cody Eich (Johny2x4)](https://github.com/Johny2x4)**.
