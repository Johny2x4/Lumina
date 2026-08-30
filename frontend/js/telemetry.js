// Lumina UI — Live Hardware Telemetry Monitor (Sidebar Accordion)
class TelemetryManager {
    constructor() {
        this.ws = null;
        this.reconnectTimer = null;
        this.isExpanded = localStorage.getItem("lumina_telemetry_expanded") !== "false";
        this.init();
    }

    init() {
        this.bindAccordionEvents();
        this.connectWebSocket();
    }

    bindAccordionEvents() {
        const toggleBtn = document.getElementById("btn-toggle-telemetry");
        const content = document.getElementById("telemetry-content");
        const chevron = document.getElementById("telemetry-chevron");

        if (toggleBtn && content) {
            // Apply initial state
            if (!this.isExpanded) {
                content.classList.add("hidden");
                if (chevron) chevron.classList.add("-rotate-90");
            }

            toggleBtn.addEventListener("click", () => {
                this.isExpanded = !this.isExpanded;
                content.classList.toggle("hidden", !this.isExpanded);
                if (chevron) chevron.classList.toggle("-rotate-90", !this.isExpanded);
                localStorage.setItem("lumina_telemetry_expanded", this.isExpanded);
            });
        }
    }

    connectWebSocket() {
        if (this.ws) {
            try { this.ws.close(); } catch (e) {}
        }

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/api/sys/ws`;

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.renderTelemetry(data);
                } catch (err) {
                    console.error("Error parsing telemetry payload", err);
                }
            };

            this.ws.onclose = () => {
                this.scheduleReconnect();
            };

            this.ws.onerror = () => {
                this.ws.close();
            };
        } catch (e) {
            this.scheduleReconnect();
        }
    }

    scheduleReconnect() {
        if (this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connectWebSocket();
        }, 3000);
    }

    renderTelemetry(data) {
        // 1. CPU
        if (data.cpu) {
            const cpuUsage = data.cpu.usage_percent;
            const cpuVal = document.getElementById("hud-cpu-val");
            const cpuBar = document.getElementById("hud-cpu-bar");
            if (cpuVal) cpuVal.textContent = `${cpuUsage}%`;
            if (cpuBar) cpuBar.style.width = `${Math.min(100, Math.max(0, cpuUsage))}%`;
        }

        // 2. RAM
        if (data.ram) {
            const ramUsed = data.ram.used_gb;
            const ramTotal = data.ram.total_gb;
            const ramPercent = data.ram.usage_percent;
            const ramVal = document.getElementById("hud-ram-val");
            const ramBar = document.getElementById("hud-ram-bar");
            if (ramVal) ramVal.textContent = `${ramUsed} / ${ramTotal} GB`;
            if (ramBar) ramBar.style.width = `${Math.min(100, Math.max(0, ramPercent))}%`;
        }

        // 3. Dynamic GPUs (optimized: only update values, don't rebuild DOM)
        const gpusContainer = document.getElementById("hud-gpus-container");
        const summaryBadge = document.getElementById("telemetry-summary-badge");

        if (data.gpus && Array.isArray(data.gpus)) {
            if (data.gpus.length > 0) {
                const primary = data.gpus[0];
                const vramGb = Math.round(primary.vram_used_mb / 1024 * 10) / 10;
                if (summaryBadge) {
                    summaryBadge.textContent = `${primary.core_util_percent}% GPU • ${vramGb}G`;
                }

                if (gpusContainer) {
                    // Create GPU cards once, then update in place
                    if (!this._gpuCardCache || this._gpuCardCache.length !== data.gpus.length) {
                        this._gpuCardCache = [];
                        gpusContainer.innerHTML = "";

                        data.gpus.forEach((gpu, idx) => {
                            const card = document.createElement("div");
                            card.className = "p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/50 space-y-1.5";

                            card.innerHTML = `
                                <div class="flex items-center justify-between text-[11px]">
                                    <span class="font-bold text-slate-200 font-mono"><span class="text-brand-400">GPU ${gpu.id}:</span> <span data-field="gpu-name"></span></span>
                                    <div class="flex items-center gap-1.5 font-mono">
                                        <span data-field="gpu-temp" class="text-emerald-400"></span>
                                        <span class="text-slate-500">•</span>
                                        <span data-field="gpu-power" class="text-slate-400"></span>
                                    </div>
                                </div>
                                <div class="space-y-0.5">
                                    <div class="flex justify-between text-[10px] font-mono text-slate-400">
                                        <span>VRAM</span>
                                        <span data-field="gpu-vram-text"></span>
                                    </div>
                                    <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                        <div data-field="gpu-vram-bar" class="h-full bg-emerald-500 transition-all duration-300" style="width: 0%"></div>
                                    </div>
                                </div>
                                <div class="space-y-0.5">
                                    <div class="flex justify-between text-[10px] font-mono text-slate-400">
                                        <span>Core Load</span>
                                        <span data-field="gpu-core-text"></span>
                                    </div>
                                    <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                        <div data-field="gpu-core-bar" class="h-full bg-indigo-400 transition-all duration-300" style="width: 0%"></div>
                                    </div>
                                </div>
                            `;

                            gpusContainer.appendChild(card);
                            this._gpuCardCache.push({
                                card,
                                nameEl: card.querySelector('[data-field="gpu-name"]'),
                                tempEl: card.querySelector('[data-field="gpu-temp"]'),
                                powerEl: card.querySelector('[data-field="gpu-power"]'),
                                vramTextEl: card.querySelector('[data-field="gpu-vram-text"]'),
                                vramBarEl: card.querySelector('[data-field="gpu-vram-bar"]'),
                                coreTextEl: card.querySelector('[data-field="gpu-core-text"]'),
                                coreBarEl: card.querySelector('[data-field="gpu-core-bar"]'),
                            });
                        });
                    }

                    // Update values in existing cards
                    data.gpus.forEach((gpu, idx) => {
                        const c = this._gpuCardCache[idx];
                        if (!c) return;

                        const vramPercent = gpu.vram_total_mb > 0 ? Math.round((gpu.vram_used_mb / gpu.vram_total_mb) * 100) : 0;
                        const vramUsedGb = Math.round(gpu.vram_used_mb / 1024 * 10) / 10;
                        const vramTotalGb = Math.round(gpu.vram_total_mb / 1024 * 10) / 10;
                        const tempColor = gpu.temp_c > 78 ? 'text-rose-400' : (gpu.temp_c > 65 ? 'text-amber-400' : 'text-emerald-400');

                        c.nameEl.textContent = gpu.name.replace('NVIDIA ', '').replace('GeForce ', '');
                        c.card.title = gpu.name;
                        c.tempEl.textContent = `${gpu.temp_c}°C`;
                        c.tempEl.className = tempColor;
                        c.powerEl.textContent = `${gpu.power_w}W`;
                        c.vramTextEl.textContent = `${vramUsedGb} / ${vramTotalGb} GB (${vramPercent}%)`;
                        c.vramBarEl.style.width = `${vramPercent}%`;
                        c.coreTextEl.textContent = `${gpu.core_util_percent}%`;
                        c.coreBarEl.style.width = `${gpu.core_util_percent}%`;
                    });
                }
            } else {
                this._gpuCardCache = null;
                if (summaryBadge) summaryBadge.textContent = "No GPU";
                if (gpusContainer) {
                    gpusContainer.innerHTML = `<div class="text-[11px] text-slate-500 italic p-1">No NVML GPU detected.</div>`;
                }
            }
        }
    }
}

window.telemetryManager = new TelemetryManager();
