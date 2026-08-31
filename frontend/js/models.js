// Lumina UI — Model Management & Ingestion Controller
class ModelManager {
    constructor() {
        this.models = [];
        this.selectedModel = localStorage.getItem("lumina_selected_model") || localStorage.getItem("lumina_default_model") || "";
        this.init();
    }

    async init() {
        this.bindEvents();
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

        const es = new EventSource(`/api/models/pull/stream?name=${encodeURIComponent(modelName)}`);
        this.currentEventSource = es;

        es.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);
                if (statusText) statusText.textContent = data.status || "Downloading...";
                const percent = Math.min(100, Math.max(0, data.percent || 0));
                if (progressBar) progressBar.style.width = `${percent}%`;
                if (percentText) percentText.textContent = `${percent}%`;

                if (data.done) {
                    es.close();
                    this.currentEventSource = null;
                    if (btnPull) btnPull.disabled = false;

                    if (data.error) {
                        if (statusText) statusText.textContent = `Error: ${data.error}`;
                    } else {
                        if (statusText) statusText.textContent = "Pull complete!";
                        if (progressBar) progressBar.style.width = "100%";
                        if (percentText) percentText.textContent = "100%";
                        await this.refreshModels();
                        this.setSelectedModel(modelName);
                        this.renderModalInstalledList();
                    }
                }
            } catch (err) {
                console.error("Error parsing pull stream event:", err);
            }
        };

        es.onerror = (err) => {
            console.warn("Pull EventSource closed/error:", err);
            es.close();
            this.currentEventSource = null;
            if (btnPull) btnPull.disabled = false;
        };
    }

    async pullModel(modelName) {
        const btnPull = document.getElementById("btn-pull-model");
        const progressBox = document.getElementById("pull-progress-box");
        const statusText = document.getElementById("pull-status-text");

        if (progressBox) progressBox.classList.remove("hidden");
        if (statusText) statusText.textContent = "Initiating background pull...";
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
            if (statusText) statusText.textContent = `Error: ${e.message}`;
            if (btnPull) btnPull.disabled = false;
        }
    }
}

window.modelManager = new ModelManager();
