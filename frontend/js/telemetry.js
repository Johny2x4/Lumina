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

        // 3. Dynamic GPUs
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
                    gpusContainer.innerHTML = data.gpus.map(gpu => {
                        const vramPercent = gpu.vram_total_mb > 0 ? Math.round((gpu.vram_used_mb / gpu.vram_total_mb) * 100) : 0;
                        const vramUsedGb = Math.round(gpu.vram_used_mb / 1024 * 10) / 10;
                        const vramTotalGb = Math.round(gpu.vram_total_mb / 1024 * 10) / 10;
                        const tempColor = gpu.temp_c > 78 ? 'text-rose-400' : (gpu.temp_c > 65 ? 'text-amber-400' : 'text-emerald-400');

                        return `
                            <div class="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/50 space-y-1.5" title="${gpu.name}">
                                <div class="flex items-center justify-between text-[11px]">
                                    <span class="font-bold text-slate-200 font-mono"><span class="text-brand-400">GPU ${gpu.id}:</span> ${gpu.name.replace('NVIDIA ', '').replace('GeForce ', '')}</span>
                                    <div class="flex items-center gap-1.5 font-mono">
                                        <span class="${tempColor}">${gpu.temp_c}°C</span>
                                        <span class="text-slate-500">•</span>
                                        <span class="text-slate-400">${gpu.power_w}W</span>
                                    </div>
                                </div>
                                <div class="space-y-0.5">
                                    <div class="flex justify-between text-[10px] font-mono text-slate-400">
                                        <span>VRAM</span>
                                        <span>${vramUsedGb} / ${vramTotalGb} GB (${vramPercent}%)</span>
                                    </div>
                                    <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                        <div class="h-full bg-emerald-500 transition-all duration-300" style="width: ${vramPercent}%"></div>
                                    </div>
                                </div>
                                <div class="space-y-0.5">
                                    <div class="flex justify-between text-[10px] font-mono text-slate-400">
                                        <span>Core Load</span>
                                        <span>${gpu.core_util_percent}%</span>
                                    </div>
                                    <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                        <div class="h-full bg-indigo-400 transition-all duration-300" style="width: ${gpu.core_util_percent}%"></div>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join("");
                }
            } else {
                if (summaryBadge) summaryBadge.textContent = "No GPU";
                if (gpusContainer) {
                    gpusContainer.innerHTML = `<div class="text-[11px] text-slate-500 italic p-1">No NVML GPU detected.</div>`;
                }
            }
        }
    }
}

window.telemetryManager = new TelemetryManager();
