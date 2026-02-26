// js/telegram-images.js
// Shared utility for resolving tg://file_id URLs to fresh Telegram download URLs.
// Uses localStorage caching (30-min TTL) so concurrent users share resolved URLs.

const TelegramImages = (() => {
    const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes (Telegram URLs last ~1 hour)
    const BATCH_SIZE = 3; // Max concurrent getFile calls (conservative for 10-15 simultaneous users)

    /**
     * Resolves a single tg://file_id URL to a fresh download URL.
     * Checks localStorage cache first. Falls through non-tg:// URLs unchanged.
     * @param {string} url - The URL to resolve (e.g. "tg://AgACAgIAAxk...")
     * @returns {Promise<string>} - The resolved download URL
     */
    async function resolveTelegramUrl(url) {
        if (!url || !url.startsWith('tg://')) return url;

        const fileId = url.substring(5); // Strip "tg://"
        const cacheKey = `tg_cache_${fileId}`;

        // 1. Check localStorage cache
        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                const { url: cachedUrl, expires } = JSON.parse(cached);
                if (Date.now() < expires) {
                    return cachedUrl;
                }
                localStorage.removeItem(cacheKey); // Expired
            }
        } catch (e) {
            // Cache read failed, continue to API call
        }

        // 2. Call Telegram getFile API (with retry for rate limits)
        if (typeof TELEGRAM_BOT_TOKEN === 'undefined' || !TELEGRAM_BOT_TOKEN) {
            console.error('TelegramImages: TELEGRAM_BOT_TOKEN not configured');
            return url; // Return original — will fail to display but won't crash
        }

        const MAX_RETRIES = 3;
        let lastError = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                const res = await fetch(
                    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
                );

                // Handle rate limiting (HTTP 429)
                if (res.status === 429) {
                    const retryAfter = parseInt(res.headers.get('Retry-After') || '1', 10);
                    const waitMs = Math.max(retryAfter * 1000, 1000 * Math.pow(2, attempt));
                    console.warn(`TelegramImages: Rate limited, retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
                    await new Promise(r => setTimeout(r, waitMs));
                    continue;
                }

                const data = await res.json();

                if (data.ok && data.result.file_path) {
                    const downloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${data.result.file_path}`;

                    // 3. Cache the resolved URL
                    try {
                        localStorage.setItem(cacheKey, JSON.stringify({
                            url: downloadUrl,
                            expires: Date.now() + CACHE_TTL_MS
                        }));
                    } catch (e) {
                        // localStorage full or unavailable — still return the URL
                    }

                    return downloadUrl;
                } else {
                    // Telegram returned an error (e.g., bad file_id) — don't retry
                    console.error('TelegramImages: getFile failed:', data.description);
                    return url;
                }
            } catch (err) {
                lastError = err;
                if (attempt < MAX_RETRIES) {
                    const waitMs = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
                    console.warn(`TelegramImages: Network error, retrying in ${waitMs}ms`, err.message);
                    await new Promise(r => setTimeout(r, waitMs));
                } else {
                    console.error('TelegramImages: All retries failed:', lastError);
                    return url;
                }
            }
        }

        return url; // Fallback
    }

    /**
     * Replaces all tg:// src attributes in an HTML string with resolved URLs.
     * @param {string} html - HTML string possibly containing <img src="tg://...">
     * @param {Map<string,string>} resolvedMap - Map of tg://url -> resolved download URL
     * @returns {string} - HTML with replaced URLs
     */
    function replaceImgSrcInHtml(html, resolvedMap) {
        if (!html || typeof html !== 'string') return html;
        return html.replace(/<img([^>]+)src=["']([^"']+)["']/gi, (fullMatch, attrs, originalUrl) => {
            const resolved = resolvedMap.get(originalUrl);
            if (resolved && resolved !== originalUrl) {
                return `<img${attrs}src="${resolved}"`;
            }
            return fullMatch;
        });
    }

    /**
     * Collects all unique image URLs from an array of questions.
     * Scans imageUrl field and embedded <img> tags in passage, prompt, options.
     * @param {Array} questions - Array of question objects
     * @returns {Set<string>} - Set of unique URLs
     */
    function collectImageUrls(questions) {
        const urls = new Set();
        for (const q of questions) {
            if (q.imageUrl) urls.add(q.imageUrl);

            const htmlFields = [q.passage, q.prompt];
            const options = q.options || {};
            Object.values(options).forEach(opt => {
                if (typeof opt === 'string') htmlFields.push(opt);
            });

            for (const html of htmlFields) {
                if (!html || typeof html !== 'string') continue;
                const matches = html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
                for (const match of matches) {
                    if (match[1]) urls.add(match[1]);
                }
            }
        }
        return urls;
    }

    /**
     * Resolves all tg:// URLs found in an array of questions.
     * Downloads in batches to avoid Telegram API rate limits.
     * Mutates question objects in-place with resolved URLs.
     * @param {Array} questions - Array of question objects
     * @param {function} [onProgress] - Optional callback(loaded, total) for progress updates
     * @returns {Promise<void>}
     */
    async function resolveAllTelegramUrls(questions, onProgress) {
        const allUrls = collectImageUrls(questions);
        const tgUrls = [...allUrls].filter(u => u.startsWith('tg://'));

        if (tgUrls.length === 0) return;

        const resolvedMap = new Map();
        let loaded = 0;

        // Resolve in batches
        for (let i = 0; i < tgUrls.length; i += BATCH_SIZE) {
            const batch = tgUrls.slice(i, i + BATCH_SIZE);
            const results = await Promise.all(
                batch.map(async (tgUrl) => {
                    const resolved = await resolveTelegramUrl(tgUrl);
                    loaded++;
                    if (onProgress) onProgress(loaded, tgUrls.length);
                    return { tgUrl, resolved };
                })
            );
            results.forEach(({ tgUrl, resolved }) => {
                resolvedMap.set(tgUrl, resolved);
            });

            // Longer delay between batches to avoid rate limits with many concurrent users
            if (i + BATCH_SIZE < tgUrls.length) {
                await new Promise(r => setTimeout(r, 300));
            }
        }

        // Replace URLs in question objects in-place
        for (const question of questions) {
            // Direct imageUrl
            if (question.imageUrl && resolvedMap.has(question.imageUrl)) {
                question.imageUrl = resolvedMap.get(question.imageUrl);
            }

            // HTML content fields
            for (const field of ['passage', 'prompt']) {
                if (question[field] && typeof question[field] === 'string') {
                    question[field] = replaceImgSrcInHtml(question[field], resolvedMap);
                }
            }

            // Options
            if (question.options) {
                for (const key of Object.keys(question.options)) {
                    if (typeof question.options[key] === 'string') {
                        question.options[key] = replaceImgSrcInHtml(question.options[key], resolvedMap);
                    }
                }
            }
        }
    }

    // Public API
    return {
        resolveTelegramUrl,
        resolveAllTelegramUrls,
        replaceImgSrcInHtml,
        collectImageUrls
    };
})();
