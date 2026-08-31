# Lumina ✦ Deployment & Quick Start Guide

This guide covers everything you need to deploy **Lumina** in production or homelab environments, including hardware acceleration, web search integration, and setting up **TLS / HTTPS** for browser microphone and voice chat support.

---

## 📋 Table of Contents
1. [Prerequisites](#-prerequisites)
2. [Deployment Methods](#-deployment-methods)
   - [Method 1: Standalone Docker Compose (Quickest)](#method-1-standalone-docker-compose)
   - [Method 2: Multi-Container Stack (Lumina + Ollama + SearXNG + Nginx)](#method-2-multi-container-stack-recommended)
   - [Method 3: Native Python / Systemd Service](#method-3-native-python--systemd-service)
3. [⚠️ Critical: TLS / HTTPS Requirement for Voice Chat](#-critical-tls--https-requirement-for-voice-chat)
   - [Why TLS is Required](#why-tls-is-required)
   - [Solution A: Tailscale Serve (Easiest for Homelabs)](#solution-a-tailscale-serve-recommended-for-homelabs)
   - [Solution B: Caddy Reverse Proxy (Automatic HTTPS)](#solution-b-caddy-reverse-proxy-automatic-https)
   - [Solution C: Nginx with mkcert or Let's Encrypt](#solution-c-nginx-with-mkcert-or-lets-encrypt)
   - [Solution D: Browser Flag Bypass (Testing Over LAN)](#solution-d-browser-flag-bypass-for-testing-only)
4. [Hardware Acceleration (NVIDIA GPU)](#-hardware-acceleration-nvidia-gpu)
5. [Pulling Recommended Models](#-pulling-recommended-models)
6. [Environment Variables Reference](#-environment-variables-reference)

---

## ⚡ Prerequisites

- **Docker & Docker Compose**: v24.0+ / Compose v2.20+
- **NVIDIA GPU** *(Optional but recommended)*:
  - NVIDIA Driver version 525+
  - [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) installed on host:
    ```bash
    # Ubuntu / Debian
    sudo apt-get install -y nvidia-container-toolkit
    sudo nvidia-ctk runtime configure --runtime=docker
    sudo systemctl restart docker
    ```
- **Network Ports**:
  - `3000` (Lumina UI / API)
  - `11434` (Ollama Engine)
  - `80 / 443` (If using reverse proxy / TLS gateway)
  - `8080` (If using SearXNG web search)

---

## 🚀 Deployment Methods

### Method 1: Standalone Docker Compose

Runs Lumina alongside Ollama with full GPU acceleration in isolated containers.

```bash
# 1. Clone the repository
git clone https://github.com/Johny2x4/Lumina.git
cd Lumina

# 2. Launch the stack in background
docker compose up -d

# 3. Verify services are running
docker compose ps
```

Access the UI at: **`http://localhost:3000`**

---

### Method 2: Multi-Container Stack (Recommended)

Includes **Lumina**, **Ollama**, **SearXNG** (for real-time web citations), and **Nginx** reverse proxy gateway.

```yaml
# docker-compose.yml
services:
  gateway:
    image: nginx:alpine
    container_name: lumina-gateway
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"  # If terminating SSL here
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
      - SEARXNG_URL=http://searxng:8080
    depends_on:
      - ollama
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
      - OLLAMA_ORIGINS=*
    volumes:
      - ollama-data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

  searxng:
    image: searxng/searxng:latest
    container_name: lumina-searxng
    restart: unless-stopped
    environment:
      - SEARXNG_BASE_URL=http://localhost:8080/
    volumes:
      - ./searxng:/etc/searxng:rw

volumes:
  ollama-data:
```

---

### Method 3: Native Python / Systemd Service

For direct bare-metal installations without Docker.

```bash
# 1. Clone repo
git clone https://github.com/Johny2x4/Lumina.git
cd Lumina

# 2. Set up virtual environment
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 3. Run with Uvicorn
export OLLAMA_BASE_URL=http://localhost:11434
export SEARXNG_URL=http://localhost:8080  # Optional
python -m uvicorn backend.main:app --host 0.0.0.0 --port 3000
```

---

## ⚠️ Critical: TLS / HTTPS Requirement for Voice Chat

> [!IMPORTANT]
> **Why Voice Chat requires HTTPS / TLS:**
> Modern web browsers (Chrome, Edge, Safari, Firefox) strictly restrict access to the microphone (`navigator.mediaDevices.getUserMedia`) and Web Speech API (`SpeechRecognition`) to **Secure Contexts (`window.isSecureContext`)**.
> 
> - **Works without HTTPS:** Only `http://localhost` and `http://127.0.0.1` are whitelisted by browsers.
> - **Fails without HTTPS:** Any access across a LAN IP (e.g. `http://192.168.x.x:3000`) or remote domain (`http://lumina.myhome.net`) **will block microphone access** with a `NotAllowedError` or `SecurityError`.

To use Gemini Live Fullscreen Voice Mode across your home network or internet, configure one of the solutions below:

---

### Solution A: Tailscale Serve (Recommended for Homelabs)

If you use [Tailscale](https://tailscale.com/), this is the cleanest, zero-config solution. Tailscale automatically provisions a valid Let's Encrypt TLS certificate for your machine.

```bash
# Run on the host running Lumina:
tailscale serve --bg --https=443 3000
```

Now open: **`https://<your-machine-name>.<your-tailnet>.ts.net`**
* Instant, valid HTTPS certificate
* Voice mode and microphone access work out of the box with zero certificate warnings.

---

### Solution B: Caddy Reverse Proxy (Automatic HTTPS)

Caddy obtains and renews certificates automatically.

1. Install Caddy on your host:
   ```bash
   sudo apt install -y caddy
   ```

2. Create a `/etc/caddy/Caddyfile`:
   ```caddy
   # For a local LAN hostname or domain:
   lumina.local, 192.168.68.69.nip.io {
       reverse_proxy localhost:3000
       tls internal
   }
   
   # Or for a public domain with automatic Let's Encrypt:
   # ai.yourdomain.com {
   #     reverse_proxy localhost:3000
   # }
   ```

3. Reload Caddy:
   ```bash
   sudo systemctl restart caddy
   ```

Access Lumina securely over **`https://...`**.

---

### Solution C: Nginx with mkcert or Let's Encrypt

If terminating SSL using Nginx:

1. **Generate locally-trusted SSL certificates** using `mkcert`:
   ```bash
   # Install mkcert
   sudo apt install -y libnss3-tools
   curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
   chmod +x mkcert-v*-linux-amd64 && sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert
   mkcert -install

   # Generate cert for your host IP or LAN name
   mkcert 192.168.68.69 lumina.local localhost 127.0.0.1
   # Creates: 192.168.68.69+3.pem and 192.168.68.69+3-key.pem
   ```

2. **Configure Nginx SSL Block**:
   ```nginx
   server {
       listen 443 ssl http2;
       server_name 192.168.68.69 lumina.local;

       ssl_certificate     /etc/nginx/certs/192.168.68.69+3.pem;
       ssl_certificate_key /etc/nginx/certs/192.168.68.69+3-key.pem;
       ssl_protocols       TLSv1.2 TLSv1.3;
       ssl_ciphers         HIGH:!aNULL:!MD5;

       # Max upload for multimodal images/documents
       client_max_body_size 50M;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto https;
           proxy_read_timeout 600s;
           proxy_buffering off;
       }
   }

   # Redirect HTTP to HTTPS
   server {
       listen 80;
       server_name 192.168.68.69 lumina.local;
       return 301 https://$host$request_uri;
   }
   ```

---

### Solution D: Browser Flag Bypass (For Testing Only)

If you only want to test microphone access across your LAN without generating certificates:

1. In Google Chrome or Microsoft Edge, navigate to:
   ```text
   chrome://flags/#unsafely-treat-insecure-origin-as-secure
   ```
2. Enable the flag and enter your Lumina host address:
   ```text
   http://192.168.68.69:80, http://192.168.68.69:3000
   ```
3. Relaunch the browser. The browser will now treat this origin as secure and allow microphone access.

---

## 🎮 Hardware Acceleration (NVIDIA GPU)

To confirm your GPU is recognized by Lumina's live telemetry drawer:

1. Check host NVIDIA driver:
   ```bash
   nvidia-smi
   ```
2. Verify Docker container has GPU passthrough:
   ```bash
   docker run --rm --gpus all nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi
   ```
3. Open Lumina and open the **Left Drawer**. You should see live compute load %, allocated VRAM, operating temperature, and wattage readouts in real-time.

---

## 🧠 Pulling Recommended Models

Lumina works with any Ollama-compatible model. Here are top recommended models:

```bash
# General Instruction & Chat (Fast & highly capable)
docker exec -it lumina-ollama ollama pull llama3.2:3b
docker exec -it lumina-ollama ollama pull qwen2.5:7b

# Multimodal Vision (Analyze photos, charts, diagrams)
docker exec -it lumina-ollama ollama pull llama3.2-vision:11b
docker exec -it lumina-ollama ollama pull moondream:latest

# Code & Development
docker exec -it lumina-ollama ollama pull qwen2.5-coder:7b
```

Models appear automatically in Lumina's model selector pill at the top of the screen.

---

## ⚙️ Environment Variables Reference

| Variable | Default | Description |
| :--- | :--- | :--- |
| `OLLAMA_BASE_URL` | `http://ollama:11434` | Endpoint for Ollama API. Accepts internal container names or external IPs. |
| `SEARXNG_URL` | *(None / Disabled)* | When set, enables the web search toggle icon in the chat bar and injects live citations into model responses. |
| `LUMINA_CORS_ORIGINS` | `*` | Comma-separated list of allowed origins. |
| `PORT` | `3000` | Port for the Uvicorn web server. |

---

## 💬 Community & Support

- GitHub Issues: [https://github.com/Johny2x4/Lumina/issues](https://github.com/Johny2x4/Lumina/issues)
- License: [MIT License](LICENSE)
