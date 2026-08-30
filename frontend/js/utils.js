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
