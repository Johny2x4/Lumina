// Lumina UI — Gemini Live Voice Mode & Speech Visualizer
class VoiceController {
    constructor() {
        this.isActive = false;
        this.state = "idle"; // "idle" | "listening" | "thinking" | "speaking" | "muted"
        this.isMuted = false;

        this.recognition = null;
        this.synth = window.speechSynthesis;
        this.currentUtterance = null;

        // Web Audio API for Speech Visualizer & iOS Autoplay Unlocking
        this.audioCtx = null;
        this.playbackAudioCtx = null;
        this.currentAudioSource = null;
        this.unlockedAudio = null;
        this.analyser = null;
        this.audioStream = null;
        this.dataArray = null;
        this.animationId = null;

        // Visualizer animation parameters
        this.canvas = null;
        this.ctx = null;
        this.phase = 0;
        this.currentVolume = 0;
        this.targetVolume = 0;

        // TTS Neural Engine vs Browser Synthesizer
        this.ttsEngine = "browser"; // "kokoro" | "browser"
        this.kokoroVoices = [];
        this.selectedKokoroVoice = localStorage.getItem("lumina_kokoro_voice") || "af_heart";
        this.activeAudio = null;

        // Browser TTS Voice Customization
        this.voices = [];
        this.selectedVoiceURI = localStorage.getItem("lumina_tts_voice") || "";
        this.watchdogTimer = null;

        // Diverse Visualizer State
        this.visualizerParticles = [];
        this.spectrumPeaks = new Array(24).fill(0);

        this.init();
    }

    async init() {
        await this.detectTtsEngine();
        this.initVoices();
        this.setupRecognition();
        this.bindEvents();
    }

    async detectTtsEngine() {
        try {
            const res = await fetch("/api/voice/status");
            if (res.ok) {
                const data = await res.json();
                if (data.available && data.engine === "kokoro") {
                    this.ttsEngine = "kokoro";
                    this.kokoroVoices = data.voices || [];
                    this.updateVoiceSelectUI();
                    return;
                }
            }
        } catch (e) {}
        this.ttsEngine = "browser";
        this.updateVoiceSelectUI();
    }

    updateVoiceSelectUI() {
        const select = document.getElementById("settings-tts-voice-select");
        const statusBadge = document.getElementById("tts-engine-badge");
        if (!select) return;

        if (this.ttsEngine === "kokoro" && this.kokoroVoices.length > 0) {
            if (statusBadge) {
                statusBadge.innerHTML = `
                    <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-sm">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        Local Neural TTS (Kokoro-82M)
                    </span>
                `;
            }
            select.innerHTML = this.kokoroVoices.map(v => {
                const isSelected = v.id === this.selectedKokoroVoice ? "selected" : "";
                return `<option value="${v.id}" ${isSelected}>✨ ${v.name}</option>`;
            }).join("");
            if (this.selectedKokoroVoice) {
                select.value = this.selectedKokoroVoice;
            }
            return;
        }

        // Browser fallback
        if (statusBadge) {
            statusBadge.innerHTML = `
                <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-500/15 text-slate-300 border border-slate-500/30">
                    Browser Synthesizer (Fallback)
                </span>
            `;
        }
        this.populateVoiceList();
    }

    initVoices() {
        if (!this.synth) return;
        this.populateVoiceList();
        if (this.synth.onvoiceschanged !== undefined) {
            this.synth.onvoiceschanged = () => this.populateVoiceList();
        }
    }

    populateVoiceList() {
        if (this.ttsEngine === "kokoro") return;
        if (!this.synth) return;
        this.voices = this.synth.getVoices();
        const select = document.getElementById("settings-tts-voice-select");
        if (!select) return;

        if (this.voices.length === 0) {
            select.innerHTML = `<option value="">System Default Voice</option>`;
            return;
        }

        const en = this.voices.filter(v => v.lang.startsWith("en"));
        const other = this.voices.filter(v => !v.lang.startsWith("en"));
        const sorted = [...en, ...other];

        select.innerHTML = `
            <option value="">Default System Persona</option>
            ${sorted.map(v => {
                const id = v.voiceURI || v.name;
                return `<option value="${id}">${v.name} (${v.lang})</option>`;
            }).join("")}
        `;

        if (this.selectedVoiceURI) {
            select.value = this.selectedVoiceURI;
        }
    }

    setupRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn("SpeechRecognition not supported by browser.");
            const btn = document.getElementById("btn-voice-toggle");
            if (btn) btn.classList.add("opacity-50", "cursor-not-allowed");
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = "en-US";

        this.recognition.onstart = () => {
            if (this.isActive && !this.isMuted && this.state !== "speaking") {
                this.setState("listening");
            }
        };

        this.recognition.onresult = (event) => {
            if (!this.isActive || this.isMuted || this.state === "speaking") return;

            let interim = "";
            let final = "";

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    final += event.results[i][0].transcript;
                } else {
                    interim += event.results[i][0].transcript;
                }
            }

            const userSub = document.getElementById("live-voice-user-sub");
            if (userSub) {
                userSub.textContent = final || interim || "";
            }

            if (final.trim()) {
                this.handleUserSpoke(final.trim());
            }
        };

        this.recognition.onerror = (event) => {
            console.error("Speech recognition error:", event.error);
            if (this.isActive && !this.isMuted && this.state !== "speaking") {
                setTimeout(() => this.startListening(), 800);
            }
        };

        this.recognition.onend = () => {
            if (this.isActive && !this.isMuted && this.state === "listening") {
                setTimeout(() => this.startListening(), 400);
            }
        };
    }

    bindEvents() {
        // Chat bar & Header voice buttons launch Live Voice Mode
        const btnVoiceToggle = document.getElementById("btn-voice-toggle");
        const btnHeaderVoice = document.getElementById("btn-header-live-voice");

        if (btnVoiceToggle) {
            btnVoiceToggle.addEventListener("click", () => {
                this.unlockAudioPipeline();
                this.enterLiveVoiceMode();
            });
        }
        if (btnHeaderVoice) {
            btnHeaderVoice.addEventListener("click", () => {
                this.unlockAudioPipeline();
                this.enterLiveVoiceMode();
            });
        }

        // Live Voice Overlay Controls
        const btnClose = document.getElementById("btn-close-live-voice");
        const btnEnd = document.getElementById("btn-live-end");
        const btnMicToggle = document.getElementById("btn-live-mic-toggle");
        const btnInterrupt = document.getElementById("btn-live-interrupt");

        if (btnClose) btnClose.addEventListener("click", () => this.exitLiveVoiceMode());
        if (btnEnd) btnEnd.addEventListener("click", () => this.exitLiveVoiceMode());

        if (btnMicToggle) {
            btnMicToggle.addEventListener("click", () => {
                this.unlockAudioPipeline();
                this.toggleMute();
            });
        }

        if (btnInterrupt) {
            btnInterrupt.addEventListener("click", () => this.interruptAI());
        }

        // Settings TTS Voice Controls
        const voiceSelect = document.getElementById("settings-tts-voice-select");
        if (voiceSelect) {
            voiceSelect.addEventListener("change", (e) => {
                if (this.ttsEngine === "kokoro") {
                    this.selectedKokoroVoice = e.target.value;
                    localStorage.setItem("lumina_kokoro_voice", this.selectedKokoroVoice);
                } else {
                    this.selectedVoiceURI = e.target.value;
                    localStorage.setItem("lumina_tts_voice", this.selectedVoiceURI);
                }
            });
        }

        const btnTest = document.getElementById("btn-test-voice");
        if (btnTest) {
            btnTest.addEventListener("click", () => {
                this.unlockAudioPipeline();
                this.speakTest("Hello! This is Lumina AI speaking with natural neural voice.");
            });
        }
    }

    unlockAudioPipeline() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!this.playbackAudioCtx) {
                this.playbackAudioCtx = new AudioContext();
            }
            if (this.playbackAudioCtx.state === "suspended") {
                this.playbackAudioCtx.resume();
            }
            const buffer = this.playbackAudioCtx.createBuffer(1, 1, 22050);
            const source = this.playbackAudioCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(this.playbackAudioCtx.destination);
            source.start(0);
        } catch (e) {
            console.warn("Could not unlock Web Audio:", e);
        }

        try {
            if (!this.unlockedAudio) {
                this.unlockedAudio = new Audio();
            }
            this.unlockedAudio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
            this.unlockedAudio.play().then(() => {
                this.unlockedAudio.pause();
            }).catch(() => {});
        } catch (e) {
            console.warn("Could not unlock HTML5 Audio:", e);
        }
    }

    async enterLiveVoiceMode() {
        this.isActive = true;
        this.unlockAudioPipeline();
        await this.detectTtsEngine();
        const overlay = document.getElementById("live-voice-overlay");
        const modelPill = document.getElementById("live-voice-model-pill");

        if (overlay) overlay.classList.remove("hidden");
        if (modelPill) {
            modelPill.textContent = window.modelManager?.selectedModel || "Model";
        }

        // Reset subtitles
        const userSub = document.getElementById("live-voice-user-sub");
        const aiSub = document.getElementById("live-voice-ai-sub");
        if (userSub) userSub.textContent = "Listening to your voice...";
        if (aiSub) aiSub.textContent = "";

        // Initialize Web Audio API Analyser
        await this.initAudioAnalyser();

        // Start Canvas Visualizer Loop
        this.initCanvas();

        // Start Speech Recognition
        this.startListening();
    }

    exitLiveVoiceMode() {
        this.isActive = false;
        this.stopListening();
        this.interruptAI();

        const overlay = document.getElementById("live-voice-overlay");
        if (overlay) overlay.classList.add("hidden");

        if (this.currentAudioSource) {
            try { this.currentAudioSource.stop(); } catch (e) {}
            this.currentAudioSource = null;
        }

        // Stop Web Audio Stream & Animation
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
            this.audioStream = null;
        }

        this.setState("idle");
    }

    async initAudioAnalyser() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AudioContext();
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 64;
            this.analyser.smoothingTimeConstant = 0.8;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

            this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const source = this.audioCtx.createMediaStreamSource(this.audioStream);
            source.connect(this.analyser);
        } catch (err) {
            console.warn("Could not initialize microphone analyser for visualizer:", err);
        }
    }

    initCanvas() {
        this.canvas = document.getElementById("live-voice-canvas");
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext("2d");

        const render = () => {
            if (!this.isActive) return;
            this.drawSpeechOrb();
            this.animationId = requestAnimationFrame(render);
        };
        render();
    }

    getThemeConfig() {
        const theme = document.body.getAttribute("data-theme") || "default";
        const configs = {
            default: {
                visualizerType: "radialAura",
                glowColor: "#6366f1",
                colors: {
                    listening: ["#818cf8", "#6366f1", "#38bdf8"],
                    speaking: ["#c084fc", "#a855f7", "#6366f1"],
                    thinking: ["#fb7185", "#a855f7", "#f43f5e"],
                    muted: ["#94a3b8", "#475569", "#334155"]
                },
                glow: {
                    listening: "rgba(99, 102, 241, 0.45)",
                    speaking: "rgba(168, 85, 247, 0.5)",
                    thinking: "rgba(244, 63, 94, 0.45)",
                    muted: "rgba(100, 116, 139, 0.3)"
                }
            },
            amoled: {
                visualizerType: "radialAura",
                glowColor: "#818cf8",
                colors: {
                    listening: ["#ffffff", "#e4e4e7", "#818cf8"],
                    speaking: ["#d4d4d8", "#a1a1aa", "#71717a"],
                    thinking: ["#c084fc", "#818cf8", "#3f3f46"],
                    muted: ["#52525b", "#27272a", "#18181b"]
                },
                glow: {
                    listening: "rgba(255, 255, 255, 0.35)",
                    speaking: "rgba(161, 161, 170, 0.4)",
                    thinking: "rgba(192, 132, 252, 0.4)",
                    muted: "rgba(63, 63, 70, 0.2)"
                }
            },
            cyberpunk: {
                visualizerType: "spectrumAnalyzer",
                glowColor: "#00f0ff",
                colors: {
                    listening: ["#00f0ff", "#fcee0a", "#ff003c"],
                    speaking: ["#ff003c", "#ff2a85", "#00f0ff"],
                    thinking: ["#fcee0a", "#ff003c", "#ffe600"],
                    muted: ["#502040", "#201030", "#100820"]
                },
                glow: {
                    listening: "rgba(0, 240, 255, 0.55)",
                    speaking: "rgba(255, 0, 60, 0.55)",
                    thinking: "rgba(252, 238, 10, 0.55)",
                    muted: "rgba(80, 32, 64, 0.3)"
                }
            },
            matrix: {
                visualizerType: "spectrumAnalyzer",
                glowColor: "#22c55e",
                colors: {
                    listening: ["#86efac", "#22c55e", "#15803d"],
                    speaking: ["#4ade80", "#16a34a", "#14532d"],
                    thinking: ["#a7f3d0", "#10b981", "#047857"],
                    muted: ["#166534", "#14532d", "#052e16"]
                },
                glow: {
                    listening: "rgba(34, 197, 94, 0.5)",
                    speaking: "rgba(74, 222, 128, 0.45)",
                    thinking: "rgba(16, 185, 129, 0.5)",
                    muted: "rgba(22, 101, 52, 0.25)"
                }
            },
            synthwave: {
                visualizerType: "particleField",
                glowColor: "#ff2a85",
                colors: {
                    listening: ["#ff2a85", "#b5179e", "#00fffb"],
                    speaking: ["#00fffb", "#7209b7", "#ff2a85"],
                    thinking: ["#f72585", "#ff007f", "#4cc9f0"],
                    muted: ["#4a154b", "#2d0c30", "#18061a"]
                },
                glow: {
                    listening: "rgba(255, 42, 133, 0.55)",
                    speaking: "rgba(0, 255, 251, 0.55)",
                    thinking: "rgba(247, 37, 133, 0.55)",
                    muted: "rgba(74, 21, 75, 0.3)"
                }
            },
            aurora: {
                visualizerType: "sineRibbon",
                glowColor: "#2dd4bf",
                colors: {
                    listening: ["#2dd4bf", "#38bdf8", "#818cf8"],
                    speaking: ["#38bdf8", "#2dd4bf", "#a78bfa"],
                    thinking: ["#c084fc", "#38bdf8", "#2dd4bf"],
                    muted: ["#134e4a", "#0f3a38", "#082020"]
                },
                glow: {
                    listening: "rgba(45, 212, 191, 0.5)",
                    speaking: "rgba(56, 189, 248, 0.5)",
                    thinking: "rgba(192, 132, 252, 0.5)",
                    muted: "rgba(19, 78, 74, 0.25)"
                }
            },
            snowforest: {
                visualizerType: "organicBlob",
                glowColor: "#34d399",
                colors: {
                    listening: ["#34d399", "#6ee7b7", "#a7f3d0"],
                    speaking: ["#10b981", "#34d399", "#f0fdf4"],
                    thinking: ["#a7f3d0", "#34d399", "#059669"],
                    muted: ["#064e3b", "#065f46", "#022c22"]
                },
                glow: {
                    listening: "rgba(52, 211, 153, 0.55)",
                    speaking: "rgba(16, 185, 129, 0.5)",
                    thinking: "rgba(167, 243, 208, 0.55)",
                    muted: "rgba(6, 78, 59, 0.25)"
                }
            },
            nordic: {
                visualizerType: "radialAura",
                glowColor: "#2563eb",
                colors: {
                    listening: ["#2563eb", "#3b82f6", "#60a5fa"],
                    speaking: ["#1d4ed8", "#2563eb", "#93c5fd"],
                    thinking: ["#60a5fa", "#3b82f6", "#1e40af"],
                    muted: ["#94a3b8", "#64748b", "#475569"]
                },
                glow: {
                    listening: "rgba(37, 99, 235, 0.5)",
                    speaking: "rgba(29, 78, 216, 0.45)",
                    thinking: "rgba(96, 165, 250, 0.5)",
                    muted: "rgba(148, 163, 184, 0.25)"
                }
            },
            paper: {
                visualizerType: "sineRibbon",
                glowColor: "#c2410c",
                colors: {
                    listening: ["#c2410c", "#ea580c", "#f97316"],
                    speaking: ["#9a3412", "#c2410c", "#fb923c"],
                    thinking: ["#fb923c", "#f97316", "#7c2d12"],
                    muted: ["#78716c", "#57534e", "#44403c"]
                },
                glow: {
                    listening: "rgba(194, 65, 12, 0.5)",
                    speaking: "rgba(154, 52, 18, 0.45)",
                    thinking: "rgba(251, 146, 60, 0.5)",
                    muted: "rgba(120, 113, 108, 0.25)"
                }
            },
            alpineday: {
                visualizerType: "organicBlob",
                glowColor: "#2d6a4f",
                colors: {
                    listening: ["#2d6a4f", "#40916c", "#52b788"],
                    speaking: ["#1b4332", "#2d6a4f", "#74c69d"],
                    thinking: ["#52b788", "#40916c", "#081c15"],
                    muted: ["#6b705c", "#588157", "#344e41"]
                },
                glow: {
                    listening: "rgba(45, 106, 79, 0.5)",
                    speaking: "rgba(27, 67, 50, 0.45)",
                    thinking: "rgba(82, 183, 136, 0.5)",
                    muted: "rgba(107, 112, 92, 0.25)"
                }
            },
            pastel: {
                visualizerType: "sineRibbon",
                glowColor: "#ec4899",
                colors: {
                    listening: ["#ec4899", "#c084fc", "#818cf8"],
                    speaking: ["#f472b6", "#a78bfa", "#67e8f9"],
                    thinking: ["#c084fc", "#f472b6", "#fed7aa"],
                    muted: ["#cbd5e1", "#e2e8f0", "#f1f5f9"]
                },
                glow: {
                    listening: "rgba(236, 72, 153, 0.5)",
                    speaking: "rgba(244, 114, 182, 0.45)",
                    thinking: "rgba(192, 132, 252, 0.5)",
                    muted: "rgba(203, 213, 225, 0.25)"
                }
            },
            pastellilac: {
                visualizerType: "sineRibbon",
                glowColor: "#ec4899",
                colors: {
                    listening: ["#ec4899", "#c084fc", "#818cf8"],
                    speaking: ["#f472b6", "#a78bfa", "#67e8f9"],
                    thinking: ["#c084fc", "#f472b6", "#fed7aa"],
                    muted: ["#cbd5e1", "#e2e8f0", "#f1f5f9"]
                },
                glow: {
                    listening: "rgba(236, 72, 153, 0.5)",
                    speaking: "rgba(244, 114, 182, 0.45)",
                    thinking: "rgba(192, 132, 252, 0.5)",
                    muted: "rgba(203, 213, 225, 0.25)"
                }
            },
            pastelprisma: {
                visualizerType: "sineRibbon",
                glowColor: "#0d9488",
                colors: {
                    listening: ["#10b981", "#0284c7", "#f59e0b"],
                    speaking: ["#0284c7", "#8b5cf6", "#10b981"],
                    thinking: ["#f59e0b", "#f43f5e", "#8b5cf6"],
                    muted: ["#94a3b8", "#cbd5e1", "#e2e8f0"]
                },
                glow: {
                    listening: "rgba(16, 185, 129, 0.5)",
                    speaking: "rgba(2, 132, 199, 0.5)",
                    thinking: "rgba(245, 158, 11, 0.5)",
                    muted: "rgba(148, 163, 184, 0.25)"
                }
            },
            glacier: {
                visualizerType: "organicBlob",
                glowColor: "#0284c7",
                colors: {
                    listening: ["#0284c7", "#38bdf8", "#7dd3fc"],
                    speaking: ["#0369a1", "#0284c7", "#bae6fd"],
                    thinking: ["#38bdf8", "#7dd3fc", "#0c4a6e"],
                    muted: ["#94a3b8", "#64748b", "#475569"]
                },
                glow: {
                    listening: "rgba(2, 132, 199, 0.5)",
                    speaking: "rgba(3, 105, 161, 0.45)",
                    thinking: "rgba(56, 189, 248, 0.5)",
                    muted: "rgba(148, 163, 184, 0.25)"
                }
            },
            pirate: {
                visualizerType: "particleField",
                glowColor: "#d4af37",
                colors: {
                    listening: ["#d4af37", "#f59e0b", "#0d9488"],
                    speaking: ["#0d9488", "#d4af37", "#b45309"],
                    thinking: ["#f59e0b", "#d4af37", "#ef4444"],
                    muted: ["#78716c", "#57534e", "#292524"]
                },
                glow: {
                    listening: "rgba(212, 175, 55, 0.55)",
                    speaking: "rgba(13, 148, 136, 0.55)",
                    thinking: "rgba(245, 158, 11, 0.55)",
                    muted: "rgba(120, 113, 108, 0.25)"
                }
            }
        };
        return configs[theme] || configs.default;
    }

    drawSpeechOrb() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;

        ctx.clearRect(0, 0, width, height);

        const cfg = this.getThemeConfig();

        // Get microphone volume
        let micVolume = 0;
        if (this.analyser && !this.isMuted && this.state === "listening") {
            this.analyser.getByteFrequencyData(this.dataArray);
            let sum = 0;
            for (let i = 0; i < this.dataArray.length; i++) {
                sum += this.dataArray[i];
            }
            micVolume = sum / (this.dataArray.length * 255);
        }

        // Smooth volume interpolation
        if (this.state === "speaking") {
            this.targetVolume = 0.35 + Math.sin(this.phase * 3.5) * 0.25;
        } else if (this.state === "thinking") {
            this.targetVolume = 0.15 + Math.sin(this.phase * 4.0) * 0.08;
        } else {
            this.targetVolume = micVolume;
        }

        this.currentVolume += (this.targetVolume - this.currentVolume) * 0.2;
        this.phase += 0.04;

        // Outer Radiant Glow Rings (Themed)
        const glowRadius = 75 + this.currentVolume * 65;
        const glowGrad = ctx.createRadialGradient(centerX, centerY, 30, centerX, centerY, glowRadius * 1.5);
        const activeGlow = cfg.glow[this.state] || cfg.glow.listening;

        glowGrad.addColorStop(0, activeGlow);
        glowGrad.addColorStop(0.7, "rgba(0,0,0,0)");

        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, glowRadius * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Dispatch to Bespoke Theme Visualizer Mode
        const mode = cfg.visualizerType || "radialAura";
        if (mode === "spectrumAnalyzer") {
            this.drawSpectrumAnalyzer(ctx, width, height, centerX, centerY, this.currentVolume, cfg, this.dataArray);
        } else if (mode === "particleField") {
            this.drawParticleField(ctx, centerX, centerY, this.currentVolume, cfg);
        } else if (mode === "sineRibbon") {
            this.drawSineRibbon(ctx, width, height, centerX, centerY, this.currentVolume, cfg);
        } else if (mode === "organicBlob") {
            this.drawOrganicBlob(ctx, centerX, centerY, this.currentVolume, cfg);
        } else {
            // "radialAura"
            this.drawRadialAura(ctx, centerX, centerY, this.currentVolume, cfg, this.dataArray);
        }
    }

    drawRadialAura(ctx, cx, cy, vol, cfg, freqs) {
        const colorSet = cfg.colors[this.state] || cfg.colors.listening;
        const baseR = 52 + vol * 28;

        ctx.save();
        const spikeCount = 36;
        const angleStep = (Math.PI * 2) / spikeCount;

        for (let i = 0; i < spikeCount; i++) {
            const angle = i * angleStep + this.phase * 0.4;
            const freqNorm = (freqs && freqs.length > 0)
                ? (freqs[i % freqs.length] / 255)
                : (0.25 + Math.sin(this.phase * 2.5 + i * 0.5) * 0.2);
            const spikeLen = 8 + (freqNorm * 45 + vol * 35);

            const x1 = cx + Math.cos(angle) * (baseR + 4);
            const y1 = cy + Math.sin(angle) * (baseR + 4);
            const x2 = cx + Math.cos(angle) * (baseR + 4 + spikeLen);
            const y2 = cy + Math.sin(angle) * (baseR + 4 + spikeLen);

            ctx.strokeStyle = colorSet[i % colorSet.length];
            ctx.lineWidth = 2.5;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }

        // Concentric acoustic wave ring
        const waveR = baseR + 24 + (Math.sin(this.phase * 3.2) * 0.5 + 0.5) * 16;
        ctx.strokeStyle = colorSet[0];
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, waveR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1.0;

        // Central Orb
        const grad = ctx.createRadialGradient(cx - baseR * 0.25, cy - baseR * 0.25, baseR * 0.1, cx, cy, baseR);
        grad.addColorStop(0, colorSet[0]);
        grad.addColorStop(0.65, colorSet[1]);
        grad.addColorStop(1, colorSet[2]);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
        ctx.fill();

        // Core Specular Glint
        ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
        ctx.beginPath();
        ctx.arc(cx - baseR * 0.3, cy - baseR * 0.3, baseR * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    drawSpectrumAnalyzer(ctx, w, h, cx, cy, vol, cfg, freqs) {
        const colorSet = cfg.colors[this.state] || cfg.colors.listening;
        const barCount = 24;
        const barWidth = 7;
        const gap = 4;
        const totalW = barCount * (barWidth + gap) - gap;
        const startX = cx - totalW / 2;
        const baseY = cy + 45;
        const maxH = 95;

        ctx.save();

        // Zero axis line
        ctx.strokeStyle = colorSet[1];
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.moveTo(startX - 10, baseY + 2);
        ctx.lineTo(startX + totalW + 10, baseY + 2);
        ctx.stroke();
        ctx.globalAlpha = 1.0;

        for (let i = 0; i < barCount; i++) {
            const freqNorm = (freqs && freqs.length > 0)
                ? (freqs[i % freqs.length] / 255)
                : (0.2 + Math.sin(this.phase * 3.0 + i * 0.45) * 0.25 + vol * 0.5);

            const targetH = Math.min(maxH, Math.max(6, (freqNorm * 0.75 + vol * 0.5) * maxH));

            if (targetH > this.spectrumPeaks[i]) {
                this.spectrumPeaks[i] = targetH;
            } else {
                this.spectrumPeaks[i] = Math.max(0, this.spectrumPeaks[i] - 1.2);
            }

            const bx = startX + i * (barWidth + gap);

            // LED Segmented Blocks
            const segments = Math.floor(targetH / 8);
            for (let s = 0; s <= segments; s++) {
                const segY = baseY - s * 8;
                const normH = s / (maxH / 8);
                ctx.fillStyle = normH < 0.5 ? colorSet[0] : (normH < 0.8 ? colorSet[1] : colorSet[2]);
                ctx.fillRect(bx, segY - 6, barWidth, 6);
            }

            // Floating Peak Hold Cap
            const peakY = baseY - this.spectrumPeaks[i];
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(bx, peakY - 3, barWidth, 2);
        }
        ctx.restore();
    }

    drawParticleField(ctx, cx, cy, vol, cfg) {
        const colorSet = cfg.colors[this.state] || cfg.colors.listening;
        const PARTICLE_COUNT = 65;

        if (this.visualizerParticles.length === 0) {
            for (let p = 0; p < PARTICLE_COUNT; p++) {
                this.visualizerParticles.push({
                    angle: Math.random() * Math.PI * 2,
                    dist: 35 + Math.random() * 85,
                    baseDist: 35 + Math.random() * 85,
                    speed: 0.015 + Math.random() * 0.025,
                    size: 1.5 + Math.random() * 2.5,
                    colorIdx: p % colorSet.length
                });
            }
        }

        ctx.save();
        const pts = [];
        const isSurging = vol > 0.12 || this.state === "speaking";

        for (const p of this.visualizerParticles) {
            p.angle += p.speed * (1 + vol * 4.5);

            const targetDist = isSurging ? (25 + p.baseDist * 0.45) : p.baseDist;
            p.dist += (targetDist - p.dist) * 0.1;

            const px = cx + Math.cos(p.angle) * p.dist;
            const py = cy + Math.sin(p.angle) * p.dist;
            const curSize = p.size * (1 + vol * 1.5);
            pts.push({ x: px, y: py, size: curSize, color: colorSet[p.colorIdx] });
        }

        // Draw connective constellation web lines
        ctx.lineWidth = 0.9;
        for (let i = 0; i < pts.length; i++) {
            for (let j = i + 1; j < pts.length; j++) {
                const dx = pts[i].x - pts[j].x;
                const dy = pts[i].y - pts[j].y;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < 38) {
                    ctx.strokeStyle = pts[i].color;
                    ctx.globalAlpha = (1 - d / 38) * 0.55;
                    ctx.beginPath();
                    ctx.moveTo(pts[i].x, pts[i].y);
                    ctx.lineTo(pts[j].x, pts[j].y);
                    ctx.stroke();
                }
            }
        }

        // Draw particle nodes
        for (const pt of pts) {
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = pt.color;
            ctx.shadowColor = pt.color;
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.shadowBlur = 0;

        // Central Energetic Nucleus
        const coreR = 18 + vol * 22;
        const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
        coreGrad.addColorStop(0, "#ffffff");
        coreGrad.addColorStop(0.4, colorSet[0]);
        coreGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    drawSineRibbon(ctx, w, h, cx, cy, vol, cfg) {
        const colorSet = cfg.colors[this.state] || cfg.colors.listening;
        ctx.save();

        const ribbonWidth = Math.min(w * 0.85, 340);
        const startX = cx - ribbonWidth / 2;
        const endX = cx + ribbonWidth / 2;

        const ribbons = [
            { freq: 0.015, phase: this.phase * 1.5, amp: 22 + vol * 65, color: colorSet[2], alpha: 0.35, height: 16 },
            { freq: 0.022, phase: -this.phase * 1.8, amp: 30 + vol * 75, color: colorSet[1], alpha: 0.55, height: 18 },
            { freq: 0.030, phase: this.phase * 2.2, amp: 38 + vol * 85, color: colorSet[0], alpha: 0.85, height: 22 }
        ];

        for (const rb of ribbons) {
            ctx.beginPath();
            for (let x = startX; x <= endX; x += 6) {
                const norm = (x - startX) / ribbonWidth;
                const windowEnvelope = Math.sin(norm * Math.PI);
                const y = cy + Math.sin(x * rb.freq + rb.phase) * (rb.amp * windowEnvelope)
                             + Math.cos(x * 0.009 - rb.phase * 0.5) * (rb.amp * 0.35 * windowEnvelope);
                if (x === startX) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            for (let x = endX; x >= startX; x -= 6) {
                const norm = (x - startX) / ribbonWidth;
                const windowEnvelope = Math.sin(norm * Math.PI);
                const y = cy + Math.sin(x * rb.freq + rb.phase) * (rb.amp * windowEnvelope)
                             + Math.cos(x * 0.009 - rb.phase * 0.5) * (rb.amp * 0.35 * windowEnvelope)
                             + rb.height * (1 + vol * 0.8) * windowEnvelope;
                ctx.lineTo(x, y);
            }
            ctx.closePath();

            ctx.fillStyle = rb.color;
            ctx.globalAlpha = rb.alpha;
            ctx.fill();

            ctx.strokeStyle = rb.color;
            ctx.lineWidth = 1.8;
            ctx.globalAlpha = Math.min(1.0, rb.alpha + 0.3);
            ctx.stroke();
        }

        ctx.globalAlpha = 1.0;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(cx, cy, 6 + vol * 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    drawOrganicBlob(ctx, cx, cy, vol, cfg) {
        const colorSet = cfg.colors[this.state] || cfg.colors.listening;
        const points = 12;
        const angleStep = (Math.PI * 2) / points;
        const baseR = 56 + vol * 34;

        ctx.save();

        // Outer Liquid Halo
        ctx.beginPath();
        const outerCoords = [];
        for (let i = 0; i < points; i++) {
            const angle = i * angleStep;
            const wave = Math.sin(this.phase * 2.2 + i * 1.4) * (vol * 22 + 8)
                       + Math.cos(this.phase * 1.6 - i * 2.0) * (vol * 14 + 6);
            const r = baseR + 18 + wave;
            outerCoords.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
        }
        ctx.moveTo((outerCoords[0].x + outerCoords[points - 1].x) / 2, (outerCoords[0].y + outerCoords[points - 1].y) / 2);
        for (let i = 0; i < points; i++) {
            const curr = outerCoords[i];
            const next = outerCoords[(i + 1) % points];
            ctx.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2);
        }
        ctx.closePath();
        ctx.fillStyle = colorSet[1];
        ctx.globalAlpha = 0.28;
        ctx.fill();

        // Main Liquid Body
        ctx.beginPath();
        const coords = [];
        for (let i = 0; i < points; i++) {
            const angle = i * angleStep;
            const wave = Math.sin(this.phase * 3.0 + i * 1.6) * (vol * 28 + 10)
                       + Math.cos(-this.phase * 2.4 + i * 2.2) * (vol * 18 + 7);
            const r = baseR + wave;
            coords.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
        }
        ctx.moveTo((coords[0].x + coords[points - 1].x) / 2, (coords[0].y + coords[points - 1].y) / 2);
        for (let i = 0; i < points; i++) {
            const curr = coords[i];
            const next = coords[(i + 1) % points];
            ctx.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2);
        }
        ctx.closePath();

        const grad = ctx.createRadialGradient(cx - baseR * 0.25, cy - baseR * 0.25, 10, cx, cy, baseR * 1.2);
        grad.addColorStop(0, colorSet[0]);
        grad.addColorStop(0.6, colorSet[1]);
        grad.addColorStop(1, colorSet[2]);

        ctx.fillStyle = grad;
        ctx.globalAlpha = 0.95;
        ctx.fill();

        // Specular highlight
        ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
        ctx.beginPath();
        ctx.arc(cx - baseR * 0.32, cy - baseR * 0.32, 12 + vol * 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    setState(newState) {
        this.state = newState;
        const badgeText = document.getElementById("live-voice-status-text");
        const badge = document.getElementById("live-voice-status-badge");
        const glow = document.getElementById("live-voice-glow");
        const cfg = this.getThemeConfig();

        if (!badgeText) return;

        if (glow) {
            glow.style.backgroundColor = cfg.glowColor;
        }

        if (newState === "listening") {
            badgeText.textContent = "Listening...";
            if (glow) glow.style.transform = "scale(1)";
        } else if (newState === "thinking") {
            badgeText.textContent = "Thinking...";
            if (glow) glow.style.transform = "scale(1.15)";
        } else if (newState === "speaking") {
            badgeText.textContent = "Speaking...";
            if (glow) glow.style.transform = "scale(1.25)";
        } else if (newState === "muted") {
            badgeText.textContent = "Muted";
            if (glow) glow.style.transform = "scale(0.85)";
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        const iconOn = document.getElementById("live-mic-icon-on");
        const iconOff = document.getElementById("live-mic-icon-off");

        if (this.isMuted) {
            iconOn?.classList.add("hidden");
            iconOff?.classList.remove("hidden");
            this.stopListening();
            this.setState("muted");
        } else {
            iconOn?.classList.remove("hidden");
            iconOff?.classList.add("hidden");
            this.startListening();
            this.setState("listening");
        }
    }

    startListening() {
        if (!this.recognition || !this.isActive || this.isMuted || this.state === "speaking") return;
        try {
            this.recognition.start();
            this.setState("listening");
        } catch (e) {}
    }

    stopListening() {
        if (!this.recognition) return;
        try {
            this.recognition.stop();
        } catch (e) {}
    }

    async handleUserSpoke(promptText) {
        this.stopListening();
        this.setState("thinking");

        const userSub = document.getElementById("live-voice-user-sub");
        const aiSub = document.getElementById("live-voice-ai-sub");
        if (userSub) userSub.textContent = `"${promptText}"`;
        if (aiSub) aiSub.textContent = "Thinking...";

        const model = window.modelManager?.selectedModel;
        if (!model) {
            if (aiSub) aiSub.textContent = "No model selected.";
            this.releaseToListening();
            return;
        }

        // Add user message to chat manager history
        if (window.chatManager) {
            window.chatManager.currentMessages.push({ role: "user", content: promptText });
            window.chatManager.renderMessageUI("user", promptText);
        }

        // 1. Voice chat explicit system instruction
        const voiceSystemInstruction = {
            role: "system",
            content: "You are speaking directly with the user in live voice mode. Rules:\n1. Keep your reply extremely short (1 to 2 sentences max).\n2. Speak naturally and conversationally.\n3. Never use emojis, bullet points, headers, lists, markdown, or code blocks.\n4. Answer immediately without conversational fluff or filler."
        };

        // 2. Filter previous system prompts and take recent turns
        const baseHistory = (window.chatManager ? window.chatManager.currentMessages : [])
            .filter(m => m.role !== "system")
            .slice(-4);

        // 3. Strong inline prompt directive (works for ALL models, even those ignoring system role)
        const promptWithDirective = `${promptText}\n\n[Instruction: Reply in 1 or 2 concise spoken sentences only. Strictly no emojis, no markdown.]`;

        const apiMessages = [
            voiceSystemInstruction,
            ...baseHistory.slice(0, -1),
            { role: "user", content: promptWithDirective }
        ];

        let fullAiText = "";
        let fullThinking = "";
        try {
            const payload = {
                model: model,
                messages: apiMessages,
                stream: true,
                keep_alive: -1,
                options: {
                    num_predict: 100, // Hard physical cap: guarantees responses cannot be verbose
                    temperature: 0.6
                }
            };

            const res = await fetch("/api/ollama/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error("Inference failed");

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const chunk = JSON.parse(line);
                        const msg = chunk.message || {};
                        const thinkingChunk = msg.thinking || chunk.thinking || "";
                        const contentChunk = msg.content || "";

                        if (thinkingChunk) {
                            fullThinking += thinkingChunk;
                            if (aiSub && !fullAiText) {
                                aiSub.textContent = "Thinking through response...";
                            }
                        }

                        if (contentChunk) {
                            fullAiText += contentChunk;
                            if (aiSub) {
                                const cleanSubtitle = this.cleanSpokenText(fullAiText);
                                aiSub.textContent = cleanSubtitle || "Responding...";
                            }
                        }
                    } catch (e) {}
                }
            }

            // Clean any reasoning blocks from text
            const spokenText = this.cleanSpokenText(fullAiText);

            // Save to chat manager history
            if (window.chatManager) {
                window.chatManager.currentMessages.push({
                    role: "assistant",
                    content: spokenText || fullAiText,
                    thinking: fullThinking || undefined
                });
                window.chatManager.renderMessageUI("assistant", spokenText || fullAiText, null, null, fullThinking);
                window.app?.onMessagesUpdated();
            }

            // Speak response via TTS
            this.speak(spokenText);
        } catch (err) {
            console.error("Live voice inference error:", err);
            if (aiSub) aiSub.textContent = `Error: ${err.message}`;
            setTimeout(() => {
                this.releaseToListening();
            }, 1200);
        }
    }

    cleanSpokenText(text) {
        if (!text) return "";
        let clean = text;
        // Strip <think>...</think> reasoning blocks completely
        clean = clean.replace(/<think>[\s\S]*?<\/think>/gi, "");
        clean = clean.replace(/<think>[\s\S]*/gi, "");
        // Strip code blocks and inline code
        clean = clean.replace(/```[\s\S]*?```/g, "");
        clean = clean.replace(/`([^`]+)`/g, "$1");
        // Strip Markdown formatting, headers, links
        clean = clean.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
        clean = clean.replace(/[*#_~>]/g, "");
        // Strip math formulas
        clean = clean.replace(/\$\$[\s\S]*?\$\$/g, "");
        clean = clean.replace(/\$[^$\n]+\$/g, "");
        // Strip all emojis and symbol pictographs
        clean = clean.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{200D}\u{FE0F}]/gu, "");
        // Strip excessive whitespace
        clean = clean.replace(/\s+/g, " ").trim();
        return clean;
    }

    splitIntoSentences(text) {
        if (!text) return [];
        const raw = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
        const chunks = [];
        for (let s of raw) {
            s = s.trim();
            if (!s) continue;
            // Prevent Chrome from choking on huge run-on sentences (> 180 chars)
            if (s.length > 180) {
                const sub = s.match(/[^,;:]+[,;:]+|[^,;:]+$/g) || [s];
                for (let part of sub) {
                    if (part.trim()) chunks.push(part.trim());
                }
            } else {
                chunks.push(s);
            }
        }
        return chunks;
    }

    async speak(text) {
        if (!this.isActive) return;

        const cleanText = this.cleanSpokenText(text);
        if (!cleanText) {
            this.releaseToListening();
            return;
        }

        this.stopListening();
        this.setState("speaking");
        this.clearWatchdog();

        // Safety Watchdog Timer: Guarantee release back to listening even if audio fails to terminate
        const estimatedMs = Math.max(3500, cleanText.length * 90 + 3500);
        this.watchdogTimer = setTimeout(() => {
            console.warn("Voice TTS watchdog: audio did not release in time, force releasing back to listening.");
            this.releaseToListening();
        }, estimatedMs);

        // 1. If Local Neural Kokoro TTS is active, play studio neural audio stream
        if (this.ttsEngine === "kokoro") {
            try {
                const res = await fetch("/api/voice/tts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        text: cleanText,
                        voice: this.selectedKokoroVoice || "af_heart",
                        speed: 1.0
                    })
                });

                if (!res.ok) throw new Error(`Kokoro HTTP ${res.status}`);

                // Web Audio API playback (iOS Safari Unlocked & Reacts with Orb Visualizer)
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!this.playbackAudioCtx) {
                    this.playbackAudioCtx = new AudioContext();
                }
                if (this.playbackAudioCtx.state === "suspended") {
                    await this.playbackAudioCtx.resume();
                }

                const arrayBuffer = await res.arrayBuffer();
                const audioBuffer = await new Promise((resolve, reject) => {
                    this.playbackAudioCtx.decodeAudioData(arrayBuffer, resolve, (err) => {
                        this.playbackAudioCtx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
                    });
                });

                if (this.currentAudioSource) {
                    try { this.currentAudioSource.stop(); } catch (e) {}
                    this.currentAudioSource = null;
                }

                const source = this.playbackAudioCtx.createBufferSource();
                source.buffer = audioBuffer;

                if (this.analyser) {
                    try { source.connect(this.analyser); } catch (e) {}
                }
                source.connect(this.playbackAudioCtx.destination);
                this.currentAudioSource = source;

                source.onended = () => {
                    this.currentAudioSource = null;
                    this.releaseToListening();
                };

                source.start(0);
                return;
            } catch (err) {
                console.warn("Kokoro neural TTS Web Audio playback failed, trying HTML5 Audio fallback:", err);
                try {
                    const res = await fetch("/api/voice/tts", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            text: cleanText,
                            voice: this.selectedKokoroVoice || "af_heart",
                            speed: 1.0
                        })
                    });
                    if (res.ok) {
                        const blob = await res.blob();
                        const audioUrl = URL.createObjectURL(blob);
                        const audio = this.unlockedAudio || new Audio();
                        this.activeAudio = audio;
                        audio.src = audioUrl;
                        audio.onended = () => {
                            URL.revokeObjectURL(audioUrl);
                            this.activeAudio = null;
                            this.releaseToListening();
                        };
                        audio.onerror = () => {
                            URL.revokeObjectURL(audioUrl);
                            this.activeAudio = null;
                            this.releaseToListening();
                        };
                        await audio.play();
                        return;
                    }
                } catch (e2) {
                    console.warn("HTML5 audio fallback failed too:", e2);
                }
            }
        }

        // 2. Legacy Browser Web Speech API fallback
        this.speakBrowser(cleanText);
    }

    speakBrowser(cleanText) {
        if (!this.synth) {
            this.releaseToListening();
            return;
        }

        // Reset and resume audio pipeline
        try {
            this.synth.cancel();
            if (this.synth.resume) {
                this.synth.resume();
            }
        } catch (e) {}

        const sentences = this.splitIntoSentences(cleanText);
        if (sentences.length === 0) {
            this.releaseToListening();
            return;
        }

        window._activeUtterances = [];
        let currentIndex = 0;

        const speakNext = () => {
            if (!this.isActive || this.state !== "speaking") {
                this.releaseToListening();
                return;
            }

            if (currentIndex >= sentences.length) {
                this.releaseToListening();
                return;
            }

            const sentence = sentences[currentIndex++];
            const utterance = new SpeechSynthesisUtterance(sentence);
            window._activeUtterances.push(utterance);

            utterance.rate = 1.05;
            utterance.pitch = 1.0;

            if (this.selectedVoiceURI && this.voices.length > 0) {
                const chosen = this.voices.find(v => (v.voiceURI && v.voiceURI === this.selectedVoiceURI) || v.name === this.selectedVoiceURI);
                if (chosen) utterance.voice = chosen;
            }

            utterance.onend = () => {
                const idx = window._activeUtterances.indexOf(utterance);
                if (idx !== -1) window._activeUtterances.splice(idx, 1);
                setTimeout(speakNext, 60);
            };

            utterance.onerror = (err) => {
                console.warn("TTS sentence error:", err);
                const idx = window._activeUtterances.indexOf(utterance);
                if (idx !== -1) window._activeUtterances.splice(idx, 1);
                setTimeout(speakNext, 40);
            };

            if (this.synth.paused) {
                this.synth.resume();
            }
            this.synth.speak(utterance);
        };

        setTimeout(speakNext, 50);
    }

    releaseToListening() {
        this.clearWatchdog();
        if (this.currentAudioSource) {
            try { this.currentAudioSource.stop(); } catch (e) {}
            this.currentAudioSource = null;
        }
        if (this.activeAudio) {
            try { this.activeAudio.pause(); } catch (e) {}
            this.activeAudio = null;
        }
        try {
            if (this.synth) this.synth.cancel();
        } catch (e) {}
        window._activeUtterances = [];

        if (this.isActive && !this.isMuted) {
            this.setState("listening");
            setTimeout(() => this.startListening(), 250);
        } else {
            this.setState("idle");
        }
    }

    clearWatchdog() {
        if (this.watchdogTimer) {
            clearTimeout(this.watchdogTimer);
            this.watchdogTimer = null;
        }
    }

    async speakTest(text) {
        this.unlockAudioPipeline();

        // Test Kokoro if online
        if (this.ttsEngine === "kokoro") {
            try {
                if (this.currentAudioSource) {
                    try { this.currentAudioSource.stop(); } catch (e) {}
                    this.currentAudioSource = null;
                }
                const res = await fetch("/api/voice/tts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        text: text,
                        voice: this.selectedKokoroVoice || "af_heart",
                        speed: 1.0
                    })
                });
                if (res.ok) {
                    const AudioContext = window.AudioContext || window.webkitAudioContext;
                    if (!this.playbackAudioCtx) {
                        this.playbackAudioCtx = new AudioContext();
                    }
                    if (this.playbackAudioCtx.state === "suspended") {
                        await this.playbackAudioCtx.resume();
                    }
                    const arrayBuffer = await res.arrayBuffer();
                    const audioBuffer = await new Promise((resolve, reject) => {
                        this.playbackAudioCtx.decodeAudioData(arrayBuffer, resolve, (err) => {
                            this.playbackAudioCtx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
                        });
                    });
                    const source = this.playbackAudioCtx.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(this.playbackAudioCtx.destination);
                    this.currentAudioSource = source;
                    source.onended = () => { this.currentAudioSource = null; };
                    source.start(0);
                    return;
                }
            } catch (err) {
                console.warn("Kokoro test speech failed:", err);
            }
        }

        // Test browser voice fallback
        if (!this.synth) return;
        try {
            this.synth.cancel();
            if (this.synth.resume) this.synth.resume();
        } catch (e) {}

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.05;
        utterance.pitch = 1.0;

        if (this.selectedVoiceURI && this.voices.length > 0) {
            const chosen = this.voices.find(v => (v.voiceURI && v.voiceURI === this.selectedVoiceURI) || v.name === this.selectedVoiceURI);
            if (chosen) utterance.voice = chosen;
        }

        this.synth.speak(utterance);
    }

    interruptAI() {
        if (this.currentAudioSource) {
            try { this.currentAudioSource.stop(); } catch (e) {}
            this.currentAudioSource = null;
        }
        if (this.activeAudio) {
            try { this.activeAudio.pause(); } catch (e) {}
            this.activeAudio = null;
        }
        if (this.synth) {
            try { this.synth.cancel(); } catch (e) {}
            this.currentUtterance = null;
        }
        this.releaseToListening();
    }
}

window.voiceController = new VoiceController();
