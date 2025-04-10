(function() {
    const currentUrl = window.location.href;
    const finalUrl = currentUrl.includes('/watch/') ? currentUrl.replace("/watch/", "/") : currentUrl;
    const app = {};

    // DOM Elements
    const DOMElements = {
        fileName: document.getElementById('file-name'),
        streamDropdownContainer: document.getElementById('stream-dropdown-container'),
        streamMenu: document.getElementById('stream-menu'),
        streamBtn: document.getElementById('stream-btn-label'),
        tracksDropdownContainer: document.getElementById('tracks-dropdown-container'),
        tracksMenu: document.getElementById('tracks-menu'),
        tracksBtn: document.getElementById('tracks-btn-label'),
        toast: document.getElementById('toast'),
        toastMessage: document.getElementById('toast')?.querySelector('.toast-message'),
        toastIcon: document.getElementById('toast')?.querySelector('.toast-icon'),
        themeToggleBtn: document.querySelector('.toggle-dark-mode')
    };

    // State
    let toastTimeout = null;
    let activeDropdownListeners = false;

    // Utilities
    const sanitizeFilename = name => name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').replace(/_{2,}/g, '_');
    
    const getFileExtension = url => { 
        try { 
            const p = new URL(url).pathname;
            const d = p.lastIndexOf('.'); 
            if (d > 0 && d < p.length - 1) return p.substring(d + 1).toLowerCase(); 
        } catch {} 
        return 'file'; 
    };
    
    const getCurrentFileName = () => DOMElements.fileName?.textContent?.trim() || '';

    // Theme management
    const setTheme = theme => { 
        document.documentElement.setAttribute('data-theme', theme); 
        localStorage.setItem('theme', theme); 
        const icon = DOMElements.themeToggleBtn?.querySelector('i'); 
        if (icon) icon.className = theme === 'light' ? 'fas fa-sun' : 'fas fa-moon'; 
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', 
            theme === 'dark' ? '#1a1a2e' : '#f2efe7');
        
        // Dispatch custom event for theme change
        document.documentElement.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme } }));
    };
    
    app.toggleDarkMode = () => { 
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark'; 
        setTheme(currentTheme === 'dark' ? 'light' : 'dark'); 
    };
    
    const setupTheme = () => { 
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches; 
        setTheme(savedTheme || (prefersDark ? 'dark' : 'light')); 
    };

    // Metadata handling
    const setInitialFileMetadata = () => {
        if (DOMElements.fileName && !DOMElements.fileName.textContent?.trim()) {
            DOMElements.fileName.textContent = "File";
        }
    };

    // Toast notifications
    const showToast = (message, type = 'info', duration = 3000) => {
        if (!DOMElements.toast || !DOMElements.toastMessage) return;
        
        DOMElements.toastMessage.textContent = message;
        DOMElements.toast.className = 'toast show ' + type;
        
        if (DOMElements.toastIcon) {
            const icon = DOMElements.toastIcon.querySelector('i');
            if (icon) {
                const icons = { 
                    success: 'fa-check-circle', 
                    error: 'fa-times-circle', 
                    warning: 'fa-exclamation-triangle', 
                    info: 'fa-info-circle' 
                };
                icon.className = `fas ${icons[type] || icons.info}`;
            }
        }
        
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            DOMElements.toast.classList.remove('show');
        }, duration);
    };

    // Dropdown handling
    const closeDropdown = () => { 
        if (!DOMElements.streamDropdownContainer?.classList.contains('open')) return; 
        
        DOMElements.streamDropdownContainer.classList.remove('open'); 
        DOMElements.streamBtn?.setAttribute('aria-expanded', 'false'); 
        
        // Remove event listeners to prevent memory leaks
        if (activeDropdownListeners) { 
            document.removeEventListener('click', closeDropdownOnClickOutside, true); 
            document.removeEventListener('keydown', handleDropdownKeys); 
            activeDropdownListeners = false; 
        } 
        
        // Return focus to dropdown button for better accessibility
        DOMElements.streamBtn?.focus(); 
    };
    
    const closeDropdownOnClickOutside = e => { 
        // Only close if clicking outside the container
        if (DOMElements.streamDropdownContainer && !DOMElements.streamDropdownContainer.contains(e.target)) 
            closeDropdown(); 
    };
    
    const handleDropdownKeys = e => {
        if (!DOMElements.streamDropdownContainer?.classList.contains('open')) return;
        
        const items = Array.from(DOMElements.streamMenu?.querySelectorAll('.dropdown-item[tabindex="0"]') || []); 
        if (items.length === 0) return;
        
        const activeIndex = items.findIndex(item => item === document.activeElement); 
        let handled = true;
        
        switch (e.key) {
            case 'Escape': 
                closeDropdown();
                break;
            case 'ArrowDown': 
                items[(activeIndex + 1) % items.length].focus();
                break;
            case 'ArrowUp': 
                items[(activeIndex - 1 + items.length) % items.length].focus();
                break;
            case 'Home': 
                items[0]?.focus();
                break;
            case 'End': 
                items[items.length - 1]?.focus();
                break;
            case 'Tab': 
                // Don't handle Tab, let it work naturally
                closeDropdown();
                handled = false;
                break;
            default: 
                handled = false;
        }
        
        if (handled) {
            e.preventDefault();
            e.stopPropagation();
        }
    };
    
    app.toggleStreamMenu = e => {
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

    // Close stream menu function - used by the explicit close button in menu header
    app.closeStreamMenu = () => {
        closeDropdown();
    };

    // External player integrations
    const playerUrlBuilder = {
        'vlc-pc': url => `vlc://${url}`,
        'potplayer': url => `potplayer://${url}`,
        'mpc': url => `mpc://${url}`,
        'kmpc': url => `kmplayer://${url}`,
        'vlc': url => `vlc://${url}`,
        'mx': url => `intent:${url}#Intent;package=com.mxtech.videoplayer.ad;S.title=${encodeURIComponent(getCurrentFileName() || 'Video')};end`,
        'mxpro': url => `intent:${url}#Intent;package=com.mxtech.videoplayer.pro;S.title=${encodeURIComponent(getCurrentFileName() || 'Video')};end`,
        'nplayer': url => `nplayer-${url}`,
        'splayer': url => `intent:${url}#Intent;action=com.young.simple.player.playback_online;package=com.young.simple.player;end`,
        'km': url => `intent:${url}#Intent;package=com.kmplayer;S.title=${encodeURIComponent(getCurrentFileName() || 'Video')};end`,
    };
    
    app.playOnline = type => {
        closeDropdown();
        const urlBuilder = playerUrlBuilder[type];
        const playerName = type.replace('-pc', ' (PC)')
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase());
        
        if (!urlBuilder || !finalUrl || !finalUrl.startsWith('http')) { 
            showToast(`Invalid URL or player type`, 'error'); 
            return; 
        }
        
        const appUrl = urlBuilder(finalUrl);
        
        try {
            const win = window.open(appUrl, '_blank');
            if (!win || win.closed || typeof win.closed === 'undefined') {
                showToast(`Trying to open ${playerName}...`, 'info');
                setTimeout(() => { window.location.href = appUrl; }, 300);
            } else { 
                showToast(`Launching ${playerName}...`, 'info'); 
            }
        } catch (err) { 
            console.error('Error opening external player:', err); 
            showToast(`Failed to open ${playerName}`, 'error'); 
        }
    };
    
    // Download function
    app.download = () => {
        if (!finalUrl || !finalUrl.startsWith('http')) { 
            showToast('Invalid URL', 'error'); 
            return; 
        }
        
        try {
            const link = document.createElement('a');
            link.href = finalUrl;
            
            let filename = "file";
            const currentTitle = getCurrentFileName();
            
            if (currentTitle && !currentTitle.toLowerCase().includes('loading')) {
                filename = currentTitle;
            } else {
                try {
                    const lastPart = new URL(finalUrl).pathname.split('/').pop();
                    if (lastPart) filename = decodeURIComponent(lastPart.split('.')[0]);
                } catch {}
            }
            
            link.download = `${sanitizeFilename(filename)}.${getFileExtension(finalUrl)}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showToast('Download started', 'success');
        } catch (err) {
            console.error('Download error:', err);
            showToast('Download failed', 'error');
        }
    };
    
    // Copy link function
    app.copyLink = async () => { 
        if (!finalUrl || !finalUrl.startsWith('http')) { 
            showToast('No valid link', 'error'); 
            return; 
        }
        
        try {
            if (navigator.clipboard) {
                await navigator.clipboard.writeText(finalUrl); 
                showToast('Link copied!', 'success');
            } else {
                const textArea = document.createElement("textarea"); 
                textArea.value = finalUrl; 
                textArea.style.position = "fixed"; 
                textArea.style.opacity = "0"; 
                document.body.appendChild(textArea); 
                textArea.focus(); 
                textArea.select();
                
                const copySuccess = document.execCommand('copy'); 
                document.body.removeChild(textArea); 
                showToast(copySuccess ? 'Copied' : 'Copy failed', copySuccess ? 'success' : 'error'); 
            }
        } catch (e) { 
            showToast('Copy failed', 'error'); 
        } 
    };

    // Initialization with better error handling and resource optimization
    const init = () => {
        window.app = app;
        
        if (!finalUrl || !finalUrl.startsWith('http')) {
            console.error("Invalid URL detected:", finalUrl);
            showToast('Invalid media URL', 'error');
            return;
        }
        
        setupTheme();
        setInitialFileMetadata();
        
        // Delay player initialization until the page is fully loaded
        if (document.readyState === 'complete') {
            initializePlayer();
        } else {
            window.addEventListener('load', initializePlayer, { once: true });
        }
        
        // Clean up resources when page unloads
        window.addEventListener('beforeunload', () => {
            // Remove any memory-heavy references
            if (activeDropdownListeners) {
                document.removeEventListener('click', closeDropdownOnClickOutside, true);
                document.removeEventListener('keydown', handleDropdownKeys);
            }
            
            // Clear any pending timeouts
            clearTimeout(toastTimeout);
        });
    };

    // Player initialization
    const initializePlayer = () => {
        const playerElement = document.getElementById('player');
        if (!playerElement) {
            console.error('Player element not found');
            return;
        }
        
        try {
            // Initialize Plyr with custom controls
            const player = new Plyr('#player', {
                controls: [
                    'play-large', 'play', 'progress', 'current-time', 'mute', 
                    'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'
                ],
                settings: ['captions', 'quality', 'speed', 'loop', 'audio'],
                autoplay: false,
                hideControls: true,
                keyboard: { focused: true, global: true },
                previewThumbnails: { enabled: false }, // Disabled for faster initial loading
                blankVideo: 'data:video/mp4;base64,AAAAHGZ0eXBpc29pc28yYXZjMW1wNDEAAAAIZnJlZQAAAu1tZGF0AAACrgYF//+q3EXpvebZSLeW',
                invertTime: false,
                loadSprite: true,
                iconUrl: 'https://cdn.plyr.io/3.7.8/plyr.svg',
                tooltips: {
                    controls: true,
                    seek: true
                },
                disableContextMenu: false,
                // Enable accessibility features for captions
                captions: { active: true, update: true, language: 'auto' },
                // Configure internationalization options for better UX
                i18n: {
                    audio: 'Audio tracks',
                    qualityLabel: {
                        0: 'Auto'
                    }
                }
            });

            // Apply consistent dark mode styling regardless of user theme preference
            applyPlayerDarkMode();

            // Hook into video metadata to extract duration and resolution info
            playerElement.addEventListener('loadedmetadata', updateVideoMetadata);
            player.on('ready', () => {
                console.log('Plyr is ready');
                updateVideoMetadata();
                player.volume = 1.0; // 100% volume
                
                // Optimize performance
                const container = document.querySelector('.player-container');
                if (container) {
                    // Initialize player only when visible
                    const observer = new IntersectionObserver((entries) => {
                        entries.forEach(entry => {
                            if (entry.isIntersecting) {
                                player.volume = 1.0; // Ensure 100% volume on visibility
                                observer.disconnect(); // Clean up observer
                            }
                        });
                    }, { threshold: 0.1 });
                    observer.observe(container);
                }
            });

            // Function to apply fixed dark mode styling to player - not affected by theme toggle
            function applyPlayerDarkMode() {
                const playerEl = document.querySelector('.plyr');
                if (playerEl) {
                    // Fixed dark mode colors that won't change with theme
                    playerEl.style.setProperty('--plyr-video-background', '#1c1c2e');
                    playerEl.style.setProperty('--plyr-video-control-color', '#ffffff');
                    playerEl.style.setProperty('--plyr-video-control-color-hover', '#9292ff');
                    playerEl.style.setProperty('--plyr-menu-background', '#2a2a40');
                    playerEl.style.setProperty('--plyr-menu-color', '#ffffff');
                    playerEl.style.setProperty('--plyr-tooltip-background', '#2a2a40');
                    playerEl.style.setProperty('--plyr-tooltip-color', '#ffffff');
                    playerEl.style.setProperty('--plyr-range-fill-background', '#7878ff');
                    playerEl.style.setProperty('--plyr-video-progress-buffered-background', 'rgba(255, 255, 255, 0.25)');
                }
            }
        } catch (error) {
            console.error('Failed to initialize Plyr:', error);
            showToast('Video player failed to initialize', 'error');
        }
    };

    // Update video metadata (duration, resolution)
    const updateVideoMetadata = () => {
        const playerElement = document.getElementById('player');
        if (!playerElement) return;
        
        const duration = playerElement.duration;
        const videoWidth = playerElement.videoWidth;
        const videoHeight = playerElement.videoHeight;
        
        // Format time for display (e.g., 1:23:45)
        const formatTime = (secs, showHrs = false) => {
            if (isNaN(secs) || secs < 0) return showHrs ? '0:00:00' : '0:00';
            secs = Math.round(secs);
            const h = Math.floor(secs / 3600);
            const m = Math.floor((secs % 3600) / 60);
            const s = secs % 60;
            
            return (showHrs || h > 0) ? 
                `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : 
                `${m}:${s.toString().padStart(2, '0')}`;
        };
        
        // Add file metadata to page if elements exist
        const metaContainer = document.querySelector('.file-meta');
        if (metaContainer) {
            // Create or update metadata with a single function for better maintainability
            const updateOrCreateMetaItem = (id, value, prefix) => {
                let element = metaContainer.querySelector(`#${id}`);
                if (!element) {
                    element = document.createElement('span');
                    element.id = id;
                    metaContainer.appendChild(element);
                }
                element.textContent = `${prefix}: ${value}`;
            };
            
            // Update duration and resolution
            updateOrCreateMetaItem('file-duration', 
                (!isNaN(duration) && duration > 0) ? formatTime(duration, duration >= 3600) : 'N/A', 
                'Dur');
            
            updateOrCreateMetaItem('file-resolution',
                (videoWidth > 0 && videoHeight > 0) ? `${videoWidth}x${videoHeight}` : 'N/A',
                'Res');
        }
    };

    // Start the app
    if (document.readyState === 'loading') 
        document.addEventListener('DOMContentLoaded', init); 
    else 
        init();
})();