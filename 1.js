(function() {
    const playerElement = document.getElementById('player');
    // Get final URL from window location, handling potential /watch/ path segment like chha.html
    const currentUrl = window.location.href;
    const finalUrl = currentUrl.includes('/watch/') ? currentUrl.replace("/watch/", "/") : currentUrl;
    const app = {};

    // --- Elements Cache ---
    const DOMElements = {
        fileName: document.getElementById('file-name'),
        fileSize: document.getElementById('file-size'),
        fileResolution: document.getElementById('file-resolution'),
        fileDuration: document.getElementById('file-duration'),
        loadingOverlay: document.getElementById('loading-overlay'),
        errorOverlay: document.getElementById('error-overlay'),
        errorMessage: document.getElementById('error-message'),
        streamDropdownContainer: document.getElementById('stream-dropdown-container'),
        streamMenu: document.getElementById('stream-menu'),
        streamBtn: document.getElementById('stream-btn-label'),
        toast: document.getElementById('toast'),
        toastMessage: document.getElementById('toast')?.querySelector('.toast-message'),
        toastProgress: document.getElementById('toast')?.querySelector('.toast-progress'),
        toastIcon: document.getElementById('toast')?.querySelector('.toast-icon'),
        themeToggleBtn: document.querySelector('.toggle-dark-mode')
    };

    // --- State ---
    let player = null;
    let toastTimeout = null;
    let activeDropdownListeners = false;
    let activeGlobalKeyListeners = false;
    let playerEventListeners = [];
    let initTimeout = null;

    // --- Utilities ---
    const formatTime = (secs, showHrs = false) => { if (isNaN(secs) || secs < 0) return showHrs ? '0:00:00' : '0:00'; secs = Math.round(secs); const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60; return (showHrs || h > 0) ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`; };
    const sanitizeFilename = (name) => name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').replace(/_{2,}/g, '_');
    const getFileExtension = (url) => { try { const p = new URL(url).pathname, d = p.lastIndexOf('.'); if (d > 0 && d < p.length - 1) return p.substring(d + 1).toLowerCase(); } catch {} return 'mp4'; };
    const getCurrentFileName = () => DOMElements.fileName?.textContent?.trim() || '';

    // --- Theme ---
    const setTheme = (theme) => { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('theme', theme); const i = DOMElements.themeToggleBtn?.querySelector('i'); if (i) i.className = theme === 'light' ? 'fas fa-sun' : 'fas fa-moon'; document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#1a1a2e' : '#f2efe7'); };
    app.toggleDarkMode = () => { const t = document.documentElement.getAttribute('data-theme') || 'dark'; setTheme(t === 'dark' ? 'light' : 'dark'); };
    const setupTheme = () => { const s = localStorage.getItem('theme'), p = window.matchMedia?.('(prefers-color-scheme: dark)').matches; setTheme(s || (p ? 'dark' : 'light')); };

    // --- Metadata ---
    const updateFileMetadata = () => {
        if (!player?.state?.canPlay || isNaN(player.state.duration) || player.state.duration <= 0) { // Check duration > 0
            if (DOMElements.fileDuration) DOMElements.fileDuration.textContent = "Dur: N/A";
            if (DOMElements.fileResolution) DOMElements.fileResolution.textContent = "Res: N/A";
            if (DOMElements.fileSize) DOMElements.fileSize.textContent = "Size: N/A";
            return;
        }
        const { duration: vd, videoWidth: vw = 0, videoHeight: vh = 0, hasAudioTrack: ha } = player.state;
        if(DOMElements.fileDuration) DOMElements.fileDuration.textContent = `Dur: ${formatTime(vd, vd >= 3600)}`;
        if(DOMElements.fileResolution) DOMElements.fileResolution.textContent = (vw > 0 && vh > 0) ? `Res: ${vw}x${vh}` : (ha ? "Res: Audio Only" : "Res: N/A");

        // Enhanced size estimation based on chha.html logic
        let bitrateMbps = 1; // Default rough estimate
        if (vw * vh > 0) { // Video track exists
            if (vw * vh >= 3840 * 2160) bitrateMbps = 8; // ~4K
            else if (vw * vh >= 1920 * 1080) bitrateMbps = 4; // ~1080p
            else if (vw * vh >= 1280 * 720) bitrateMbps = 2.5; // ~720p
            else bitrateMbps = 1.5; // ~SD
        } else if (ha) { // Audio only
            bitrateMbps = 0.192; // Assume ~192kbps audio
        }
        const estimatedSizeBytes = (bitrateMbps * 1e6 / 8) * vd;
        const estimatedSizeMB = estimatedSizeBytes / (1024 * 1024);

        if (DOMElements.fileSize) {
            if (!isNaN(estimatedSizeMB) && estimatedSizeMB > 0.1) {
                DOMElements.fileSize.textContent = `Size: ~${estimatedSizeMB.toFixed(1)} MB`;
            } else if (estimatedSizeMB > 0) {
                DOMElements.fileSize.textContent = `Size: ~${(estimatedSizeBytes / 1024).toFixed(0)} KB`;
            } else {
                DOMElements.fileSize.textContent = "Size: N/A";
            }
        }
        player.setAttribute('data-metadata-updated', 'true');
        const cfn = getCurrentFileName(); if (playerElement && !playerElement.getAttribute('title') && cfn) playerElement.setAttribute('title', cfn);
    };
    const setInitialFileMetadata = () => {
        // Simple initialization without placeholder checks from chha.html
        const initialFileName = DOMElements.fileName?.textContent?.trim();
        if (DOMElements.fileName && (!initialFileName || initialFileName === '')) {
            DOMElements.fileName.textContent = "Loading video...";
        }
        if(DOMElements.fileDuration) DOMElements.fileDuration.textContent = "Dur: ...";
        if(DOMElements.fileResolution) DOMElements.fileResolution.textContent = "Res: ...";
        if(DOMElements.fileSize) DOMElements.fileSize.textContent = "Size: ...";
    };

    // --- UI Overlays & Toast ---
    const showOverlay = (overlayEl, show = true) => { if (!overlayEl) return; overlayEl.classList.toggle('show', show); overlayEl.setAttribute('aria-hidden', String(!show)); };
    const showErrorOverlay = (msg) => { if(DOMElements.errorMessage) DOMElements.errorMessage.textContent = msg || 'Could not load video.'; showOverlay(DOMElements.errorOverlay, true); showOverlay(DOMElements.loadingOverlay, false); DOMElements.errorOverlay?.querySelector('.error-button')?.focus(); if (initTimeout) { clearTimeout(initTimeout); initTimeout = null; } };
    app.retryPlayback = () => {
         if (!player) return;
         console.log("Retrying playback...");
         showOverlay(DOMElements.errorOverlay, false); showOverlay(DOMElements.loadingOverlay, true);
         player.removeAttribute('data-started'); player.removeAttribute('data-metadata-updated');
         // Use player.load() from chha.html
         player.load().then(() => player.play()).catch(err => showErrorOverlay(`Retry failed: ${err.message || 'Could not load video.'}`));
    };
     // Updated showToast from chha.html
    const showToast = (message, type = 'info', duration = 3000) => {
        if (!DOMElements.toast || !DOMElements.toastMessage || !DOMElements.toastProgress || !DOMElements.toastIcon) return;
        DOMElements.toastMessage.textContent = message;
        DOMElements.toast.className = 'toast show'; // Reset classes then add type
        DOMElements.toast.classList.add(type);
        DOMElements.toast.setAttribute('aria-hidden', 'false'); // Ensure it's announced
        const icon = DOMElements.toastIcon.querySelector('i');
        if (icon) {
            const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
            icon.className = `fas ${icons[type] || icons.info}`;
        }
        clearTimeout(toastTimeout);
        const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (!prefersReducedMotion) {
            DOMElements.toastProgress.style.animation = 'none'; 
            void DOMElements.toastProgress.offsetHeight; 
            DOMElements.toastProgress.style.animation = `progress ${duration/1000}s linear forwards`;
        } else { 
            DOMElements.toastProgress.style.animation = 'none'; 
        }
        toastTimeout = setTimeout(() => { 
            DOMElements.toast.classList.remove('show', 'info', 'success', 'warning', 'error'); 
            DOMElements.toast.setAttribute('aria-hidden', 'true'); 
        }, duration);
    };

    // --- Player ---
    const addPlayerListener = (e, h, options) => { if (!player) return; player.addEventListener(e, h, options); playerEventListeners.push({ event: e, handler: h, options }); };
    const onCanPlay = (e) => { if (!player.autoplay || player.hasAttribute('data-started')) showOverlay(DOMElements.loadingOverlay, false); showOverlay(DOMElements.errorOverlay, false); if (!player.hasAttribute('data-metadata-updated')) updateFileMetadata(); };
    const onWaiting = (e) => { if (player.hasAttribute('data-started') && player.currentTime > 0 && !player.paused && !player.ended) showOverlay(DOMElements.loadingOverlay, true); }; // Logic from chha.html
    const onPlaying = (e) => { showOverlay(DOMElements.loadingOverlay, false); showOverlay(DOMElements.errorOverlay, false); player.setAttribute('data-started', 'true'); if (!player.hasAttribute('data-metadata-updated')) updateFileMetadata(); if (initTimeout) { clearTimeout(initTimeout); initTimeout = null; } };
    // Updated onError from chha.html
    const onError = (e) => {
        console.error("Player error:", e.detail);
        const err = e.detail; let msg='Unknown error.';
        if(err){
            const code=err.code, msgTxt=err.message;
            if(code===4||msgTxt?.includes('MEDIA_SRC')) msg='Format unsupported/URL invalid.';
            else if(code===2||err.group==='network') msg='Network error.';
            else if(code===3) msg='Video decoding error (corrupted?).';
            else if(msgTxt) msg=`Error: ${msgTxt} (Code: ${code||'N/A'})`;
        }
        showErrorOverlay(msg);
        if (initTimeout) { clearTimeout(initTimeout); initTimeout = null; }
    };
    const onLoadedMetadata = (e) => { if (!player.hasAttribute('data-metadata-updated')) updateFileMetadata(); };
    const onEnded = (e) => { console.log('Playback ended.'); showOverlay(DOMElements.loadingOverlay, false); }; // Added console log
    // Updated initializePlayer from chha.html
    const initializePlayer = () => {
        if (!playerElement) { showErrorOverlay("Player element missing."); return; }
        showOverlay(DOMElements.loadingOverlay, true);
        customElements.whenDefined('media-player').then(() => {
            player = playerElement;
            const initialSrc = player?.getAttribute('src');

            // If we have a valid URL from finalUrl that's different from the initial source, use it
            if (finalUrl && finalUrl !== initialSrc && finalUrl.startsWith('http')) {
                player.src = finalUrl;
            } else if (!initialSrc && finalUrl && finalUrl.startsWith('http')) {
                 player.src = finalUrl; // Ensure src is set if initially empty but finalUrl is valid
            }

            console.log("Player init, src:", player.src);

            // Attach listeners
            addPlayerListener('provider-change', () => { player.removeAttribute('data-started'); player.removeAttribute('data-metadata-updated'); showOverlay(DOMElements.loadingOverlay, true); });
            addPlayerListener('can-play', onCanPlay);
            addPlayerListener('waiting', onWaiting);
            addPlayerListener('playing', onPlaying);
            addPlayerListener('error', onError);
            addPlayerListener('loaded-metadata', onLoadedMetadata);
            addPlayerListener('ended', onEnded);

            // Init timeout (15s from chha.html)
            initTimeout = setTimeout(() => { 
                if (!player.hasAttribute('data-started') && !document.hidden) 
                    showErrorOverlay('Player took too long to load. Check connection/refresh.'); 
            }, 15000);
            addPlayerListener('playing', () => {
                if (initTimeout) {
                    clearTimeout(initTimeout);
                    initTimeout = null;
                }
            }, { once: true });

        }).catch(err => { 
            console.error("Vidstack component failed define:", err); 
            showErrorOverlay('Failed to load player component.'); 
            showOverlay(DOMElements.loadingOverlay, false); 
        });

        // Component definition fallback
        setTimeout(() => { 
            if (!customElements.get('media-player') && !player) { 
                showErrorOverlay('Player failed to load completely. Please refresh.'); 
                showOverlay(DOMElements.loadingOverlay, false); 
            } 
        }, 10000);
    };

    // --- Dropdown ---
    const closeDropdown = () => { 
        if (!DOMElements.streamDropdownContainer?.classList.contains('open')) return; 
        DOMElements.streamDropdownContainer.classList.remove('open'); 
        DOMElements.streamBtn?.setAttribute('aria-expanded', 'false'); 
        if (activeDropdownListeners) { 
            document.removeEventListener('click', closeDropdownOnClickOutside, true); 
            document.removeEventListener('keydown', handleDropdownKeys); 
            activeDropdownListeners = false; 
        } 
        DOMElements.streamBtn?.focus(); 
    };
    const openDropdown = () => { 
        if (DOMElements.streamDropdownContainer?.classList.contains('open')) return; 
        DOMElements.streamDropdownContainer.classList.add('open'); 
        DOMElements.streamBtn?.setAttribute('aria-expanded', 'true'); 
        const f = DOMElements.streamMenu?.querySelector('.dropdown-item[role="menuitem"]'); 
        if (f) {
            f.setAttribute('tabindex', '0'); 
            f.focus();
        }
        if (!activeDropdownListeners) { 
            document.addEventListener('click', closeDropdownOnClickOutside, true); 
            document.addEventListener('keydown', handleDropdownKeys); 
            activeDropdownListeners = true; 
        } 
    };
    const closeDropdownOnClickOutside = (e) => { 
        if (DOMElements.streamDropdownContainer && !DOMElements.streamDropdownContainer.contains(e.target)) 
            closeDropdown(); 
    };
    const handleDropdownKeys = (e) => {
        if (!DOMElements.streamDropdownContainer?.classList.contains('open')) return;
        const items = Array.from(DOMElements.streamMenu.querySelectorAll('.dropdown-item[tabindex="0"]')); 
        if (items.length === 0) return;
        const activeIndex = items.findIndex(item => item === document.activeElement); 
        let handled = true;
        switch (e.key) {
            case 'Escape': closeDropdown(); DOMElements.streamBtn?.focus(); break; // Focus back on button
            case 'ArrowDown': items[(activeIndex + 1) % items.length].focus(); break;
            case 'ArrowUp': items[(activeIndex - 1 + items.length) % items.length].focus(); break;
            case 'Home': items[0]?.focus(); break;
            case 'End': items[items.length - 1]?.focus(); break;
            case 'Tab': closeDropdown(); handled = false; break; // Allow default tab behavior
            default: handled = false;
        }
        if (handled) e.preventDefault();
    };
    app.toggleStreamMenu = (e) => {
        if (!DOMElements.streamDropdownContainer || !DOMElements.streamMenu || !DOMElements.streamBtn) return;
        const isOpen = DOMElements.streamDropdownContainer.classList.toggle('open');
        DOMElements.streamBtn.setAttribute('aria-expanded', isOpen.toString());
        if (isOpen) { 
            const firstItem = DOMElements.streamMenu.querySelector('.dropdown-item[tabindex="0"]');
            if (firstItem) firstItem.focus();
            if (!activeDropdownListeners) { 
                document.addEventListener('click', closeDropdownOnClickOutside, true); 
                document.addEventListener('keydown', handleDropdownKeys); 
                activeDropdownListeners = true; 
            } 
        } else { 
            if (activeDropdownListeners) { 
                document.removeEventListener('click', closeDropdownOnClickOutside, true); 
                document.removeEventListener('keydown', handleDropdownKeys); 
                activeDropdownListeners = false; 
            } 
        }
        if (e) e.stopPropagation();
    };

    // --- Actions ---
    // Updated playerUrlBuilder from chha.html (removes mpc://play/, adds title to intents)
    const playerUrlBuilder = {
        'vlc-pc': (url) => `vlc://${url}`,
        'potplayer': (url) => `potplayer://${url}`,
        'mpc': (url) => `mpc://${url}`, // Removed /play/
        'kmpc': (url) => `kmplayer://${url}`,
        'vlc': (url) => `vlc://${url}`,
        'mx': (url) => `intent:${url}#Intent;package=com.mxtech.videoplayer.ad;S.title=${encodeURIComponent(getCurrentFileName() || 'Video')};end`,
        'mxpro': (url) => `intent:${url}#Intent;package=com.mxtech.videoplayer.pro;S.title=${encodeURIComponent(getCurrentFileName() || 'Video')};end`,
        'nplayer': (url) => `nplayer-${url}`,
        'splayer': (url) => `intent:${url}#Intent;action=com.young.simple.player.playback_online;package=com.young.simple.player;end`,
        'km': (url) => `intent:${url}#Intent;package=com.kmplayer;S.title=${encodeURIComponent(getCurrentFileName() || 'Video')};end`,
    };
    // Updated playOnline from chha.html (uses window.open with timeout fallback)
    app.playOnline = (type) => {
        closeDropdown();
        const urlBuilder = playerUrlBuilder[type];
        const playerName = type.replace('-pc', ' (PC)').replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        if (!urlBuilder || !finalUrl || !finalUrl.startsWith('http')) { 
            showToast(`Invalid URL or player type: ${type}`, 'error'); 
            return; 
        }
        
        const appUrl = urlBuilder(finalUrl);

        console.log(`Attempting to open ${playerName}: ${appUrl}`);
        try {
            const win = window.open(appUrl, '_blank');
            if (!win || win.closed || typeof win.closed == 'undefined') {
                showToast(`Trying to open ${playerName}...`, 'info');
                // Fallback for browsers that block window.open for custom protocols
                setTimeout(() => { window.location.href = appUrl; }, 300);
            } else { 
                showToast(`Attempting to launch ${playerName}...`, 'info'); 
            }
        } catch (err) { 
            console.error('Error opening external player:', err); 
            showToast(`Failed to open ${playerName}. Try copy link.`, 'error'); 
        }
    };
    // Updated download logic from chha.html (uses title if available)
    app.download = () => {
        if (!finalUrl || !finalUrl.startsWith('http')) { 
            showToast('Invalid URL.', 'error'); 
            return; 
        }
        try {
            const link = document.createElement('a');
            link.href = finalUrl;
            let fname = "video"; // Default base name
            const currentTitle = getCurrentFileName();

            // Use the title if available and not "Loading video..."
            if (currentTitle && !currentTitle.toLowerCase().includes('loading')) {
                fname = currentTitle;
            } else {
                try {
                    const lastPart = new URL(finalUrl).pathname.split('/').pop();
                    if(lastPart) fname = decodeURIComponent(lastPart.split('.')[0]);
                } catch { /* Ignore URL parsing errors */ }
            }

            // Sanitize and add extension
            const safeName = sanitizeFilename(fname);
            link.download = `${safeName}.${getFileExtension(finalUrl)}`;

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast('Download started...', 'success');
        } catch (err) {
            console.error('Download error:', err);
            showToast('Download failed.', 'error');
        }
    };
    app.copyLink = async () => { 
        if (!finalUrl || !finalUrl.startsWith('http')) { 
            showToast('No valid link.', 'error'); 
            return; 
        } 
        if (!navigator.clipboard) { 
            try { 
                const ta = document.createElement("textarea"); 
                ta.value = finalUrl; 
                ta.style.position = "fixed"; 
                ta.style.opacity = "0"; 
                document.body.appendChild(ta); 
                ta.focus(); 
                ta.select(); 
                const ok = document.execCommand('copy'); 
                document.body.removeChild(ta); 
                showToast(ok ? 'Copied (Fallback)' : 'Copy failed (Fallback).', ok ? 'success' : 'error'); 
            } catch (e) { 
                showToast('Could not copy.', 'error'); 
            } 
            return; 
        } 
        try { 
            await navigator.clipboard.writeText(finalUrl); 
            showToast('Link copied!', 'success'); 
        } catch (e) { 
            showToast('Copy failed.', 'error'); 
        } 
    };

    // --- Global Keys (Updated from chha.html) ---
    const handleGlobalKeyDown = (e) => {
        const t = e.target;
        const i = t.matches('input, textarea, button, [role="menuitem"], [contenteditable="true"]');
        const d = DOMElements.streamDropdownContainer?.classList.contains('open');
        // Added check for player.isReady from chha.html
        if (e.metaKey || e.ctrlKey || e.altKey || !player?.isReady || i || d) return;
        
        let h = true, s = e.shiftKey ? 5 : 10; // Seek amount from chha.html
        switch (e.key) {
            case 'k': case ' ': player.paused ? player.play() : player.pause(); break;
            case 'f': player.fullscreen.active ? player.exitFullscreen() : player.enterFullscreen(); break;
            case 'm': player.muted = !player.muted; showToast(player.muted ? 'Muted' : 'Unmuted', 'info', 1500); break; // Use player.muted directly
            case 'ArrowRight': player.currentTime = Math.min(player.duration, player.currentTime + s); break; // Use player.duration
            case 'ArrowLeft': player.currentTime = Math.max(0, player.currentTime - s); break;
            case 'ArrowUp': player.volume = Math.min(1, player.volume + 0.1); showToast(`Volume: ${Math.round(player.volume * 100)}%`, 'info', 1500); break; // Use player.volume
            case 'ArrowDown': player.volume = Math.max(0, player.volume - 0.1); showToast(`Volume: ${Math.round(player.volume * 100)}%`, 'info', 1500); break; // Use player.volume
            // Removed number keys for seeking
            default: h = false;
        }
        if (h) e.preventDefault();
    };

    // --- Cleanup ---
    const cleanup = () => { 
        if (activeGlobalKeyListeners) { 
            document.removeEventListener('keydown', handleGlobalKeyDown); 
            activeGlobalKeyListeners = false; 
        } 
        if (activeDropdownListeners) { 
            document.removeEventListener('click', closeDropdownOnClickOutside, true); 
            document.removeEventListener('keydown', handleDropdownKeys); 
            activeDropdownListeners = false; 
        } 
        if (player && playerEventListeners.length > 0) { 
            playerEventListeners.forEach(({ event: e, handler: h, options: o }) => { 
                try { 
                    player.removeEventListener(e, h, o); 
                } catch (err) {} 
            }); 
            playerEventListeners = []; 
            player = null; 
        } 
        clearTimeout(toastTimeout); 
        clearTimeout(initTimeout); 
        toastTimeout = null; 
        initTimeout = null; 
    };

    // --- Init ---
    const init = () => {
        window.app = app; // Moved to the beginning of init
        // Crucial check
        if (!finalUrl || !finalUrl.startsWith('http')) {
            console.error("Initialization failed: Invalid src URL:", finalUrl);
            showErrorOverlay("Video source URL is missing or invalid.");
            showOverlay(DOMElements.loadingOverlay, false);
            return;
        }
        setupTheme();
        setInitialFileMetadata();
        initializePlayer();
        if (!activeGlobalKeyListeners) { 
            document.addEventListener('keydown', handleGlobalKeyDown); 
            activeGlobalKeyListeners = true; 
        }
        window.addEventListener('beforeunload', cleanup);
    };

    // --- Start ---
    if (document.readyState === 'loading') 
        document.addEventListener('DOMContentLoaded', init); 
    else 
        init();
})();