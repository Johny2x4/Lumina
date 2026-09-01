// Lumina UI — Shared Utilities
// Centralized security and helper functions used across all modules.

/**
 * Escape a string for safe insertion into HTML.
 * Prevents XSS when dynamic content must be placed inside innerHTML.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    if (typeof str !== "string") return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Escape a string for safe insertion into an HTML attribute value.
 * Use when constructing onclick="..." or value="..." from dynamic data.
 * @param {string} str
 * @returns {string}
 */
function escapeAttr(str) {
    if (typeof str !== "string") return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/**
 * Returns authorization headers if an auth token is saved in localStorage.
 */
function getLuminaAuthHeaders(extraHeaders = {}) {
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("lumina_auth_token") : null;
    const headers = { ...extraHeaders };
    if (token) {
        headers["X-Lumina-Token"] = token;
        headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
}

window.escapeHtml = escapeHtml;
window.escapeAttr = escapeAttr;
window.getLuminaAuthHeaders = getLuminaAuthHeaders;

/**
 * Render Markdown with native KaTeX LaTeX math & chemical formula support ($...$, $$...$$, \(...\), \[...\]).
 * Protects math expressions from Markdown mangling and renders native KaTeX HTML with mhchem chemistry support.
 * @param {string} text
 * @returns {string}
 */
function renderMarkdown(text) {
    if (!text) return "";

    // Store math blocks to protect them from Markdown underscore/asterisk mangling
    const mathBlocks = [];

    // 1. Block math: $$ ... $$ or \[ ... \]
    let processed = text.replace(/\$\$([\s\S]+?)\$\$/g, (match, math) => {
        const id = `@@MATH_BLOCK_${mathBlocks.length}@@`;
        mathBlocks.push({ math: math.trim(), display: true });
        return id;
    }).replace(/\\\[([\s\S]+?)\\\]/g, (match, math) => {
        const id = `@@MATH_BLOCK_${mathBlocks.length}@@`;
        mathBlocks.push({ math: math.trim(), display: true });
        return id;
    });

    // 2. Inline math: $ ... $ or \( ... \)
    processed = processed.replace(/\$([^\$\n\s]+|[^\$\n\s][^\$\n]*?[^\$\n\s])\$/g, (match, math) => {
        const id = `@@MATH_INLINE_${mathBlocks.length}@@`;
        mathBlocks.push({ math: math.trim(), display: false });
        return id;
    }).replace(/\\\(([\s\S]+?)\\\)/g, (match, math) => {
        const id = `@@MATH_INLINE_${mathBlocks.length}@@`;
        mathBlocks.push({ math: math.trim(), display: false });
        return id;
    });

    // 3. Parse Markdown with marked.js
    let html = "";
    try {
        if (typeof marked !== "undefined" && marked.parse) {
            html = marked.parse(processed);
        } else {
            html = escapeHtml(processed);
        }
    } catch (e) {
        html = escapeHtml(text);
        return html;
    }

    // 4. Render math placeholders with KaTeX
    if (typeof katex !== "undefined" && mathBlocks.length > 0) {
        html = html.replace(/@@MATH_(BLOCK|INLINE)_(\d+)@@/g, (match, type, index) => {
            const item = mathBlocks[parseInt(index, 10)];
            if (!item) return match;
            try {
                return katex.renderToString(item.math, {
                    displayMode: item.display,
                    throwOnError: false
                });
            } catch (err) {
                return `<span class="katex-error" title="${escapeAttr(err.message)}">${escapeHtml(item.math)}</span>`;
            }
        });
    } else if (mathBlocks.length > 0) {
        // Fallback if KaTeX is not loaded: restore raw delimiters
        html = html.replace(/@@MATH_(BLOCK|INLINE)_(\d+)@@/g, (match, type, index) => {
            const item = mathBlocks[parseInt(index, 10)];
            return item ? (item.display ? `$$${item.math}$$` : `$${item.math}$`) : match;
        });
    }

    return html;
}

/**
 * Lightweight IndexedDB persistent storage to handle large conversations beyond localStorage 5MB limit.
 */
class LuminaStorage {
    constructor(dbName = "lumina_db", storeName = "conversations") {
        this.dbName = dbName;
        this.storeName = storeName;
        this._dbPromise = null;
    }

    _open() {
        if (!this._dbPromise) {
            this._dbPromise = new Promise((resolve, reject) => {
                if (typeof window === "undefined" || !window.indexedDB) {
                    reject(new Error("IndexedDB not supported"));
                    return;
                }
                const req = indexedDB.open(this.dbName, 1);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        db.createObjectStore(this.storeName);
                    }
                };
                req.onsuccess = (e) => resolve(e.target.result);
                req.onerror = (e) => reject(e.target.error);
            });
        }
        return this._dbPromise;
    }

    async get(key) {
        try {
            const db = await this._open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, "readonly");
                const store = tx.objectStore(this.storeName);
                const req = store.get(key);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.warn("LuminaStorage.get error:", e);
            return null;
        }
    }

    async set(key, value) {
        try {
            const db = await this._open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, "readwrite");
                const store = tx.objectStore(this.storeName);
                const req = store.put(value, key);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.warn("LuminaStorage.set error:", e);
        }
    }

    async delete(key) {
        try {
            const db = await this._open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, "readwrite");
                const store = tx.objectStore(this.storeName);
                const req = store.delete(key);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.warn("LuminaStorage.delete error:", e);
        }
    }
}

window.luminaStorage = new LuminaStorage();

/**
 * Non-blocking sleek toast notification.
 * @param {string} message
 * @param {'info' | 'success' | 'warning' | 'error'} type
 */
function showToast(message, type = 'info') {
    let container = document.getElementById('lumina-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'lumina-toast-container';
        container.className = 'fixed bottom-5 right-5 z-50 flex flex-col space-y-2 pointer-events-none max-w-sm w-full px-4';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    const colorClass = type === 'error' ? 'border-rose-500/80 text-rose-200 bg-slate-900/95' :
                       type === 'success' ? 'border-emerald-500/80 text-emerald-200 bg-slate-900/95' :
                       type === 'warning' ? 'border-amber-500/80 text-amber-200 bg-slate-900/95' :
                       'border-indigo-500/80 text-indigo-200 bg-slate-900/95';
    toast.className = `pointer-events-auto flex items-center justify-between p-3.5 rounded-xl border shadow-2xl backdrop-blur-md text-sm transition-all duration-300 transform translate-y-2 opacity-0 ${colorClass}`;
    toast.innerHTML = `
        <div class="flex items-center space-x-2.5">
            <span>${escapeHtml(message)}</span>
        </div>
    `;
    container.appendChild(toast);
    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
        toast.classList.add('translate-y-0', 'opacity-100');
    });
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
window.showToast = showToast;

