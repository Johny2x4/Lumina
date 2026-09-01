# Lumina ✦
### Sovereign Web Frontend for Ollama with Optional Extensions

> **Lumina** is an ultra-low overhead, purely self-hosted **web frontend for [Ollama](https://ollama.com/)**.
> 
> It provides a fast, distraction-free chat canvas without enterprise bloat or cloud dependencies, while seamlessly integrating with optional homelab power-ups: real-time web search (**[SearXNG](https://searx.github.io/searxng/)**), local neural voice (**[Kokoro TTS](https://github.com/remsky/Kokoro-FastAPI)**), and secure gateway routing (**[Nginx](https://nginx.org/)**).

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python: 3.12+](https://img.shields.io/badge/Python-3.12+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg)](https://fastapi.tiangolo.com/)
[![Ollama Frontend](https://img.shields.io/badge/Ollama-Frontend%20Client-black.svg)](https://ollama.com/)
[![SearXNG Compatible](https://img.shields.io/badge/SearXNG-Optional%20Search-blue.svg)](https://searx.github.io/searxng/)
[![Kokoro TTS Compatible](https://img.shields.io/badge/Kokoro%20TTS-Optional%20Voice-purple.svg)](https://github.com/remsky/Kokoro-FastAPI)
[![NVIDIA CUDA](https://img.shields.io/badge/NVIDIA-NVML%20Supported-76B900.svg)](https://developer.nvidia.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose%20Ready-2496ED.svg)](https://www.docker.com/)

> [!NOTE]
> **What Lumina Is (and Isn't):**
> - ✅ **A Dedicated Web Interface:** Lumina provides a modern browser UI, streaming chat client, hardware telemetry dashboard, and live voice canvas.
> - ❌ **Not an LLM Runtime:** Lumina does not execute tensor math or model weights itself. It connects to and orchestrates your **Ollama** engine.
> - 🧩 **Modular & Optional Stack:** Deploy Lumina standalone on top of your existing Ollama instance, or add SearXNG for web search, Kokoro for speech, and Nginx for TLS with zero configuration friction.

<p align="center">
  <img src="docs/screenshots/lumina-chat-hero.png" alt="Lumina Chat Interface" width="100%" style="border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.5);" />
</p>

### 📱 Responsive Desktop & Mobile/PWA Ergonomics

Lumina is engineered dynamically for both multi-monitor desktop setups and mobile/PWA environments (calibrated for iPhone & modern smartphone viewports):

<p align="center">
  <img src="docs/screenshots/lumina-mobile-chat.png" alt="Lumina Mobile Chat (gemma4:12b)" width="23.5%" style="border-radius: 12px; box-shadow: 0 12px 28px rgba(0,0,0,0.5); margin: 0 1%;" />
  <img src="docs/screenshots/lumina-mobile-drawer.png" alt="Lumina Hardware Telemetry Drawer" width="23.5%" style="border-radius: 12px; box-shadow: 0 12px 28px rgba(0,0,0,0.5); margin: 0 1%;" />
  <img src="docs/screenshots/lumina-mobile-voice.png" alt="Lumina Live Voice Mode" width="23.5%" style="border-radius: 12px; box-shadow: 0 12px 28px rgba(0,0,0,0.5); margin: 0 1%;" />
  <img src="docs/screenshots/lumina-mobile-themes.png" alt="Lumina 15 Curated Themes" width="23.5%" style="border-radius: 12px; box-shadow: 0 12px 28px rgba(0,0,0,0.5); margin: 0 1%;" />
</p>

- **Mobile Slide-Out Drawer**: All telemetry, model selection, memory toggles, and chat histories tuck neatly into an overlay drawer that sweeps out of sight during conversation.
- **PWA Ready**: Installable directly to your home screen with offline asset caching and mobile touch ergonomics.

---

## ⚡ Core Features

### 1. Purely Self-Hosted, Lightweight Chat
- **Distraction-Free Canvas**: Clean viewport prioritizing the conversation, with streaming token-by-token rendering.
- **Rich Document & Vision Attachments**: Drag-and-drop or upload images (PNG, JPG, WebP) and documents (TXT, MD, CSV, JSON, PDF, code files) with preview chips.
- **Markdown, Code & Math Support**: Syntax-highlighted code blocks with 1-click clipboard copy, plus native KaTeX math and chemical formulas.
- **In-Chat Controls**: Abort running generation instantly via `AbortController`, edit and resubmit prior user turns, toggle raw monospace source, or adjust sampling options (temperature, top_p, repetition penalty).

### 2. Optional Real-Time Web Search (SearXNG)
- **Zero Cloud API Reliance**: Connects to private, self-hosted SearXNG instances without Google, Bing, or paid API keys.
- **Smart Intent & Entity Distillation**: Automatically extracts intent from questions (e.g. *"what will the weather be like tomorrow in zip code 68046"* ➔ `"weather 68046"`), fetching accurate local forecasts, prices, and events.
- **Clean Turn-Scoped Context**: Search results and clickable source chips are scoped strictly to the current turn payload, preventing search instructions from contaminating subsequent conversation turns.
- **Visual On-Demand Toggle**: Web search defaults to OFF to preserve local-first privacy, featuring an illuminated cyan active button and non-blocking toast status indicators.

### 3. Lumina Live: Fullscreen Voice Mode (Inspired by Gemini Live)
- **Continuous Conversational Loop**: Hands-free voice chat powered by your browser's Web Speech STT and a local Kokoro neural TTS backend.
- **Reactive Canvas Visualizer**: Radiant glowing audio spheres and dynamic harmonic waveforms that morph and pulse in real time to input and speech frequencies.
- **Retro 8-Bit Scanline Mode**: In arcade themes, transforms the audio orb into stepped diamond geometry with CRT phosphor scanlines.

<p align="center">
  <img src="docs/screenshots/lumina-voice-mode.png" alt="Lumina Live Voice Mode" width="100%" style="border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.5);" />
</p>

### 4. Direct Model & VRAM Residency Management
- **In-App Model Pulls**: Search and pull models directly from Ollama's registry or any Hugging Face GGUF repository.
- **VRAM Pinning ("Keep in VRAM")**: Models stay pinned in GPU memory (`keep_alive: -1`) to eliminate cold-start warmup latency on subsequent turns.
- **One-Click VRAM Flush ("Free VRAM")**: Instantly evict the active model from GPU memory (`keep_alive: 0`) when you need to reclaim VRAM for gaming, ComfyUI, or other tasks.

### 5. Live Backend Hardware Telemetry
- **Native NVML Streaming**: Real-time hardware stats dynamically sampled from NVIDIA GPUs over WebSockets.
- **Comprehensive Gauges**: Per-GPU core compute load %, active VRAM allocation bar, operating temperatures (°C), and live wattage draw.
- **Host Resource Tracking**: Real-time CPU core utilization % and system RAM allocation.

<p align="center">
  <img src="docs/screenshots/lumina-telemetry.png" alt="Lumina Hardware Telemetry Drawer" width="100%" style="border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.5);" />
</p>

### 6. 15 Bespoke Visual Themes

Lumina features 15 distinct, hand-crafted system themes spanning dark atmospheric moods and high-contrast daylight palettes:

<p align="center">
  <img src="docs/screenshots/lumina-themes-showcase.gif" alt="Lumina 15 Themes Live Showcase" width="100%" style="border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.5);" />
</p>

- **Dark Atmosphere (9 Themes)**:
  - **Midnight (Default)**: Deep midnight slate with refined indigo ambient glow.
  - **AMOLED**: True pure black `#000000` for OLED power efficiency and maximum contrast.
  - **Cyberpunk**: Neon cyan, electric yellow, and pulsing magenta gridlines.
  - **Matrix**: Phosphor terminal green code rain aesthetic.
  - **Synthwave**: 80s neon magenta, sunset violet, and animated perspective grid.
  - **Aurora**: Arctic emerald, cyan, and northern lights gradients.
  - **Snowy Forest**: Deep spruce evergreen with gentle animated snowflakes.
  - **Pirate Voyage**: Weathered parchment, warm bronze, and sea-captain charcoal.
  - **Rainbow Rave**: Chromatic reactive gradients and pulsing spectrum glow.
- **Light & Day (6 Themes)**:
  - **Nordic Frost**: Minimalist crisp Scandinavian daylight mode.
  - **Paper & Ink**: Warm literary editorial light mode with charcoal typography.
  - **Alpine Day**: Frosted sage, meadow green, and light pine tones.
  - **Pastel Lilac**: Sweet marshmallow lilac with high-contrast violet user cards.
  - **Pastel Prisma**: Saturated chromatic pastel wash with playful accents.
  - **Glacial Ice**: Translucent frosted ice crystal sheets with blizzard particle physics.

---

## 🏛️ System Architecture & Optional Extensions

Lumina operates as a lean, single-container Python FastAPI + Vanilla JS service. It is designed to sit alongside optional companion services in a modular homelab topology:

```
                      ┌─────────────────────────────────────────┐
                      │       Client Browser / Mobile PWA       │
                      │  (Chat UI, Audio Visualizer, 15 Themes) │
                      └────────────────────┬────────────────────┘
                                           │ HTTP / WebSockets
                                           ▼
                      ┌─────────────────────────────────────────┐
                      │            [Optional] Nginx             │
                      │       Reverse Proxy & TLS Gateway       │
                      └────────────────────┬────────────────────┘
                                           │
                                           ▼
                      ┌─────────────────────────────────────────┐
                      │           Lumina UI Frontend            │
                      │         (FastAPI + Vanilla JS)          │
                      │  - Single-Page Responsive Web Client    │
                      │  - Fullscreen Voice & Audio Engine      │
                      │  - Real-Time NVML Hardware Telemetry    │
                      │  - Intent Extractor & Streaming Proxy   │
                      └───┬───────────────────┬───────────────┬─┘
                          │                   │               │
            NVML / psutil │     HTTP Streaming│               │ HTTP Metasearch
                          ▼                   ▼               ▼
             ┌─────────────────────────┐ ┌─────────┐     ┌─────────┐
             │ NVIDIA GPUs (RTX / Data)│ │ Ollama  │     │ SearXNG │
             │ Core Load, VRAM, Power  │ │ [Core]  │     │[Optional│
             │ Temperatures & Status   │ │ (LLMs)  │     │ (Search)│
             └─────────────────────────┘ └────┬────┘     └─────────┘
                                              │ Audio TTS
                                              ▼
                                         ┌─────────┐
                                         │ Kokoro  │
                                         │[Optional│
                                         │ (Voice) │
                                         └─────────┘
```

### What Each Package Adds to Lumina

| Component | Role | What It Adds to Lumina |
| :--- | :--- | :--- |
| **Ollama** | **Core Engine** *(Required)* | Provides local GGUF/fp16 model loading, GPU acceleration (CUDA/ROCm/Metal), and streaming token inference. |
| **SearXNG** | **Metasearch** *(Optional)* | Enables real-time web search without external API subscriptions. Automatically distills queries and injects citation cards with source links. |
| **Kokoro-FastAPI** | **Neural Voice** *(Optional)* | Lightweight, high-quality 82M neural TTS container running on CPU or GPU. Powers voice replies in Lumina Live. |
| **Nginx / Gateway** | **Proxy & TLS** *(Optional)* | Provides unified single-port routing and SSL/TLS certificate termination across your LAN. |

---

## 🎙️ Voice Chat & TLS / HTTPS Requirements

Modern web browsers (Chrome, Safari, Edge, Firefox) enforce a strict security rule: **microphone access (`getUserMedia` and Web Speech APIs) is only permitted in Secure Contexts (`localhost`, `127.0.0.1`, or over HTTPS / TLS)**.

- **Running on Localhost:** Microphone access works immediately with zero configuration.
- **Accessing over LAN (e.g. `http://192.168.x.x:3000`):** Browsers will block the microphone on plain HTTP with a `NotAllowedError`.
- **Easy Homelab Solutions**:
  1. **Tailscale Serve (Easiest)**: Run `tailscale serve --bg --https=443 3000` on the Lumina host for instant zero-config HTTPS with automated Let's Encrypt certificates.
  2. **Nginx with TLS**: Deploy the Nginx gateway configuration provided in the [Getting Started Guide](docs/GETTING_STARTED.md#path-3-full-sovereign-homelab-stack).
  3. **Browser Flags (Testing)**: Whitelist your IP under `chrome://flags/#unsafely-treat-insecure-origin-as-secure`.

---

## 🔒 Privacy & Sovereign Storage Architecture

- **100% Sovereign Offline Operation**: All frontend vendor assets (Tailwind CSS, KaTeX math engines, 20 WOFF2 fonts, Marked.js, Highlight.js) are completely self-hosted locally within the container. Zero requests escape to external CDNs or analytics trackers.
- **High-Capacity Client Storage (IndexedDB)**: Conversation sessions, images, and long contexts are persisted client-side in the browser via **IndexedDB** (`luminaStorage`), eliminating the traditional 5MB `localStorage` quota crash.
- **Instant Client Preferences (localStorage)**: UI configurations (active theme, system persona, inference options, auth tokens) are persisted in `localStorage` for instant hydration without database dependencies.
- **Incognito Mode**: Toggle Incognito at any time to enter 100% ephemeral in-memory sessions that leave zero trace in browser storage upon closing.

---

## 🚀 Installation & Deployment

Detailed step-by-step guides for every deployment scenario are available in the **[Getting Started Guide](docs/GETTING_STARTED.md)**:

- 📦 **[Path 1: Deploying Just Lumina](docs/GETTING_STARTED.md#path-1-deploying-just-lumina)** — Connect Lumina to your existing Ollama, SearXNG, or Kokoro servers.
- 💻 **[Path 2: Lumina + Ollama Workstation](docs/GETTING_STARTED.md#path-2-lumina--ollama-workstation-stack)** — Turnkey single-machine setup with GPU acceleration and persistent model storage.
- 🏰 **[Path 3: Full Sovereign Homelab Stack](docs/GETTING_STARTED.md#path-3-full-sovereign-homelab-stack)** — Complete homelab compose stack with Lumina, Ollama, Kokoro TTS, SearXNG, and Nginx with TLS.

### Quick Start with Docker Compose

```bash
git clone https://github.com/Johny2x4/Lumina.git
cd Lumina
docker compose up -d
```

Open your browser to: **`http://localhost:3000`**

---

## 📄 License

Distributed under the **MIT License**. See [LICENSE](LICENSE) for details.

Developed with ✦ by **[Johny2x4](https://github.com/Johny2x4)**.
