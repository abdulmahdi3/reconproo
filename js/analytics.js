/**
 * RECON PRO Analytics Module
 * Privacy-respecting, lightweight visitor tracking
 */

const ANALYTICS_CONFIG = {
    endpoint: './analytics_server.php', // Changed to PHP for Shared Hosting
    dbName: 'ReconProAnalytics',
    storeName: 'visits',
    version: 1
};

class Analytics {
    constructor() {
        this.sessionId = this.getOrCreateSessionId();
        this.visitorId = this.getOrCreateVisitorId();
        this.visitStart = Date.now();
        this.initialized = false;
        this.locationData = null;
    }

    async init() {
        if (this.initialized) return;
        this.initialized = true;

        // Try to get location data (non-blocking)
        this.fetchLocationData();

        // Track page view
        this.trackEvent('page_view', {
            path: window.location.pathname,
            referrer: document.referrer,
            userAgent: navigator.userAgent,
            screen: `${window.screen.width}x${window.screen.height}`,
            language: navigator.language
        });

        // Set up visibility tracking
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.trackEvent('session_end', { duration: Date.now() - this.visitStart });
            }
        });

        console.log('🛡️ Analytics Initialized');
    }

    getOrCreateSessionId() {
        let id = sessionStorage.getItem('rp_session_id');
        if (!id) {
            id = 's_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            sessionStorage.setItem('rp_session_id', id);
        }
        return id;
    }

    getOrCreateVisitorId() {
        let id = localStorage.getItem('rp_visitor_id');
        if (!id) {
            id = 'v_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('rp_visitor_id', id);
        }
        return id;
    }

    async fetchLocationData() {
        try {
            // Use time-limited cached location or fetch new
            const cached = JSON.parse(localStorage.getItem('rp_location_cache') || '{}');
            if (cached.timestamp && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
                this.locationData = cached.data;
                return;
            }

            // Using privacy-friendly IP info service (client-side only for display)
            const res = await fetch('https://ipapi.co/json/');
            if (res.ok) {
                const data = await res.json();
                this.locationData = {
                    country: data.country_name,
                    city: data.city,
                    ip: data.ip
                };
                localStorage.setItem('rp_location_cache', JSON.stringify({
                    timestamp: Date.now(),
                    data: this.locationData
                }));
            }
        } catch (e) {
            // Fail silently
        }
    }

    async trackEvent(eventName, data = {}) {
        const payload = {
            timestamp: new Date().toISOString(),
            visitorId: this.visitorId,
            sessionId: this.sessionId,
            event: eventName,
            data: data,
            location: this.locationData
        };

        // 1. Store locally in IndexedDB as backup
        await this.storeLocally(payload);

        // 2. Send to backend if available
        try {
            if (navigator.sendBeacon) {
                const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
                navigator.sendBeacon(ANALYTICS_CONFIG.endpoint, blob);
            } else {
                fetch(ANALYTICS_CONFIG.endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    keepalive: true
                }).catch(() => { });
            }
        } catch (e) {
            // Backend might be offline, data is saved locally
        }
    }

    storeLocally(payload) {
        return new Promise((resolve) => {
            const request = indexedDB.open(ANALYTICS_CONFIG.dbName, ANALYTICS_CONFIG.version);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(ANALYTICS_CONFIG.storeName)) {
                    db.createObjectStore(ANALYTICS_CONFIG.storeName, { keyPath: 'id', autoIncrement: true });
                }
            };

            request.onsuccess = (e) => {
                const db = e.target.result;
                const tx = db.transaction(ANALYTICS_CONFIG.storeName, 'readwrite');
                const store = tx.objectStore(ANALYTICS_CONFIG.storeName);
                store.add(payload);
                resolve();
            };

            request.onerror = () => resolve(); // Don't block on DB errors
        });
    }

    // Helper to get local stats for admin/self-view
    async getLocalStats() {
        return new Promise((resolve) => {
            const request = indexedDB.open(ANALYTICS_CONFIG.dbName, ANALYTICS_CONFIG.version);
            request.onsuccess = (e) => {
                const db = e.target.result;
                const tx = db.transaction(ANALYTICS_CONFIG.storeName, 'readonly');
                const store = tx.objectStore(ANALYTICS_CONFIG.storeName);
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve([]);
            };
            request.onerror = () => resolve([]);
        });
    }
}

// Export singleton
export const analytics = new Analytics();

// Auto-init
analytics.init();
