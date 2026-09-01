# Lumina ✦ Getting Started & Deployment Guide

Welcome to **Lumina**—a sovereign, lightweight, zero-cloud web interface designed for **[Ollama](https://ollama.com/)**, **[SearXNG](https://searx.github.io/searxng/)**, and **[Kokoro TTS](https://github.com/remsky/Kokoro-FastAPI)**. 

Whether you want to drop Lumina on top of services already running on your network, spin up a dedicated local LLM workstation, or orchestrate the full sovereign homelab stack, this guide covers each path with turnkey configurations.

---

## 🧭 Choose Your Deployment Path

| Deployment Path | Best For | Included Services | Complexity |
| :--- | :--- | :--- | :--- |
| **[Path 1: Just Lumina](#path-1-deploying-just-lumina-on-top-of-existing-services)** | You already have Ollama, SearXNG, or Kokoro running elsewhere | Lumina UI only | ⭐ Quickest |
| **[Path 2: Lumina + Ollama](#path-2-lumina--ollama-workstation-stack)** | Local LLM chat workstation with GPU acceleration | Lumina UI + Ollama | ⭐⭐ Easy |
| **[Path 3: Full Sovereign Stack](#path-3-full-sovereign-homelab-stack)** | The complete all-in-one private AI cockpit (LLM + Search + Voice + TLS) | Lumina UI + Ollama + Kokoro TTS + SearXNG + Nginx Gateway | ⭐⭐⭐ Comprehensive |

---

## Path 1: Deploying Just Lumina (On Top of Existing Services)

Use this method if you already have an **Ollama** instance running on your host machine, an unRAID / TrueNAS server, or an external GPU box.

```
┌─────────────────────────────────────────────────────────┐
│                      Lumina UI                          │
│   (Runs in Docker or Python on port 3000)               │
└───────────────┬─────────────────┬─────────────────┬─────┘
                │                 │                 │
                ▼                 ▼                 ▼
   http://192.168.1.50:11434   http://...:8080   http://...:8880
     (Existing Ollama)       (Existing SearXNG) (Existing Kokoro)
```

### Option 1A: Single Docker Container (Recommended)

Run Lumina in a standalone container and pass the URLs of your existing services:

```bash
docker run -d \
  --name lumina \
  --restart unless-stopped \
  -p 3000:3000 \
  -e OLLAMA_BASE_URL="http://192.168.1.50:11434" \
  -e SEARXNG_URL="http://192.168.1.50:8080" \
  -e KOKORO_BASE_URL="http://192.168.1.50:8880" \
  lumina:latest
```

> **Tip (Ollama on Host Machine):** If Ollama is running directly on the Docker host (e.g. `localhost:11434`), Docker containers cannot reach it via `localhost`. Use `http://host.docker.internal:11434` and add `--add-host=host.docker.internal:host-gateway`:
> ```bash
> docker run -d \
>   --name lumina \
>   --restart unless-stopped \
>   -p 3000:3000 \
>   --add-host=host.docker.internal:host-gateway \
>   -e OLLAMA_BASE_URL="http://host.docker.internal:11434" \
>   lumina:latest
> ```

---

### Option 1B: Docker Compose (Standalone)

Create a `docker-compose.yml` file:

```yaml
version: "3.8"

services:
  lumina:
    build: .
    container_name: lumina
    restart: unless-stopped
    ports:
      - "3000:3000"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      # Replace with your actual service endpoints:
      - OLLAMA_BASE_URL=http://host.docker.internal:11434
      - SEARXNG_URL=http://192.168.1.50:8080
      - KOKORO_BASE_URL=http://192.168.1.50:8880
      # Optional: set an authentication token for API endpoints
      # - LUMINA_AUTH_TOKEN=your-secret-token
```

Launch with:
```bash
docker compose up -d
```

---

### Option 1C: Native Python (No Docker Required)

For local development or low-overhead environments:

```bash
# 1. Clone repo & navigate
git clone https://github.com/Johny2x4/Lumina.git
cd Lumina

# 2. Set up virtual environment
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Point to your running Ollama / services
export OLLAMA_BASE_URL="http://localhost:11434"
export SEARXNG_URL="http://localhost:8080"
export KOKORO_BASE_URL="http://localhost:8880"

# 5. Start Lumina
python -m uvicorn backend.main:app --host 0.0.0.0 --port 3000
```

Access Lumina at: **`http://localhost:3000`**

---

## Path 2: Lumina + Ollama (Workstation Stack)

Use this method if you want a turnkey local LLM setup on a single computer or workstation with NVIDIA GPU acceleration.

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Compose                       │
│                                                         │
│   ┌───────────────┐               ┌─────────────────┐   │
│   │   Lumina UI   │ ────────────> │  Ollama Engine  │   │
│   │  (Port 3000)  │  Docker Net   │ (NVIDIA GPU)    │   │
│   └───────────────┘               └─────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 1. Prerequisites
- Docker & Docker Compose installed.
- NVIDIA GPU with drivers and [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) (for GPU acceleration).

### 2. The Compose File (`docker-compose.yml`)

```yaml
version: "3.8"

services:
  lumina:
    build: .
    container_name: lumina
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - OLLAMA_BASE_URL=http://ollama:11434
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
    restart: unless-stopped
    ports:
      - "127.0.0.1:11434:11434" # Exposed to localhost for CLI debugging
    environment:
      - OLLAMA_KEEP_ALIVE=-1       # Keep models hot in VRAM by default
      - OLLAMA_FLASH_ATTENTION=1    # Enable Flash Attention for speed
      - OLLAMA_MAX_LOADED_MODELS=1  # Prevent multi-model VRAM contention
    volumes:
      - ollama-models:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

volumes:
  ollama-models:
    name: lumina_ollama_models
```

### 3. Launch & Pull a Model
```bash
# 1. Start the stack
docker compose up -d

# 2. Pull a recommended model directly via terminal (or use Lumina's UI model manager):
docker exec -it lumina-ollama ollama pull gemma4:12b
# Or lightweight fast models:
docker exec -it lumina-ollama ollama pull qwen2.5:7b
```

Open your browser to: **`http://localhost:3000`**

---

## Path 3: Full Sovereign Homelab Stack

The complete private AI operations center:
1. **Lumina UI**: Sovereign web interface with 15 themes, VRAM pinning, and hardware telemetry.
2. **Ollama**: Local GPU-accelerated LLM runtime.
3. **Kokoro TTS**: Lightning-fast neural speech synthesis for voice mode.
4. **SearXNG**: Self-hosted metasearch engine delivering real-time web citations.
5. **Nginx Gateway / TLS**: Terminating HTTPS so mobile phones and LAN clients have microphone access for Live Voice Mode.

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

### 1. The Full Compose Stack (`docker-compose.full.yml`)

```yaml
version: "3.8"

services:
  # --- Reverse Proxy Gateway (Handles TLS for Microphone Access) ---
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

  # --- Lumina Sovereign Web Interface ---
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
      # Optional: set token to secure system & telemetry endpoints
      # - LUMINA_AUTH_TOKEN=your-secret-key
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

  # --- Ollama LLM Inference Engine ---
  ollama:
    image: ollama/ollama:latest
    container_name: lumina-ollama
    restart: unless-stopped
    environment:
      - OLLAMA_KEEP_ALIVE=-1
      - OLLAMA_FLASH_ATTENTION=1
      - OLLAMA_MAX_LOADED_MODELS=1
    volumes:
      - ollama-models:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

  # --- Kokoro Neural TTS ---
  kokoro:
    image: ghcr.io/remsky/kokoro-fastapi-cpu:latest
    container_name: lumina-kokoro
    restart: unless-stopped
    expose:
      - "8880"

  # --- SearXNG Private Metasearch Engine ---
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
  ollama-models:
    name: lumina_ollama_models
```

---

### 2. SearXNG Configuration (`searxng/settings.yml`)

Ensure SearXNG has `json` format enabled so Lumina can extract search results:

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

### 3. Nginx Gateway Configuration (`gateway/nginx.conf`)

Nginx routes incoming requests and upgrades WebSockets for streaming chat and hardware telemetry:

```nginx
events { worker_connections 1024; }

http {
    upstream lumina {
        server lumina-ui:3000;
    }

    # Redirect HTTP to HTTPS (Required for browser microphone permissions)
    server {
        listen 80;
        server_name _;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl;
        server_name _;

        ssl_certificate /etc/nginx/certs/fullchain.pem;
        ssl_certificate_key /etc/nginx/certs/privkey.pem;

        # WebSocket & Streaming Chat Proxy
        location / {
            proxy_pass http://lumina;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # Disable buffering for real-time token streaming
            proxy_buffering off;
            proxy_cache off;
            proxy_read_timeout 86400s;
        }
    }
}
```

---

## 🎙️ Critical: Enabling Microphone for Live Voice Mode

Web browsers enforce strict security rules for microphone access (`getUserMedia`):
- **Allowed on `localhost` & `127.0.0.1`**: Microphone works immediately without HTTPS.
- **Blocked on LAN IPs (e.g. `http://192.168.1.x`)**: Browsers **block** the microphone on plain HTTP unless you connect over HTTPS or configure an exception.

### Easy Solutions for Homelabs:

1. **Tailscale Serve (Zero Config, Easiest)**:
   If you use Tailscale on your host machine:
   ```bash
   tailscale serve --https=443 3000
   ```
   Access Lumina via your magic DNS address (e.g. `https://my-gpu-node.tailscale.net`). Microphone works out of the box on iPhone, Android, and laptops!

2. **Caddy Reverse Proxy (Automatic Free SSL)**:
   ```caddyfile
   ai.yourdomain.com {
       reverse_proxy lumina-ui:3000
   }
   ```

3. **Chrome / Edge Testing Flag (No SSL Required)**:
   For quick testing on another computer or phone without SSL:
   - Navigate to: `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
   - Enter your LAN URL: `http://192.168.1.69:3000`
   - Set to **Enabled** and restart the browser.

---

## 🛠️ Recommended Local Models

Once Lumina is running, pull any of these battle-tested models via the Lumina UI (**Pull / Manage** in sidebar) or `docker exec -it lumina-ollama ollama pull <model>`:

| Model | Size | VRAM Needed | Best For |
| :--- | :--- | :--- | :--- |
| **`gemma4:12b`** | 7.6 GB | ~8 GB | State-of-the-art general reasoning, math, and code |
| **`qwen2.5:7b`** | 4.7 GB | ~5.5 GB | Ultra-fast token generation, reasoning, multilingual |
| **`llama3.2-vision:11b`**| 7.9 GB | ~8.5 GB | Multimodal image inspection and document analysis |
| **`qwen2.5-coder:7b`** | 4.7 GB | ~5.5 GB | Programming, debugging, and syntax accuracy |

---

## ❓ Frequently Asked Questions

<details>
<summary><b>Can I run Lumina without a GPU?</b></summary>
Yes! Ollama automatically falls back to CPU inference if no NVIDIA GPU is detected. The hardware telemetry widget in Lumina will display host CPU and RAM utilization.
</details>

<details>
<summary><b>How do I free GPU memory when I'm done chatting?</b></summary>
Open the slide-out drawer on the left and click <b>Free VRAM</b>. Lumina calls Ollama with <code>keep_alive: 0</code>, immediately releasing the model weights from GPU memory.
</details>

<details>
<summary><b>Where are chat histories stored?</b></summary>
All conversation histories and settings are stored locally in your browser's <code>localStorage</code>. No external database or cloud storage is ever contacted.
</details>
