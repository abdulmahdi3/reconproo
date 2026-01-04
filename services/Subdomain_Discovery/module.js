/**
 * Subdomain Discovery Service - with state persistence
 */
if (!window.serviceStates) window.serviceStates = {};

export default class SubdomainDiscoveryService {
    constructor() {
        this.serviceId = 'Subdomain_Discovery';
        this.isScanning = false;
        this.abortController = null;
        this.subdomains = new Set();
        this.sourceStates = {};
        this.sources = [
            { id: 'crtsh', name: 'crt.sh' },
            { id: 'hackertarget', name: 'HackerTarget' },
            { id: 'alienvault', name: 'AlienVault OTX' },
        ];
    }

    async init(container, context = {}) {
        this.container = container;
        this.context = context;
        import('../../js/analytics.js').then(m => m.analytics.trackEvent('service_load', { service: this.serviceId }));
        this.restoreState();
        this.render();
        this.bindEvents();
        this.updateStatusDisplay();
    }

    restoreState() {
        const saved = window.serviceStates[this.serviceId];
        if (saved) {
            this.subdomains = new Set(saved.subdomains || []);
            this.sourceStates = saved.sourceStates || {};
            this.isScanning = saved.isScanning || false;
        }
    }

    saveState() {
        window.serviceStates[this.serviceId] = {
            subdomains: Array.from(this.subdomains),
            sourceStates: this.sourceStates,
            isScanning: this.isScanning
        };
    }

    render() {
        if (this.context.primaryActions) {
            this.context.primaryActions.innerHTML = `
                <button id="subdomainBtn" ${this.isScanning ? 'style="display:none"' : ''}>FIND SUBDOMAINS</button>
                <button id="stopSubBtn" class="btn-stop" ${!this.isScanning ? 'style="display:none"' : ''}>STOP</button>
            `;
            this.scanBtn = this.context.primaryActions.querySelector('#subdomainBtn');
            this.stopBtn = this.context.primaryActions.querySelector('#stopSubBtn');
        }

        if (this.context.secondaryActions) {
            this.context.secondaryActions.innerHTML = '';
        }

        this.container.innerHTML = `
            <div style="width: 100%; max-width: 1200px;">
                <div style="display: grid; grid-template-columns: 1fr 250px; gap: 20px;">
                    <div id="subdomainResults" style="background: var(--bg-card, #18181b); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px; min-height: 400px; max-height: 600px; overflow-y: auto;"></div>
                    <div style="background: var(--bg-card, #18181b); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px;">
                        <h3 style="margin: 0 0 15px; font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase;">Sources</h3>
                        <div id="sourceList"></div>
                    </div>
                </div>
                <div style="margin-top: 20px; padding: 15px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; font-family: monospace;">
                    <span style="color: var(--text-muted);">Total Unique:</span> <span id="totalCount">${this.subdomains.size}</span>
                </div>
            </div>
        `;

        this.resultsDiv = this.container.querySelector('#subdomainResults');
        this.sourceList = this.container.querySelector('#sourceList');
        this.totalCount = this.container.querySelector('#totalCount');
        this.renderSources();
        this.renderSubdomains();
    }

    renderSources() {
        this.sourceList.innerHTML = this.sources.map(src => {
            const state = this.sourceStates[src.id] || { status: 'waiting', count: 0 };
            const styles = {
                loading: { bg: 'rgba(245,158,11,0.2)', color: '#f59e0b', text: 'LOADING' },
                success: { bg: '#10b981', color: '#fff', text: `${state.count} FOUND` },
                error: { bg: '#ef4444', color: '#fff', text: 'ERROR' },
                waiting: { bg: '#27272a', color: 'var(--text-muted)', text: 'WAITING' }
            };
            const s = styles[state.status] || styles.waiting;
            return `<div id="src-${src.id}" style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.8rem;">
                <span>${src.name}</span><span class="src-badge" style="padding: 2px 6px; border-radius: 4px; background: ${s.bg}; color: ${s.color}; font-size: 0.7rem;">${s.text}</span>
            </div>`;
        }).join('');
    }

    updateSource(id, status, count = 0) {
        this.sourceStates[id] = { status, count };
        this.saveState();
        this.renderSources();
    }

    bindEvents() {
        this.scanBtn?.addEventListener('click', () => this.startEnumeration());
        this.stopBtn?.addEventListener('click', () => this.stopEnumeration());
        document.getElementById('clearSubBtn')?.addEventListener('click', () => this.clearResults());
    }

    updateStatusDisplay() {
        if (this.context.apiStatus) this.context.apiStatus.innerHTML = `Found: ${this.subdomains.size} subdomains`;
    }

    async startEnumeration() {
        let target = document.getElementById('globalTargetInput')?.value?.trim();
        if (!target) { alert('Please enter a target domain'); return; }

        // Security: Sanitize
        target = window.sanitizeInput ? window.sanitizeInput(target) : target;

        import('../../js/analytics.js').then(m => m.analytics.trackEvent('scan_start', { service: this.serviceId, target: target }));

        const domain = target.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');

        this.isScanning = true;
        this.abortController = new AbortController();
        this.subdomains = new Set();
        this.sourceStates = {};
        this.saveState();

        if (this.scanBtn) this.scanBtn.style.display = 'none';
        if (this.stopBtn) this.stopBtn.style.display = 'inline-block';
        if (this.context.progressTrack) this.context.progressTrack.style.display = 'block';

        this.renderSources();
        this.resultsDiv.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 20px;">Enumerating subdomains for <strong style="color: #f43f5e">${domain}</strong>...</div>`;

        const promises = this.sources.map(async (source) => {
            this.updateSource(source.id, 'loading');
            try {
                const subs = await this.fetchSource(source.id, domain);
                subs.forEach(s => this.subdomains.add(s.toLowerCase()));
                this.updateSource(source.id, 'success', subs.length);
            } catch (err) { this.updateSource(source.id, 'error'); }
            this.saveState();
            this.renderSubdomains();
            this.updateStatusDisplay();
        });

        await Promise.allSettled(promises);
        this.finishEnumeration();
    }

    async fetchSource(id, domain) {
        const signal = this.abortController?.signal;
        if (id === 'crtsh') {
            const res = await fetch(`https://crt.sh/?q=%25.${domain}&output=json`, { signal });
            const data = await res.json();
            const subs = new Set();
            data.forEach(e => e.name_value.split('\n').forEach(n => { const c = n.replace('*.', '').trim().toLowerCase(); if (c.endsWith(domain)) subs.add(c); }));
            return Array.from(subs);
        }
        if (id === 'hackertarget') {
            const res = await fetch(`https://api.hackertarget.com/hostsearch/?q=${domain}`, { signal });
            const text = await res.text();
            return text.split('\n').filter(l => l.trim()).map(l => l.split(',')[0].trim().toLowerCase()).filter(s => s.endsWith(domain));
        }
        if (id === 'alienvault') {
            const res = await fetch(`https://otx.alienvault.com/api/v1/indicators/domain/${domain}/passive_dns`, { signal });
            const data = await res.json();
            return (data.passive_dns || []).map(e => e.hostname?.toLowerCase()).filter(h => h?.endsWith(domain));
        }
        return [];
    }

    renderSubdomains() {
        const subs = Array.from(this.subdomains).sort();
        this.totalCount.textContent = subs.length;
        if (subs.length === 0) { this.resultsDiv.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 40px;">No subdomains found yet...</div>`; return; }
        this.resultsDiv.innerHTML = `<div style="display: flex; flex-wrap: wrap; gap: 8px;">${subs.map(s => `<a href="https://${s}" target="_blank" style="display: inline-block; background: #000; border: 1px solid #27272a; padding: 6px 12px; border-radius: 6px; font-family: monospace; font-size: 0.8rem; color: #e4e4e7; text-decoration: none;">${s}</a>`).join('')}</div>`;
    }

    stopEnumeration() { this.isScanning = false; this.abortController?.abort(); this.saveState(); this.finishEnumeration(); }
    finishEnumeration() {
        this.isScanning = false; this.saveState();
        if (this.scanBtn) this.scanBtn.style.display = 'inline-block';
        if (this.stopBtn) this.stopBtn.style.display = 'none';
        if (this.context.statusText) this.context.statusText.textContent = `Found ${this.subdomains.size} unique subdomains`;
    }

    exportResults() {
        if (this.subdomains.size === 0) { alert('No results'); return; }
        const blob = new Blob([Array.from(this.subdomains).sort().join('\n')], { type: 'text/plain' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `subdomains-${Date.now()}.txt`; a.click();
    }

    clearResults() {
        this.subdomains = new Set(); this.sourceStates = {}; this.saveState();
        this.totalCount.textContent = '0'; this.renderSources();
        this.resultsDiv.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 40px;">Enter a domain and click "FIND SUBDOMAINS"</div>`;
    }

    destroy() { this.saveState(); }
}
