// Lumina UI — Main Application, Session State, Themes & Settings Controller
class App {
    constructor() {
        this.isIncognito = false;
        this.sessions = [];
        this.activeSessionId = null;
        const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
        this.currentTheme = (urlParams && urlParams.get("theme")) || localStorage.getItem("lumina_theme") || "default";
        this._saveTimer = null;
        this.init();
    }

    init() {
        this.applyTheme(this.currentTheme);
        this.bindEvents();
        this.loadSessions();

        // Always collapsed by default on all screens
        this.closeSidebar();
    }

    bindEvents() {
        // Sidebar Toggle, Close, & Backdrop
        const btnToggleSidebar = document.getElementById("btn-toggle-sidebar");
        const btnCloseSidebar = document.getElementById("btn-close-sidebar");
        const backdrop = document.getElementById("sidebar-backdrop");

        if (btnToggleSidebar) {
            btnToggleSidebar.addEventListener("click", (e) => {
                e.stopPropagation();
                this.toggleSidebar();
            });
        }
        if (btnCloseSidebar) {
            btnCloseSidebar.addEventListener("click", (e) => {
                e.stopPropagation();
                this.closeSidebar();
            });
        }
        if (backdrop) {
            backdrop.addEventListener("click", () => this.closeSidebar());
        }

        // Close sidebar when clicking outside on the document
        document.addEventListener("click", (e) => {
            const sidebar = document.getElementById("sidebar");
            const btnToggleSidebar = document.getElementById("btn-toggle-sidebar");
            if (sidebar && sidebar.classList.contains("open")) {
                if (!sidebar.contains(e.target) && !btnToggleSidebar?.contains(e.target)) {
                    this.closeSidebar();
                }
            }
        });

        // Close sidebar on Escape key
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                this.closeSidebar();
            }
        });

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
            window.voiceController?.detectTtsEngine();
        };

        if (btnOpenSettings) btnOpenSettings.addEventListener("click", openSettings);
        if (btnSidebarSettings) btnSidebarSettings.addEventListener("click", openSettings);
        if (btnCloseSettings) btnCloseSettings.addEventListener("click", () => settingsModal?.classList.add("hidden"));
        if (btnSaveSettings) btnSaveSettings.addEventListener("click", () => settingsModal?.classList.add("hidden"));

        // Settings Tab Switcher (Appearance & Voice vs Model & Inference)
        const settingsTabBtns = document.querySelectorAll(".settings-tab-btn");
        const settingsTabPanes = document.querySelectorAll(".settings-tab-pane");

        settingsTabBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                const targetTab = btn.getAttribute("data-tab");
                settingsTabBtns.forEach(b => {
                    b.classList.remove("text-slate-200", "bg-slate-800", "border", "border-slate-700/80", "shadow-sm");
                    b.classList.add("text-slate-400");
                });
                btn.classList.add("text-slate-200", "bg-slate-800", "border", "border-slate-700/80", "shadow-sm");
                btn.classList.remove("text-slate-400");

                settingsTabPanes.forEach(pane => {
                    if (pane.id === `settings-tab-${targetTab}`) {
                        pane.classList.remove("hidden");
                    } else {
                        pane.classList.add("hidden");
                    }
                });

                if (targetTab === "appearance-voice") {
                    window.voiceController?.detectTtsEngine();
                }
            });
        });

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
                    window.luminaStorage?.delete("lumina_sessions");
                    this.sessions = [];
                    this.createNewSession();
                    document.getElementById("settings-modal")?.classList.add("hidden");
                }
            });
        }

        // 6. Optional Security Token Input
        const tokenInput = document.getElementById("settings-auth-token");
        if (tokenInput) {
            tokenInput.value = localStorage.getItem("lumina_auth_token") || "";
            tokenInput.addEventListener("input", (e) => {
                const val = e.target.value.trim();
                if (val) {
                    localStorage.setItem("lumina_auth_token", val);
                } else {
                    localStorage.removeItem("lumina_auth_token");
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

    // Universal Floating Sidebar Drawer Methods (Overlay across Chat Window)
    openSidebar() {
        const sidebar = document.getElementById("sidebar");
        const backdrop = document.getElementById("sidebar-backdrop");

        if (sidebar) {
            sidebar.classList.add("open");
            sidebar.classList.remove("collapsed");
            sidebar.style.setProperty("z-index", "9999", "important");
            sidebar.style.setProperty("transform", "translateX(0)", "important");
            sidebar.style.setProperty("visibility", "visible", "important");
            sidebar.style.setProperty("pointer-events", "auto", "important");
        }
        if (backdrop) {
            backdrop.classList.remove("hidden");
            backdrop.style.setProperty("z-index", "9998", "important");
        }
    }

    closeSidebar() {
        const sidebar = document.getElementById("sidebar");
        const backdrop = document.getElementById("sidebar-backdrop");

        if (sidebar) {
            sidebar.classList.remove("open");
            sidebar.classList.add("collapsed");
            sidebar.style.setProperty("transform", "translateX(-100%)", "important");
            sidebar.style.setProperty("pointer-events", "none", "important");
        }
        if (backdrop) {
            backdrop.classList.add("hidden");
        }
    }

    toggleSidebar() {
        const sidebar = document.getElementById("sidebar");
        if (!sidebar) return;

        if (sidebar.classList.contains("open")) {
            this.closeSidebar();
        } else {
            this.openSidebar();
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
        if (this.snowAnimFrame) {
            cancelAnimationFrame(this.snowAnimFrame);
            this.snowAnimFrame = null;
        }
        if (this.ambientAnimFrame) {
            cancelAnimationFrame(this.ambientAnimFrame);
            this.ambientAnimFrame = null;
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
        } else if (themeName === "snowforest" || themeName === "glacier") {
            const isGlacier = themeName === "glacier";
            const canvas = document.createElement("canvas");
            canvas.className = "w-full h-full pointer-events-none";
            layer.appendChild(canvas);

            const ctx = canvas.getContext("2d");
            const resizeCanvas = () => {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            };
            resizeCanvas();
            this._resizeHandler = resizeCanvas;
            window.addEventListener("resize", resizeCanvas);

            // Blizzard particle density for Glacier (3-4x more snow), gentle snowfall for Snowforest
            const FLAKE_COUNT = isGlacier 
                ? Math.min(340, Math.max(180, Math.floor(window.innerWidth / 4.8)))
                : Math.min(95, Math.max(45, Math.floor(window.innerWidth / 16)));
            const flakes = [];

            // Visible tile ledges cache (refreshed periodically to avoid layout thrashing)
            let tileLedges = [];
            const updateLedges = () => {
                const elements = document.querySelectorAll(
                    ".message-bubble-wrapper > div, #chat-input, #chat-input-wrapper, .hud-card, .example-card, #header-model-pill"
                );
                const list = [];
                elements.forEach(el => {
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 20 && rect.top > 0 && rect.top < window.innerHeight) {
                        list.push({
                            left: rect.left,
                            right: rect.right,
                            top: rect.top,
                        });
                    }
                });
                tileLedges = list;
            };
            updateLedges();

            let frameCount = 0;

            const createFlake = (initialY = null, initialX = null) => {
                const isStreak = isGlacier && Math.random() < 0.20; // 20% flurry wind streaks in blizzard
                return {
                    x: initialX !== null ? initialX : Math.random() * (canvas.width + 100) - 50,
                    y: initialY !== null ? initialY : Math.random() * canvas.height,
                    radius: isGlacier ? (0.8 + Math.random() * 2.4) : (1.0 + Math.random() * 2.2),
                    speedY: isGlacier ? (1.6 + Math.random() * 3.4) : (0.6 + Math.random() * 1.3),
                    speedX: isGlacier ? (1.8 + Math.random() * 3.2) : 0,
                    sway: Math.random() * Math.PI * 2,
                    swaySpeed: 0.015 + Math.random() * 0.03,
                    opacity: isGlacier ? (0.35 + Math.random() * 0.6) : (0.35 + Math.random() * 0.55),
                    landed: false,
                    isStreak: isStreak,
                    meltTimer: 0,
                    maxMelt: isGlacier ? (120 + Math.floor(Math.random() * 180)) : (180 + Math.floor(Math.random() * 240)),
                };
            };

            for (let i = 0; i < FLAKE_COUNT; i++) {
                flakes.push(createFlake());
            }

            const animateSnow = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                frameCount++;
                if (frameCount % 60 === 0) {
                    updateLedges();
                }

                // Blizzard wind gusts that pulse across the screen
                const windGust = isGlacier ? (1.6 + Math.sin(frameCount * 0.018) * 1.4) : 0;

                for (let i = 0; i < flakes.length; i++) {
                    const f = flakes[i];

                    if (f.landed) {
                        f.meltTimer++;
                        const meltRatio = Math.max(0, 1 - (f.meltTimer / f.maxMelt));
                        ctx.fillStyle = isGlacier 
                            ? `rgba(186, 230, 253, ${f.opacity * meltRatio})`
                            : `rgba(240, 253, 244, ${f.opacity * meltRatio})`;
                        ctx.beginPath();
                        ctx.arc(f.x, f.y, f.radius * (0.8 + 0.2 * meltRatio), 0, Math.PI * 2);
                        ctx.fill();

                        if (f.meltTimer >= f.maxMelt) {
                            flakes[i] = createFlake(-10);
                        }
                        continue;
                    }

                    // Update position: diagonal flurry rush in blizzard, gentle sway in snowforest
                    if (isGlacier) {
                        f.x += f.speedX + windGust;
                        f.y += f.speedY;
                    } else {
                        f.sway += f.swaySpeed;
                        f.x += Math.sin(f.sway) * 0.65;
                        f.y += f.speedY;
                    }

                    // Collision check with horizontal tile ledges (sheets of ice)
                    if (!f.isStreak) {
                        for (let j = 0; j < tileLedges.length; j++) {
                            const ledge = tileLedges[j];
                            if (
                                f.y >= ledge.top - 1 &&
                                f.y <= ledge.top + 4 &&
                                f.x >= ledge.left &&
                                f.x <= ledge.right
                            ) {
                                if (Math.random() < 0.65) {
                                    f.landed = true;
                                    f.y = ledge.top;
                                    break;
                                }
                            }
                        }
                    }

                    // Render snowflake particle
                    if (f.isStreak && isGlacier) {
                        // High-speed blizzard flurry streak
                        ctx.strokeStyle = `rgba(186, 230, 253, ${f.opacity * 0.8})`;
                        ctx.lineWidth = 1.3;
                        ctx.beginPath();
                        ctx.moveTo(f.x, f.y);
                        ctx.lineTo(f.x - (f.speedX + windGust) * 2.2, f.y - f.speedY * 1.8);
                        ctx.stroke();
                    } else {
                        ctx.fillStyle = isGlacier
                            ? `rgba(147, 197, 253, ${f.opacity * 0.92})`
                            : `rgba(240, 253, 244, ${f.opacity})`;
                        ctx.beginPath();
                        ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
                        ctx.fill();

                        // Soft icy azure glow around larger flakes
                        if (f.radius > 2.0) {
                            ctx.fillStyle = isGlacier
                                ? `rgba(56, 189, 248, ${f.opacity * 0.4})`
                                : `rgba(167, 243, 208, ${f.opacity * 0.25})`;
                            ctx.beginPath();
                            ctx.arc(f.x, f.y, f.radius * 1.8, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    }

                    // Wrap-around / reset out of bounds
                    if (isGlacier) {
                        if (f.x > canvas.width + 40 || f.y > canvas.height + 20) {
                            if (Math.random() < 0.65) {
                                // Re-enter from the top
                                flakes[i] = createFlake(-10, Math.random() * canvas.width - 50);
                            } else {
                                // Re-enter from the left windward edge
                                flakes[i] = createFlake(Math.random() * canvas.height, -25);
                            }
                        }
                    } else {
                        if (f.y > canvas.height + 5 || f.x < -10 || f.x > canvas.width + 10) {
                            flakes[i] = createFlake(-5);
                        }
                    }
                }

                this.snowAnimFrame = requestAnimationFrame(animateSnow);
            };

            this.snowAnimFrame = requestAnimationFrame(animateSnow);
        } else if (themeName === "cyberpunk") {
            const canvas = document.createElement("canvas");
            canvas.className = "w-full h-full pointer-events-none opacity-40";
            layer.appendChild(canvas);

            const ctx = canvas.getContext("2d");
            const resizeCanvas = () => {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            };
            resizeCanvas();
            this._resizeHandler = resizeCanvas;
            window.addEventListener("resize", resizeCanvas);

            // Cyberpunk Static Grid with High-Speed Neon Data Runners
            const RUNNER_COUNT = 12;
            const horizCount = 18;

            const initRunner = () => ({
                gridY: Math.floor(Math.random() * 14) + 2,
                lane: (Math.random() - 0.5) * 16,
                dir: Math.random() < 0.5 ? "forward" : (Math.random() < 0.5 ? "left" : "right"),
                speed: 0.04 + Math.random() * 0.05,
                color: Math.random() < 0.45 ? "#00f0ff" : (Math.random() < 0.75 ? "#fcee0a" : "#ff003c"),
                trail: [],
                maxTrail: 16 + Math.floor(Math.random() * 14)
            });

            const runners = [];
            for (let r = 0; r < RUNNER_COUNT; r++) {
                runners.push(initRunner());
            }

            const animateCyberpunk = () => {
                const w = canvas.width;
                const h = canvas.height;
                const horizon = h * 0.48;
                const vanishingX = w * 0.5;

                ctx.clearRect(0, 0, w, h);

                // Horizon Cyber Glow
                const cyberGrad = ctx.createRadialGradient(vanishingX, horizon, 10, vanishingX, horizon, w * 0.45);
                cyberGrad.addColorStop(0, "rgba(0, 240, 255, 0.35)");
                cyberGrad.addColorStop(0.5, "rgba(255, 0, 60, 0.15)");
                cyberGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
                ctx.fillStyle = cyberGrad;
                ctx.fillRect(0, 0, w, horizon + 50);

                const getScreenPos = (lane, normY) => {
                    const y = horizon + Math.pow(normY, 2.0) * (h - horizon);
                    const spread = (w * 1.5) / 16;
                    const x = vanishingX + (lane * spread * normY);
                    return { x, y };
                };

                // 1. STATIC Horizontal Grid Lines (No scroll offset — perfectly stationary)
                ctx.lineWidth = 1.2;
                for (let i = 1; i <= horizCount; i++) {
                    const norm = i / horizCount; // STATIC!
                    const y = horizon + Math.pow(norm, 2.0) * (h - horizon);
                    const alpha = Math.min(0.8, Math.pow(norm, 1.3));
                    ctx.strokeStyle = (i % 4 === 0)
                        ? `rgba(252, 238, 10, ${alpha * 0.5})`
                        : `rgba(0, 240, 255, ${alpha * 0.55})`;
                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(w, y);
                    ctx.stroke();
                }

                // 2. STATIC Longitudinal Radiating Grid Lines
                for (let l = -12; l <= 12; l++) {
                    const p1 = getScreenPos(l, 0.05);
                    const p2 = getScreenPos(l, 1.0);
                    const isCenter = Math.abs(l) <= 1;
                    ctx.strokeStyle = isCenter ? "rgba(255, 0, 60, 0.45)" : "rgba(0, 240, 255, 0.3)";
                    ctx.lineWidth = isCenter ? 1.5 : 1.0;
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                }

                // 3. Neon Data / Lightcycle Runners traversing the Static Grid
                ctx.save();
                for (let i = 0; i < runners.length; i++) {
                    const r = runners[i];

                    if (r.dir === "forward") {
                        r.gridY += r.speed;
                        if (Math.random() < 0.06 && r.gridY > 2 && r.gridY < horizCount - 2) {
                            r.dir = Math.random() < 0.5 ? "left" : "right";
                        }
                    } else if (r.dir === "left") {
                        r.lane -= r.speed * 1.8;
                        if (Math.random() < 0.07) r.dir = "forward";
                    } else if (r.dir === "right") {
                        r.lane += r.speed * 1.8;
                        if (Math.random() < 0.07) r.dir = "forward";
                    }

                    if (r.gridY >= horizCount || Math.abs(r.lane) > 12 || r.gridY <= 0) {
                        runners[i] = initRunner();
                        continue;
                    }

                    const pos = getScreenPos(r.lane, r.gridY / horizCount);
                    r.trail.push(pos);
                    if (r.trail.length > r.maxTrail) r.trail.shift();

                    if (r.trail.length > 1) {
                        for (let t = 1; t < r.trail.length; t++) {
                            const alpha = (t / r.trail.length) * 0.9;
                            ctx.strokeStyle = r.color;
                            ctx.globalAlpha = alpha;
                            ctx.lineWidth = 2.2;
                            ctx.shadowColor = r.color;
                            ctx.shadowBlur = 6;
                            ctx.beginPath();
                            ctx.moveTo(r.trail[t - 1].x, r.trail[t - 1].y);
                            ctx.lineTo(r.trail[t].x, r.trail[t].y);
                            ctx.stroke();
                        }
                        ctx.fillStyle = "#ffffff";
                        ctx.globalAlpha = 1.0;
                        ctx.beginPath();
                        ctx.arc(pos.x, pos.y, 2.5, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
                ctx.restore();

                this.ambientAnimFrame = requestAnimationFrame(animateCyberpunk);
            };

            this.ambientAnimFrame = requestAnimationFrame(animateCyberpunk);
        } else if (themeName === "synthwave") {
            const canvas = document.createElement("canvas");
            canvas.className = "w-full h-full pointer-events-none opacity-45";
            layer.appendChild(canvas);

            const ctx = canvas.getContext("2d");
            const resizeCanvas = () => {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            };
            resizeCanvas();
            this._resizeHandler = resizeCanvas;
            window.addEventListener("resize", resizeCanvas);

            // Generate skyline buildings
            const buildings = [];
            let bx = 0;
            while (bx < 2560) {
                const bw = 35 + Math.random() * 65;
                const bh = 50 + Math.random() * 140;
                const windows = [];
                for (let wy = 15; wy < bh - 10; wy += 12) {
                    for (let wx = 6; wx < bw - 6; wx += 9) {
                        if (Math.random() < 0.4) {
                            windows.push({
                                x: wx,
                                y: wy,
                                color: Math.random() < 0.5 ? "#00fffb" : (Math.random() < 0.8 ? "#fcee0a" : "#ff2a85"),
                                lit: Math.random() < 0.75
                            });
                        }
                    }
                }
                buildings.push({ x: bx, width: bw, height: bh, windows });
                bx += bw + (Math.random() * 12 - 4);
            }

            let roadOffset = 0;
            const animateSynthwave = () => {
                const w = canvas.width;
                const h = canvas.height;
                const horizon = h * 0.52;
                const vanishingX = w * 0.5;

                ctx.clearRect(0, 0, w, h);

                // 1. Digital Sun at Horizon (Synthwave Yellow to Magenta to Violet)
                const sunRadius = Math.min(w, h) * 0.18;
                const sunY = horizon - sunRadius * 0.25;

                const sunGrad = ctx.createLinearGradient(0, sunY - sunRadius, 0, sunY + sunRadius);
                sunGrad.addColorStop(0, "#ffe600");
                sunGrad.addColorStop(0.5, "#ff0055");
                sunGrad.addColorStop(1, "#7900ff");

                ctx.save();
                ctx.fillStyle = sunGrad;
                ctx.beginPath();
                ctx.arc(vanishingX, sunY, sunRadius, 0, Math.PI * 2);
                ctx.fill();

                // Sun horizontal digital scanline blind bars
                ctx.fillStyle = "#130722";
                for (let sy = sunY - sunRadius * 0.1; sy < sunY + sunRadius; sy += 7) {
                    const barHeight = 2.5 + ((sy - (sunY - sunRadius * 0.1)) / (sunRadius * 1.1)) * 3;
                    ctx.fillRect(vanishingX - sunRadius - 10, sy, (sunRadius + 10) * 2, barHeight);
                }
                ctx.restore();

                // 2. City Skyline Silhouettes
                ctx.save();
                const skylineShift = (w > 2000) ? 0 : (vanishingX - 800);
                for (const b of buildings) {
                    const screenX = b.x + skylineShift;
                    if (screenX + b.width < -100 || screenX > w + 100) continue;
                    const screenY = horizon - b.height;

                    ctx.fillStyle = "#0c0417";
                    ctx.fillRect(screenX, screenY, b.width, b.height);
                    ctx.strokeStyle = "rgba(255, 42, 133, 0.25)";
                    ctx.lineWidth = 1;
                    ctx.strokeRect(screenX, screenY, b.width, b.height);

                    for (const win of b.windows) {
                        if (win.lit) {
                            ctx.fillStyle = win.color;
                            ctx.shadowColor = win.color;
                            ctx.shadowBlur = 4;
                            ctx.fillRect(screenX + win.x, screenY + win.y, 4, 6);
                        }
                    }
                    ctx.shadowBlur = 0;
                }
                ctx.restore();

                // 3. Moving Perspective Highway Ground Grid
                ctx.save();
                roadOffset = (roadOffset + 0.007) % 1;

                ctx.lineWidth = 1.2;
                for (let i = 1; i <= 22; i++) {
                    const norm = (i + roadOffset) / 22;
                    const y = horizon + Math.pow(norm, 2.2) * (h - horizon);
                    const alpha = Math.min(0.85, Math.pow(norm, 1.5));
                    ctx.strokeStyle = `rgba(255, 42, 133, ${alpha * 0.65})`;
                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(w, y);
                    ctx.stroke();
                }

                const lanes = 18;
                for (let j = -lanes; j <= lanes; j++) {
                    const spread = (w * 1.8) / lanes;
                    const bottomX = vanishingX + j * spread;
                    const isHighwayCenter = Math.abs(j) <= 2;

                    ctx.strokeStyle = isHighwayCenter ? "rgba(0, 255, 251, 0.75)" : "rgba(114, 9, 183, 0.5)";
                    ctx.lineWidth = isHighwayCenter ? 1.8 : 1.1;

                    ctx.beginPath();
                    ctx.moveTo(vanishingX + (j * 4), horizon);
                    ctx.lineTo(bottomX, h);
                    ctx.stroke();
                }

                // Horizon neon glow
                const horizGrad = ctx.createLinearGradient(0, horizon - 8, 0, horizon + 8);
                horizGrad.addColorStop(0, "rgba(255, 42, 133, 0)");
                horizGrad.addColorStop(0.5, "rgba(255, 42, 133, 0.85)");
                horizGrad.addColorStop(1, "rgba(0, 255, 251, 0)");
                ctx.fillStyle = horizGrad;
                ctx.fillRect(0, horizon - 8, w, 16);

                ctx.restore();

                this.ambientAnimFrame = requestAnimationFrame(animateSynthwave);
            };

            this.ambientAnimFrame = requestAnimationFrame(animateSynthwave);
        } else if (themeName === "pirate") {
            const canvas = document.createElement("canvas");
            canvas.className = "w-full h-full pointer-events-none opacity-50";
            layer.appendChild(canvas);

            const ctx = canvas.getContext("2d");
            const resizeCanvas = () => {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            };
            resizeCanvas();
            this._resizeHandler = resizeCanvas;
            window.addEventListener("resize", resizeCanvas);

            // Rising warm sea-lantern embers & drifting sea mist
            const EMBER_COUNT = 45;
            const embers = [];
            for (let i = 0; i < EMBER_COUNT; i++) {
                embers.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    radius: 1.0 + Math.random() * 2.2,
                    speedY: 0.35 + Math.random() * 0.85,
                    sway: Math.random() * Math.PI * 2,
                    swaySpeed: 0.01 + Math.random() * 0.02,
                    color: Math.random() < 0.65 ? "#d4af37" : (Math.random() < 0.85 ? "#f59e0b" : "#0d9488"),
                    opacity: 0.3 + Math.random() * 0.5
                });
            }

            const animatePirate = () => {
                const w = canvas.width;
                const h = canvas.height;
                ctx.clearRect(0, 0, w, h);

                ctx.save();
                for (const em of embers) {
                    em.y -= em.speedY;
                    em.sway += em.swaySpeed;
                    em.x += Math.sin(em.sway) * 1.2;

                    if (em.y < -10) {
                        em.y = h + 10;
                        em.x = Math.random() * w;
                    }

                    ctx.fillStyle = em.color;
                    ctx.globalAlpha = em.opacity;
                    ctx.shadowColor = em.color;
                    ctx.shadowBlur = 8;
                    ctx.beginPath();
                    ctx.arc(em.x, em.y, em.radius, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();

                this.ambientAnimFrame = requestAnimationFrame(animatePirate);
            };

            this.ambientAnimFrame = requestAnimationFrame(animatePirate);
        } else if (themeName === "rainbowrave") {
            const canvas = document.createElement("canvas");
            canvas.className = "w-full h-full pointer-events-none opacity-85";
            layer.appendChild(canvas);

            const ctx = canvas.getContext("2d");
            const resizeCanvas = () => {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            };
            resizeCanvas();
            this._resizeHandler = resizeCanvas;
            window.addEventListener("resize", resizeCanvas);

            // Explosive Rainbow Particles & Shockwaves
            const PARTICLE_COUNT = 160;
            const particles = [];

            const initParticle = (forceCenter = false) => {
                const angle = Math.random() * Math.PI * 2;
                const speed = 2.0 + Math.random() * 9.0;
                return {
                    x: canvas.width * 0.5 + (forceCenter ? 0 : (Math.random() - 0.5) * canvas.width * 0.4),
                    y: canvas.height * 0.5 + (forceCenter ? 0 : (Math.random() - 0.5) * canvas.height * 0.4),
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    size: 1.5 + Math.random() * 4.5,
                    hue: Math.floor(Math.random() * 360),
                    alpha: 0.7 + Math.random() * 0.3,
                    decay: 0.008 + Math.random() * 0.015,
                    life: 1.0,
                    trail: []
                };
            };

            for (let i = 0; i < PARTICLE_COUNT; i++) {
                particles.push(initParticle(false));
            }

            let shockwaves = [];
            let tick = 0;
            let currentIntensity = 0;

            const animateRainbowRave = () => {
                const w = canvas.width;
                const h = canvas.height;
                const cx = w * 0.5;
                const cy = h * 0.5;
                tick++;

                // Check generating / thinking state
                const isGenerating = document.body.classList.contains("lumina-generating");
                const isThinking = document.body.classList.contains("lumina-thinking");
                const targetIntensity = isThinking ? 1.35 : (isGenerating ? 1.0 : 0.0);

                // Smooth ramp up and ramp down transition
                currentIntensity += (targetIntensity - currentIntensity) * 0.055;

                ctx.clearRect(0, 0, w, h);

                if (currentIntensity <= 0.01) {
                    // STATIC / CALM RESTING STATE: Single-color deep cosmic obsidian backdrop with subtle prism gradient
                    const calmGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, Math.max(w, h) * 0.7);
                    calmGrad.addColorStop(0, "rgba(24, 8, 48, 0.45)");
                    calmGrad.addColorStop(1, "rgba(9, 3, 20, 0.95)");
                    ctx.fillStyle = calmGrad;
                    ctx.fillRect(0, 0, w, h);

                    // Gentle dormant center gem pulse
                    const dormantGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90);
                    dormantGlow.addColorStop(0, "rgba(255, 0, 128, 0.12)");
                    dormantGlow.addColorStop(0.5, "rgba(0, 240, 255, 0.06)");
                    dormantGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
                    ctx.fillStyle = dormantGlow;
                    ctx.beginPath();
                    ctx.arc(cx, cy, 90, 0, Math.PI * 2);
                    ctx.fill();

                    this.ambientAnimFrame = requestAnimationFrame(animateRainbowRave);
                    return;
                }

                // ==========================================
                // HYPER-COLOR RAINBOW EXPLOSION IN FULL EFFECT!
                // ==========================================

                // 1. Swirling Hyperspeed Rainbow Vortex Backdrop
                ctx.save();
                const vortexGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(w, h) * 0.85);
                const baseHue = (tick * 4) % 360;
                vortexGrad.addColorStop(0, `hsla(${baseHue}, 100%, 65%, ${0.35 * currentIntensity})`);
                vortexGrad.addColorStop(0.25, `hsla(${(baseHue + 60) % 360}, 100%, 60%, ${0.25 * currentIntensity})`);
                vortexGrad.addColorStop(0.5, `hsla(${(baseHue + 140) % 360}, 100%, 55%, ${0.2 * currentIntensity})`);
                vortexGrad.addColorStop(0.75, `hsla(${(baseHue + 220) % 360}, 100%, 50%, ${0.15 * currentIntensity})`);
                vortexGrad.addColorStop(1, "rgba(9, 3, 20, 0.9)");
                ctx.fillStyle = vortexGrad;
                ctx.fillRect(0, 0, w, h);
                ctx.restore();

                // 2. High-speed Rotating Rainbow Light Beams
                ctx.save();
                ctx.translate(cx, cy);
                const beamCount = 16;
                const rot = tick * 0.035 * (currentIntensity + 0.5);
                ctx.rotate(rot);
                for (let b = 0; b < beamCount; b++) {
                    const bAngle = (b / beamCount) * Math.PI * 2;
                    const bHue = (baseHue + b * 22) % 360;
                    ctx.fillStyle = `hsla(${bHue}, 100%, 60%, ${0.12 * currentIntensity})`;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.arc(0, 0, Math.max(w, h), bAngle - 0.08, bAngle + 0.08);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();

                // 3. Spawning Concentric Rainbow Shockwave Rings
                if (tick % (isThinking ? 12 : 18) === 0 && currentIntensity > 0.25) {
                    shockwaves.push({
                        radius: 10,
                        speed: 7 + Math.random() * 7,
                        maxRadius: Math.max(w, h) * 0.85,
                        hue: (tick * 6) % 360,
                        lineWidth: 4 + Math.random() * 6,
                        alpha: 0.95 * currentIntensity
                    });
                }

                for (let s = shockwaves.length - 1; s >= 0; s--) {
                    const sw = shockwaves[s];
                    sw.radius += sw.speed;
                    sw.alpha *= 0.962;

                    if (sw.radius > sw.maxRadius || sw.alpha <= 0.02) {
                        shockwaves.splice(s, 1);
                        continue;
                    }

                    ctx.save();
                    ctx.strokeStyle = `hsla(${sw.hue}, 100%, 65%, ${sw.alpha})`;
                    ctx.lineWidth = sw.lineWidth;
                    ctx.shadowColor = `hsl(${sw.hue}, 100%, 50%)`;
                    ctx.shadowBlur = 16;
                    ctx.beginPath();
                    ctx.arc(cx, cy, sw.radius, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                }

                // 4. Explosive Rainbow Particles Blasting Outward
                ctx.save();
                for (let i = 0; i < particles.length; i++) {
                    const p = particles[i];

                    p.x += p.vx * (1 + currentIntensity * 1.5);
                    p.y += p.vy * (1 + currentIntensity * 1.5);
                    p.hue = (p.hue + 3) % 360;
                    p.life -= p.decay;

                    p.trail.push({ x: p.x, y: p.y });
                    if (p.trail.length > 8) p.trail.shift();

                    if (p.life <= 0 || p.x < -100 || p.x > w + 100 || p.y < -100 || p.y > h + 100) {
                        particles[i] = initParticle(true);
                        continue;
                    }

                    // Draw trail
                    if (p.trail.length > 1) {
                        ctx.beginPath();
                        ctx.moveTo(p.trail[0].x, p.trail[0].y);
                        for (let t = 1; t < p.trail.length; t++) {
                            ctx.lineTo(p.trail[t].x, p.trail[t].y);
                        }
                        ctx.strokeStyle = `hsla(${p.hue}, 100%, 60%, ${p.life * 0.7 * currentIntensity})`;
                        ctx.lineWidth = p.size * 0.7;
                        ctx.stroke();
                    }

                    // Particle head
                    ctx.fillStyle = `hsla(${p.hue}, 100%, 75%, ${p.life * currentIntensity})`;
                    ctx.shadowColor = `hsl(${p.hue}, 100%, 50%)`;
                    ctx.shadowBlur = 10;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();

                this.ambientAnimFrame = requestAnimationFrame(animateRainbowRave);
            };

            this.ambientAnimFrame = requestAnimationFrame(animateRainbowRave);
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
    async loadSessions() {
        if (this.isIncognito) return;
        try {
            // 1. Check IndexedDB first
            let stored = await window.luminaStorage?.get("lumina_sessions");

            // 2. If nothing in IndexedDB, check localStorage for legacy sessions to migrate
            if (!stored || (Array.isArray(stored) && stored.length === 0)) {
                const legacy = localStorage.getItem("lumina_sessions");
                if (legacy) {
                    try {
                        stored = JSON.parse(legacy);
                        if (Array.isArray(stored) && stored.length > 0) {
                            await window.luminaStorage?.set("lumina_sessions", stored);
                            localStorage.removeItem("lumina_sessions");
                        }
                    } catch (e) {}
                }
            }
            this.sessions = Array.isArray(stored) ? stored : [];
        } catch (e) {
            console.warn("Failed to load sessions from IndexedDB:", e);
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
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(async () => {
            try {
                const stripped = this.sessions.map(s => ({
                    ...s,
                    messages: s.messages.map(m => {
                        if (m.imagePreviews) {
                            return { ...m, imagePreviews: m.imagePreviews.map(() => "[image]") };
                        }
                        return m;
                    }),
                }));
                await window.luminaStorage?.set("lumina_sessions", stripped);
            } catch (e) {
                console.warn("Failed to save sessions to IndexedDB:", e);
            }
        }, 500);
    }

    createNewSession() {
        const id = "sess_" + (window.crypto?.randomUUID ? window.crypto.randomUUID() : (Date.now() + "_" + Math.random().toString(36).substring(2)));
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

        if (window.chatManager) {
            window.chatManager.currentMessages = [];
            window.chatManager.isWebSearchActive = false;
            window.chatManager.updateWebSearchButtonUI();
        }

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
                window.chatManager?.renderMessageUI(msg.role, msg.content, msg.imagePreviews, msg.sources, msg.thinking);
            });
        }
        if (window.chatManager) {
            window.chatManager.currentMessages = [...sess.messages];
            window.chatManager.checkBackgroundChat(id);
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

        if (!listEl.dataset.bound) {
            listEl.dataset.bound = "true";
            listEl.addEventListener("click", (e) => {
                const deleteBtn = e.target.closest("[data-action='delete-session']");
                if (deleteBtn && deleteBtn.dataset.id) {
                    e.stopPropagation();
                    this.deleteSession(deleteBtn.dataset.id, e);
                    return;
                }
                const tab = e.target.closest(".session-tab");
                if (tab && tab.dataset.id) {
                    this.switchSession(tab.dataset.id);
                }
            });
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
                }" data-id="${safeId}">
                    <span class="truncate max-w-[180px]">${safeTitle}</span>
                    <button class="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 transition p-1 text-sm leading-none" data-action="delete-session" data-id="${safeId}" title="Delete Chat">
                        &times;
                    </button>
                </div>
            `;
        }).join("");
    }
}

window.app = new App();
