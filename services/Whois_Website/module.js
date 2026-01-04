/**
 * Whois Website Service
 * Retrieves registration and ownership information for domains
 */

// Global state storage for service persistence
if (!window.serviceStates) window.serviceStates = {};

export default class WhoisWebsiteService {
    constructor() {
        this.serviceId = 'Whois_Website';
        this.isScanning = false;
        this.results = null;
    }

    async init(container, context = {}) {
        this.container = container;
        this.context = context;
        import('../../js/analytics.js').then(m => m.analytics.trackEvent('service_load', { service: this.serviceId }));
        this.restoreState();
        await this.render();
        this.bindEvents();
    }

    restoreState() {
        const saved = window.serviceStates[this.serviceId];
        if (saved) {
            this.results = saved.results;
            this.isScanning = saved.isScanning || false;
        }
    }

    saveState() {
        window.serviceStates[this.serviceId] = {
            results: this.results,
            isScanning: this.isScanning
        };
    }

    render() {
        if (this.context.primaryActions) {
            this.context.primaryActions.innerHTML = `<button id="whoisBtn">LOOKUP WHOIS</button>`;
            this.whoisBtn = this.context.primaryActions.querySelector('#whoisBtn');
        }

        if (this.context.secondaryActions) {
            this.context.secondaryActions.innerHTML = '';
        }

        this.container.innerHTML = `
            <div class="whois-container" style="width: 100%; max-width: 900px;">
                <div id="whoisResults" style="background: var(--bg-card, #18181b); border: 1px solid var(--border-color, #27272a); border-radius: 12px; padding: 24px; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; color: var(--text-main, #e4e4e7); min-height: 300px;"></div>
            </div>
        `;
        this.resultsDiv = this.container.querySelector('#whoisResults');

        // Restore previous results if any
        if (this.results) {
            this.renderResults(this.results, this.results.domain);
        } else {
            this.resultsDiv.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 40px;">Enter a domain and click "LOOKUP WHOIS" to retrieve registration information.</div>`;
        }
    }

    bindEvents() {
        this.whoisBtn?.addEventListener('click', () => this.lookupWhois());
    }

    async lookupWhois() {
        let target = document.getElementById('globalTargetInput')?.value?.trim();
        if (!target) { alert('Please enter a target domain'); return; }

        // Security: Sanitize
        target = window.sanitizeInput ? window.sanitizeInput(target) : target;

        import('../../js/analytics.js').then(m => m.analytics.trackEvent('scan_start', { service: this.serviceId, target: target }));

        const domain = target.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');

        this.isScanning = true;
        if (this.whoisBtn) this.whoisBtn.disabled = true;
        if (this.context.progressTrack) { this.context.progressTrack.style.display = 'block'; this.context.progressFill.style.width = '30%'; }
        if (this.context.statusText) this.context.statusText.textContent = `Looking up: ${domain}`;

        this.resultsDiv.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-muted);"><div style="font-size: 2rem; margin-bottom: 10px;">⏳</div>Loading WHOIS data for ${domain}...</div>`;

        try {
            const data = await this.fetchWhoisData(domain);
            this.results = data;
            this.saveState();
            this.renderResults(data, domain);
            if (this.context.progressFill) this.context.progressFill.style.width = '100%';
            if (this.context.statusText) this.context.statusText.textContent = 'Lookup complete';
        } catch (err) {
            console.error('WHOIS Error:', err);
            this.resultsDiv.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--danger, #ef4444);"><div style="font-size: 2rem; margin-bottom: 10px;">❌</div>Failed to retrieve WHOIS data: ${err.message}</div>`;
            if (this.context.statusText) this.context.statusText.textContent = 'Lookup failed';
        }

        this.isScanning = false;
        this.saveState();
        if (this.whoisBtn) this.whoisBtn.disabled = false;
    }

    async fetchWhoisData(domain) {
        try {
            const rdapData = await this.fetchRDAP(domain);
            if (rdapData) return rdapData;
        } catch (e) { console.log('RDAP failed'); }
        return this.getMockWhoisData(domain);
    }

    async fetchRDAP(domain) {
        const tld = domain.split('.').pop().toLowerCase();
        const rdapServers = {
            'com': 'https://rdap.verisign.com/com/v1/domain/',
            'net': 'https://rdap.verisign.com/net/v1/domain/',
            'org': 'https://rdap.publicinterestregistry.org/rdap/domain/',
        };
        const rdapUrl = rdapServers[tld] || 'https://rdap.org/domain/';
        const response = await fetch(`${rdapUrl}${domain}`, { headers: { 'Accept': 'application/rdap+json' } });
        if (!response.ok) throw new Error('RDAP lookup failed');
        return this.parseRDAPResponse(await response.json(), domain);
    }

    parseRDAPResponse(rdap, domain) {
        const getEvent = (action) => rdap.events?.find(e => e.eventAction === action)?.eventDate || 'N/A';
        return {
            domain, registrar: rdap.entities?.find(e => e.roles?.includes('registrar'))?.vcardArray?.[1]?.find(v => v[0] === 'fn')?.[3] || 'N/A',
            created: getEvent('registration'), updated: getEvent('last changed'), expires: getEvent('expiration'),
            status: rdap.status?.join(', ') || 'N/A', nameServers: rdap.nameservers?.map(ns => ns.ldhName).join(', ') || 'N/A',
            registrant: { name: 'REDACTED', org: 'Privacy Protected', country: 'N/A' }, admin: { name: 'REDACTED', email: 'N/A' }
        };
    }

    getMockWhoisData(domain) {
        return {
            domain, registrar: 'Example Registrar Inc.', created: '2020-01-15', updated: '2024-12-01', expires: '2025-12-15',
            status: 'clientTransferProhibited', nameServers: `ns1.${domain}, ns2.${domain}`,
            registrant: { name: 'REDACTED FOR PRIVACY', org: 'Privacy Protection Service', country: 'US' },
            admin: { name: 'REDACTED FOR PRIVACY', email: 'Refer to registrar' }, note: 'Demo data - configure RDAP for real lookups.'
        };
    }

    renderResults(data, domain) {
        const formatDate = (d) => { try { return d && d !== 'N/A' ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'; } catch { return d; } };
        this.resultsDiv.innerHTML = `
            <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid var(--border-color);">
                <h2 style="margin: 0; font-size: 1.5rem; color: var(--brand-primary, #f43f5e);">${domain}</h2>
                ${data.note ? `<div style="margin-top: 8px; color: var(--warning); font-size: 0.75rem;">⚠️ ${data.note}</div>` : ''}
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px;">
                <div style="background: rgba(0,0,0,0.3); padding: 16px; border-radius: 8px;">
                    <h3 style="color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; margin-bottom: 12px;">Registration</h3>
                    <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05);"><span style="color: var(--text-muted);">Registrar:</span><span>${data.registrar}</span></div>
                    <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05);"><span style="color: var(--text-muted);">Created:</span><span>${formatDate(data.created)}</span></div>
                    <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05);"><span style="color: var(--text-muted);">Expires:</span><span>${formatDate(data.expires)}</span></div>
                    <div style="display: flex; justify-content: space-between; padding: 6px 0;"><span style="color: var(--text-muted);">Status:</span><span style="color: var(--success);">${data.status}</span></div>
                </div>
                <div style="background: rgba(0,0,0,0.3); padding: 16px; border-radius: 8px;">
                    <h3 style="color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; margin-bottom: 12px;">Name Servers</h3>
                    <div style="background: #000; padding: 12px; border-radius: 6px; word-break: break-all;">${(data.nameServers || 'N/A').split(',').map(ns => `<div style="margin: 4px 0;">${ns.trim()}</div>`).join('')}</div>
                </div>
            </div>`;
    }

    exportResults() {
        if (!this.results) { alert('No results to export'); return; }
        const blob = new Blob([JSON.stringify(this.results, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `whois-${this.results.domain}-${Date.now()}.json`; a.click();
    }

    destroy() { this.saveState(); }
}
