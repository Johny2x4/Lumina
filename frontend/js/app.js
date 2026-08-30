// Lumina UI — Main Application, Session State, Themes & Settings Controller
class App {
    constructor() {
        this.isIncognito = false;
        this.sessions = [];
        this.activeSessionId = null;
        this.currentTheme = localStorage.getItem("lumina_theme") || "default";
        this._saveTimer = null;
        this.init();
    }

    init() {
        this.applyTheme(this.currentTheme);
        this.bindEvents();
        this.loadSessions();

        // Restore desktop collapsed preference
        if (window.innerWidth > 768 && localStorage.getItem("lumina_sidebar_collapsed") === "true") {
            const sidebar = document.getElementById("sidebar");
            if (sidebar) sidebar.classList.add("collapsed");
        }
    }

    bindEvents() {
        // Sidebar Toggle & Mobile Drawer
        const btnToggleSidebar = document.getElementById("btn-toggle-sidebar");
        const btnCloseSidebar = document.getElementById("btn-close-sidebar");
        const backdrop = document.getElementById("sidebar-backdrop");

        if (btnToggleSidebar) btnToggleSidebar.addEventListener("click", () => this.toggleSidebar());
        if (btnCloseSidebar) btnCloseSidebar.addEventListener("click", () => this.closeSidebar());
        if (backdrop) backdrop.addEventListener("click", () => this.closeSidebar());

        // New Chat Buttons (Header & Sidebar)
        const btnQuickNewChat = document.getElementById("btn-quick-new-chat");
        const btnSidebarNewChat = document.getElementById("btn-sidebar-new-chat");

        if (btnQuickNewChat) {
            btnQuickNewChat.addEventListener("click", () => {
                this.createNewSession();
                this.closeSidebar();
            });
        }
        if (btnSidebarNewChat) {
            btnSidebarNewChat.addEventListener("click", () => {
                this.createNewSession();
                this.closeSidebar();
            });
        }

        // Incognito Mode Toggle
        const toggleIncognito = document.getElementById("toggle-incognito");
        if (toggleIncognito) {
            toggleIncognito.addEventListener("click", () => this.toggleIncognitoMode());
        }

        // Settings Dialog Events
        const btnOpenSettings = document.getElementById("btn-open-settings");
        const btnSidebarSettings = document.getElementById("btn-sidebar-settings");
        const btnCloseSettings = document.getElementById("close-settings-modal");
        const btnSaveSettings = document.getElementById("btn-save-settings");
        const settingsModal = document.getElementById("settings-modal");

        const openSettings = () => {
            this.closeSidebar();
            settingsModal?.classList.remove("hidden");
            this.syncSettingsUI();
        };

        if (btnOpenSettings) btnOpenSettings.addEventListener("click", openSettings);
        if (btnSidebarSettings) btnSidebarSettings.addEventListener("click", openSettings);
        if (btnCloseSettings) btnCloseSettings.addEventListener("click", () => settingsModal?.classList.add("hidden"));
        if (btnSaveSettings) btnSaveSettings.addEventListener("click", () => settingsModal?.classList.add("hidden"));

        // Theme Buttons inside Settings
        document.querySelectorAll(".theme-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const theme = btn.getAttribute("data-theme-val");
                if (theme) this.applyTheme(theme);
            });
        });

        // Search Conversations Input
        const searchInput = document.getElementById("session-search-input");
        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                this.searchQuery = e.target.value.trim().toLowerCase();
                this.renderSessionList();
            });
        }

        // Initialize Advanced Settings Controls
        this.initSettingsControls();
    }

    initSettingsControls() {
        // 1. Default Model in Settings
        const defaultModelSelect = document.getElementById("settings-default-model-select");
        if (defaultModelSelect) {
            defaultModelSelect.addEventListener("change", (e) => {
                localStorage.setItem("lumina_default_model", e.target.value);
            });
        }

        // 2. System Persona & Custom Prompt
        const personaSelect = document.getElementById("settings-persona-select");
        const customPersonaText = document.getElementById("settings-custom-persona-text");
        const savedPersona = localStorage.getItem("lumina_system_persona") || "default";
        const savedCustomPrompt = localStorage.getItem("lumina_custom_system_prompt") || "";

        if (personaSelect) {
            personaSelect.value = savedPersona;
            if (customPersonaText) {
                customPersonaText.value = savedCustomPrompt;
                customPersonaText.classList.toggle("hidden", savedPersona !== "custom");
            }

            personaSelect.addEventListener("change", (e) => {
                const val = e.target.value;
                localStorage.setItem("lumina_system_persona", val);
                if (customPersonaText) {
                    customPersonaText.classList.toggle("hidden", val !== "custom");
                    if (val === "custom") customPersonaText.focus();
                }
            });
        }

        if (customPersonaText) {
            customPersonaText.addEventListener("input", (e) => {
                localStorage.setItem("lumina_custom_system_prompt", e.target.value);
            });
        }

        // 3. Inference Sliders & Selectors
        const numCtxSelect = document.getElementById("settings-num-ctx");
        const labelNumCtx = document.getElementById("label-num-ctx");
        const tempSlider = document.getElementById("settings-temperature");
        const labelTemp = document.getElementById("label-temperature");
        const topPSlider = document.getElementById("settings-top-p");
        const labelTopP = document.getElementById("label-top-p");
        const repSlider = document.getElementById("settings-repeat-penalty");
        const labelRep = document.getElementById("label-repeat-penalty");

        let savedOptions = {};
        try {
            savedOptions = JSON.parse(localStorage.getItem("lumina_inference_options") || "{}");
        } catch (e) {}

        if (numCtxSelect) {
            numCtxSelect.value = savedOptions.num_ctx || "8192";
            if (labelNumCtx) labelNumCtx.textContent = `${numCtxSelect.value} tokens`;
            numCtxSelect.addEventListener("change", (e) => {
                this.updateInferenceOption("num_ctx", parseInt(e.target.value, 10));
                if (labelNumCtx) labelNumCtx.textContent = `${e.target.value} tokens`;
            });
        }

        if (tempSlider) {
            tempSlider.value = savedOptions.temperature !== undefined ? savedOptions.temperature : 0.7;
            if (labelTemp) labelTemp.textContent = parseFloat(tempSlider.value).toFixed(2);
            tempSlider.addEventListener("input", (e) => {
                const val = parseFloat(e.target.value);
                this.updateInferenceOption("temperature", val);
                if (labelTemp) labelTemp.textContent = val.toFixed(2);
            });
        }

        if (topPSlider) {
            topPSlider.value = savedOptions.top_p !== undefined ? savedOptions.top_p : 0.9;
            if (labelTopP) labelTopP.textContent = parseFloat(topPSlider.value).toFixed(2);
            topPSlider.addEventListener("input", (e) => {
                const val = parseFloat(e.target.value);
                this.updateInferenceOption("top_p", val);
                if (labelTopP) labelTopP.textContent = val.toFixed(2);
            });
        }

        if (repSlider) {
            repSlider.value = savedOptions.repeat_penalty !== undefined ? savedOptions.repeat_penalty : 1.1;
            if (labelRep) labelRep.textContent = parseFloat(repSlider.value).toFixed(2);
            repSlider.addEventListener("input", (e) => {
                const val = parseFloat(e.target.value);
                this.updateInferenceOption("repeat_penalty", val);
                if (labelRep) labelRep.textContent = val.toFixed(2);
            });
        }

        // Reset Defaults
        const btnReset = document.getElementById("btn-reset-inference");
        if (btnReset) {
            btnReset.addEventListener("click", () => {
                localStorage.removeItem("lumina_inference_options");
                if (numCtxSelect) { numCtxSelect.value = "8192"; if (labelNumCtx) labelNumCtx.textContent = "8192 tokens"; }
                if (tempSlider) { tempSlider.value = "0.7"; if (labelTemp) labelTemp.textContent = "0.70"; }
                if (topPSlider) { topPSlider.value = "0.9"; if (labelTopP) labelTopP.textContent = "0.90"; }
                if (repSlider) { repSlider.value = "1.1"; if (labelRep) labelRep.textContent = "1.10"; }
            });
        }

        // 4. Export Actions
        const btnExportMd = document.getElementById("btn-export-markdown");
        if (btnExportMd) {
            btnExportMd.addEventListener("click", () => {
                window.chatManager?.exportCurrentChatMarkdown();
            });
        }

        const btnExportJson = document.getElementById("btn-export-json");
        if (btnExportJson) {
            btnExportJson.addEventListener("click", () => {
                window.chatManager?.exportCurrentChatJSON();
            });
        }

        // 5. Clear All History Button
        const btnClearAll = document.getElementById("btn-clear-all-history");
        if (btnClearAll) {
            btnClearAll.addEventListener("click", () => {
                if (confirm("Are you sure you want to delete all saved conversations? This cannot be undone.")) {
                    localStorage.removeItem("lumina_sessions");
                    this.sessions = [];
                    this.createNewSession();
                    document.getElementById("settings-modal")?.classList.add("hidden");
                }
            });
        }
    }

    updateInferenceOption(key, value) {
        let opts = {};
        try {
            opts = JSON.parse(localStorage.getItem("lumina_inference_options") || "{}");
        } catch (e) {}
        opts[key] = value;
        localStorage.setItem("lumina_inference_options", JSON.stringify(opts));
    }

    // Sidebar Mobile & Desktop Management
    openSidebar() {
        const sidebar = document.getElementById("sidebar");
        const backdrop = document.getElementById("sidebar-backdrop");
        const isMobile = window.innerWidth <= 768;

        if (sidebar) {
            sidebar.classList.add("open");
            sidebar.classList.remove("collapsed");
        }
        if (isMobile && backdrop) {
            backdrop.classList.remove("hidden");
        }
        localStorage.setItem("lumina_sidebar_collapsed", "false");
    }

    closeSidebar() {
        const sidebar = document.getElementById("sidebar");
        const backdrop = document.getElementById("sidebar-backdrop");
        const isMobile = window.innerWidth <= 768;

        if (sidebar) {
            sidebar.classList.remove("open");
            if (!isMobile) {
                sidebar.classList.add("collapsed");
                localStorage.setItem("lumina_sidebar_collapsed", "true");
            }
        }
        if (backdrop) backdrop.classList.add("hidden");
    }

    toggleSidebar() {
        const sidebar = document.getElementById("sidebar");
        const isMobile = window.innerWidth <= 768;

        if (isMobile) {
            if (sidebar && sidebar.classList.contains("open")) {
                this.closeSidebar();
            } else {
                this.openSidebar();
            }
        } else {
            if (sidebar && sidebar.classList.contains("collapsed")) {
                sidebar.classList.remove("collapsed");
            } else {
                sidebar?.classList.add("collapsed");
            }
        }
    }

    // Theme Controller
    applyTheme(themeName) {
        this.currentTheme = themeName;
        localStorage.setItem("lumina_theme", themeName);

        if (themeName === "default") {
            document.body.removeAttribute("data-theme");
        } else {
            document.body.setAttribute("data-theme", themeName);
        }

        this.handleAmbientLayer(themeName);

        // Highlight selected theme button
        document.querySelectorAll(".theme-btn").forEach(btn => {
            const val = btn.getAttribute("data-theme-val");
            if (val === themeName) {
                btn.classList.add("ring-2", "ring-indigo-500", "border-indigo-500");
            } else {
                btn.classList.remove("ring-2", "ring-indigo-500", "border-indigo-500");
            }
        });
    }

    handleAmbientLayer(themeName) {
        const layer = document.getElementById("ambient-layer");
        if (!layer) return;

        layer.innerHTML = "";
        if (this.matrixInterval) {
            clearInterval(this.matrixInterval);
            this.matrixInterval = null;
        }
        if (this._resizeHandler) {
            window.removeEventListener("resize", this._resizeHandler);
            this._resizeHandler = null;
        }

        if (themeName === "matrix") {
            const canvas = document.createElement("canvas");
            canvas.className = "w-full h-full opacity-20";
            layer.appendChild(canvas);

            const ctx = canvas.getContext("2d");
            const resizeCanvas = () => {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            };
            resizeCanvas();
            this._resizeHandler = resizeCanvas;
            window.addEventListener("resize", resizeCanvas);

            const chars = "01010101XYZ日ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ";
            const fontSize = 14;
            const columns = Math.floor(canvas.width / fontSize);
            const drops = Array(columns).fill(1);

            this.matrixInterval = setInterval(() => {
                ctx.fillStyle = "rgba(2, 6, 3, 0.08)";
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                ctx.fillStyle = "#00ff66";
                ctx.font = `${fontSize}px monospace`;

                for (let i = 0; i < drops.length; i++) {
                    const text = chars[Math.floor(Math.random() * chars.length)];
                    ctx.fillText(text, i * fontSize, drops[i] * fontSize);

                    if (drops[i] * fontSize > canvas.height && Math.random() > 0.98) {
                        drops[i] = 0;
                    }
                    drops[i]++;
                }
            }, 55);
        }
    }

    syncSettingsUI() {
        this.applyTheme(this.currentTheme);
        const defaultModelSelect = document.getElementById("settings-default-model-select");
        const savedDefault = localStorage.getItem("lumina_default_model");
        if (defaultModelSelect && savedDefault) {
            defaultModelSelect.value = savedDefault;
        }
    }

    // Incognito Mode
    toggleIncognitoMode() {
        this.isIncognito = !this.isIncognito;
        const toggle = document.getElementById("toggle-incognito");
        const slider = document.getElementById("incognito-slider");
        const label = document.getElementById("incognito-label");
        const icon = document.getElementById("incognito-icon");
        const headerBadge = document.getElementById("header-incognito-badge");

        if (this.isIncognito) {
            toggle.classList.remove("bg-slate-700");
            toggle.classList.add("bg-purple-600");
            slider.classList.remove("translate-x-0");
            slider.classList.add("translate-x-4");
            if (label) label.textContent = "Incognito";
            if (icon) icon.classList.add("text-purple-400");
            if (headerBadge) headerBadge.classList.remove("hidden");
        } else {
            toggle.classList.add("bg-slate-700");
            toggle.classList.remove("bg-purple-600");
            slider.classList.add("translate-x-0");
            slider.classList.remove("translate-x-4");
            if (label) label.textContent = "Persistent";
            if (icon) icon.classList.remove("text-purple-400");
            if (headerBadge) headerBadge.classList.add("hidden");
        }
    }

    // Session Management
    loadSessions() {
        if (this.isIncognito) return;
        try {
            const stored = localStorage.getItem("lumina_sessions");
            this.sessions = stored ? JSON.parse(stored) : [];
        } catch (e) {
            this.sessions = [];
        }

        if (this.sessions.length > 0) {
            this.switchSession(this.sessions[0].id);
        } else {
            this.createNewSession();
        }
        this.renderSessionList();
    }

    saveSessions() {
        if (this.isIncognito) return;
        // Debounce: avoid excessive localStorage writes during streaming
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => {
            try {
                // Strip base64 image data before persisting to avoid blowing
                // through the ~5 MB localStorage quota
                const stripped = this.sessions.map(s => ({
                    ...s,
                    messages: s.messages.map(m => {
                        if (m.imagePreviews) {
                            return { ...m, imagePreviews: m.imagePreviews.map(() => "[image]") };
                        }
                        return m;
                    }),
                }));
                localStorage.setItem("lumina_sessions", JSON.stringify(stripped));
            } catch (e) {
                console.warn("Failed to save sessions to localStorage:", e);
            }
        }, 500);
    }

    createNewSession() {
        const id = "sess_" + Date.now();
        const newSess = {
            id: id,
            title: "New Conversation",
            createdAt: Date.now(),
            messages: []
        };
        this.sessions.unshift(newSess);
        this.activeSessionId = id;
        this.saveSessions();
        this.renderSessionList();

        const container = document.getElementById("messages-container");
        if (container) {
            container.innerHTML = `
                <div id="empty-state" class="h-full flex flex-col items-center justify-center text-center p-4 select-none opacity-90">
                    <div class="relative mb-4">
                        <img src="assets/icon.png" alt="Lumina Icon" class="w-16 h-16 rounded-2xl object-cover shadow-xl shadow-indigo-500/25 ring-1 ring-white/20">
                        <div class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 ring-2 ring-slate-900 animate-pulse"></div>
                    </div>
                    <h2 class="text-lg font-bold text-white tracking-tight">Lumina Local Intelligence</h2>
                    <p class="text-xs text-slate-400 max-w-xs mt-1 mb-5">Zero cold-start lag, pinned VRAM residence, and native hardware telemetry.</p>
                </div>
            `;
        }
        if (window.chatManager) {
            window.chatManager.currentMessages = [];
        }
        const badge = document.getElementById("token-telemetry-badge");
        if (badge) badge.classList.add("hidden");
    }

    switchSession(id) {
        this.activeSessionId = id;
        const sess = this.sessions.find(s => s.id === id);
        if (!sess) return;

        const container = document.getElementById("messages-container");
        if (container) {
            container.innerHTML = "";
            if (sess.messages.length === 0) {
                this.createNewSession();
                return;
            }
            sess.messages.forEach(msg => {
                window.chatManager?.renderMessageUI(msg.role, msg.content, msg.imagePreviews, msg.sources);
            });
        }
        if (window.chatManager) {
            window.chatManager.currentMessages = [...sess.messages];
        }
        this.renderSessionList();
        this.closeSidebar();
    }

    deleteSession(id, e) {
        e.stopPropagation();
        this.sessions = this.sessions.filter(s => s.id !== id);
        this.saveSessions();
        if (this.activeSessionId === id) {
            if (this.sessions.length > 0) {
                this.switchSession(this.sessions[0].id);
            } else {
                this.createNewSession();
            }
        }
        this.renderSessionList();
    }

    onMessagesUpdated() {
        const activeSess = this.sessions.find(s => s.id === this.activeSessionId);
        if (activeSess && window.chatManager) {
            activeSess.messages = [...window.chatManager.currentMessages];
            const firstUser = activeSess.messages.find(m => m.role === "user");
            if (firstUser && activeSess.title === "New Conversation") {
                activeSess.title = firstUser.content.slice(0, 26);
            }
            this.saveSessions();
            this.renderSessionList();
        }
    }

    renderSessionList() {
        const listEl = document.getElementById("chat-list");
        const countBadge = document.getElementById("chat-count-badge");
        if (!listEl) return;

        let displaySessions = this.sessions;
        if (this.searchQuery) {
            displaySessions = this.sessions.filter(s => {
                const titleMatch = s.title && s.title.toLowerCase().includes(this.searchQuery);
                const msgMatch = s.messages && s.messages.some(m => m.content && m.content.toLowerCase().includes(this.searchQuery));
                return titleMatch || msgMatch;
            });
        }

        if (countBadge) {
            countBadge.textContent = this.searchQuery ? `${displaySessions.length}/${this.sessions.length}` : `${this.sessions.length}`;
        }

        if (displaySessions.length === 0) {
            listEl.innerHTML = `<div class="text-[11px] text-slate-500 p-2 italic">${this.searchQuery ? 'No matching conversations.' : 'No chats yet.'}</div>`;
            return;
        }

        listEl.innerHTML = displaySessions.map(s => {
            const isActive = s.id === this.activeSessionId;
            const safeTitle = escapeHtml(s.title);
            const safeId = escapeAttr(s.id);
            return `
                <div class="session-tab group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition text-xs ${
                    isActive ? 'bg-slate-800 text-white font-medium shadow-sm' : 'hover:bg-slate-800/40 text-slate-400 hover:text-slate-200'
                }" onclick="window.app.switchSession('${safeId}')">
                    <span class="truncate max-w-[180px]">${safeTitle}</span>
                    <button class="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 transition p-1 text-sm leading-none" onclick="window.app.deleteSession('${safeId}', event)" title="Delete Chat">
                        &times;
                    </button>
                </div>
            `;
        }).join("");
    }
}

window.app = new App();
