// Lumina UI — Lumina Live Voice Mode & Speech Visualizer (Inspired by Gemini Live)
function getAuthHeaders(extra = {}) {
    if (typeof getLuminaAuthHeaders === "function") {
        return getLuminaAuthHeaders(extra);
    }
    if (typeof window !== "undefined" && typeof window.getLuminaAuthHeaders === "function") {
        return window.getLuminaAuthHeaders(extra);
    }
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("lumina_auth_token") : null;
    const headers = { ...extra };
    if (token) {
        headers["X-Lumina-Token"] = token;
        headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
}

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
        this.visualizer = typeof VoiceVisualizer !== "undefined" ? new VoiceVisualizer() : null;

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
            const res = await fetch("/api/voice/status", {
                headers: getAuthHeaders()
            });
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

        if (this.visualizer) {
            this.visualizer.stop();
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
        const canvas = document.getElementById("live-voice-canvas");
        if (canvas && this.visualizer) {
            this.visualizer.init(canvas, this.analyser, this.dataArray);
            this.visualizer.start();
        }
    }

    setState(newState) {
        this.state = newState;
        const badgeText = document.getElementById("live-voice-status-text");

        if (badgeText) {
            if (newState === "listening") {
                badgeText.textContent = "Listening...";
            } else if (newState === "thinking") {
                badgeText.textContent = "Thinking...";
            } else if (newState === "speaking") {
                badgeText.textContent = "Speaking...";
            } else if (newState === "muted") {
                badgeText.textContent = "Muted";
            }
        }

        if (this.visualizer) {
            this.visualizer.setState(newState, this.isMuted);
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

        if (this.visualizer) {
            this.visualizer.setState(this.state, this.isMuted);
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
        const thinkStartTime = Date.now();
        let thinkTimer = null;
        let receivedDone = false;

        if (aiSub) {
            aiSub.textContent = "Thinking...";
            thinkTimer = setInterval(() => {
                if (this.state === "thinking" && !fullAiText) {
                    const elapsed = Math.round((Date.now() - thinkStartTime) / 1000);
                    aiSub.textContent = `Thinking... (${elapsed}s)`;
                }
            }, 1000);
        }

        try {
            // Use resilient /api/chat/generate endpoint (same as regular chat) so
            // inference runs as a server-side background task and completes fully
            // even if the browser connection hiccups.
            const voiceSessionId = "voice_" + (window.app?.activeSessionId || Date.now());
            const inferenceOptions = {
                num_predict: 4096, // Reasoning models need ample headroom — 1024 was exhausted entirely inside <think>
                temperature: 0.6
            };

            const res = await fetch("/api/chat/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    session_id: voiceSessionId,
                    model: model,
                    messages: apiMessages,
                    sources: [],
                    options: inferenceOptions,
                    keep_alive: -1
                })
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

                        // Track Ollama's done signal to detect complete vs truncated responses
                        if (chunk.done === true) {
                            receivedDone = true;
                        }

                        const msg = chunk.message || {};
                        const thinkingChunk = msg.thinking || chunk.thinking || "";
                        const contentChunk = msg.content || "";

                        if (thinkingChunk) {
                            fullThinking += thinkingChunk;
                        }

                        if (contentChunk) {
                            if (thinkTimer) {
                                clearInterval(thinkTimer);
                                thinkTimer = null;
                            }
                            fullAiText += contentChunk;
                            if (aiSub) {
                                const cleanSubtitle = this.cleanSpokenText(fullAiText);
                                aiSub.textContent = cleanSubtitle || "Responding...";
                            }
                        }
                    } catch (e) {}
                }
            }

            // Process any remaining data in the buffer
            if (buffer.trim()) {
                try {
                    const chunk = JSON.parse(buffer);
                    if (chunk.done === true) receivedDone = true;
                    const msg = chunk.message || {};
                    if (msg.thinking || chunk.thinking) fullThinking += (msg.thinking || chunk.thinking);
                    if (msg.content) fullAiText += msg.content;
                } catch (e) {}
            }

            if (thinkTimer) {
                clearInterval(thinkTimer);
                thinkTimer = null;
            }

            // Warn if the stream ended without Ollama's done signal (truncated response)
            if (!receivedDone) {
                console.warn("Voice inference: stream ended without Ollama done signal — response may be incomplete.");
            }

            // Clean reasoning blocks from text
            let spokenText = this.cleanSpokenText(fullAiText);

            // Fallback: If model produced only thinking and no content (e.g. token budget
            // was exhausted inside <think>, or model placed its answer in the thinking block)
            if (!spokenText && fullThinking) {
                const cleanThoughts = this.cleanSpokenText(fullThinking);
                // Extract complete sentences only — avoid partial/mid-sentence fragments
                const thoughtSentences = this.splitIntoSentences(cleanThoughts)
                    .filter(s => /[.!?]$/.test(s.trim()));
                if (thoughtSentences.length > 0) {
                    // Take the last 2 complete sentences as they're most likely the conclusion
                    spokenText = thoughtSentences.slice(-2).join(" ");
                } else {
                    // Last resort: use whatever we have, even if incomplete
                    const allSentences = this.splitIntoSentences(cleanThoughts);
                    if (allSentences.length > 0) {
                        spokenText = allSentences.slice(-2).join(" ");
                    }
                }
            }

            // Final safety: if we still have nothing to speak, provide a graceful fallback
            if (!spokenText) {
                spokenText = "I'm sorry, I wasn't able to generate a response. Could you try again?";
            }

            // Save to chat manager history
            if (window.chatManager) {
                window.chatManager.currentMessages.push({
                    role: "assistant",
                    content: spokenText || fullAiText || "...",
                    thinking: fullThinking || undefined
                });
                window.chatManager.renderMessageUI("assistant", spokenText || fullAiText || "...", null, null, fullThinking);
                window.app?.onMessagesUpdated();
            }

            // Speak response via TTS — speak() handles releaseToListening() on completion
            this.speak(spokenText);
        } catch (err) {
            if (thinkTimer) {
                clearInterval(thinkTimer);
                thinkTimer = null;
            }
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
            console.warn("Live voice: No spoken text to speak after cleaning.");
            this.releaseToListening();
            return;
        }

        // Limit spoken audio to first 3 concise sentences so speech stays snappy
        const sentences = this.splitIntoSentences(cleanText);
        const textToSpeak = sentences.slice(0, 3).join(" ") || cleanText;

        this.stopListening();
        this.setState("speaking");
        this.clearWatchdog();

        const aiSub = document.getElementById("live-voice-ai-sub");
        if (aiSub) aiSub.textContent = textToSpeak;

        // 1. If Local Neural Kokoro TTS is active, play studio neural audio stream
        if (this.ttsEngine === "kokoro") {
            try {
                // AbortController with 25s timeout for Kokoro synthesis
                const fetchController = new AbortController();
                const fetchTimeout = setTimeout(() => fetchController.abort(), 25000);

                const res = await fetch("/api/voice/tts", {
                    method: "POST",
                    headers: getAuthHeaders({ "Content-Type": "application/json" }),
                    body: JSON.stringify({
                        text: textToSpeak,
                        voice: this.selectedKokoroVoice || "af_heart",
                        speed: 1.0
                    }),
                    signal: fetchController.signal
                });
                clearTimeout(fetchTimeout);

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

                // Watchdog Timer starts ONLY once playback starts, calibrated to exact audio duration + 6s buffer
                const safetyTimeoutMs = Math.ceil(audioBuffer.duration * 1000) + 6000;
                this.clearWatchdog();
                this.watchdogTimer = setTimeout(() => {
                    console.warn("Kokoro audio playback watchdog safety release.");
                    this.releaseToListening();
                }, safetyTimeoutMs);

                source.onended = () => {
                    this.clearWatchdog();
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
                            text: textToSpeak,
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

                        audio.onplay = () => {
                            const safetyTimeoutMs = Math.ceil((audio.duration || 10) * 1000) + 6000;
                            this.clearWatchdog();
                            this.watchdogTimer = setTimeout(() => {
                                this.releaseToListening();
                            }, safetyTimeoutMs);
                        };

                        audio.onended = () => {
                            this.clearWatchdog();
                            URL.revokeObjectURL(audioUrl);
                            this.activeAudio = null;
                            this.releaseToListening();
                        };
                        audio.onerror = () => {
                            this.clearWatchdog();
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
        this.speakBrowser(textToSpeak);
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
                this.clearWatchdog();
                this.releaseToListening();
                return;
            }

            if (currentIndex >= sentences.length) {
                this.clearWatchdog();
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

            utterance.onstart = () => {
                // Safety watchdog per sentence: ample time based on characters + 6s buffer
                this.clearWatchdog();
                const sentenceSafetyMs = Math.max(8000, sentence.length * 160 + 6000);
                this.watchdogTimer = setTimeout(() => {
                    console.warn("Browser TTS sentence watchdog fired.");
                    speakNext();
                }, sentenceSafetyMs);
            };

            utterance.onend = () => {
                this.clearWatchdog();
                const idx = window._activeUtterances.indexOf(utterance);
                if (idx !== -1) window._activeUtterances.splice(idx, 1);
                setTimeout(speakNext, 60);
            };

            utterance.onerror = (err) => {
                this.clearWatchdog();
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
