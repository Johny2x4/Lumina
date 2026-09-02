# Lumina ✦ Getting Started & Deployment Guide

Welcome to **Lumina**—a sovereign, lightweight, zero-cloud web frontend designed specifically for conversational, turn-based chat with **[Ollama](https://ollama.com/)**, with optional companion extensions for **[SearXNG](https://searx.github.io/searxng/)** (real-time web search), **[Kokoro TTS](https://github.com/remsky/Kokoro-FastAPI)** (neural voice), and **[Nginx](https://nginx.org/)** (gateway routing & TLS).

---

## 📋 Table of Contents
1. [Prerequisites & GPU Acceleration](#-prerequisites--gpu-acceleration)
2. [Choose Your Deployment Variant](#-choose-your-deployment-variant)
3. [Network Exposure: LAN & Tailscale Access](#-network-exposure-lan--tailscale-access)
4. [Enabling Authentication (`LUMINA_AUTH_TOKEN`)](#-enabling-authentication-lumina_auth_token)
5. [Variant 1: Lumina on Top of Existing Services](#-variant-1-lumina-on-top-of-existing-services)
6. [Variant 2: Lumina + Ollama Workstation Stack](#-variant-2-lumina--ollama-workstation-stack)
7. [Variant 3: Full Sovereign Homelab Stack](#-variant-3-full-sovereign-homelab-stack)
8. [Native Python & Systemd Service](#-native-python--systemd-service)
9. [Model Management & VRAM Optimization](#-model-management--vram-optimization)
10. [TLS / HTTPS & Live Voice Mode Requirements](#-tls--https--live-voice-mode-requirements)
11. [Environment Variables Reference](#-environment-variables-reference)
12. [Frequently Asked Questions](#-frequently-asked-questions)

---

## ⚡ Prerequisites & GPU Acceleration

### 1. System Requirements
* **Docker & Docker Compose**: Docker Engine v24.0+ / Compose v2.20+
* **OS**: Linux (Ubuntu, Debian, Fedora, Arch, unRAID, TrueNAS), macOS (Apple Silicon), or Windows 10/11 (WSL2).

### 2. NVIDIA GPU Acceleration (Optional but Recommended)
To run local models with full GPU tensor acceleration and stream hardware metrics into Lumina's telemetry drawer:
1. Ensure the NVIDIA proprietary driver (version 525+) is installed on your host:
   ```bash
   nvidia-smi
   ```
2. Install the **[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)** on Linux:
   ```bash
   # Ubuntu / Debian
   sudo apt-get update
   sudo apt-get install -y nvidia-container-toolkit
   sudo nvidia-ctk runtime configure --runtime=docker
   sudo systemctl restart docker
   ```
3. Verify GPU access inside Docker:
   ```bash
   docker run --rm --gpus all nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi
   ```
   *If no GPU is present, Ollama will automatically fall back to multi-threaded CPU inference.*

---

## 🧭 Choose Your Deployment Variant

| Variant | Best For | Included Services | Capabilities & Trade-offs |
| :--- | :--- | :--- | :--- |
| **[Variant 1: Lumina on Existing Services](#-variant-1-lumina-on-top-of-existing-services)** | You already have Ollama, SearXNG, or Kokoro running on your network | Lumina UI only | Connects to your existing endpoints via environment variables. |
| **[Variant 2: Lumina + Ollama Workstation](#-variant-2-lumina--ollama-workstation-stack)** | Standalone local LLM chat with GPU acceleration | Lumina UI + Ollama | Full turn-based chat & model management. **No web search, basic browser voice (no Kokoro neural TTS), no TLS gateway.** |
| **[Variant 3: Full Sovereign Homelab Stack](#-variant-3-full-sovereign-homelab-stack)** | Complete private AI cockpit with all power-ups | Lumina + Ollama + Kokoro + SearXNG + Nginx Gateway | Full features: neural voice, web search citations, and TLS-ready gateway for Tailscale / LAN microphone access. |
| **[Native Python](#-native-python--systemd-service)** | Bare-metal environments without Docker | Python 3.12+ / Systemd | Direct execution on host machine. |

---

## 🌐 Network Exposure: LAN & Tailscale Access

By default, Lumina's `docker-compose.yml` binds to **`127.0.0.1:3000` (localhost only)**. This ensures that when spinning up Lumina on a shared Wi-Fi network, office, or dorm, your AI models and GPU are not exposed unauthenticated to the entire network.

### Exposing Lumina to Your Network (`0.0.0.0`)
If you are running Lumina on a home server, unRAID box, Proxmox VM, or dedicated GPU rig and want to access it from other PCs, smartphones (PWA), or over Tailscale:

1. **Update Port Mapping**: In your `docker-compose.yml`, change the port binding from:
   ```yaml
   ports:
     - "${LUMINA_HOST:-127.0.0.1}:3000:3000"
   ```
   to:
   ```yaml
   ports:
     - "0.0.0.0:3000:3000"
   ```
   *(Or simply set `LUMINA_HOST=0.0.0.0` in your `.env` file).*
2. **Restart the container**:
   ```bash
   docker compose up -d
   ```
3. You can now access Lumina at `http://<your-server-lan-ip>:3000` or via your Tailscale IP (`http://100.x.y.z:3000`).

---

## 🔑 Enabling Authentication (`LUMINA_AUTH_TOKEN`)

When exposing Lumina beyond localhost (`0.0.0.0`), you should protect your instance with a secret token:

### 1. Set the Token in `docker-compose.yml`
```yaml
    environment:
      - OLLAMA_BASE_URL=http://ollama:11434
      - LUMINA_AUTH_TOKEN=your-secure-password-here
```

### 2. How Authentication Works in Lumina
* When you visit Lumina in your browser, an authentication modal prompts for your access token.
* Once entered, the token is saved in browser storage (`lumina_auth_token`).
* All API and WebSocket requests automatically include the token via:
  - `Authorization: Bearer <token>`
  - `X-Lumina-Token: <token>`
  - `?token=<token>` (for native browser WebSocket and EventSource streams).
* Comparisons on the backend use constant-time `secrets.compare_digest` to prevent timing attacks.

---

## 📦 Variant 1: Lumina on Top of Existing Services

Use this method if you already have Ollama running on your host, another server, or an existing AI container stack.

```
┌─────────────────────────────────────────────────────────┐
│                      Lumina UI                          │
│         (Runs in Docker or Native Python)               │
└───────────────┬─────────────────┬─────────────────┬─────┘
                │                 │                 │
                ▼                 ▼                 ▼
   http://192.168.1.50:11434   http://...:8080   http://...:8880
     (Existing Ollama)       (Existing SearXNG) (Existing Kokoro)
```

### Docker Compose Configuration
Create a `docker-compose.yml` and point the environment variables to your existing service endpoints:

```yaml
services:
  lumina:
    build: .
    container_name: lumina
    restart: unless-stopped
    ports:
      - "${LUMINA_HOST:-127.0.0.1}:3000:3000"
    extra_hosts:
      # Allows the container to communicate with services running directly on the Docker host:
      - "host.docker.internal:host-gateway"
    environment:
      # Point to your existing Ollama instance:
      - OLLAMA_BASE_URL=http://host.docker.internal:11434
      # Optional: point to your existing SearXNG instance (if available):
      # - SEARXNG_URL=http://192.168.1.50:8080
      # Optional: point to your existing Kokoro TTS instance (if available):
      # - KOKORO_BASE_URL=http://192.168.1.50:8880
      # Optional: set password token
      # - LUMINA_AUTH_TOKEN=your-secure-token
```

Start the container:
```bash
docker compose up -d
```

---

## 💻 Variant 2: Lumina + Ollama Workstation Stack

Use this turnkey setup for a single machine or GPU workstation where you want Lumina and Ollama running together.

> [!NOTE]
> **What this variant includes (and what it omits):**
> - ✅ **Included:** Full conversational turn-based chat, in-app model manager, multi-GPU hardware telemetry, and 15 themes.
> - ❌ **No Web Search:** SearXNG is omitted; web search toggle remains disabled.
> - ⚠️ **Basic Voice Mode:** Kokoro neural TTS is omitted; Live Voice Mode uses browser-native speech synthesis instead of neural speech.
> - ⚠️ **No TLS Gateway:** Served over plain HTTP; voice mode microphone access is limited to `localhost` unless routed through Tailscale or an external reverse proxy.

```yaml
services:
  lumina:
    build: .
    container_name: lumina
    restart: unless-stopped
    ports:
      - "${LUMINA_HOST:-127.0.0.1}:3000:3000"
    environment:
      - OLLAMA_BASE_URL=http://ollama:11434
      # - LUMINA_AUTH_TOKEN=your-token-if-exposing-to-network
    depends_on:
      - ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

  ollama:
    image: ollama/ollama:latest
    container_name: lumina-ollama
    init: true
    restart: unless-stopped
    ports:
      - "127.0.0.1:11434:11434"
    environment:
      - OLLAMA_KEEP_ALIVE=-1
      - OLLAMA_MAX_LOADED_MODELS=1
      - OLLAMA_FLASH_ATTENTION=1
    volumes:
      - ollama-data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

volumes:
  ollama-data:
    name: lumina_ollama-data
```

Start the workstation:
```bash
docker compose up -d
```

---

## 🏰 Variant 3: Full Sovereign Homelab Stack

The complete private AI operations center including:
1. **Lumina UI**: Turn-based web interface with 15 themes, VRAM residency management, and multi-GPU telemetry.
2. **Ollama**: Local GPU-accelerated LLM runtime.
3. **Kokoro TTS**: Neural speech synthesis for studio-quality voice replies.
4. **SearXNG**: Private metasearch engine providing citation sources without cloud API keys.
5. **Nginx Gateway**: Unified reverse proxy terminating TLS so phones, tablets, and remote browsers have microphone permissions for voice mode.

```
                     ┌──────────────────────────────┐
                     │   HTTPS / Browser Client     │
                     │  (Desktop, iPhone, Android)  │
                     └──────────────┬───────────────┘
                                    │ Port 443 (TLS)
                                    ▼
                     ┌──────────────────────────────┐
                     │     Nginx Gateway Proxy      │
                     └──────────────┬───────────────┘
                                    │ Internal Docker Network
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
  ┌──────────────┐           ┌──────────────┐           ┌──────────────┐
  │  Lumina UI   │ ────────> │    Ollama    │           │   SearXNG    │
  │ (Port 3000)  │           │ (NVIDIA GPU) │           │ (Port 8080)  │
  └──────┬───────┘           └──────────────┘           └──────────────┘
         │
         ▼
  ┌──────────────┐
  │  Kokoro TTS  │
  │ (Port 8880)  │
  └──────────────┘
```

### Full `docker-compose.full.yml`
```yaml
services:
  gateway:
    image: nginx:alpine
    container_name: lumina-gateway
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./gateway/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - lumina-ui

  lumina-ui:
    build: .
    container_name: lumina-ui
    restart: unless-stopped
    expose:
      - "3000"
    environment:
      - OLLAMA_BASE_URL=http://ollama:11434
      - KOKORO_BASE_URL=http://kokoro:8880
      - SEARXNG_URL=http://searxng:8080
      # - LUMINA_AUTH_TOKEN=your-secure-password
    depends_on:
      - ollama
      - kokoro
      - searxng
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

  ollama:
    image: ollama/ollama:latest
    container_name: lumina-ollama
    restart: unless-stopped
    environment:
      - OLLAMA_KEEP_ALIVE=-1
      - OLLAMA_FLASH_ATTENTION=1
      - OLLAMA_MAX_LOADED_MODELS=1
    volumes:
      - ollama-data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

  kokoro:
    image: ghcr.io/remsky/kokoro-fastapi-cpu:latest
    container_name: lumina-kokoro
    restart: unless-stopped
    expose:
      - "8880"

  searxng:
    image: searxng/searxng:latest
    container_name: lumina-searxng
    restart: unless-stopped
    expose:
      - "8080"
    volumes:
      - ./searxng/settings.yml:/etc/searxng/settings.yml:ro
    environment:
      - SEARXNG_BASE_URL=http://searxng:8080

volumes:
  ollama-data:
    name: lumina_ollama-data
```

### SearXNG Settings (`searxng/settings.yml`)
Ensure SearXNG has `json` format enabled:
```yaml
use_default_settings: true
general:
  debug: false
  instance_name: "Lumina Search"
search:
  safe_search: 0
  autocomplete: ""
  formats:
    - html
    - json
server:
  secret_key: "generate-a-random-secret-key-here"
  limiter: false
  image_proxy: false
```

---

## 🐍 Native Python & Systemd Service

For bare-metal Linux environments or direct local development without Docker:

```bash
# 1. Clone repo & navigate
git clone https://github.com/Johny2x4/Lumina.git
cd Lumina

# 2. Set up virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment variables
export OLLAMA_BASE_URL="http://localhost:11434"
# export SEARXNG_URL="http://localhost:8080"
# export KOKORO_BASE_URL="http://localhost:8880"
# export LUMINA_AUTH_TOKEN="your-secret-token"

# 5. Launch Lumina
python -m uvicorn backend.main:app --host 0.0.0.0 --port 3000
```

### Running as a Background Systemd Service
Create `/etc/systemd/system/lumina.service`:
```ini
[Unit]
Description=Lumina Web Frontend for Ollama
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/home/your-user/Lumina
Environment="PATH=/home/your-user/Lumina/venv/bin"
Environment="OLLAMA_BASE_URL=http://localhost:11434"
ExecStart=/home/your-user/Lumina/venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```
Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now lumina.service
```

---

## ⚙️ Model Management & VRAM Optimization

Lumina provides complete graphical model management directly inside the UI drawer without requiring command-line access.

### 1. Pulling Models
* Open the left slide-out drawer.
* In the **Model Management** section, enter any model tag from the [Ollama Library](https://ollama.com/library) (e.g., `gemma4:12b`, `qwen2.5:7b`, `llama3.2:3b`).
* You can also pull any GGUF quantized model directly from Hugging Face by prefixing with `hf.co/` (e.g., `hf.co/bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M`).
* Click **Pull Model**. Real-time download progress, download speed, and layer verification stream directly into the UI.

### 2. Activating & Switching Models
* Use the model dropdown at the top of the chat canvas or inside the drawer to instantly switch active models.
* Switching models takes effect on the very next conversation turn.

### 3. Prewarming & VRAM Persistence ("Keep in VRAM")
* By default, Lumina sends `keep_alive: -1` to Ollama.
* **Why this matters:** When a model is pinned in GPU memory, subsequent conversation turns begin generating tokens **instantly** without a 3–8 second model reload delay.
* If you prefer to release VRAM automatically after inactivity, toggle off VRAM persistence in settings to let models unload after 5 minutes.

### 4. Releasing VRAM ("Free VRAM")
* When you need GPU memory back for gaming, 3D rendering, or ComfyUI, open the drawer and click **Free VRAM**.
* Lumina immediately sends `keep_alive: 0` to Ollama, evicting the active model from GPU memory and restoring VRAM to 0 MB.

### 5. Deleting Models
* In the model drawer, locate any installed model and click the trash can icon to permanently remove the weights from disk and reclaim storage.

### 6. Recommended Local Models

| Model Tag | Size | VRAM Needed | Best For |
| :--- | :--- | :--- | :--- |
| **`gemma4:12b`** | 7.6 GB | ~8.5 GB | State-of-the-art reasoning, math, and code |
| **`qwen2.5:7b`** | 4.7 GB | ~5.5 GB | Fast, lightweight instruction following, multilingual |
| **`llama3.2-vision:11b`** | 7.9 GB | ~8.5 GB | Multimodal vision, chart analysis, document OCR |
| **`qwen2.5-coder:7b`** | 4.7 GB | ~5.5 GB | Software engineering, code generation, debugging |
| **`llama3.2:3b`** | 2.0 GB | ~2.5 GB | Ultra-fast responses on low-VRAM GPUs and laptops |

---

## 🎙️ TLS / HTTPS & Live Voice Mode Requirements

Modern web browsers enforce strict security standards around the Web Audio and Speech APIs:
* **Allowed on `localhost` & `127.0.0.1`**: Microphone access (`getUserMedia`) works immediately without SSL.
* **Blocked on Remote / LAN IPs (e.g., `http://192.168.1.x:3000`)**: Browsers automatically block microphone permissions on plain HTTP with a `NotAllowedError`.

To enable **Lumina Live Voice Mode** on your iPhone, Android phone, or laptop over your network, choose one of these turnkey solutions:

### Option A: Tailscale Serve (Easiest, Recommended)
If your host is connected to Tailscale:
```bash
# Point Tailscale HTTPS directly to Lumina's port:
tailscale serve --bg 3000
```
Access Lumina at `https://<your-device-name>.tailnet-name.ts.net`.
Tailscale automatically manages valid Let's Encrypt TLS certificates. The microphone and PWA installation work immediately on all devices!

### Option B: Caddy Reverse Proxy
If using Caddy on your network or host:
```caddyfile
ai.yourdomain.home {
    reverse_proxy 127.0.0.1:3000
}
```
Caddy handles automatic internal or external HTTPS certificates.

### Option C: Browser Flag Exception (Testing Only)
If you just want to test voice mode quickly over LAN without configuring TLS:
1. On your client browser (Chrome or Edge), open: `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
2. Enter your Lumina LAN address: `http://192.168.1.69:3000`
3. Set the flag to **Enabled** and click **Relaunch**.

---

## 📋 Environment Variables Reference

| Variable | Default | Description |
| :--- | :--- | :--- |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Endpoint for your Ollama engine (e.g., `http://ollama:11434` in Docker). |
| `OLLAMA_HOST` | *(Fallback for Base URL)* | Alternative alias for `OLLAMA_BASE_URL`. |
| `KOKORO_BASE_URL` | `http://kokoro:8880` | Endpoint for Kokoro-FastAPI neural TTS service. |
| `SEARXNG_URL` | *(Empty / Disabled)* | Endpoint for SearXNG metasearch. Enables real-time web citations. |
| `LUMINA_AUTH_TOKEN` | *(Empty / Open Access)* | Secret token required to access API and UI. |
| `LUMINA_HOST` | `127.0.0.1` | Network interface binding. Set to `0.0.0.0` to allow LAN & Tailscale connections. |
| `LUMINA_CORS_ORIGINS`| `*` | Comma-separated list of allowed CORS origins. |
| `PORT` | `3000` | HTTP port for the Uvicorn web server. |

---

## ❓ Frequently Asked Questions

<details>
<summary><b>Can I run Lumina without a dedicated NVIDIA GPU?</b></summary>
Yes! If no NVIDIA GPU is detected, Ollama automatically falls back to multi-threaded CPU inference. Lumina's hardware telemetry bar will automatically adapt to track host CPU load and system RAM allocation.
</details>

<details>
<summary><b>Where are chat histories stored?</b></summary>
Conversations, document attachments, and user sessions are stored strictly client-side in your browser via <b>IndexedDB</b> (<code>luminaStorage</code>). No external databases (PostgreSQL/SQLite) or cloud backends are required, preserving 100% data sovereignty.
</details>

<details>
<summary><b>Does Lumina work with third-party OpenAI-compatible APIs?</b></summary>
Lumina is specifically purpose-built as an ultra-low-overhead frontend for <b>Ollama</b>. It communicates with Ollama's native API to support direct model pulls, VRAM keep-alive pinning, parameter sampling, and raw GGUF streaming.
</details>
