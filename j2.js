const currentUrl = window.location.href;
const finalUrl = currentUrl.includes('/watch/') ? currentUrl.replace("/watch/", "/") : currentUrl;
const app = {}; // Interface for HTML onclick

document.addEventListener('DOMContentLoaded', () => {
    // --- Element Cache ---
    const playerElement = document.getElementById('player');
    const fileNameEl = document.getElementById('file-name');
    const fileSizeEl = document.getElementById('file-size');
    const fileResolutionEl = document.getElementById('file-resolution');
    const fileDurationEl = document.getElementById('file-duration');
    const loadingOverlay = document.getElementById('loading-overlay');
    const errorOverlay = document.getElementById('error-overlay');
    const errorMessage = document.getElementById('error-message');
    const streamDropdownContainer = document.getElementById('stream-dropdown-container');
    const streamMenu = document.getElementById('stream-menu');
    const streamBtn = document.getElementById('stream-btn-label');
    const toastElement = document.getElementById('toast');
    const toastMessage = toastElement?.querySelector('.toast-message');
    const toastProgress = toastElement?.querySelector('.toast-progress');
    const toastIconContainer = toastElement?.querySelector('.toast-icon');
    const themeToggleBtn = document.querySelector('.toggle-dark-mode'); // Cache theme toggle button

    // --- State ---
    let player = null;
    let toastTimeout = null;

    // --- Theme ---
    const setTheme = (theme) => {
         document.documentElement.setAttribute('data-theme', theme);
         localStorage.setItem('theme', theme);
         const icon = themeToggleBtn?.querySelector('i');
         if (icon) icon.className = theme === 'light' ? 'fas fa-sun' : 'fas fa-moon';
    };
    app.toggleDarkMode = () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        setTheme(currentTheme === 'dark' ? 'light' : 'dark');
    };
    const setupTheme = () => {
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
        setTheme(savedTheme || (prefersDark ? 'dark' : 'light'));
    };

    // --- Metadata ---
    const formatTime = (totalSeconds, showHours = false) => {
        if (isNaN(totalSeconds) || totalSeconds < 0) return showHours ? '0:00:00' : '0:00';
        totalSeconds = Math.floor(totalSeconds);
        const h = Math.floor(totalSeconds / 3600), m = Math.floor((totalSeconds % 3600) / 60), s = totalSeconds % 60;
        const ps = String(s).padStart(2, '0'), pm = String(m).padStart(2, '0');
        return (showHours || h > 0) ? `${h}:${pm}:${ps}` : `${pm}:${ps}`;
    };
    const updateFileMetadata = () => {
        if (!player?.isReady || isNaN(player.duration) || player.duration <= 0) {
            console.warn("Metadata update skipped: Player not ready/duration invalid.");
            fileDurationEl.textContent = "Dur: N/A"; fileResolutionEl.textContent = "Res: N/A"; fileSizeEl.textContent = "Size: N/A";
            return;
        }
        const { duration: videoDuration, videoWidth: width = 0, videoHeight: height = 0 } = player;
        fileDurationEl.textContent = `Dur: ${formatTime(videoDuration, true)}`;
        fileResolutionEl.textContent = (width > 0 && height > 0) ? `Res: ${width}x${height}` : "Res: N/A";
        let bitrateMbps = 1; // Rough estimate based on resolution
        if (width * height >= 3840 * 2160) bitrateMbps = 8; else if (width * height >= 1920 * 1080) bitrateMbps = 4; else if (width * height >= 1280 * 720) bitrateMbps = 2.5;
        const estimatedSizeMB = (bitrateMbps * 1e6 / 8) * videoDuration / (1024 * 1024);
        fileSizeEl.textContent = (!isNaN(estimatedSizeMB) && estimatedSizeMB > 0.1) ? `Size: ~${estimatedSizeMB.toFixed(1)}MB` : (estimatedSizeMB > 0 ? `Size: <0.1MB` : "Size: N/A");
        player.setAttribute('data-metadata-updated', 'true');
    };
    const setInitialFileMetadata = () => {
         const initialFileName = fileNameEl?.textContent.trim();
         if (initialFileName && initialFileName !== '%s') { document.title = initialFileName + " | Thunder FileToLink"; }
         else if (document.title === '%s') { document.title = "Thunder FileToLink"; }
         if (fileNameEl && (!initialFileName || initialFileName === '%s')) { fileNameEl.textContent = "Loading video..."; }
         fileDurationEl.textContent = "Dur: ..."; fileResolutionEl.textContent = "Res: ..."; fileSizeEl.textContent = "Size: ...";
    };

    // --- UI Overlays & Toast ---
    const showOverlay = (overlay, show = true) => overlay?.classList.toggle('show', show);
    const showErrorOverlay = (message) => {
         if(errorMessage) errorMessage.textContent = message || 'Could not load video.';
         showOverlay(errorOverlay, true);
         showOverlay(loadingOverlay, false);
    };
    app.retryPlayback = () => {
         if (!player) return;
         console.log("Retrying playback...");
         showOverlay(errorOverlay, false); showOverlay(loadingOverlay, true);
         player.removeAttribute('data-started'); player.removeAttribute('data-metadata-updated');
         player.load().then(() => player.play()).catch(err => showErrorOverlay(`Retry failed: ${err.message || 'Could not load video.'}`));
    };
     // Type: 'info', 'success', 'warning', 'error'
    const showToast = (message, type = 'info') => {
        if (!toastElement || !toastMessage || !toastProgress || !toastIconContainer) return;
        toastMessage.textContent = message;
        toastElement.className = 'toast show'; // Reset classes then add type
        toastElement.classList.add(type);
        const icon = toastIconContainer.querySelector('i');
        if (icon) {
            const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
            icon.className = `fas ${icons[type] || icons.info}`;
        }
        clearTimeout(toastTimeout);
        const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (!prefersReducedMotion) {
            toastProgress.style.animation = 'none'; void toastProgress.offsetHeight; toastProgress.style.animation = 'progress 3s linear forwards';
        } else { toastProgress.style.animation = 'none'; }
        toastTimeout = setTimeout(() => toastElement.classList.remove('show', 'info', 'success', 'warning', 'error'), 3000);
    };


    // --- Player Initialization & Handlers ---
    const initializePlayer = () => {
        showOverlay(loadingOverlay, true);
        customElements.whenDefined('media-player').then(() => {
            player = playerElement;
            const initialSrc = player?.getAttribute('src');
            let effectiveSrc = initialSrc;

            // Determine the correct source URL
            if (initialSrc === '%s') {
                if (finalUrl && finalUrl !== '%s' && finalUrl.startsWith('http')) { effectiveSrc = finalUrl; player.src = finalUrl; }
                else { showErrorOverlay(finalUrl && finalUrl !== '%s' ? `Invalid derived URL scheme: ${finalUrl}` : 'Video source placeholder not replaced.'); return; }
            } else if (finalUrl !== initialSrc && finalUrl.startsWith('http')) {
                 effectiveSrc = finalUrl; player.src = finalUrl; // Prefer cleaned URL if different
            }

            if (!effectiveSrc || !effectiveSrc.startsWith('http')) { showErrorOverlay(effectiveSrc ? `Invalid source URL scheme: ${effectiveSrc}` : 'Video source URL missing/invalid.'); return; }

            console.log("Player init, src:", effectiveSrc);
            // Attach listeners
            player.addEventListener('provider-change', () => { player.removeAttribute('data-started'); player.removeAttribute('data-metadata-updated'); showOverlay(loadingOverlay, true); });
            player.addEventListener('can-play', () => { if (!player.autoplay || player.hasAttribute('data-started')) showOverlay(loadingOverlay, false); showOverlay(errorOverlay, false); if (!player.hasAttribute('data-metadata-updated')) updateFileMetadata(); });
            player.addEventListener('waiting', () => { if (player.hasAttribute('data-started') && player.currentTime > 0 && !player.paused && !player.ended) showOverlay(loadingOverlay, true); });
            player.addEventListener('playing', () => { showOverlay(loadingOverlay, false); showOverlay(errorOverlay, false); player.setAttribute('data-started', 'true'); if (!player.hasAttribute('data-metadata-updated')) updateFileMetadata(); });
            player.addEventListener('error', (e) => { const err = e.detail; let msg='Unknown error.'; if(err){ const code=err.code, msgTxt=err.message; if(code===4||msgTxt?.includes('MEDIA_SRC')) msg='Format unsupported/URL invalid.'; else if(code===2||err.group==='network') msg='Network error.'; else if(code===3) msg='Video decoding error (corrupted?).'; else if(msgTxt) msg=`Error: ${msgTxt} (Code: ${code||'N/A'})`; } showErrorOverlay(msg); });
            player.addEventListener('loaded-metadata', () => { if (!player.hasAttribute('data-metadata-updated')) updateFileMetadata(); });
            player.addEventListener('ended', () => console.log('Playback ended.'));

            // Init timeout
            const initTimeout = setTimeout(() => { if (!player.hasAttribute('data-started') && !document.hidden) showErrorOverlay('Player took too long to load. Check connection/refresh.'); }, 15000);
            player.addEventListener('playing', () => clearTimeout(initTimeout), { once: true });

        }).catch(err => { console.error("Vidstack component failed define:", err); showErrorOverlay('Failed to load player component.'); showOverlay(loadingOverlay, false); });

        // Component definition fallback
        setTimeout(() => { if (!customElements.get('media-player') && !player) { showErrorOverlay('Player failed to load completely. Please refresh.'); showOverlay(loadingOverlay, false); } }, 10000);
    };


    // --- Dropdown ---
    const closeDropdownOnClickOutside = (event) => { if (streamDropdownContainer && !streamDropdownContainer.contains(event.target) && streamDropdownContainer.classList.contains('open')) app.toggleStreamMenu(); };
    const handleDropdownKeys = (event) => {
        if (!streamDropdownContainer?.classList.contains('open')) return;
        const items = Array.from(streamMenu.querySelectorAll('.dropdown-item[tabindex="0"]')); if (items.length === 0) return;
        const activeIndex = items.findIndex(item => item === document.activeElement); let handled = true;
        switch (event.key) {
            case 'Escape': app.toggleStreamMenu(); streamBtn?.focus(); break;
            case 'ArrowDown': items[(activeIndex + 1) % items.length].focus(); break;
            case 'ArrowUp': items[(activeIndex - 1 + items.length) % items.length].focus(); break;
            case 'Home': items[0]?.focus(); break;
            case 'End': items[items.length - 1]?.focus(); break;
            case 'Tab': app.toggleStreamMenu(); handled = false; break; // Allow default tab
            default: handled = false;
        }
         if (handled) event.preventDefault();
     };
    app.toggleStreamMenu = (event) => {
         if (!streamDropdownContainer || !streamMenu || !streamBtn) return;
         const isOpen = streamDropdownContainer.classList.toggle('open');
         streamBtn.setAttribute('aria-expanded', isOpen);
         if (isOpen) { streamMenu.querySelector('.dropdown-item[tabindex="0"]')?.focus(); document.addEventListener('click', closeDropdownOnClickOutside, true); document.addEventListener('keydown', handleDropdownKeys); }
         else { document.removeEventListener('click', closeDropdownOnClickOutside, true); document.removeEventListener('keydown', handleDropdownKeys); }
         event?.stopPropagation();
    };


    // --- Actions ---
    // Map player types to functions generating the URL/Intent string
    const playerUrlBuilder = {
        'vlc-pc': (url) => `vlc://${url}`,
        'potplayer': (url) => `potplayer://${url}`,
        'mpc': (url) => `mpc://${url}`,
        'kmpc': (url) => `kmplayer://${url}`,
        'vlc': (url) => `vlc://${url}`,
        'mx': (url) => `intent:${url}#Intent;package=com.mxtech.videoplayer.ad;end`,
        'mxpro': (url) => `intent:${url}#Intent;package=com.mxtech.videoplayer.pro;end`,
        'nplayer': (url) => `nplayer-${url}`,
        'splayer': (url) => `intent:${url}#Intent;action=com.young.simple.player.playback_online;package=com.young.simple.player;end`,
        'km': (url) => `intent:${url}#Intent;package=com.kmplayer;end`,
    };
    app.playOnline = (playerType) => {
        const urlBuilder = playerUrlBuilder[playerType];
        const playerName = playerType.replace('-pc', ' (PC)').replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        if (!urlBuilder) { showToast(`Unknown player type: ${playerType}`, 'error'); return; }

        const appUrl = urlBuilder(finalUrl); // Use globally derived finalUrl
        console.log(`Attempting to open ${playerName}: ${appUrl}`);
        try {
            const win = window.open(appUrl, '_blank');
            if (!win || win.closed || typeof win.closed == 'undefined') {
                showToast(`Trying to open ${playerName}...`, 'info');
                setTimeout(() => { window.location.href = appUrl; }, 300);
            } else { showToast(`Attempting to launch ${playerName}...`, 'info'); }
            if (streamDropdownContainer?.classList.contains('open')) app.toggleStreamMenu();
        } catch (err) { console.error('Error opening external player:', err); showToast(`Failed to open ${playerName}. Try copy link.`, 'error'); }
    };
    app.download = () => {
        try {
            const link = document.createElement('a'); link.href = finalUrl;
            let fname = "video"; // Default base name
            const currentTitle = fileNameEl?.textContent?.trim();
            // Use H1 content if valid, otherwise try parsing URL
            if (currentTitle && currentTitle !== '%s' && !currentTitle.toLowerCase().includes('loading')) {
                fname = currentTitle;
            } else {
                try { const lastPart = new URL(finalUrl).pathname.split('/').pop(); if(lastPart) fname = decodeURIComponent(lastPart.split('.')[0]); } catch { /* Ignore URL parsing errors */ }
            }
            // Sanitize and add extension
            const safeName = fname.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').replace(/_{2,}/g, '_');
            link.download = `${safeName}.mp4`; // Assume mp4, could check URL extension if needed

            document.body.appendChild(link); link.click(); document.body.removeChild(link);
            showToast('Download started...', 'success');
        } catch (err) { console.error('Download error:', err); showToast('Download failed.', 'error'); }
    };
    app.copyLink = async () => {
        if (!navigator.clipboard) { showToast('Clipboard API not available.', 'error'); return; }
        try { await navigator.clipboard.writeText(finalUrl); showToast('Link copied!', 'success'); }
        catch (err) { console.error('Failed to copy:', err); showToast('Could not copy link.', 'error'); }
    };

    // --- Global Keybindings ---
    const handleGlobalKeyDown = (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey || !player?.isReady) return;
        const target = e.target;
        const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
        if (isInputFocused || target.closest('button, .dropdown-item')) return; // Ignore if focus is on interactive elements

        let handled = true; let seekAmount = e.shiftKey ? 5 : 10;
        switch (e.key) {
            case 'k': case ' ': player.paused ? player.play() : player.pause(); break;
            case 'f': player.fullscreen.active ? player.exitFullscreen() : player.enterFullscreen(); break;
            case 'm': player.muted = !player.muted; break;
            case 'ArrowRight': player.currentTime = Math.min(player.duration, player.currentTime + seekAmount); break;
            case 'ArrowLeft': player.currentTime = Math.max(0, player.currentTime - seekAmount); break;
            case 'ArrowUp': player.volume = Math.min(1, player.volume + 0.1); break;
            case 'ArrowDown': player.volume = Math.max(0, player.volume - 0.1); break;
            default: handled = false;
        }
        if (handled) e.preventDefault();
    };

    // --- Init ---
    setupTheme();
    setInitialFileMetadata();
    initializePlayer();
    document.addEventListener('keydown', handleGlobalKeyDown);
    window.addEventListener('beforeunload', () => document.removeEventListener('keydown', handleGlobalKeyDown));
}); // End DOMContentLoaded