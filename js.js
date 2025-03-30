const currentUrl = window.location.href;
const finalUrl = currentUrl.replace("/watch/", "/");

document.addEventListener('DOMContentLoaded', function() {
    // Initialize Plyr with optimized settings
    window.player = new Plyr('#player', {
        controls: [
            'play-large',
            'play',
            'progress',
            'current-time',
            'duration',
            'mute',
            'volume',
            'fullscreen'
        ],
        hideControls: true,
        autoplay: false,
        fullscreen: { enabled: true, iosNative: true },
        seekTime: 10,
        volume: 1,
        muted: false,
        clickToPlay: true,
        displayDuration: true,
        toggleInvert: true,
        tooltips: { controls: true, seek: true },
        previewThumbnails: { enabled: false }
    });
    
    // File metadata elements
    const fileSizeEl = document.getElementById('file-size');
    const fileResolutionEl = document.getElementById('file-resolution');
    const fileDurationEl = document.getElementById('file-duration');
    const loadingOverlay = document.getElementById('loading-overlay');
    const errorOverlay = document.getElementById('error-overlay');
    const errorMessage = document.getElementById('error-message');
    
    // Set theme based on user preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateThemeIcon(savedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        document.documentElement.setAttribute('data-theme', 'light');
        updateThemeIcon('light');
    }
    
    // Initialize loading state
    let isVideoLoading = true;
    let hasPlaybackStarted = false;
    let videoFailed = false;
    
    // Set file metadata dynamically
    setFileMetadata();
    
    // Plyr events with enhanced error handling
    window.player.on('ready', function() {
        updateFileMetadata();
        // Add keyboard shortcuts for better accessibility
        document.addEventListener('keydown', function(e) {
            if (e.key === 'k' || e.key === ' ') {
                window.player.togglePlay();
                e.preventDefault();
            } else if (e.key === 'f') {
                window.player.fullscreen.toggle();
                e.preventDefault();
            } else if (e.key === 'm') {
                window.player.muted = !window.player.muted;
                e.preventDefault();
            } else if (e.key === 'ArrowRight') {
                window.player.forward(10);
                e.preventDefault();
            } else if (e.key === 'ArrowLeft') {
                window.player.rewind(10);
                e.preventDefault();
            }
        });
    });
    
    window.player.on('loadstart', function() {
        isVideoLoading = true;
        loadingOverlay.classList.remove('hidden');
    });
    
    window.player.on('canplay', function() {
        isVideoLoading = false;
        loadingOverlay.classList.add('hidden');
    });
    
    window.player.on('playing', function() {
        isVideoLoading = false;
        hasPlaybackStarted = true;
        loadingOverlay.classList.add('hidden');
        errorOverlay.classList.remove('show');
        videoFailed = false;
    });
    
    window.player.on('error', function(e) {
        console.error('Video error:', e);
        isVideoLoading = false;
        videoFailed = true;
        loadingOverlay.classList.add('hidden');
        errorOverlay.classList.add('show');
        
        // More detailed error messages
        let errorText = 'An unknown error occurred during playback.';
        if (e && e.detail && e.detail.code) {
            switch(e.detail.code) {
                case 1:
                    errorText = 'The video playback was aborted.';
                    break;
                case 2:
                    errorText = 'Network error. Please check your connection.';
                    break;
                case 3:
                    errorText = 'Video decoding failed. The format may not be supported.';
                    break;
                case 4:
                    errorText = 'The video is not available or has been removed.';
                    break;
                default:
                    errorText = 'Unknown error occurred. Please try again.';
            }
        }
        errorMessage.textContent = errorText;
    });
    
    // Update file metadata
    function updateFileMetadata() {
        // Duration
        const videoDuration = window.player.duration || 0;
        fileDurationEl.textContent = formatTime(videoDuration, true);
        
        // Resolution
        const videoElement = window.player.elements.original;
        const width = videoElement.videoWidth || 1280;
        const height = videoElement.videoHeight || 720;
        fileResolutionEl.textContent = `${width}x${height}`;
        
        // File size estimation with improved calculation
        let bitrate = 1; // Default 1 Mbps
        if (width * height > 1920 * 1080) {
            bitrate = 4; // 4K content
        } else if (width * height > 1280 * 720) {
            bitrate = 2.5; // 1080p content
        } else if (width * height > 640 * 480) {
            bitrate = 1.5; // 720p content
        }
        
        const estimatedSize = (bitrate * 1024 * 1024 / 8) * videoDuration / 1024 / 1024;
        fileSizeEl.textContent = estimatedSize.toFixed(1) + ' MB';
    }

    // Ensure video source is set correctly with better error handling
    const videoSource = document.getElementById('video-source');
    if (videoSource.src === window.location.href || videoSource.src.includes('%s')) {
        try {
            // If placeholder wasn't replaced, use the transformed URL
            videoSource.src = finalUrl;
            window.player.source = finalUrl;
        } catch (err) {
            console.error('Error setting video source:', err);
            errorMessage.textContent = 'Error loading video source. Please try again.';
            errorOverlay.classList.add('show');
        }
    }
    
    // Add touch event handling for mobile
    if ('ontouchstart' in window) {
        const playerElement = document.querySelector('.player-container');
        let touchStartX, touchEndX;
        
        playerElement.addEventListener('touchstart', function(e) {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });
        
        playerElement.addEventListener('touchend', function(e) {
            touchEndX = e.changedTouches[0].screenX;
            handleSwipe();
        }, { passive: true });
        
        function handleSwipe() {
            const diff = touchStartX - touchEndX;
            // Must swipe at least 50px to register
            if (Math.abs(diff) < 50) return;
            
            if (diff > 0) {
                // Swipe left, forward 10s
                window.player.forward(10);
            } else {
                // Swipe right, rewind 10s
                window.player.rewind(10);
            }
        }
    }
});

// Format time to MM:SS or HH:MM:SS if needed
function formatTime(seconds, showHours = false) {
    seconds = Math.floor(seconds);
    const hours = Math.floor(seconds / 3600);
    seconds = seconds % 3600;
    const minutes = Math.floor(seconds / 60);
    seconds = seconds % 60;
    
    if (showHours || hours > 0) {
        return hours + ':' + 
            (minutes < 10 ? '0' : '') + minutes + ':' + 
            (seconds < 10 ? '0' : '') + seconds;
    }
    
    return minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
}

// Toggle dark/light mode
function toggleDarkMode() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    updateThemeIcon(newTheme);
}

// Update theme toggle icon
function updateThemeIcon(theme) {
    const icon = document.querySelector('.toggle-dark-mode i');
    
    if (theme === 'light') {
        icon.className = 'fas fa-sun';
    } else {
        icon.className = 'fas fa-moon';
    }
}

// Toggle stream dropdown menu
function toggleStreamMenu() {
    const menu = document.getElementById('stream-menu');
    menu.classList.toggle('show');
    
    // Close dropdown when clicking outside
    if (menu.classList.contains('show')) {
        setTimeout(() => {
            document.addEventListener('click', closeDropdownOnClickOutside);
        }, 10);
    } else {
        document.removeEventListener('click', closeDropdownOnClickOutside);
    }
}

function closeDropdownOnClickOutside(event) {
    const menu = document.getElementById('stream-menu');
    const streamBtn = document.querySelector('.stream-btn');
    
    if (!menu.contains(event.target) && !streamBtn.contains(event.target)) {
        menu.classList.remove('show');
        document.removeEventListener('click', closeDropdownOnClickOutside);
    }
}

// Play in external apps
function playOnline(player) {
    // Use the finalUrl from the global scope, exactly like old.html
    let videoUrl = encodeURIComponent(finalUrl);
    let appUrl = '';
    
    switch(player) {
        // Default System Player
        case 'default':
            window.location.href = finalUrl;
            showToast("Opening in system default player...");
            return;
            
        // PC Players
        case 'vlc-pc':
            appUrl = 'vlc://' + finalUrl;
            break;
        case 'potplayer':
            appUrl = 'potplayer://' + finalUrl;
            break;
        case 'mpc':
            appUrl = 'mpc://' + finalUrl;
            break;
        case 'kmpc':
            appUrl = 'kmplayer://' + finalUrl;
            break;
        // Mobile Players
        case 'vlc':
            appUrl = 'vlc://' + videoUrl;
            break;
        case 'mx':
            appUrl = 'intent:' + videoUrl + '#Intent;package=com.mxtech.videoplayer.ad;end';
            break;
        case 'mxpro':
            appUrl = 'intent:' + videoUrl + '#Intent;package=com.mxtech.videoplayer.pro;end';
            break;
        case 'nplayer':
            appUrl = 'nplayer-' + videoUrl;
            break;
        case 'splayer':
            appUrl = 'intent:' + videoUrl + '#Intent;action=com.young.simple.player.playback_online;package=com.young.simple.player;end';
            break;
        case 'km':
            appUrl = 'intent:' + videoUrl + '#Intent;package=com.kmplayer;end';
            break;
        default:
            console.warn(`Unknown player type: ${player}`);
            showToast(`Unknown player type: ${player}`, 'error');
    }
    
    window.location.href = appUrl;
    showToast(`Opening in ${player}...`);
    
    // Close dropdown
    document.getElementById('stream-menu').classList.remove('show');
}

// Download file
function download() {
    // Use the finalUrl directly like in old.html
    window.location.href = finalUrl;
}

// Copy link to clipboard
function copyLink() {
    // Use the finalUrl directly like in old.html
    navigator.clipboard.writeText(finalUrl).then(function() {
        showToast('Link copied to clipboard');
    }).catch(function() {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = finalUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Link copied to clipboard');
    });
}

// Retry playback after error
function retryPlayback() {
    const videoElement = document.querySelector('#player');
    const errorOverlay = document.getElementById('error-overlay');
    const loadingOverlay = document.getElementById('loading-overlay');
    
    errorOverlay.classList.remove('show');
    loadingOverlay.classList.remove('hidden');
    
    // Use the finalUrl directly
    videoElement.querySelector('source').src = finalUrl;
    
    // Use window.player instead of getting a new instance
    if (window.player) {
        window.player.restart();
    } else {
        // Fallback if player isn't available
        console.warn('Plyr instance not found, using native video API');
        videoElement.load();
        videoElement.play().catch(err => {
            console.error('Error retrying video:', err);
            errorOverlay.classList.add('show');
        });
    }
}

// Show toast notification
function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMessage = toast.querySelector('.toast-message');
    
    toastMessage.textContent = message;
    toast.classList.add('show');
    
    // Auto hide after 3 seconds
    setTimeout(function() {
        toast.classList.remove('show');
    }, 3000);
}

// Dynamically set file metadata
function setFileMetadata() {
    // This would be replaced by server-side variables
    const fileName = document.getElementById('file-name').textContent;
    document.title = fileName + " | Thunder FileToLink Bot";
}

// Add an optimized service worker for better offline support
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
            .then(function(registration) {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(function(err) {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}

// Simple app namespace that just calls the global functions
// This is to maintain compatibility with the HTML which calls app.function()
const app = {
    toggleDarkMode: function() {
        toggleDarkMode();
    },
    toggleStreamMenu: function(event) {
        // Stop event propagation before calling global function
        if (event) event.stopPropagation();
        toggleStreamMenu();
    },
    playOnline: function(playerType) {
        playOnline(playerType);
    },
    download: function() {
        download();
    },
    copyLink: function() {
        copyLink();
    },
    retryPlayback: function() {
        retryPlayback();
    }
};