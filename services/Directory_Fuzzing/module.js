/**
 * Directory Fuzzing Service - with state persistence
 */
if (!window.serviceStates) window.serviceStates = {};

export default class DirectoryFuzzingService {
    constructor() {
        this.serviceId = 'Directory_Fuzzing';
        this.isScanning = false;
        this.abortController = null;
        this.results = [];
        this.stats = { found200: 0, found3xx: 0, found403: 0, scanned: 0 };
        this.wordlist = [
            'admin', 'administrator', 'login', 'wp-admin', 'wp-login.php', 'dashboard', 'panel',
            'api', 'api/v1', 'api/v2', 'graphql', 'swagger', 'docs', 'documentation',
            'backup', 'backups', 'bak', 'old', 'temp', 'tmp', 'test', 'dev', 'staging',
            '.git', '.env', '.htaccess', 'robots.txt', 'sitemap.xml', 'config', 'config.php',
            'wp-config.php', 'phpinfo.php', 'info.php', 'server-status', 'server-info',
            'uploads', 'images', 'img', 'assets', 'static', 'media', 'files', 'download',
            'private', 'secret', 'hidden', 'internal', 'portal', 'console',
            'cgi-bin', 'scripts', 'includes', 'inc', 'lib', 'vendor', 'node_modules',
            'phpmyadmin', 'pma', 'mysql', 'database', 'db', 'sql', 'data',
            'user', 'users', 'account', 'profile', 'register', 'signup', 'signin',
            '.well-known', 'security.txt', 'humans.txt', 'favicon.ico'
        ];
    }

    async init(container, context = {}) {
        this.container = container;
        this.context = context;
        import('../../js/analytics.js').then(m => m.analytics.trackEvent('service_load', { service: this.serviceId }));
        this.restoreState();
        this.render();
        this.bindEvents();
    }

    restoreState() {
        const saved = window.serviceStates[this.serviceId];
        if (saved) {
            this.results = saved.results || [];
            this.stats = saved.stats || { found200: 0, found3xx: 0, found403: 0, scanned: 0 };
            this.isScanning = saved.isScanning || false;
        }
    }

    saveState() {
        window.serviceStates[this.serviceId] = { results: this.results, stats: this.stats, isScanning: this.isScanning };
    }

    render() {
        if (this.context.primaryActions) {
            this.context.primaryActions.innerHTML = `
                <button id="fuzzBtn" ${this.isScanning ? 'style="display:none"' : ''}>START FUZZING</button>
                <button id="stopFuzzBtn" class="btn-stop" ${!this.isScanning ? 'style="display:none"' : ''}>STOP</button>
            `;
            this.scanBtn = this.context.primaryActions.querySelector('#fuzzBtn');
            this.stopBtn = this.context.primaryActions.querySelector('#stopFuzzBtn');
        }

        if (this.context.secondaryActions) {
            this.context.secondaryActions.innerHTML = '';
        }

        this.container.innerHTML = `
            <div style="width: 100%; max-width: 1000px;">
                <div style="display: flex; gap: 15px; margin-bottom: 20px;">
                    <div style="flex: 1; background: var(--bg-card); border: 1px solid #27272a; border-radius: 8px; padding: 15px; text-align: center;">
                        <div style="font-size: 2rem; font-weight: 700; color: #10b981;" id="found200">${this.stats.found200}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">200 OK</div>
                    </div>
                    <div style="flex: 1; background: var(--bg-card); border: 1px solid #27272a; border-radius: 8px; padding: 15px; text-align: center;">
                        <div style="font-size: 2rem; font-weight: 700; color: #f59e0b;" id="found3xx">${this.stats.found3xx}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">3xx Redirect</div>
                    </div>
                    <div style="flex: 1; background: var(--bg-card); border: 1px solid #27272a; border-radius: 8px; padding: 15px; text-align: center;">
                        <div style="font-size: 2rem; font-weight: 700; color: #ef4444;" id="found403">${this.stats.found403}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">403 Forbidden</div>
                    </div>
                    <div style="flex: 1; background: var(--bg-card); border: 1px solid #27272a; border-radius: 8px; padding: 15px; text-align: center;">
                        <div style="font-size: 2rem; font-weight: 700; color: #e4e4e7;" id="scanned">${this.stats.scanned}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">Scanned</div>
                    </div>
                </div>
                <div id="fuzzResults" style="background: var(--bg-card); border: 1px solid #27272a; border-radius: 12px; padding: 20px; min-height: 300px; max-height: 500px; overflow-y: auto; font-family: monospace; font-size: 0.85rem;"></div>
            </div>
        `;

        this.resultsDiv = this.container.querySelector('#fuzzResults');
        this.renderResults();
    }

    renderResults() {
        if (this.results.length === 0) {
            this.resultsDiv.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 40px;">Enter a target URL and click "START FUZZING"</div>`;
            return;
        }
        this.resultsDiv.innerHTML = this.results.map(r => `
            <div style="display: flex; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); align-items: center;">
                <a href="${r.url}" target="_blank" style="color: #e4e4e7; text-decoration: none; flex: 1;">${r.path}</a>
                <span style="color: ${r.status >= 200 && r.status < 300 ? '#10b981' : r.status >= 300 && r.status < 400 ? '#f59e0b' : '#ef4444'}; font-size: 0.75rem;">${r.status}</span>
            </div>
        `).join('');
    }

    bindEvents() {
        this.scanBtn?.addEventListener('click', () => this.startFuzzing());
        this.stopBtn?.addEventListener('click', () => this.stopFuzzing());
        document.getElementById('clearFuzzBtn')?.addEventListener('click', () => this.clearResults());
    }

    async startFuzzing() {
        let target = document.getElementById('globalTargetInput')?.value?.trim();
        if (!target) { alert('Please enter a target URL'); return; }

        // Security: Sanitize
        target = window.sanitizeInput ? window.sanitizeInput(target) : target;

        import('../../js/analytics.js').then(m => m.analytics.trackEvent('scan_start', { service: this.serviceId, target: target }));

        if (!target.startsWith('http')) target = 'https://' + target;
        target = target.replace(/\/$/, '');

        this.isScanning = true;
        this.abortController = new AbortController();
        this.results = [];
        this.stats = { found200: 0, found3xx: 0, found403: 0, scanned: 0 };
        this.saveState();

        if (this.scanBtn) this.scanBtn.style.display = 'none';
        if (this.stopBtn) this.stopBtn.style.display = 'inline-block';
        if (this.context.progressTrack) this.context.progressTrack.style.display = 'block';

        this.resultsDiv.innerHTML = '';
        const total = this.wordlist.length;

        for (const path of this.wordlist) {
            if (!this.isScanning) break;
            const url = `${target}/${path}`;
            this.stats.scanned++;
            this.container.querySelector('#scanned').textContent = this.stats.scanned;
            if (this.context.progressFill) this.context.progressFill.style.width = `${(this.stats.scanned / total) * 100}%`;
            if (this.context.statusText) this.context.statusText.textContent = `Testing: /${path}`;

            try {
                const res = await fetch(url, { method: 'HEAD', signal: this.abortController.signal });
                const status = res.status;
                if (status >= 200 && status < 300) { this.stats.found200++; this.container.querySelector('#found200').textContent = this.stats.found200; }
                else if (status >= 300 && status < 400) { this.stats.found3xx++; this.container.querySelector('#found3xx').textContent = this.stats.found3xx; }
                else if (status === 403) { this.stats.found403++; this.container.querySelector('#found403').textContent = this.stats.found403; }

                if (status !== 404) {
                    const entry = { url, path, status, time: new Date().toISOString() };
                    this.results.push(entry);
                    this.addResultRow(entry);
                }
            } catch (err) { /* Timeout or CORS blocked */ }

            this.saveState();
            await new Promise(r => setTimeout(r, 100));
        }

        this.finishFuzzing();
    }

    addResultRow(entry) {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); align-items: center;';
        const color = entry.status >= 200 && entry.status < 300 ? '#10b981' : entry.status >= 300 && entry.status < 400 ? '#f59e0b' : '#ef4444';
        row.innerHTML = `<a href="${entry.url}" target="_blank" style="color: #e4e4e7; text-decoration: none; flex: 1;">${entry.path}</a><span style="color: ${color}; font-size: 0.75rem;">${entry.status}</span>`;
        this.resultsDiv.appendChild(row);
    }

    stopFuzzing() { this.isScanning = false; this.abortController?.abort(); this.saveState(); this.finishFuzzing(); }
    finishFuzzing() {
        this.isScanning = false; this.saveState();
        if (this.scanBtn) this.scanBtn.style.display = 'inline-block';
        if (this.stopBtn) this.stopBtn.style.display = 'none';
        if (this.context.statusText) this.context.statusText.textContent = `Completed. Found ${this.results.length} endpoints`;
    }

    exportResults() {
        if (!this.results.length) { alert('No results'); return; }
        const blob = new Blob([JSON.stringify(this.results, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `fuzz-results-${Date.now()}.json`; a.click();
    }

    clearResults() {
        this.results = []; this.stats = { found200: 0, found3xx: 0, found403: 0, scanned: 0 }; this.saveState();
        this.container.querySelector('#found200').textContent = '0';
        this.container.querySelector('#found3xx').textContent = '0';
        this.container.querySelector('#found403').textContent = '0';
        this.container.querySelector('#scanned').textContent = '0';
        this.resultsDiv.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 40px;">Enter a target URL and click "START FUZZING"</div>';
    }

    destroy() { this.saveState(); }
}
