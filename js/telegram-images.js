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

        // 2. Ensure tokens are loaded from Firestore
        await ensureTokensLoaded();

        if (botTokens.length === 0) {
            console.error('TelegramImages: No bot tokens available');
            return url;
        }

        // 3. Try each bot (round-robin with fallback on 401/429/Unauthorized)
        const maxAttempts = botTokens.length;
        let lastError = null;

        for (let botAttempt = 0; botAttempt < maxAttempts; botAttempt++) {
            const token = getNextToken();
            const MAX_RETRIES = 2;

            for (let retry = 0; retry <= MAX_RETRIES; retry++) {
                try {
                    const res = await fetch(
                        `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`
                    );

                    // Rate limited or Unauthorized at HTTP level — try next bot immediately
                    if (res.status === 429 || res.status === 401) {
                        lastError = `HTTP ${res.status}`;
                        console.warn(`TelegramImages: Bot returned ${res.status}, trying next bot...`);
                        break; // Break retry loop, continue to next bot
                    }

                    const data = await res.json();

                    if (data.ok && data.result.file_path) {
                        const downloadUrl = `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;

                        // Cache the resolved URL
                        try {
                            localStorage.setItem(cacheKey, JSON.stringify({
                                url: downloadUrl,
                                expires: Date.now() + CACHE_TTL_MS
                            }));
                        } catch (e) {
                            // localStorage full or unavailable
                        }

                        return downloadUrl;
                    } else {
                        // Telegram-level error — check if it's auth-related (try next bot)
                        const desc = (data.description || '').toLowerCase();
                        if (desc.includes('unauthorized') || desc.includes('forbidden') || desc.includes('bot was blocked')) {
                            console.warn(`TelegramImages: getFile failed (${data.description}), trying next bot...`);
                            lastError = data.description;
                            break; // Try next bot
                        }
                        // Other Telegram error (bad file_id) — don't retry, give up
                        console.error('TelegramImages: getFile failed:', data.description);
                        return url;
                    }
                } catch (err) {
                    lastError = err;
                    if (retry < MAX_RETRIES) {
                        const waitMs = 1000 * Math.pow(2, retry);
                        await new Promise(r => setTimeout(r, waitMs));
                    }
                }
            }
        }

        console.error('TelegramImages: All bots failed:', lastError);
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
            const token = getNextToken();
            try {
                const response = await fetch(
                    `https://api.telegram.org/bot${token}/sendPhoto`,
                    { method: 'POST', body: formData }
                );

                // If unauthorized (401) or rate-limited (429), try the next token
                if (response.status === 401 || response.status === 429) {
                    console.warn(`Telegram token failed with ${response.status}. Trying next...`);
                    lastError = `Status ${response.status}`;
                    continue;
                }

                const data = await response.json();

                if (data.ok) {
                    const photoArray = data.result.photo;
                    const fileId = photoArray[photoArray.length - 1].file_id;
                    return `tg://${fileId}`;
                } else {
                    lastError = data.description;
                    console.warn('Upload failed on this token:', data.description);
                    // Still continue to next token if it's a Telegram-level error
                }
            } catch (error) {
                lastError = error.message;
                console.warn('Network error on this token:', error.message);
                // Continue to next token
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
