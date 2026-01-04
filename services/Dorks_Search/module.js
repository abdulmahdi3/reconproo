/**
 * Dorks Search Service
 * Fetches real Google search result counts for dork queries
 */

if (!window.serviceStates) window.serviceStates = {};

export default class DorksSearchService {
    constructor() {
        this.serviceId = 'Dorks_Search';
        this.isScanning = false;
        this.abortController = null;
        this.results = [];
        this.cardStates = {};

        this.dorks = [
            { category: 'Exposed Files', name: 'Config Files', query: 'site:{target} ext:xml | ext:conf | ext:cnf | ext:reg | ext:inf | ext:rdp | ext:cfg | ext:txt | ext:ora | ext:ini' },
            { category: 'Exposed Files', name: 'Database Files', query: 'site:{target} ext:sql | ext:dbf | ext:mdb' },
            { category: 'Exposed Files', name: 'Log Files', query: 'site:{target} ext:log' },
            { category: 'Exposed Files', name: 'Backup Files', query: 'site:{target} ext:bkf | ext:bkp | ext:bak | ext:old | ext:backup' },
            { category: 'Secrets', name: 'Password Files', query: 'site:{target} inurl:password | inurl:passwd | intext:password | intext:passwd' },
            { category: 'Secrets', name: 'SSH Keys', query: 'site:{target} ext:pem | ext:ppk | inurl:id_rsa | inurl:id_dsa' },
            { category: 'Secrets', name: 'API Keys', query: 'site:{target} intext:"api_key" | intext:"apikey" | intext:"api-key"' },
            { category: 'Secrets', name: 'AWS Secrets', query: 'site:{target} intext:"AKIA" | intext:"aws_secret_access_key"' },
            { category: 'Sensitive Dirs', name: 'Admin Pages', query: 'site:{target} inurl:admin | inurl:administrator | inurl:wp-admin' },
            { category: 'Sensitive Dirs', name: 'Login Pages', query: 'site:{target} inurl:login | inurl:signin | inurl:auth' },
            { category: 'Sensitive Dirs', name: 'Upload Pages', query: 'site:{target} inurl:upload | inurl:uploader' },
            { category: 'Source Code', name: 'PHP Errors', query: 'site:{target} "PHP Parse error" | "PHP Warning" | "PHP Error"' },
            { category: 'Source Code', name: 'SQL Errors', query: 'site:{target} "SQL syntax" | "mysql_fetch" | "mysql_num_rows"' },
            { category: 'Source Code', name: 'Git Exposed', query: 'site:{target} inurl:.git | intitle:"index of" ".git"' },
            { category: 'Documents', name: 'PDF Files', query: 'site:{target} ext:pdf' },
            { category: 'Documents', name: 'Office Docs', query: 'site:{target} ext:doc | ext:docx | ext:xls | ext:xlsx | ext:ppt | ext:pptx' },
            { category: 'Infrastructure', name: 'Directory Listing', query: 'site:{target} intitle:"index of /"' },
            { category: 'Infrastructure', name: 'Open Redirects', query: 'site:{target} inurl:url= | inurl:return= | inurl:next= | inurl:redirect=' },
            { category: 'Infrastructure', name: 'Subdomains', query: 'site:*.{target}' },
            { category: 'Vulnerabilities', name: 'XSS Prone', query: 'site:{target} inurl:q= | inurl:s= | inurl:search= | inurl:query=' },
        ];
    }

    async init(container, context = {}) {
        this.container = container;
        this.context = context;

        // Track service usage
        import('../../js/analytics.js').then(m => m.analytics.trackEvent('service_load', { service: this.serviceId }));

        this.restoreState();
        await this.loadCSS();
        this.render();
        this.bindEvents();
        this.updateStatusDisplay();
    }

    restoreState() {
        const saved = window.serviceStates[this.serviceId];
        if (saved) {
            this.results = saved.results || [];
            this.cardStates = saved.cardStates || {};
            this.isScanning = saved.isScanning || false;
        }
    }

    saveState() {
        window.serviceStates[this.serviceId] = {
            results: this.results,
            cardStates: this.cardStates,
            isScanning: this.isScanning
        };
    }

    async loadCSS() {
        if (!document.querySelector('link[href*="Dorks_Search/module.css"]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = './services/Dorks_Search/module.css';
            document.head.appendChild(link);
        }

        if (!document.getElementById('dorks-custom-styles')) {
            const style = document.createElement('style');
            style.id = 'dorks-custom-styles';
            style.textContent = `
                .card-query-wrapper {
                    position: relative;
                    margin-top: auto;
                }
                .card-query-wrapper .search-icon {
                    position: absolute;
                    right: 8px;
                    top: 50%;
                    transform: translateY(-50%);
                    opacity: 0;
                    transition: all 0.2s ease;
                    background: rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(4px);
                    color: #fff;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    width: 32px;
                    height: 32px;
                    border-radius: 6px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                    text-decoration: none;
                }
                .card-query-wrapper:hover .search-icon {
                    opacity: 1;
                }
                .card-query-wrapper .search-icon:hover {
                    transform: translateY(-50%) scale(1.1);
                    background: rgba(139, 92, 246, 0.3);
                    border-color: rgba(139, 92, 246, 0.6);
                    box-shadow: 0 0 12px rgba(139, 92, 246, 0.4);
                }
                .card-query {
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .card-query.copied {
                    border-color: var(--success, #10b981) !important;
                }
                .copy-feedback {
                    position: absolute;
                    left: 50%;
                    top: 50%;
                    transform: translate(-50%, -50%);
                    background: var(--success, #10b981);
                    color: #fff;
                    padding: 4px 12px;
                    border-radius: 4px;
                    font-size: 0.75rem;
                    font-weight: 700;
                    opacity: 0;
                    transition: opacity 0.2s;
                    pointer-events: none;
                }
                .copy-feedback.show {
                    opacity: 1;
                }
                .card.checked {
                    border-color: var(--brand-primary, #f43f5e) !important;
                    box-shadow: 0 0 15px rgba(244, 63, 94, 0.2);
                }
                .card.checking {
                    border-color: var(--warning, #f59e0b) !important;
                    box-shadow: 0 0 15px rgba(245, 158, 11, 0.2);
                }
                .card.has-results {
                    border-color: var(--success, #10b981) !important;
                    box-shadow: 0 0 15px rgba(16, 185, 129, 0.2);
                }
            `;
            document.head.appendChild(style);
        }
    }

    render() {
        if (this.context.primaryActions) {
            this.context.primaryActions.innerHTML = `
                <button id="scanBtn" ${this.isScanning ? 'style="display:none"' : ''}>START DORK SCAN</button>
                <button id="stopBtn" class="btn-stop" ${!this.isScanning ? 'style="display:none"' : ''}>STOP</button>
            `;
            this.scanBtn = this.context.primaryActions.querySelector('#scanBtn');
            this.stopBtn = this.context.primaryActions.querySelector('#stopBtn');
        }

        if (this.context.secondaryActions) {
            this.context.secondaryActions.innerHTML = '';
        }

        this.container.innerHTML = `<div class="dork-grid" id="dorkGrid"></div>`;
        this.dorkGrid = this.container.querySelector('#dorkGrid');
        this.renderDorkCards();
    }

    renderDorkCards() {
        const target = document.getElementById('globalTargetInput')?.value || '{target}';

        this.dorkGrid.innerHTML = this.dorks.map((dork, idx) => {
            const state = this.cardStates[idx] || { status: 'waiting', count: 0 };
            const query = dork.query.replace(/{target}/g, target);
            const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

            let cardClass = 'card';
            if (state.status === 'loading') cardClass += ' checking';
            else if (state.status === 'success' && state.count > 0) cardClass += ' has-results';
            else if (state.status === 'success' || state.status === 'empty') cardClass += ' checked';

            return `
            <div class="${cardClass}" data-idx="${idx}">
                <div class="card-header">
                    <div>
                        <div class="card-cat">${dork.category}</div>
                        <div class="card-title">${dork.name}</div>
                    </div>
                    <span class="badge ${state.status}" id="badge-${idx}">${this.getBadgeText(state)}</span>
                </div>
                <div class="card-query-wrapper">
                    <div class="card-query" data-query="${query}" data-idx="${idx}" title="Click to copy">
                        ${query}
                    </div>
                    <a href="${googleUrl}" target="_blank" class="search-icon" onclick="event.stopPropagation();" title="Search on Google">🔍</a>
                    <div class="copy-feedback" id="feedback-${idx}">Copied!</div>
                </div>
            </div>
        `}).join('');
    }

    getBadgeText(state) {
        switch (state.status) {
            case 'loading': return 'CHECKING';
            case 'success': return state.count > 0 ? `${this.formatNumber(state.count)} RESULTS` : '0 RESULTS';
            case 'empty': return '0 RESULTS';
            case 'error': return 'ERROR';
            default: return 'WAITING';
        }
    }

    formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }

    bindEvents() {
        this.scanBtn?.addEventListener('click', () => this.startScan());
        this.stopBtn?.addEventListener('click', () => this.stopScan());

        this.dorkGrid.addEventListener('click', (e) => {
            const queryEl = e.target.closest('.card-query');
            if (queryEl && !e.target.classList.contains('search-icon')) {
                const query = queryEl.dataset.query;
                const idx = queryEl.dataset.idx;
                navigator.clipboard.writeText(query);

                queryEl.classList.add('copied');
                const feedback = document.getElementById(`feedback-${idx}`);
                if (feedback) feedback.classList.add('show');

                setTimeout(() => {
                    queryEl.classList.remove('copied');
                    if (feedback) feedback.classList.remove('show');
                }, 1500);
            }
        });

        document.getElementById('clearBtn')?.addEventListener('click', () => this.clearResults());
    }

    updateStatusDisplay() {
        if (this.context.apiStatus) {
            const completed = Object.values(this.cardStates).filter(s => s.status !== 'waiting' && s.status !== 'loading').length;
            const withResults = Object.values(this.cardStates).filter(s => s.count > 0).length;
            this.context.apiStatus.innerHTML = `${completed}/${this.dorks.length} checked | ${withResults} with results`;
        }
    }

    async startScan() {
        let target = document.getElementById('globalTargetInput')?.value?.trim();
        if (!target) { alert('Please enter a target domain'); return; }

        // Sanitize and validate
        target = window.sanitizeInput ? window.sanitizeInput(target) : target.replace(/[<>"']/g, '');
        if (window.validateDomain && !window.validateDomain(target) && !target.includes('{target}')) {
            // Allow {target} placeholder for demo, but warn for bad domains
            console.warn('Invalid domain format, proceeding with caution');
        }

        import('../../js/analytics.js').then(m => m.analytics.trackEvent('scan_start', { service: this.serviceId, target: target }));

        this.isScanning = true;
        this.abortController = new AbortController();

        if (this.scanBtn) this.scanBtn.style.display = 'none';
        if (this.stopBtn) this.stopBtn.style.display = 'inline-block';
        if (this.context.progressTrack) this.context.progressTrack.style.display = 'block';

        this.renderDorkCards();

        const total = this.dorks.length;
        let completed = 0;
        this.results = [];

        for (let i = 0; i < total; i++) {
            if (!this.isScanning) break;

            this.cardStates[i] = { status: 'loading', count: 0 };
            this.saveState();
            this.renderDorkCards();

            if (this.context.statusText) this.context.statusText.textContent = `Checking: ${this.dorks[i].name}`;

            try {
                const query = this.dorks[i].query.replace(/{target}/g, target);
                const count = await this.getGoogleResultCount(query);

                this.cardStates[i] = { status: 'success', count };
                this.saveState();

                this.results.push({ dork: this.dorks[i], query, count });
            } catch (err) {
                console.error('Check error:', err);
                this.cardStates[i] = { status: 'error', count: 0 };
                this.saveState();
            }

            this.renderDorkCards();
            completed++;

            if (this.context.progressFill) this.context.progressFill.style.width = `${(completed / total) * 100}%`;
            this.updateStatusDisplay();

            // Delay between requests to avoid rate limiting
            await this.delay(1500);
        }

        this.finishScan();
    }

    async getGoogleResultCount(query) {
        // Try multiple methods to get Google result count

        // Method 1: Try SerpApi-like free services
        const proxyServices = [
            // AllOrigins CORS proxy with Google
            async () => {
                const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=1`;
                const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(googleUrl)}`;
                const res = await fetch(proxyUrl, { signal: this.abortController?.signal });
                const html = await res.text();
                return this.parseGoogleResultCount(html);
            },
            // Another proxy option
            async () => {
                const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=1`;
                const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(googleUrl)}`;
                const res = await fetch(proxyUrl, { signal: this.abortController?.signal });
                const html = await res.text();
                return this.parseGoogleResultCount(html);
            }
        ];

        // Try each method
        for (const method of proxyServices) {
            try {
                const count = await method();
                if (count !== null) return count;
            } catch (err) {
                console.log('Proxy method failed:', err.message);
            }
        }

        // Fallback: Use crt.sh for subdomain queries
        if (query.includes('site:*.')) {
            try {
                const domain = query.match(/site:\*\.([^\s]+)/)?.[1];
                if (domain) {
                    const res = await fetch(`https://crt.sh/?q=%25.${domain}&output=json`, {
                        signal: this.abortController?.signal
                    });
                    const data = await res.json();
                    return [...new Set(data.map(e => e.name_value.split('\n')[0]))].length;
                }
            } catch { }
        }

        return 0;
    }

    parseGoogleResultCount(html) {
        // Parse "About X results" from Google HTML
        const patterns = [
            /About\s+([\d,]+)\s+results/i,
            /نحو\s+([\d٬,]+)\s+نتيجة/i, // Arabic
            /([\d,]+)\s+results/i,
            /résultat[s]?\s*:\s*environ\s*([\d\s]+)/i, // French
            /Ungefähr\s+([\d.]+)\s+Ergebnisse/i, // German
        ];

        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match) {
                const numStr = match[1].replace(/[,\s٬.]/g, '');
                const num = parseInt(numStr);
                if (!isNaN(num)) return num;
            }
        }

        // Check if there are any results at all
        if (html.includes('did not match any documents') || html.includes('لم تتطابق')) {
            return 0;
        }

        // If we got HTML but couldn't parse, assume some results exist
        if (html.length > 1000 && html.includes('google')) {
            return -1; // Unknown but exists
        }

        return 0;
    }

    stopScan() {
        this.isScanning = false;
        this.abortController?.abort();
        this.saveState();
        this.finishScan();
    }

    finishScan() {
        this.isScanning = false;
        this.saveState();
        if (this.scanBtn) this.scanBtn.style.display = 'inline-block';
        if (this.stopBtn) this.stopBtn.style.display = 'none';
        const withResults = Object.values(this.cardStates).filter(s => s.count > 0).length;
        if (this.context.statusText) this.context.statusText.textContent = `Scan complete - ${withResults} dorks have results`;
        this.updateStatusDisplay();
    }

    exportResults() {
        if (!this.results || this.results.length === 0) { alert('No results to export'); return; }
        const report = { timestamp: new Date().toISOString(), target: document.getElementById('globalTargetInput')?.value, results: this.results };
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `dork-scan-${report.target}-${Date.now()}.json`; a.click();
    }

    clearResults() {
        this.results = [];
        this.cardStates = {};
        this.saveState();
        this.renderDorkCards();
        if (this.context.progressFill) this.context.progressFill.style.width = '0%';
        if (this.context.statusText) this.context.statusText.textContent = '';
        this.updateStatusDisplay();
    }

    delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    destroy() { this.saveState(); }
}
