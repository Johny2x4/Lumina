// Lumina UI — Model Management & Ingestion Controller
class ModelManager {
    constructor() {
        this.models = [];
        this.selectedModel = localStorage.getItem("lumina_selected_model") || localStorage.getItem("lumina_default_model") || "";
        this.isPersistenceEnabled = localStorage.getItem("lumina_model_persistence") !== "false";
        this.currentEventSource = null;
        this.pullPollTimer = null;
        this.init();
    }

    async init() {
        this.bindEvents();
        this.initPersistenceToggle();
        await this.refreshModels();
        await this.checkBackgroundPulls();
    }

    bindEvents() {
        const select = document.getElementById("model-select");
        if (select) {
            select.addEventListener("change", (e) => {
                this.setSelectedModel(e.target.value);
            });
        }

        const headerPill = document.getElementById("header-model-pill");
        if (headerPill) {
            headerPill.addEventListener("click", () => {
                window.app?.openSidebar();
                select?.focus();
            });
        }

        const openModalBtn = document.getElementById("open-model-modal");
        const closeModalBtn = document.getElementById("close-model-modal");
        const modal = document.getElementById("model-modal");

        if (openModalBtn && modal) {
            openModalBtn.addEventListener("click", () => {
                this.renderModalInstalledList();
                modal.classList.remove("hidden");
            });
        }

        if (closeModalBtn && modal) {
            closeModalBtn.addEventListener("click", () => {
                modal.classList.add("hidden");
            });
        }

        const btnPull = document.getElementById("btn-pull-model");
        const inputPull = document.getElementById("pull-model-input");

        if (btnPull && inputPull) {
            btnPull.addEventListener("click", () => {
                const modelName = inputPull.value.trim();
                if (modelName) this.pullModel(modelName);
            });

            inputPull.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    const modelName = inputPull.value.trim();
                    if (modelName) this.pullModel(modelName);
                }
            });
        }

        const btnPurge = document.getElementById("btn-purge-vram");
        if (btnPurge) {
            btnPurge.addEventListener("click", () => this.purgeVRAM());
        }
    }

    async purgeVRAM() {
        const model = this.selectedModel;
        const status = document.getElementById("vram-purge-status");
        const btnPurge = document.getElementById("btn-purge-vram");

        if (!model) {
            if (status) {
                status.textContent = "No model!";
                status.className = "text-[11px] text-amber-400 font-mono font-medium";
                status.classList.remove("hidden");
                setTimeout(() => status.classList.add("hidden"), 2500);
            }
            return;
        }

        if (btnPurge) btnPurge.disabled = true;

        try {
            // Ollama: posting keep_alive: 0 flushes the model from GPU VRAM
            const res = await fetch("/api/ollama/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model: model, keep_alive: 0 })
            });

            if (status) {
                status.textContent = "Flushed!";
                status.className = "text-[11px] text-emerald-400 font-mono font-medium";
                status.classList.remove("hidden");
                setTimeout(() => status.classList.add("hidden"), 3000);
            }
        } catch (e) {
            console.error("Failed to purge VRAM:", e);
            if (status) {
                status.textContent = "Error!";
                status.className = "text-[11px] text-rose-400 font-mono font-medium";
                status.classList.remove("hidden");
                setTimeout(() => status.classList.add("hidden"), 3000);
            }
        } finally {
            if (btnPurge) btnPurge.disabled = false;
        }
    }

    async deleteModel(modelName) {
        if (!confirm(`Are you sure you want to delete model "${modelName}"? This will free its disk space.`)) {
            return;
        }

        try {
            const res = await fetch("/api/ollama/delete", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model: modelName })
            });

            if (!res.ok) throw new Error("Delete failed");
            await this.refreshModels();
            this.renderModalInstalledList();
        } catch (e) {
            alert(`Failed to delete model: ${e.message}`);
        }
    }

    initPersistenceToggle() {
        this.syncPersistenceUI();

        const btnSidebar = document.getElementById("toggle-model-persistence");
        const btnSettings = document.getElementById("settings-toggle-persistence");

        const handleToggle = () => {
            this.isPersistenceEnabled = !this.isPersistenceEnabled;
            localStorage.setItem("lumina_model_persistence", this.isPersistenceEnabled ? "true" : "false");
            this.syncPersistenceUI();

            if (this.isPersistenceEnabled && this.selectedModel) {
                this.preloadModel(this.selectedModel);
            }
        };

        if (btnSidebar) btnSidebar.addEventListener("click", handleToggle);
        if (btnSettings) btnSettings.addEventListener("click", handleToggle);
    }

    syncPersistenceUI() {
        const btnSidebar = document.getElementById("toggle-model-persistence");
        const knobSidebar = document.getElementById("toggle-persist-knob");
        const btnSettings = document.getElementById("settings-toggle-persistence");
        const knobSettings = document.getElementById("settings-persist-knob");

        [btnSidebar, btnSettings].forEach(btn => {
            if (btn) {
                btn.setAttribute("aria-checked", this.isPersistenceEnabled ? "true" : "false");
                btn.className = `relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    this.isPersistenceEnabled ? 'bg-indigo-600' : 'bg-slate-700'
                } focus:outline-none`;
            }
        });

        [knobSidebar, knobSettings].forEach(knob => {
            if (knob) {
                knob.className = `pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    this.isPersistenceEnabled ? 'translate-x-4' : 'translate-x-0'
                }`;
            }
        });
    }

    async preloadModel(modelName) {
        const status = document.getElementById("vram-purge-status");
        if (status) {
            status.textContent = "Pre-warming...";
            status.className = "text-[11px] text-indigo-400 font-mono font-medium";
            status.classList.remove("hidden");
        }

        try {
            await fetch("/api/models/preload", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model: modelName, keep_alive: -1 })
            });

            if (status) {
                status.textContent = "VRAM Ready";
                status.className = "text-[11px] text-emerald-400 font-mono font-medium";
                setTimeout(() => status.classList.add("hidden"), 3000);
            }
        } catch (e) {
            console.warn("Model preload error:", e);
            if (status) status.classList.add("hidden");
        }
    }

    setSelectedModel(modelName) {
        this.selectedModel = modelName;
        localStorage.setItem("lumina_selected_model", modelName);

        const select = document.getElementById("model-select");
        if (select && select.value !== modelName) {
            select.value = modelName;
        }

        const headerName = document.getElementById("header-model-name");
        if (headerName) {
            headerName.textContent = modelName || "Select model";
        }

        // If Memory Persistence is enabled, immediately preload and pin in VRAM
        if (this.isPersistenceEnabled && modelName) {
            this.preloadModel(modelName);
        }
    }

    async refreshModels() {
        const select = document.getElementById("model-select");
        const settingsSelect = document.getElementById("settings-default-model-select");

        try {
            const res = await fetch("/api/ollama/tags");
            if (!res.ok) throw new Error("Failed to fetch models");
            const data = await res.json();
            this.models = data.models || [];

            if (this.models.length === 0) {
                if (select) select.innerHTML = `<option value="">No models installed</option>`;
                if (settingsSelect) settingsSelect.innerHTML = `<option value="">No models installed</option>`;
                this.setSelectedModel("");
                return;
            }

            const optionsHtml = this.models.map(m => {
                const sizeGb = Math.round((m.size / (1024 ** 3)) * 10) / 10;
                const safeName = escapeHtml(m.name);
                const safeNameAttr = escapeAttr(m.name);
                return `<option value="${safeNameAttr}">${safeName} (${sizeGb} GB)</option>`;
            }).join("");

            if (select) select.innerHTML = optionsHtml;
            if (settingsSelect) settingsSelect.innerHTML = optionsHtml;

            // Pick active model: current selected > default setting > first in list
            const defaultSetting = localStorage.getItem("lumina_default_model");
            let targetModel = this.selectedModel;

            if (!targetModel || !this.models.some(m => m.name === targetModel)) {
                if (defaultSetting && this.models.some(m => m.name === defaultSetting)) {
                    targetModel = defaultSetting;
                } else {
                    targetModel = this.models[0].name;
                }
            }

            this.setSelectedModel(targetModel);

            if (settingsSelect && defaultSetting) {
                settingsSelect.value = defaultSetting;
            }
        } catch (e) {
            console.error("Error refreshing model list:", e);
            if (select) select.innerHTML = `<option value="">Ollama offline</option>`;
        }
    }

    renderModalInstalledList() {
        const container = document.getElementById("installed-models-list");
        if (!container) return;

        if (this.models.length === 0) {
            container.innerHTML = `<div class="text-slate-500 py-2">No models installed yet.</div>`;
            return;
        }

        container.innerHTML = this.models.map(m => {
            const sizeGb = Math.round((m.size / (1024 ** 3)) * 10) / 10;
            const paramSize = m.details?.parameter_size || "";
            const quant = m.details?.quantization_level || "";
            const isSelected = m.name === this.selectedModel;
            const safeName = escapeHtml(m.name);
            const safeNameAttr = escapeAttr(m.name);

            return `
                <div class="p-2.5 bg-slate-800/70 rounded-xl border border-slate-700/60 flex items-center justify-between gap-2">
                    <div class="truncate">
                        <div class="flex items-center gap-1.5">
                            <span class="font-medium text-slate-200 font-mono text-xs truncate">${safeName}</span>
                            ${isSelected ? '<span class="text-[9px] px-1.5 py-0.2 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">Active</span>' : ''}
                        </div>
                        <div class="text-[10px] text-slate-400 mt-0.5">${sizeGb} GB ${paramSize ? '• ' + escapeHtml(paramSize) : ''} ${quant ? '• ' + escapeHtml(quant) : ''}</div>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                        <button class="text-[10px] px-2.5 py-1 rounded-lg bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-600 hover:text-white transition active:scale-95" onclick="window.modelManager.setSelectedModel('${safeNameAttr}'); document.getElementById('model-modal').classList.add('hidden');">
                            Select
                        </button>
                        <button class="text-[10px] p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg border border-transparent hover:border-rose-500/30 transition" onclick="window.modelManager.deleteModel('${safeNameAttr}')" title="Delete Model">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>
                </div>
            `;
        }).join("");
    }

    async checkBackgroundPulls() {
        try {
            const res = await fetch("/api/models/pull/status");
            if (!res.ok) return;
            const data = await res.json();
            const activePull = (data.pulls || []).find(p => !p.done);
            if (activePull) {
                this.attachToPullStream(activePull.model);
            }
        } catch (e) {
            console.warn("Could not check background pulls:", e);
        }
    }

    attachToPullStream(modelName) {
        const progressBox = document.getElementById("pull-progress-box");
        const progressBar = document.getElementById("pull-progress-bar");
        const statusText = document.getElementById("pull-status-text");
        const percentText = document.getElementById("pull-percent-text");
        const btnPull = document.getElementById("btn-pull-model");
        const inputPull = document.getElementById("pull-model-input");

        if (inputPull && !inputPull.value) inputPull.value = modelName;
        if (progressBox) progressBox.classList.remove("hidden");
        if (btnPull) btnPull.disabled = true;

        if (this.currentEventSource) {
            this.currentEventSource.close();
            this.currentEventSource = null;
        }
        if (this.pullPollTimer) {
            clearInterval(this.pullPollTimer);
            this.pullPollTimer = null;
        }

        const updateUI = async (data) => {
            if (!data) return;
            const percent = Math.min(100, Math.max(0, data.percent || 0));
            if (progressBar) progressBar.style.width = `${percent}%`;
            if (percentText) percentText.textContent = `${percent}%`;

            let displayStatus = data.status || "Downloading layers...";
            if (data.completed && data.total && data.total > 0) {
                const doneMb = (data.completed / (1024 * 1024)).toFixed(1);
                const totalMb = (data.total / (1024 * 1024)).toFixed(1);
                displayStatus = `${data.status} • ${doneMb} / ${totalMb} MB (${percent}%)`;
            }
            if (statusText) statusText.textContent = displayStatus;

            if (data.done) {
                if (this.currentEventSource) {
                    this.currentEventSource.close();
                    this.currentEventSource = null;
                }
                if (this.pullPollTimer) {
                    clearInterval(this.pullPollTimer);
                    this.pullPollTimer = null;
                }
                if (btnPull) btnPull.disabled = false;

                const isFailed = data.error || data.status === "failed" || data.status === "cancelled";
                if (isFailed) {
                    const errorReason = data.error || data.status || "Verification or download failed (corrupted layer deleted).";
                    if (statusText) {
                        statusText.textContent = `❌ ${errorReason}`;
                        statusText.className = "text-[11px] text-rose-400 font-medium break-words";
                    }
                    if (progressBar) {
                        progressBar.style.width = "100%";
                        progressBar.className = "h-full bg-rose-500 transition-all duration-300";
                    }
                    if (percentText) {
                        percentText.textContent = "Failed";
                        percentText.className = "text-[10px] text-rose-400 font-mono font-bold";
                    }
                } else {
                    if (statusText) {
                        statusText.textContent = "✓ Pull complete!";
                        statusText.className = "text-[11px] text-emerald-400 font-medium";
                    }
                    if (progressBar) {
                        progressBar.style.width = "100%";
                        progressBar.className = "h-full bg-brand-500 transition-all duration-300";
                    }
                    if (percentText) {
                        percentText.textContent = "100%";
                        percentText.className = "text-[10px] text-brand-400 font-mono";
                    }
                    await this.refreshModels();
                    this.setSelectedModel(modelName);
                    this.renderModalInstalledList();
                }
            }
        };

        // 1. Dual Engine: SSE Stream
        try {
            const es = new EventSource(`/api/models/pull/stream?name=${encodeURIComponent(modelName)}`);
            this.currentEventSource = es;

            es.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    updateUI(data);
                } catch (err) {
                    console.error("Error parsing pull stream event:", err);
                }
            };

            es.onerror = () => {
                // If SSE drops, polling will continue seamlessly
            };
        } catch (e) {}

        // 2. Dual Engine: Polling Fallback (guarantees updates every 800ms even if SSE is buffered)
        this.pullPollTimer = setInterval(async () => {
            try {
                const res = await fetch("/api/models/pull/status");
                if (!res.ok) return;
                const data = await res.json();
                const job = (data.pulls || []).find(p => p.model === modelName);
                if (job) {
                    updateUI(job);
                }
            } catch (e) {}
        }, 800);
    }

    async pullModel(modelName) {
        const btnPull = document.getElementById("btn-pull-model");
        const progressBox = document.getElementById("pull-progress-box");
        const progressBar = document.getElementById("pull-progress-bar");
        const percentText = document.getElementById("pull-percent-text");
        const statusText = document.getElementById("pull-status-text");

        if (progressBox) progressBox.classList.remove("hidden");
        if (statusText) {
            statusText.textContent = "Initiating background pull...";
            statusText.className = "text-[11px] text-slate-300 font-medium";
        }
        if (progressBar) {
            progressBar.style.width = "0%";
            progressBar.className = "h-full bg-brand-500 transition-all duration-300";
        }
        if (percentText) {
            percentText.textContent = "0%";
            percentText.className = "text-[10px] text-slate-400 font-mono";
        }
        if (btnPull) btnPull.disabled = true;

        try {
            const res = await fetch("/api/models/pull", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: modelName })
            });

            if (!res.ok) throw new Error(`Pull failed: ${res.statusText}`);
            this.attachToPullStream(modelName);
        } catch (e) {
            console.error("Error starting model pull:", e);
            if (statusText) {
                statusText.textContent = `❌ Error: ${e.message}`;
                statusText.className = "text-[11px] text-rose-400 font-medium";
            }
            if (progressBar) {
                progressBar.className = "h-full bg-rose-500 transition-all duration-300";
            }
            if (btnPull) btnPull.disabled = false;
        }
    }
}

window.modelManager = new ModelManager();
