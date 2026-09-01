// Lumina UI — Chat Inference, Multimodal Attachments & Streaming Engine
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

class ChatManager {
    constructor() {
        this.currentMessages = [];
        this.stagedAttachments = []; // { id, type: 'image'|'text', name, size, data, previewUrl }
        this.abortController = null;
        this.isGenerating = false;
        this.isWebSearchEnabled = false;
        this.isWebSearchActive = localStorage.getItem("lumina_web_search_active") === "true";
        this._streamPending = false;
        this._streamContentEl = null;
        this._streamArgs = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.bindAttachmentEvents();
        this.initWebSearch();
    }

    async initWebSearch() {
        const btnSearch = document.getElementById("btn-web-search");
        if (!btnSearch) return;

        try {
            const res = await fetch("/api/search/status", { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                this.isWebSearchEnabled = !!data.enabled;
            }
        } catch (e) {
            this.isWebSearchEnabled = false;
        }

        if (this.isWebSearchEnabled) {
            btnSearch.classList.remove("hidden");
            this.updateWebSearchButtonUI();

            btnSearch.addEventListener("click", () => {
                this.isWebSearchActive = !this.isWebSearchActive;
                localStorage.setItem("lumina_web_search_active", this.isWebSearchActive);
                this.updateWebSearchButtonUI();
            });
        } else {
            btnSearch.classList.add("hidden");
        }
    }

    updateWebSearchButtonUI() {
        const btnSearch = document.getElementById("btn-web-search");
        if (!btnSearch) return;
        btnSearch.classList.toggle("search-active", this.isWebSearchActive);
        btnSearch.title = this.isWebSearchActive
            ? "Web Search: ON (Queries live web before answering)"
            : "Web Search: OFF (Local inference only)";
    }

    bindEvents() {
        const input = document.getElementById("chat-input");
        const btnSend = document.getElementById("btn-send");
        const btnStop = document.getElementById("btn-stop");

        if (input) {
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });

            // Auto-resize input
            input.addEventListener("input", () => {
                input.style.height = "auto";
                input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
            });
        }

        if (btnSend) {
            btnSend.addEventListener("click", () => this.sendMessage());
        }

        if (btnStop) {
            btnStop.addEventListener("click", () => this.stopGeneration());
        }

        // Example cards
        document.querySelectorAll(".example-card").forEach(card => {
            card.addEventListener("click", () => {
                const prompt = card.getAttribute("data-prompt");
                if (input && prompt) {
                    input.value = prompt;
                    this.sendMessage();
                }
            });
        });
    }

    // Multimodal & File Attachment Handling
    bindAttachmentEvents() {
        const btnAttach = document.getElementById("btn-attach");
        const fileInput = document.getElementById("file-input");

        if (btnAttach && fileInput) {
            btnAttach.addEventListener("click", () => fileInput.click());
            fileInput.addEventListener("change", (e) => {
                if (e.target.files && e.target.files.length > 0) {
                    this.handleFiles(Array.from(e.target.files));
                    fileInput.value = "";
                }
            });
        }

        // Paste Handling (e.g. Screenshot or copied file from clipboard)
        window.addEventListener("paste", (e) => {
            if (e.clipboardData && e.clipboardData.files.length > 0) {
                this.handleFiles(Array.from(e.clipboardData.files));
            }
        });

        // Drag & Drop Handling
        ["dragenter", "dragover"].forEach(eventName => {
            window.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        window.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer && e.dataTransfer.files.length > 0) {
                this.handleFiles(Array.from(e.dataTransfer.files));
            }
        });
    }

    async handleFiles(files) {
        for (const file of files) {
            const id = "att_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
            const isImage = file.type.startsWith("image/");

            if (isImage) {
                const base64DataUrl = await this.readFileAsDataURL(file);
                // Extract pure base64 without data URI prefix for Ollama API
                const rawBase64 = base64DataUrl.split(",")[1] || "";

                this.stagedAttachments.push({
                    id: id,
                    type: "image",
                    name: file.name,
                    size: file.size,
                    data: rawBase64,
                    previewUrl: base64DataUrl
                });
            } else {
                // Read as text document (source code, logs, txt, csv, json, md)
                try {
                    const textContent = await this.readFileAsText(file);
                    this.stagedAttachments.push({
                        id: id,
                        type: "text",
                        name: file.name,
                        size: file.size,
                        data: textContent,
                        previewUrl: null
                    });
                } catch (err) {
                    console.error("Failed to read file as text:", err);
                }
            }
        }

        this.renderAttachmentPreviews();
    }

    readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    renderAttachmentPreviews() {
        const container = document.getElementById("attachment-previews");
        if (!container) return;

        if (this.stagedAttachments.length === 0) {
            container.innerHTML = "";
            container.classList.add("hidden");
            return;
        }

        if (!container.dataset.bound) {
            container.dataset.bound = "true";
            container.addEventListener("click", (e) => {
                const btn = e.target.closest("[data-action='remove-attachment']");
                if (btn && btn.dataset.id) {
                    this.removeAttachment(btn.dataset.id);
                }
            });
        }

        container.classList.remove("hidden");
        container.innerHTML = this.stagedAttachments.map(att => {
            const sizeKb = Math.round(att.size / 1024);
            const safeName = escapeHtml(att.name);
            const safeId = escapeAttr(att.id);
            if (att.type === "image") {
                return `
                    <div class="relative group flex items-center gap-1.5 p-1 bg-slate-800/80 rounded-xl border border-slate-700/60 shadow-sm shrink-0">
                        <img src="${escapeAttr(att.previewUrl)}" alt="${safeName}" class="w-10 h-10 object-cover rounded-lg">
                        <div class="max-w-[100px] truncate text-[11px] font-mono pr-2">
                            <div class="text-slate-200 truncate">${safeName}</div>
                            <div class="text-slate-500 text-[9px]">${sizeKb} KB</div>
                        </div>
                        <button type="button" class="text-slate-400 hover:text-rose-400 p-1 text-xs" data-action="remove-attachment" data-id="${safeId}" title="Remove attachment">
                            &times;
                        </button>
                    </div>
                `;
            } else {
                return `
                    <div class="relative group flex items-center gap-2 px-2.5 py-1.5 bg-slate-800/80 rounded-xl border border-slate-700/60 shadow-sm shrink-0 text-[11px]">
                        <svg class="w-4 h-4 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        <div class="max-w-[120px] truncate font-mono">
                            <div class="text-slate-200 truncate">${safeName}</div>
                            <div class="text-slate-500 text-[9px]">${sizeKb} KB</div>
                        </div>
                        <button type="button" class="text-slate-400 hover:text-rose-400 p-1 text-xs" data-action="remove-attachment" data-id="${safeId}" title="Remove attachment">
                            &times;
                        </button>
                    </div>
                `;
            }
        }).join("");
    }

    removeAttachment(id) {
        this.stagedAttachments = this.stagedAttachments.filter(a => a.id !== id);
        this.renderAttachmentPreviews();
    }

    async sendMessage() {
        const input = document.getElementById("chat-input");
        let text = input ? input.value.trim() : "";
        const hasAttachments = this.stagedAttachments.length > 0;

        if (!text && !hasAttachments) return;
        if (this.isGenerating) return;

        const model = window.modelManager?.selectedModel;
        if (!model) {
            if (typeof showToast === "function") {
                showToast("Please select or pull a model first.", "warning");
            } else {
                alert("Please select or pull a model first.");
            }
            return;
        }

        // Process attachments
        const imageAttachments = this.stagedAttachments.filter(a => a.type === "image");
        const textAttachments = this.stagedAttachments.filter(a => a.type === "text");

        // Format inlined text/code files
        let fullPromptContent = text;
        if (textAttachments.length > 0) {
            const formattedDocs = textAttachments.map(doc => {
                return `\n\n--- Attached File: ${doc.name} ---\n\`\`\`\n${doc.data}\n\`\`\``;
            }).join("");
            fullPromptContent = fullPromptContent ? `${fullPromptContent}${formattedDocs}` : formattedDocs.trim();
        }

        // Base64 images array for Ollama multimodal API
        const rawImages = imageAttachments.map(img => img.data);
        const imagePreviews = imageAttachments.map(img => img.previewUrl);

        // Clear input and staged attachments
        input.value = "";
        input.style.height = "auto";
        this.stagedAttachments = [];
        this.renderAttachmentPreviews();

        // Remove empty state if visible
        const emptyState = document.getElementById("empty-state");
        if (emptyState) emptyState.remove();

        // Optional Web Search Pre-fetch
        let searchSources = null;
        if (this.isWebSearchEnabled && this.isWebSearchActive && text) {
            try {
                const modelParam = model ? `&model=${encodeURIComponent(model)}` : "";
                const sRes = await fetch(`/api/search?q=${encodeURIComponent(text)}${modelParam}`, {
                    headers: getAuthHeaders()
                });
                if (sRes.ok) {
                    const sData = await sRes.json();
                    if (sData.results && sData.results.length > 0) {
                        searchSources = sData.results;
                        const contextLines = searchSources.map((s, i) => {
                            return `[${i + 1}] "${s.title}" (${s.url})\n${s.snippet}`;
                        }).join("\n\n");

                        const webContextPrompt = `\n\n--- Real-Time Web Search Results ---\n${contextLines}\n------------------------------------\nInstructions: Use the real-time web search results above to answer the user's prompt accurately. Cite references using [1], [2], etc., where appropriate.`;
                        fullPromptContent = `${fullPromptContent}${webContextPrompt}`;
                    }
                }
            } catch (searchErr) {
                console.warn("Web search query failed, continuing with direct LLM inference:", searchErr);
            }
        }

        // 1. Append User Message
        const userMsg = {
            role: "user",
            content: fullPromptContent || (rawImages.length > 0 ? "What is in this image?" : ""),
            images: rawImages.length > 0 ? rawImages : undefined,
            imagePreviews: imagePreviews.length > 0 ? imagePreviews : undefined
        };
        this.currentMessages.push(userMsg);
        // Show original clean text in user bubble rather than the raw injected search payload
        this.renderMessageUI("user", text || userMsg.content, userMsg.imagePreviews);

        // 2. Append Assistant Message Container
        const assistantMsgEl = this.renderMessageUI("assistant", "");
        const contentEl = assistantMsgEl.querySelector(".message-content");

        // 3. Update UI state
        this.setGenerating(true);
        this.abortController = new AbortController();

        let assistantContent = "";
        let finalMetadata = null;

        try {
            // Read System Persona & Prompt Preset
            const personaKey = localStorage.getItem("lumina_system_persona") || "default";
            const customPrompt = localStorage.getItem("lumina_custom_system_prompt") || "";
            const personas = {
                default: "You are a helpful, brilliant, concise, and structured AI assistant.",
                engineer: "You are an expert senior software engineer. Provide direct, highly technical, minimal-fluff solutions with clean, robust code.",
                writer: "You are an articulate, evocative, and creative writer. Use expressive language, compelling narratives, and nuanced descriptions.",
                extractor: "You are a precise data extraction engine. Output only valid JSON or Markdown tables as requested. Never include chit-chat, conversational filler, or pleasantries.",
                custom: customPrompt || "You are a helpful AI assistant."
            };
            const systemInstruction = personas[personaKey] || personas.default;

            // Prepare messages for Ollama with system instruction prepended
            const apiMessages = [
                { role: "system", content: systemInstruction }
            ];

            this.currentMessages.forEach(m => {
                const item = {
                    role: m.role,
                    content: m.content
                };
                if (m.images && m.images.length > 0) {
                    item.images = m.images;
                }
                apiMessages.push(item);
            });

            // Read Custom Inference & Sampling Options
            let inferenceOptions = {
                num_ctx: 8192,
                temperature: 0.7,
                top_p: 0.9,
                repeat_penalty: 1.1
            };
            try {
                const storedOpts = JSON.parse(localStorage.getItem("lumina_inference_options") || "{}");
                inferenceOptions = { ...inferenceOptions, ...storedOpts };
            } catch (e) {}

            const payload = {
                model: model,
                messages: apiMessages,
                stream: true,
                keep_alive: -1, // Zero cold-start lag: keep pinned in VRAM
                options: inferenceOptions
            };

            const sessionId = window.app?.activeSessionId || ("sess_" + Date.now());
            const isPersist = window.modelManager?.isPersistenceEnabled !== false;
            const response = await fetch("/api/chat/generate", {
                method: "POST",
                headers: getAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({
                    session_id: sessionId,
                    model: model,
                    messages: apiMessages,
                    sources: searchSources && searchSources.length > 0 ? searchSources : [],
                    options: inferenceOptions,
                    keep_alive: isPersist ? -1 : "5m"
                }),
                signal: this.abortController.signal
            });

            if (!response.ok) {
                throw new Error(`Inference error: ${response.statusText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let assistantContent = "";
            let assistantThinking = "";
            let isThinkingPhase = false;
            let thinkingStartTime = Date.now();
            let receivedFirstChunk = false;

            // Give feedback if a large model is loading into GPU VRAM
            const loadTimer = setTimeout(() => {
                if (!receivedFirstChunk && contentEl) {
                    const statusText = contentEl.querySelector(".thinking-indicator-text");
                    if (statusText) {
                        statusText.textContent = "Loading model into GPU VRAM...";
                    }
                }
            }, 3000);

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
                        receivedFirstChunk = true;
                        clearTimeout(loadTimer);

                        const msg = chunk.message || {};
                        const contentChunk = msg.content || "";
                        const thinkingChunk = msg.thinking || chunk.thinking || "";

                        if (thinkingChunk) {
                            if (!isThinkingPhase) {
                                isThinkingPhase = true;
                                thinkingStartTime = Date.now();
                                document.body.classList.add("lumina-thinking");
                            }
                            assistantThinking += thinkingChunk;
                            this.queueStreamRender(contentEl, assistantContent, assistantThinking, isThinkingPhase, thinkingStartTime);
                        }

                        if (contentChunk) {
                            if (isThinkingPhase) {
                                isThinkingPhase = false;
                                document.body.classList.remove("lumina-thinking");
                            }
                            assistantContent += contentChunk;
                            this.queueStreamRender(contentEl, assistantContent, assistantThinking, isThinkingPhase, thinkingStartTime);
                        }

                        if (chunk.done) {
                            finalMetadata = chunk;
                        }
                    } catch (e) {}
                }
            }
            clearTimeout(loadTimer);

            // Final render with full code highlighting and math rendering
            this.renderStreamContent(contentEl, assistantContent, assistantThinking, false, thinkingStartTime, true);
            this.scrollToBottom();

            // Save completed message
            this.currentMessages.push({
                role: "assistant",
                content: assistantContent,
                sources: searchSources && searchSources.length > 0 ? searchSources : undefined
            });
            window.app?.onMessagesUpdated();

            // Render sources citations card if search results were used
            if (searchSources && searchSources.length > 0) {
                this.renderSourcesUI(assistantMsgEl, searchSources);
            }

            // Attach final contextual action handlers to this assistant container
            this.bindMessageActions(assistantMsgEl, "assistant", assistantContent);

            // Display per-turn token telemetry if metadata provided
            if (finalMetadata) {
                this.renderTokenTelemetry(finalMetadata);
            }

            // Voice synthesis if active
            if (window.voiceController?.isActive) {
                window.voiceController.speak(assistantContent);
            }
        } catch (err) {
            if (err.name === "AbortError") {
                contentEl.innerHTML += `<p class="text-xs text-slate-500 italic mt-2">[Generation stopped by user]</p>`;
                if (assistantContent) {
                    this.currentMessages.push({ role: "assistant", content: assistantContent });
                    window.app?.onMessagesUpdated();
                    this.bindMessageActions(assistantMsgEl, "assistant", assistantContent);
                }
            } else {
                contentEl.innerHTML = `<p class="text-xs text-rose-400 font-mono">Error: ${escapeHtml(err.message)}</p>`;
            }
        } finally {
            this.setGenerating(false);
        }
    }

    async checkBackgroundChat(sessionId) {
        if (!sessionId) return;
        try {
            const res = await fetch(`/api/chat/status/${sessionId}`, {
                headers: getAuthHeaders()
            });
            if (!res.ok) return;
            const data = await res.json();
            if (!data.job) return;

            const job = data.job;
            const lastMsg = this.currentMessages[this.currentMessages.length - 1];

            // If completed while window was closed
            if (job.done && job.accumulated_text) {
                if (!lastMsg || lastMsg.role !== "assistant" || lastMsg.content !== job.accumulated_text) {
                    document.getElementById("empty-state")?.classList.add("hidden");
                    this.currentMessages.push({
                        role: "assistant",
                        content: job.accumulated_text,
                        sources: job.sources && job.sources.length > 0 ? job.sources : undefined
                    });
                    this.renderMessageUI("assistant", job.accumulated_text, null, job.sources);
                    window.app?.onMessagesUpdated();
                    if (job.final_metadata) {
                        this.renderTokenTelemetry(job.final_metadata);
                    }
                }
            } else if (data.active) {
                // Job is actively generating in the background! Re-attach live stream!
                this.attachToChatStream(sessionId, job);
            }
        } catch (e) {
            console.warn("Could not check background chat:", e);
        }
    }

    async attachToChatStream(sessionId, initialJob) {
        this.setGenerating(true);
        this.abortController = new AbortController();

        document.getElementById("empty-state")?.classList.add("hidden");
        const assistantMsgEl = this.renderMessageUI("assistant", initialJob.accumulated_text || "");
        const contentEl = assistantMsgEl.querySelector(".message-content");
        let assistantContent = initialJob.accumulated_text || "";
        let finalMetadata = initialJob.final_metadata || null;

        try {
            const res = await fetch(`/api/chat/stream/${sessionId}`, {
                headers: getAuthHeaders(),
                signal: this.abortController.signal
            });
            if (!res.ok) throw new Error("Could not resume chat stream");

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let assistantThinking = initialJob.accumulated_thinking || "";
            let isThinkingPhase = !assistantContent && !initialJob.done;
            let thinkingStartTime = Date.now();

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
                        const contentChunk = msg.content || "";
                        const thinkingChunk = msg.thinking || chunk.thinking || "";

                        if (thinkingChunk) {
                            if (!isThinkingPhase) {
                                isThinkingPhase = true;
                                thinkingStartTime = Date.now();
                                document.body.classList.add("lumina-thinking");
                            }
                            assistantThinking += thinkingChunk;
                            this.queueStreamRender(contentEl, assistantContent, assistantThinking, isThinkingPhase, thinkingStartTime);
                        }

                        if (contentChunk) {
                            if (isThinkingPhase) {
                                isThinkingPhase = false;
                                document.body.classList.remove("lumina-thinking");
                            }
                            assistantContent += contentChunk;
                            this.queueStreamRender(contentEl, assistantContent, assistantThinking, isThinkingPhase, thinkingStartTime);
                        }

                        if (chunk.done) {
                            finalMetadata = chunk;
                        }
                    } catch (e) {}
                }
            }

            // Final render with full code highlighting and math rendering
            this.renderStreamContent(contentEl, assistantContent, assistantThinking, false, thinkingStartTime, true);
            this.scrollToBottom();

            this.currentMessages.push({
                role: "assistant",
                content: assistantContent,
                sources: initialJob.sources && initialJob.sources.length > 0 ? initialJob.sources : undefined
            });
            window.app?.onMessagesUpdated();

            if (initialJob.sources && initialJob.sources.length > 0) {
                this.renderSourcesUI(assistantMsgEl, initialJob.sources);
            }
            this.bindMessageActions(assistantMsgEl, "assistant", assistantContent);
            if (finalMetadata) {
                this.renderTokenTelemetry(finalMetadata);
            }
        } catch (err) {
            console.warn("Resumed stream interrupted:", err);
        } finally {
            this.setGenerating(false);
        }
    }

    renderTokenTelemetry(meta) {
        const badge = document.getElementById("token-telemetry-badge");
        if (!badge) return;

        // Prompt speed
        const promptCount = meta.prompt_eval_count || 0;
        const promptDurationSec = (meta.prompt_eval_duration || 0) / 1e9;
        const promptTps = promptDurationSec > 0 ? Math.round((promptCount / promptDurationSec) * 10) / 10 : 0;

        // Generation speed
        const evalCount = meta.eval_count || 0;
        const evalDurationSec = (meta.eval_duration || 0) / 1e9;
        const evalTps = evalDurationSec > 0 ? Math.round((evalCount / evalDurationSec) * 10) / 10 : 0;

        // Total Latency
        const totalDurationMs = Math.round((meta.total_duration || 0) / 1e6);

        // Context saturation
        let ctxLimit = 8192;
        try {
            const opts = JSON.parse(localStorage.getItem("lumina_inference_options") || "{}");
            if (opts.num_ctx) ctxLimit = opts.num_ctx;
        } catch (e) {}
        const contextUsed = promptCount + evalCount;

        document.getElementById("tt-prompt-speed").textContent = `${promptTps} t/s`;
        document.getElementById("tt-eval-speed").textContent = `${evalTps} t/s`;
        document.getElementById("tt-duration").textContent = `${totalDurationMs} ms`;
        document.getElementById("tt-context-ratio").textContent = `Ctx: ${contextUsed.toLocaleString()} / ${Math.round(ctxLimit / 1024)}k`;

        badge.classList.remove("hidden");
    }

    stopGeneration() {
        const sessionId = window.app?.activeSessionId;
        if (sessionId) {
            fetch(`/api/chat/abort/${sessionId}`, { method: "POST", headers: getAuthHeaders() }).catch(() => {});
        }
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        this.setGenerating(false);
    }

    setGenerating(isGen) {
        this.isGenerating = isGen;
        const btnSend = document.getElementById("btn-send");
        const btnStop = document.getElementById("btn-stop");

        if (btnSend) btnSend.classList.toggle("hidden", isGen);
        if (btnStop) btnStop.classList.toggle("hidden", !isGen);

        if (isGen) {
            document.body.classList.add("lumina-generating");
        } else {
            document.body.classList.remove("lumina-generating", "lumina-thinking");
        }
    }

    renderMessageUI(role, content, imagePreviews = null, sources = null, thinking = null) {
        const container = document.getElementById("messages-container");
        const isUser = role === "user";

        const msgDiv = document.createElement("div");
        msgDiv.className = `flex gap-2.5 sm:gap-3 ${isUser ? 'justify-end' : 'justify-start'}`;

        let imagesHtml = "";
        if (imagePreviews && Array.isArray(imagePreviews) && imagePreviews.length > 0) {
            imagesHtml = `
                <div class="flex flex-wrap gap-2 mb-2">
                    ${imagePreviews.map(url => `
                        <img src="${url}" class="max-h-48 max-w-full rounded-xl object-contain border border-white/20 shadow-sm" alt="Uploaded multimodal image">
                    `).join("")}
                </div>
            `;
        }

        let sourcesHtml = "";
        if (!isUser && sources && Array.isArray(sources) && sources.length > 0) {
            sourcesHtml = `
                <div class="search-sources-container">
                    <div class="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-[var(--brand-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path></svg>
                        <span>Sources</span>
                    </div>
                    <div class="flex flex-wrap gap-1.5">
                        ${sources.map((s, idx) => `
                            <a href="${escapeAttr(s.url)}" target="_blank" rel="noopener noreferrer" class="source-chip" title="${escapeAttr(s.title)}">
                                <span class="text-[var(--brand-primary)] font-bold font-mono">[${idx + 1}]</span>
                                <span class="truncate">${escapeHtml(s.title)}</span>
                            </a>
                        `).join("")}
                    </div>
                </div>
            `;
        }

        msgDiv.innerHTML = `
            ${!isUser ? `
                <div class="w-7 h-7 rounded-xl bg-[var(--brand-glow)] border border-[var(--border-color)] flex items-center justify-center text-[var(--brand-primary)] shrink-0 select-none text-xs font-bold shadow-sm">
                    AI
                </div>
            ` : ''}
            <div class="message-bubble-wrapper relative group max-w-[88%] sm:max-w-2xl">
                <div class="px-3.5 sm:px-4 py-2.5 ${
                    isUser
                        ? 'user-message-bubble bg-[var(--bg-user-bubble)] text-[var(--text-user-bubble)] rounded-2xl rounded-tr-sm shadow-md'
                        : 'ai-message-bubble bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl rounded-tl-sm shadow-sm'
                }">
                    ${imagesHtml}
                    <div class="message-content prose-lumina ${isUser ? 'text-[var(--text-user-bubble)]' : ''}">
                        ${isUser ? escapeHtml(content) : (content || thinking ? this.renderMessageContent(content, thinking) : `
                            <div class="thinking-indicator flex items-center gap-2 py-1 select-none">
                                <div class="flex items-center gap-1">
                                    <span class="w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)] animate-bounce" style="animation-delay: 0ms"></span>
                                    <span class="w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)] animate-bounce" style="animation-delay: 150ms"></span>
                                    <span class="w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)] animate-bounce" style="animation-delay: 300ms"></span>
                                </div>
                                <span class="thinking-indicator-text text-xs text-[var(--brand-primary)] font-medium tracking-wide">Thinking...</span>
                            </div>
                        `)}
                    </div>
                    <pre class="raw-content hidden font-mono text-xs whitespace-pre-wrap p-2 bg-black/40 rounded-lg border border-white/10 select-text overflow-x-auto custom-scrollbar my-1"></pre>
                    ${sourcesHtml}
                </div>

                <!-- Floating Action Buttons underneath message bubble -->
                <div class="msg-actions-bar flex items-center gap-1 mt-1.5 ${isUser ? 'justify-end' : 'justify-start'}">
                    ${!isUser ? `
                        <button class="msg-action-btn btn-copy-msg" title="Copy response" aria-label="Copy response">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                        </button>
                        <button class="msg-action-btn btn-toggle-raw" title="Toggle raw Markdown" aria-label="Toggle raw Markdown">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
                        </button>
                        <button class="msg-action-btn btn-regen-msg" title="Regenerate response" aria-label="Regenerate response">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                        </button>
                    ` : `
                        <button class="msg-action-btn btn-edit-msg" title="Edit prompt & re-run" aria-label="Edit prompt & re-run">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                        </button>
                    `}
                </div>
            </div>
            ${isUser ? `
                <div class="w-7 h-7 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 select-none text-xs font-bold">
                    U
                </div>
            ` : ''}
        `;

        container.appendChild(msgDiv);
        if (content) {
            this.bindMessageActions(msgDiv, role, content);
            if (!isUser) {
                this.highlightCode(msgDiv);
            }
        }
        this.scrollToBottom();
        return msgDiv;
    }

    renderSourcesUI(msgDiv, sources) {
        if (!msgDiv || !sources || sources.length === 0) return;
        const bubble = msgDiv.querySelector(".message-bubble-wrapper > div");
        if (!bubble || bubble.querySelector(".search-sources-container")) return;

        const container = document.createElement("div");
        container.className = "search-sources-container";
        container.innerHTML = `
            <div class="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path></svg>
                <span>Sources</span>
            </div>
            <div class="flex flex-wrap gap-1.5">
                ${sources.map((s, idx) => `
                    <a href="${escapeAttr(s.url)}" target="_blank" rel="noopener noreferrer" class="source-chip" title="${escapeAttr(s.title)}">
                        <span class="text-cyan-400 font-bold font-mono">[${idx + 1}]</span>
                        <span class="truncate">${escapeHtml(s.title)}</span>
                    </a>
                `).join("")}
            </div>
        `;
        bubble.appendChild(container);
    }

    bindMessageActions(msgDiv, role, content) {
        const isUser = role === "user";

        if (!isUser) {
            // Copy Response
            const btnCopy = msgDiv.querySelector(".btn-copy-msg");
            if (btnCopy) {
                btnCopy.addEventListener("click", () => {
                    navigator.clipboard.writeText(content);
                    const originalSvg = btnCopy.innerHTML;
                    btnCopy.setAttribute("title", "Copied!");
                    btnCopy.innerHTML = `<svg class="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
                    setTimeout(() => {
                        btnCopy.innerHTML = originalSvg;
                        btnCopy.setAttribute("title", "Copy response");
                    }, 2000);
                });
            }

            // Toggle Raw Markdown View
            const btnRaw = msgDiv.querySelector(".btn-toggle-raw");
            const proseEl = msgDiv.querySelector(".message-content");
            const rawEl = msgDiv.querySelector(".raw-content");
            if (btnRaw && proseEl && rawEl) {
                btnRaw.addEventListener("click", () => {
                    const isShowingRaw = !rawEl.classList.contains("hidden");
                    if (isShowingRaw) {
                        rawEl.classList.add("hidden");
                        proseEl.classList.remove("hidden");
                        btnRaw.setAttribute("title", "Toggle raw Markdown");
                        btnRaw.classList.remove("text-brand-400");
                    } else {
                        rawEl.textContent = content;
                        rawEl.classList.remove("hidden");
                        proseEl.classList.add("hidden");
                        btnRaw.setAttribute("title", "Toggle rendered Markdown");
                        btnRaw.classList.add("text-brand-400");
                    }
                });
            }

            // Regenerate
            const btnRegen = msgDiv.querySelector(".btn-regen-msg");
            if (btnRegen) {
                btnRegen.addEventListener("click", () => {
                    this.regenerateLastTurn();
                });
            }
        } else {
            // Edit Prompt
            const btnEdit = msgDiv.querySelector(".btn-edit-msg");
            if (btnEdit) {
                btnEdit.addEventListener("click", () => {
                    const input = document.getElementById("chat-input");
                    if (input) {
                        input.value = content;
                        input.focus();
                        input.style.height = "auto";
                        input.style.height = `${Math.min(input.scrollHeight, 140)}px`;

                        // Remove this message and all after from this.currentMessages and UI
                        const index = this.currentMessages.findIndex(m => m.role === "user" && m.content === content);
                        if (index !== -1) {
                            this.currentMessages = this.currentMessages.slice(0, index);
                            window.app?.onMessagesUpdated();

                            // Re-render UI
                            const container = document.getElementById("messages-container");
                            if (container) {
                                container.innerHTML = "";
                                this.currentMessages.forEach(m => {
                                    this.renderMessageUI(m.role, m.content, m.imagePreviews, m.sources, m.thinking);
                                });
                            }
                        }
                    }
                });
            }
        }
    }

    regenerateLastTurn() {
        if (this.isGenerating || this.currentMessages.length === 0) return;

        // Pop last assistant message if present
        const last = this.currentMessages[this.currentMessages.length - 1];
        if (last.role === "assistant") {
            this.currentMessages.pop();
        }

        // Now pop user message and re-send it
        const lastUser = this.currentMessages.pop();
        if (lastUser && lastUser.role === "user") {
            window.app?.onMessagesUpdated();
            const container = document.getElementById("messages-container");
            if (container) {
                container.innerHTML = "";
                this.currentMessages.forEach(m => {
                    this.renderMessageUI(m.role, m.content, m.imagePreviews, m.sources, m.thinking);
                });
            }

            const input = document.getElementById("chat-input");
            if (input) input.value = lastUser.content;
            this.sendMessage();
        }
    }

    exportCurrentChatMarkdown() {
        const activeSess = window.app?.sessions.find(s => s.id === window.app?.activeSessionId);
        const title = activeSess?.title || "Lumina Conversation";
        const dateStr = new Date().toLocaleString();

        let md = `# ${title}\n\n*Exported from Lumina UI on ${dateStr}*\n\n---\n\n`;

        this.currentMessages.forEach(m => {
            const roleHeading = m.role === "user" ? "### 👤 User" : "### 🤖 Lumina AI";
            md += `${roleHeading}\n\n${m.content}\n\n`;
        });

        const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${title.toLowerCase().replace(/[^a-z0-9]/g, "-")}.md`;
        a.click();
        URL.revokeObjectURL(url);
    }

    exportCurrentChatJSON() {
        const activeSess = window.app?.sessions.find(s => s.id === window.app?.activeSessionId);
        const data = {
            session: activeSess,
            exportedAt: new Date().toISOString(),
            messages: this.currentMessages
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `lumina-chat-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    highlightCode(el) {
        el.querySelectorAll("pre code").forEach((block) => {
            if (!block.dataset.highlighted) {
                hljs.highlightElement(block);
                block.dataset.highlighted = "true";

                // Add copy button
                const pre = block.parentElement;
                if (pre && !pre.querySelector(".copy-code-btn")) {
                    const btn = document.createElement("button");
                    btn.className = "copy-code-btn";
                    btn.textContent = "Copy";
                    btn.addEventListener("click", () => {
                        navigator.clipboard.writeText(block.innerText);
                        btn.textContent = "Copied!";
                        setTimeout(() => { btn.textContent = "Copy"; }, 2000);
                    });
                    pre.appendChild(btn);
                }
            }
        });
        this.renderMath(el);
    }

    renderMath(el) {
        if (typeof renderMathInElement === "function") {
            try {
                renderMathInElement(el, {
                    delimiters: [
                        { left: "$$", right: "$$", display: true },
                        { left: "\\[", right: "\\]", display: true },
                        { left: "$", right: "$", display: false },
                        { left: "\\(", right: "\\)", display: false }
                    ],
                    throwOnError: false
                });
            } catch (e) {}
        }
    }

    scrollToBottom() {
        const container = document.getElementById("messages-container");
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }

    renderMessageContent(content, thinking) {
        let thoughts = thinking || "";
        let mainContent = content || "";

        if (mainContent.includes("<think>")) {
            const endIdx = mainContent.indexOf("</think>");
            if (endIdx !== -1) {
                thoughts += (thoughts ? "\n" : "") + mainContent.substring(7, endIdx).trim();
                mainContent = mainContent.substring(endIdx + 8).trim();
            } else {
                thoughts += (thoughts ? "\n" : "") + mainContent.substring(7).trim();
                mainContent = "";
            }
        }

        let html = "";
        if (thoughts) {
            html += `
                <details class="thinking-accordion group mb-3 rounded-xl border border-indigo-500/25 bg-indigo-950/20 text-xs overflow-hidden transition-all">
                    <summary class="flex items-center gap-2 px-3 py-2 cursor-pointer select-none text-indigo-300 hover:text-indigo-200 font-medium transition bg-indigo-500/10">
                        <span class="w-2 h-2 rounded-full bg-indigo-400"></span>
                        <span class="font-mono text-[11px] tracking-wide">Reasoning Process</span>
                        <svg class="w-3.5 h-3.5 text-indigo-400 group-open:rotate-180 transition-transform ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                    </summary>
                    <div class="thinking-content px-3.5 py-2.5 font-mono text-[11px] text-slate-300/90 whitespace-pre-wrap border-t border-indigo-500/15 max-h-60 overflow-y-auto leading-relaxed custom-scrollbar bg-black/20">
                        ${escapeHtml(thoughts)}
                    </div>
                </details>
            `;
        }

        if (mainContent) {
            html += renderMarkdown(mainContent);
        }

        return html;
    }

    queueStreamRender(contentEl, content, thinking, isThinking, startTime) {
        this._streamContentEl = contentEl;
        this._streamArgs = { content, thinking, isThinking, startTime };
        if (!this._streamPending) {
            this._streamPending = true;
            requestAnimationFrame(() => {
                this._streamPending = false;
                if (this._streamContentEl && this._streamArgs) {
                    this.renderStreamContent(
                        this._streamContentEl,
                        this._streamArgs.content,
                        this._streamArgs.thinking,
                        this._streamArgs.isThinking,
                        this._streamArgs.startTime,
                        false
                    );
                    this.scrollToBottom();
                }
            });
        }
    }

    renderStreamContent(contentEl, content, thinking, isThinking, startTime, isFinal = false) {
        let thoughts = thinking || "";
        let mainContent = content || "";

        if (mainContent.includes("<think>")) {
            const endIdx = mainContent.indexOf("</think>");
            if (endIdx !== -1) {
                thoughts += (thoughts ? "\n" : "") + mainContent.substring(7, endIdx).trim();
                mainContent = mainContent.substring(endIdx + 8).trim();
            } else {
                thoughts += (thoughts ? "\n" : "") + mainContent.substring(7).trim();
                mainContent = "";
            }
        }

        let html = "";
        if (thoughts) {
            const durationSec = startTime ? Math.max(1, Math.round((Date.now() - startTime) / 1000)) : 1;
            const durationLabel = isThinking ? `${durationSec}s` : `Thought for ${durationSec}s`;
            const pulseClass = isThinking ? "animate-pulse" : "";
            const openAttr = isThinking ? "open" : "";

            html += `
                <details class="thinking-accordion group mb-3 rounded-xl border border-indigo-500/25 bg-indigo-950/20 text-xs overflow-hidden transition-all" ${openAttr}>
                    <summary class="flex items-center gap-2 px-3 py-2 cursor-pointer select-none text-indigo-300 hover:text-indigo-200 font-medium transition bg-indigo-500/10">
                        <span class="w-2 h-2 rounded-full bg-indigo-400 ${pulseClass}"></span>
                        <span class="font-mono text-[11px] tracking-wide">${isThinking ? "Thinking..." : "Reasoning Process"}</span>
                        <span class="thinking-duration text-slate-400 text-[10px] ml-auto font-mono">${durationLabel}</span>
                        <svg class="w-3.5 h-3.5 text-indigo-400 group-open:rotate-180 transition-transform ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                    </summary>
                    <div class="thinking-content px-3.5 py-2.5 font-mono text-[11px] text-slate-300/90 whitespace-pre-wrap border-t border-indigo-500/15 max-h-60 overflow-y-auto leading-relaxed custom-scrollbar bg-black/20">
                        ${escapeHtml(thoughts)}
                    </div>
                </details>
            `;
        }

        if (mainContent) {
            html += renderMarkdown(mainContent);
        }

        contentEl.innerHTML = html;
        if (isFinal) {
            this.highlightCode(contentEl);
        }
    }

    // Use the global escapeHtml utility from utils.js
}

window.chatManager = new ChatManager();
