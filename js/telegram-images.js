// js/telegram-images.js
// Shared utility for resolving tg://file_id URLs to fresh Telegram download URLs.
// Bot tokens are stored in Firestore (config/telegram), NOT in client code.
// Uses localStorage caching (30-min TTL) and round-robin across multiple bots.

const TelegramImages = (() => {
    const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes (Telegram URLs last ~1 hour)
    const BATCH_SIZE = 3; // Max concurrent getFile calls

    // --- Bot Token Pool (read from config.js) ---
    // If not found in config.js, fallback to empty to avoid crashing
    let botTokens = (typeof TELEGRAM_BOT_TOKENS !== 'undefined') ? TELEGRAM_BOT_TOKENS : [];
    let channelId = (typeof TELEGRAM_CHANNEL_ID !== 'undefined') ? TELEGRAM_CHANNEL_ID : "";
    let roundRobinIndex = 0;

    /**
     * Ensures tokens are available (now instantaneous, kept async for API compatibility)
     */
    async function ensureTokensLoaded() {
        if (botTokens.length === 0 && typeof TELEGRAM_BOT_TOKENS !== 'undefined') {
            botTokens = TELEGRAM_BOT_TOKENS;
            channelId = TELEGRAM_CHANNEL_ID;
        }
        return Promise.resolve();
    }

    /** Gets the next bot token using round-robin distribution */
    function getNextToken() {
        if (botTokens.length === 0) return null;
        const token = botTokens[roundRobinIndex % botTokens.length];
        roundRobinIndex++;
        return token;
    }

    /**
     * Resolves a single tg://file_id URL to a fresh download URL.
     * Checks localStorage cache first. Falls through non-tg:// URLs unchanged.
     * Round-robins across multiple bots. On 429 rate limit, tries next bot.
     * @param {string} url - The URL to resolve (e.g. "tg://AgACAgIAAxk...")
     * @returns {Promise<string>} - The resolved download URL
     */
    async function resolveTelegramUrl(url) {
        if (!url || !url.startsWith('tg://')) return url;

        let rawId = url.substring(5); // Strip "tg://"
        let preferredBotIndex = -1;
        let fileId = rawId;

        // Check for indexed format "tg://index:file_id"
        const colonIndex = rawId.indexOf(':');
        if (colonIndex !== -1) {
            const indexPart = rawId.substring(0, colonIndex);
            if (!isNaN(indexPart) && indexPart !== "") {
                preferredBotIndex = parseInt(indexPart);
                fileId = rawId.substring(colonIndex + 1);
            }
        }

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
        } catch (e) {}

        await ensureTokensLoaded();
        if (botTokens.length === 0) return url;

        // 2. Determine bot order
        let botsToTry = [];
        if (preferredBotIndex >= 0 && preferredBotIndex < botTokens.length) {
            // Try preferred bot first, then others
            botsToTry.push(preferredBotIndex);
            for (let i = 0; i < botTokens.length; i++) {
                if (i !== preferredBotIndex) botsToTry.push(i);
            }
        } else {
            // No index (legacy) — try round-robin order
            for (let i = 0; i < botTokens.length; i++) {
                botsToTry.push((roundRobinIndex + i) % botTokens.length);
            }
        }

        let lastError = null;
        for (const botIdx of botsToTry) {
            const token = botTokens[botIdx];
            const MAX_RETRIES = 2;

            for (let retry = 0; retry <= MAX_RETRIES; retry++) {
                try {
                    const res = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
                    
                    if (res.status === 429 || res.status === 401) {
                        lastError = `HTTP ${res.status}`;
                        break; 
                    }

                    const data = await res.json();
                    if (data.ok && data.result.file_path) {
                        const downloadUrl = `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
                        try {
                            localStorage.setItem(cacheKey, JSON.stringify({
                                url: downloadUrl,
                                expires: Date.now() + CACHE_TTL_MS
                            }));
                        } catch (e) {}
                        return downloadUrl;
                    } else {
                        const desc = (data.description || '').toLowerCase();
                        if (desc.includes('unauthorized') || desc.includes('forbidden') || desc.includes('bot was blocked') || desc.includes('wrong file_id')) {
                            lastError = data.description;
                            break; // Try next bot
                        }
                        console.error('TelegramImages: getFile failed:', data.description);
                        return url;
                    }
                } catch (err) {
                    lastError = err;
                    if (retry < MAX_RETRIES) {
                        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retry)));
                    }
                }
            }
        }

        console.error('TelegramImages: All bots failed:', lastError);
        return url;
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
            const options = q.options;
            if (options) {
                if (Array.isArray(options)) {
                    // Handle array formats: [{text: "..."}, ...] or ["string", ...]
                    options.forEach(opt => {
                        if (typeof opt === 'string') htmlFields.push(opt);
                        else if (typeof opt === 'object' && opt !== null) {
                            Object.values(opt).forEach(v => { if (typeof v === 'string') htmlFields.push(v); });
                        }
                    });
                } else if (typeof options === 'object') {
                    Object.values(options).forEach(opt => {
                        if (typeof opt === 'string') htmlFields.push(opt);
                        else if (typeof opt === 'object' && opt !== null) {
                            Object.values(opt).forEach(v => { if (typeof v === 'string') htmlFields.push(v); });
                        }
                    });
                }
            }

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

        // Make sure tokens are loaded before we start batch processing
        await ensureTokensLoaded();

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

            // Delay between batches to avoid rate limits
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

    /**
     * Uploads an image to Telegram channel and returns tg://file_id.
     * Used by admin editor for adding images to questions.
     * @param {File} file - The image file to upload
     * @returns {Promise<string|null>} - The tg://file_id URL, or null on failure
     */
    async function uploadImage(file) {
        await ensureTokensLoaded();

        if (botTokens.length === 0 || !channelId) {
            console.error('TelegramImages: Missing bot tokens or channel ID');
            alert('Error: Telegram configuration is missing. Cannot upload image.');
            return null;
        }

        const formData = new FormData();
        formData.append('chat_id', channelId);
        formData.append('photo', file);

        let lastError = null;
        const maxAttempts = botTokens.length;

        for (let botAttempt = 0; botAttempt < maxAttempts; botAttempt++) {
            const botIdx = roundRobinIndex % botTokens.length;
            const token = getNextToken();
            try {
                const response = await fetch(
                    `https://api.telegram.org/bot${token}/sendPhoto`,
                    { method: 'POST', body: formData }
                );

                if (response.status === 401 || response.status === 429) {
                    lastError = `Status ${response.status}`;
                    continue;
                }

                const data = await response.json();
                if (data.ok) {
                    const photoArray = data.result.photo;
                    const fileId = photoArray[photoArray.length - 1].file_id;
                    return `tg://${botIdx}:${fileId}`;
                } else {
                    lastError = data.description;
                }
            } catch (error) {
                lastError = error.message;
            }
        }

        console.error('TelegramImages: All upload attempts failed. Last error:', lastError);
        alert('Error uploading image. All bot tokens failed. See console.');
        return null;
    }

    /**
     * Sends a text message to the Telegram channel.
     * Used for announcements (score releases, etc.)
     * @param {string} text - Message text
     * @param {string} [parseMode='Markdown'] - Parse mode
     * @returns {Promise<boolean>} - True if sent successfully
     */
    async function sendMessage(text, parseMode = 'Markdown') {
        await ensureTokensLoaded();

        if (botTokens.length === 0 || !channelId) {
            console.warn('TelegramImages: Missing config for sendMessage');
            return false;
        }

        const token = getNextToken();

        try {
            const res = await fetch(
                `https://api.telegram.org/bot${token}/sendMessage`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: channelId,
                        text: text,
                        parse_mode: parseMode,
                        disable_web_page_preview: false
                    })
                }
            );
            const data = await res.json();
            return data.ok === true;
        } catch (err) {
            console.error('TelegramImages: sendMessage error:', err.message);
            return false;
        }
    }

    // Public API
    return {
        resolveTelegramUrl,
        resolveAllTelegramUrls,
        replaceImgSrcInHtml,
        collectImageUrls,
        uploadImage,
        sendMessage,
        ensureTokensLoaded
    };
})();
