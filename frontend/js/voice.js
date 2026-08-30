// Lumina UI — Gemini Live Voice Mode & Speech Visualizer
class VoiceController {
    constructor() {
        this.isActive = false;
        this.state = "idle"; // "idle" | "listening" | "thinking" | "speaking" | "muted"
        this.isMuted = false;

        this.recognition = null;
        this.synth = window.speechSynthesis;
        this.currentUtterance = null;

        // Web Audio API for Speech Visualizer
        this.audioCtx = null;
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

        // TTS Voice Customization
        this.voices = [];
        this.selectedVoiceURI = localStorage.getItem("lumina_tts_voice") || "";

        this.init();
    }

    init() {
        this.initVoices();
        this.setupRecognition();
        this.bindEvents();
    }

    initVoices() {
        if (!this.synth) return;
        this.populateVoiceList();
        if (this.synth.onvoiceschanged !== undefined) {
            this.synth.onvoiceschanged = () => this.populateVoiceList();
        }
    }

    populateVoiceList() {
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
            btnVoiceToggle.addEventListener("click", () => this.enterLiveVoiceMode());
        }
        if (btnHeaderVoice) {
            btnHeaderVoice.addEventListener("click", () => this.enterLiveVoiceMode());
        }

        // Live Voice Overlay Controls
        const btnClose = document.getElementById("btn-close-live-voice");
        const btnEnd = document.getElementById("btn-live-end");
        const btnMicToggle = document.getElementById("btn-live-mic-toggle");
        const btnInterrupt = document.getElementById("btn-live-interrupt");

        if (btnClose) btnClose.addEventListener("click", () => this.exitLiveVoiceMode());
        if (btnEnd) btnEnd.addEventListener("click", () => this.exitLiveVoiceMode());

        if (btnMicToggle) {
            btnMicToggle.addEventListener("click", () => this.toggleMute());
        }

        if (btnInterrupt) {
            btnInterrupt.addEventListener("click", () => this.interruptAI());
        }

        // Settings TTS Voice Controls
        const voiceSelect = document.getElementById("settings-tts-voice-select");
        if (voiceSelect) {
            voiceSelect.addEventListener("change", (e) => {
                this.selectedVoiceURI = e.target.value;
                localStorage.setItem("lumina_tts_voice", this.selectedVoiceURI);
            });
        }

        const btnTest = document.getElementById("btn-test-voice");
        if (btnTest) {
            btnTest.addEventListener("click", () => {
                this.speakTest("Hello! This is Lumina AI speaking with your selected voice.");
            });
        }
    }

    async enterLiveVoiceMode() {
        this.isActive = true;
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

        // Stop Web Audio Stream & Animation
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
            this.audioStream = null;
        }

        if (this.audioCtx && this.audioCtx.state !== "closed") {
            try { this.audioCtx.close(); } catch (e) {}
            this.audioCtx = null;
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
                is8Bit: false,
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
                is8Bit: false,
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
                is8Bit: false,
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
            eightbit: {
                is8Bit: true,
                glowColor: "#00ff41",
                colors: {
                    listening: ["#00ff41", "#00cc33", "#ffb000"],
                    speaking: ["#ffb000", "#ff8800", "#00ff41"],
                    thinking: ["#ffff00", "#ffb000", "#00ff41"],
                    muted: ["#005511", "#003308", "#001100"]
                },
                glow: {
                    listening: "rgba(0, 255, 65, 0.5)",
                    speaking: "rgba(255, 176, 0, 0.5)",
                    thinking: "rgba(255, 255, 0, 0.5)",
                    muted: "rgba(0, 85, 17, 0.2)"
                }
            },
            matrix: {
                is8Bit: false,
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
                is8Bit: false,
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
                is8Bit: false,
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
            crimson: {
                is8Bit: false,
                glowColor: "#f43f5e",
                colors: {
                    listening: ["#f43f5e", "#e11d48", "#be123c"],
                    speaking: ["#fb7185", "#f43f5e", "#9f1239"],
                    thinking: ["#fda4af", "#e11d48", "#881337"],
                    muted: ["#881337", "#4c0519", "#20020a"]
                },
                glow: {
                    listening: "rgba(244, 63, 94, 0.55)",
                    speaking: "rgba(225, 29, 72, 0.5)",
                    thinking: "rgba(253, 164, 175, 0.5)",
                    muted: "rgba(136, 19, 55, 0.25)"
                }
            },
            sakura: {
                is8Bit: false,
                glowColor: "#f472b6",
                colors: {
                    listening: ["#f472b6", "#e879f9", "#c084fc"],
                    speaking: ["#c084fc", "#f472b6", "#fbcfe8"],
                    thinking: ["#fbcfe8", "#e879f9", "#d946ef"],
                    muted: ["#701a75", "#4a044e", "#250227"]
                },
                glow: {
                    listening: "rgba(244, 114, 182, 0.5)",
                    speaking: "rgba(192, 132, 252, 0.5)",
                    thinking: "rgba(232, 121, 249, 0.5)",
                    muted: "rgba(112, 26, 117, 0.25)"
                }
            },
            solarized: {
                is8Bit: false,
                glowColor: "#f59e0b",
                colors: {
                    listening: ["#fbbf24", "#f59e0b", "#d97706"],
                    speaking: ["#f59e0b", "#d97706", "#b45309"],
                    thinking: ["#fde68a", "#f59e0b", "#92400e"],
                    muted: ["#78350f", "#451a03", "#220d02"]
                },
                glow: {
                    listening: "rgba(245, 158, 11, 0.55)",
                    speaking: "rgba(217, 119, 6, 0.5)",
                    thinking: "rgba(251, 191, 36, 0.55)",
                    muted: "rgba(120, 53, 15, 0.25)"
                }
            },
            abyss: {
                is8Bit: false,
                glowColor: "#06b6d4",
                colors: {
                    listening: ["#22d3ee", "#06b6d4", "#0284c7"],
                    speaking: ["#38bdf8", "#0284c7", "#1d4ed8"],
                    thinking: ["#67e8f9", "#06b6d4", "#2563eb"],
                    muted: ["#075985", "#0c4a6e", "#082f49"]
                },
                glow: {
                    listening: "rgba(6, 182, 212, 0.55)",
                    speaking: "rgba(14, 165, 233, 0.5)",
                    thinking: "rgba(103, 232, 249, 0.55)",
                    muted: "rgba(7, 89, 133, 0.25)"
                }
            },
            monochrome: {
                is8Bit: false,
                glowColor: "#fafafa",
                colors: {
                    listening: ["#ffffff", "#e4e4e7", "#a1a1aa"],
                    speaking: ["#e4e4e7", "#a1a1aa", "#71717a"],
                    thinking: ["#f4f4f5", "#d4d4d8", "#52525b"],
                    muted: ["#52525b", "#3f3f46", "#27272a"]
                },
                glow: {
                    listening: "rgba(255, 255, 255, 0.4)",
                    speaking: "rgba(228, 228, 231, 0.35)",
                    thinking: "rgba(244, 244, 245, 0.4)",
                    muted: "rgba(82, 82, 91, 0.2)"
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

        if (cfg.is8Bit) {
            // Retro 8-bit Arcade concentric stepped waveform
            const colorSet = cfg.colors[this.state] || cfg.colors.listening;
            ctx.save();
            const rings = 4;
            for (let r = 1; r <= rings; r++) {
                const baseR = r * 20 + this.currentVolume * 30;
                const quantizedR = Math.floor(baseR / 4) * 4;
                ctx.strokeStyle = colorSet[r % colorSet.length];
                ctx.lineWidth = 3;
                // Draw pixelated stepped diamond / square
                ctx.strokeRect(centerX - quantizedR, centerY - quantizedR, quantizedR * 2, quantizedR * 2);
            }
            ctx.restore();
            return;
        }

        // Multi-Layer Organic Fluid Blobs (Gemini Live Shape)
        this.drawFluidBlob(ctx, centerX, centerY, 62 + this.currentVolume * 35, 1.0, this.phase, cfg);
        this.drawFluidBlob(ctx, centerX, centerY, 48 + this.currentVolume * 22, 0.8, this.phase + 1.2, cfg);
        this.drawFluidBlob(ctx, centerX, centerY, 34 + this.currentVolume * 14, 0.6, this.phase + 2.5, cfg);

        // Core Center Highlight
        ctx.beginPath();
        ctx.arc(centerX - 8, centerY - 8, 14 + this.currentVolume * 8, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
        ctx.fill();
    }

    drawFluidBlob(ctx, cx, cy, radius, opacity, phaseOffset, cfg) {
        const points = 8;
        const angleStep = (Math.PI * 2) / points;

        ctx.save();
        ctx.beginPath();

        const colorSet = cfg.colors[this.state] || cfg.colors.listening;
        const grad = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
        grad.addColorStop(0, colorSet[0]);
        grad.addColorStop(0.5, colorSet[1]);
        grad.addColorStop(1, colorSet[2]);

        const coords = [];
        for (let i = 0; i < points; i++) {
            const angle = i * angleStep;
            const wave = Math.sin(phaseOffset * 2.0 + i * 1.5) * (this.currentVolume * 24 + 5);
            const r = radius + wave;
            const x = cx + Math.cos(angle) * r;
            const y = cy + Math.sin(angle) * r;
            coords.push({ x, y });
        }

        ctx.moveTo((coords[0].x + coords[points - 1].x) / 2, (coords[0].y + coords[points - 1].y) / 2);
        for (let i = 0; i < points; i++) {
            const curr = coords[i];
            const next = coords[(i + 1) % points];
            const midX = (curr.x + next.x) / 2;
            const midY = (curr.y + next.y) / 2;
            ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
        }

        ctx.closePath();
        ctx.fillStyle = grad;
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
        if (aiSub) aiSub.textContent = "Connecting to model...";

        // Also add to chat messages in background so session transcript is preserved
        const model = window.modelManager?.selectedModel;
        if (!model) {
            if (aiSub) aiSub.textContent = "No model selected.";
            this.setState("listening");
            this.startListening();
            return;
        }

        // Add user message to chat manager
        if (window.chatManager) {
            window.chatManager.currentMessages.push({ role: "user", content: promptText });
            window.chatManager.renderMessageUI("user", promptText);
        }

        let fullAiText = "";
        try {
            const payload = {
                model: model,
                messages: window.chatManager ? window.chatManager.currentMessages : [{ role: "user", content: promptText }],
                stream: true,
                keep_alive: -1
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
                        if (chunk.message?.content) {
                            fullAiText += chunk.message.content;
                            if (aiSub) {
                                aiSub.textContent = this.stripMarkdown(fullAiText);
                            }
                        }
                    } catch (e) {}
                }
            }

            // Save to chat manager history
            if (window.chatManager) {
                window.chatManager.currentMessages.push({ role: "assistant", content: fullAiText });
                window.chatManager.renderMessageUI("assistant", fullAiText);
                window.app?.onMessagesUpdated();
            }

            // Speak response
            this.speak(fullAiText);
        } catch (err) {
            console.error("Live voice inference error:", err);
            if (aiSub) aiSub.textContent = `Error: ${err.message}`;
            setTimeout(() => {
                if (this.isActive && !this.isMuted) {
                    this.startListening();
                }
            }, 1500);
        }
    }

    stripMarkdown(text) {
        return text
            .replace(/```[\s\S]*?```/g, " [code block omitted] ")
            .replace(/`([^`]+)`/g, "$1")
            .replace(/[*#_~>]/g, "")
            .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
            .trim();
    }

    speak(text) {
        if (!this.isActive || !this.synth) return;

        this.stopListening();
        this.setState("speaking");
        this.synth.cancel();

        const cleanText = this.stripMarkdown(text);
        if (!cleanText) {
            this.setState("listening");
            this.startListening();
            return;
        }

        const utterance = new SpeechSynthesisUtterance(cleanText);
        this.currentUtterance = utterance;
        utterance.rate = 1.05;
        utterance.pitch = 1.0;

        // Apply selected TTS Voice persona if specified
        if (this.selectedVoiceURI && this.voices.length > 0) {
            const chosen = this.voices.find(v => (v.voiceURI && v.voiceURI === this.selectedVoiceURI) || v.name === this.selectedVoiceURI);
            if (chosen) utterance.voice = chosen;
        }

        utterance.onend = () => {
            this.currentUtterance = null;
            if (this.isActive && !this.isMuted) {
                this.setState("listening");
                setTimeout(() => this.startListening(), 300);
            }
        };

        utterance.onerror = () => {
            this.currentUtterance = null;
            if (this.isActive && !this.isMuted) {
                this.setState("listening");
                setTimeout(() => this.startListening(), 300);
            }
        };

        this.synth.speak(utterance);
    }

    speakTest(text) {
        if (!this.synth) return;
        this.synth.cancel();

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
        if (this.synth) {
            this.synth.cancel();
            this.currentUtterance = null;
        }
        if (this.isActive && !this.isMuted) {
            this.setState("listening");
            this.startListening();
        }
    }
}

window.voiceController = new VoiceController();
