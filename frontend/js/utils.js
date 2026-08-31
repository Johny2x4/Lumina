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

