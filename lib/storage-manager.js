// TAMos Storage Manager - Comprehensive data persistence system
// Implements sessionStorage, localStorage, and IndexedDB with multi-tab safety
// Browser-only: Guards against server-side execution

class StorageManager {
    constructor() {
        // Guard against server-side execution
        if (typeof window === "undefined") {
            return;
        }

        this.formVersion = '1.0';
        this.draftTTL = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
        this.autoSaveInterval = 15000; // 15 seconds
        this.dirtyFlag = false;
        this.lastSaveTime = 0;
        this.autoSaveTimer = null;
        this.storageEventHandlers = new Map();
        
        this.init();
    }

    async init() {
        if (typeof window === "undefined") return;
        await this.initIndexedDB();
        this.setupStorageEventListeners();
        this.setupVisibilityChangeListener();
        this.setupBeforeUnloadListener();
    }

    // IndexedDB initialization
    async initIndexedDB() {
        if (typeof window === "undefined" || typeof indexedDB === "undefined") {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open('TAMosDB', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create submissions store
                if (!db.objectStoreNames.contains('submissions')) {
                    const submissionsStore = db.createObjectStore('submissions', { keyPath: 'id' });
                    submissionsStore.createIndex('status', 'status', { unique: false });
                    submissionsStore.createIndex('createdAt', 'createdAt', { unique: false });
                    submissionsStore.createIndex('customerName', 'payload.customerName', { unique: false });
                    submissionsStore.createIndex('formVersion', 'formVersion', { unique: false });
                }
                
                // Create drafts store
                if (!db.objectStoreNames.contains('drafts')) {
                    const draftsStore = db.createObjectStore('drafts', { keyPath: 'id' });
                    draftsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                    draftsStore.createIndex('formVersion', 'formVersion', { unique: false });
                }
                
                // Create settings store
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    }

    // Data Models
    createSubmission(payload, meta = {}) {
        return {
            id: this.generateId(),
            formVersion: this.formVersion,
            status: 'submitted',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            payload: payload,
            meta: {
                userAgent: typeof navigator !== "undefined" ? navigator.userAgent : '',
                timestamp: Date.now(),
                ...meta
            }
        };
    }

    createDraft(payload) {
        return {
            id: this.generateId(),
            formVersion: this.formVersion,
            status: 'draft',
            updatedAt: new Date().toISOString(),
            payload: payload
        };
    }

    // SessionStorage for live draft safety
    saveLiveDraft(formData) {
        if (typeof window === "undefined" || typeof sessionStorage === "undefined") return;
        try {
            const liveDraft = {
                data: formData,
                timestamp: Date.now(),
                dirty: true
            };
            sessionStorage.setItem('tamos_live_draft', JSON.stringify(liveDraft));
            this.dirtyFlag = true;
        } catch (error) {
            console.error('Error saving live draft:', error);
        }
    }

    loadLiveDraft() {
        if (typeof window === "undefined" || typeof sessionStorage === "undefined") return null;
        try {
            const liveDraft = sessionStorage.getItem('tamos_live_draft');
            return liveDraft ? JSON.parse(liveDraft) : null;
        } catch (error) {
            console.error('Error loading live draft:', error);
            return null;
        }
    }

    clearLiveDraft() {
        if (typeof window === "undefined" || typeof sessionStorage === "undefined") return;
        sessionStorage.removeItem('tamos_live_draft');
        this.dirtyFlag = false;
    }

    // LocalStorage for drafts and submissions (fallback)
    saveToLocalStorage(key, data) {
        if (typeof window === "undefined" || typeof localStorage === "undefined") return;
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (error) {
            console.error('Error saving to localStorage:', error);
            // Fallback to sessionStorage if localStorage is full
            try {
                if (typeof sessionStorage !== "undefined") {
                    sessionStorage.setItem(key, JSON.stringify(data));
                }
            } catch (sessionError) {
                console.error('Error saving to sessionStorage:', sessionError);
            }
        }
    }

    loadFromLocalStorage(key) {
        if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Error loading from localStorage:', error);
            return null;
        }
    }

    // IndexedDB operations
    async saveSubmission(submission) {
        if (typeof window === "undefined") return submission;
        
        // No encryption (privacy-manager removed)
        const encryptedSubmission = submission;
        
        if (!this.db) {
            // Fallback to localStorage
            const submissions = this.loadFromLocalStorage('tamos_submissions') || [];
            submissions.push(encryptedSubmission);
            this.saveToLocalStorage('tamos_submissions', submissions);
            return submission;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['submissions'], 'readwrite');
            const store = transaction.objectStore('submissions');
            const request = store.add(encryptedSubmission);
            
            request.onsuccess = () => resolve(submission);
            request.onerror = () => reject(request.error);
        });
    }

    async saveDraft(draft) {
        if (typeof window === "undefined") return draft;
        
        // No encryption (privacy-manager removed)
        const encryptedDraft = draft;
        
        if (!this.db) {
            // Fallback to localStorage
            const drafts = this.loadFromLocalStorage('tamos_drafts') || [];
            const existingIndex = drafts.findIndex(d => d.id === draft.id);
            if (existingIndex >= 0) {
                drafts[existingIndex] = encryptedDraft;
            } else {
                drafts.push(encryptedDraft);
            }
            this.saveToLocalStorage('tamos_drafts', drafts);
            return draft;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['drafts'], 'readwrite');
            const store = transaction.objectStore('drafts');
            const request = store.put(encryptedDraft);
            
            request.onsuccess = () => {
                // Also save to localStorage for immediate access
                const drafts = this.loadFromLocalStorage('tamos_drafts') || [];
                const existingIndex = drafts.findIndex(d => d.id === draft.id);
                if (existingIndex >= 0) {
                    drafts[existingIndex] = encryptedDraft;
                } else {
                    drafts.push(encryptedDraft);
                }
                this.saveToLocalStorage('tamos_drafts', drafts);
                resolve(draft);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getSubmissions(filter = {}) {
        if (typeof window === "undefined") return [];
        
        let submissions;
        
        if (!this.db) {
            // Fallback to localStorage
            submissions = this.loadFromLocalStorage('tamos_submissions') || [];
        } else {
            submissions = await new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['submissions'], 'readonly');
                const store = transaction.objectStore('submissions');
                const request = store.getAll();
                
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }
        
        // No decryption needed (privacy-manager removed)
        return this.filterSubmissions(submissions, filter);
    }

    async getDrafts() {
        if (typeof window === "undefined") return [];
        
        let drafts;
        
        if (!this.db) {
            // Fallback to localStorage
            drafts = this.loadFromLocalStorage('tamos_drafts') || [];
        } else {
            drafts = await new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['drafts'], 'readonly');
                const store = transaction.objectStore('drafts');
                const request = store.getAll();
                
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }
        
        // No decryption needed (privacy-manager removed)
        return drafts;
    }

    async deleteDraft(draftId) {
        if (typeof window === "undefined") return;
        
        if (!this.db) {
            // Fallback to localStorage
            const drafts = this.loadFromLocalStorage('tamos_drafts') || [];
            const filteredDrafts = drafts.filter(d => d.id !== draftId);
            this.saveToLocalStorage('tamos_drafts', filteredDrafts);
            return;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['drafts'], 'readwrite');
            const store = transaction.objectStore('drafts');
            const request = store.delete(draftId);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Draft autosave functionality
    startAutoSave(formElement) {
        if (typeof window === "undefined" || !formElement) return;
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
        }

        // Debounced save function
        const debouncedSave = this.debounce(() => {
            this.saveFormAsDraft(formElement);
        }, 2000);

        // Auto-save on input changes
        formElement.addEventListener('input', () => {
            this.dirtyFlag = true;
            debouncedSave();
        });

        formElement.addEventListener('change', () => {
            this.dirtyFlag = true;
            debouncedSave();
        });

        // Periodic auto-save
        this.autoSaveTimer = setInterval(() => {
            if (this.dirtyFlag) {
                this.saveFormAsDraft(formElement);
            }
        }, this.autoSaveInterval);
    }

    stopAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
    }

    async saveFormAsDraft(formElement) {
        if (typeof window === "undefined" || !formElement) return;

        const formData = this.extractFormData(formElement);
        const draft = this.createDraft(formData);
        
        // Save live draft to sessionStorage
        this.saveLiveDraft(formData);
        
        // Save persistent draft
        await this.saveDraft(draft);
        
        this.dirtyFlag = false;
        this.lastSaveTime = Date.now();
        
        // Notify other tabs
        this.notifyOtherTabs('draft_saved', { draftId: draft.id, timestamp: Date.now() });
    }

    async loadDraft(draftId = null) {
        if (typeof window === "undefined") return null;
        
        if (draftId) {
            // Load specific draft
            const drafts = await this.getDrafts();
            return drafts.find(d => d.id === draftId);
        } else {
            // Load most recent draft
            const drafts = await this.getDrafts();
            return drafts.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
        }
    }

    async restoreDraftToForm(draft, formElement) {
        if (typeof window === "undefined" || !draft || !formElement) return false;

        try {
            Object.keys(draft.payload).forEach(key => {
                if (key === 'projectPlanOwner' && Array.isArray(draft.payload[key])) {
                    // Handle checkbox group
                    draft.payload[key].forEach(value => {
                        const checkbox = formElement.querySelector(`input[name="projectPlanOwner"][value="${value}"]`);
                        if (checkbox) checkbox.checked = true;
                    });
                } else {
                    const input = formElement.querySelector(`[name="${key}"]`);
                    if (input && draft.payload[key]) {
                        if (input.type === 'checkbox') {
                            input.checked = true;
                        } else {
                            input.value = draft.payload[key];
                        }
                    }
                }
            });
            return true;
        } catch (error) {
            console.error('Error restoring draft:', error);
            return false;
        }
    }

    // Multi-tab safety
    setupStorageEventListeners() {
        if (typeof window === "undefined") return;
        window.addEventListener('storage', (event) => {
            if (event.key && event.key.startsWith('tamos_')) {
                this.handleStorageEvent(event);
            }
        });
    }

    handleStorageEvent(event) {
        const { key, newValue } = event;
        
        if (key === 'tamos_draft_saved') {
            const data = JSON.parse(newValue);
            this.showMultiTabNotification('Draft updated in another tab', data.timestamp);
        }
    }

    notifyOtherTabs(eventType, data) {
        if (typeof window === "undefined" || typeof localStorage === "undefined") return;
        try {
            localStorage.setItem(`tamos_${eventType}`, JSON.stringify({
                ...data,
                timestamp: Date.now()
            }));
            // Clear the notification after a short delay
            setTimeout(() => {
                localStorage.removeItem(`tamos_${eventType}`);
            }, 1000);
        } catch (error) {
            console.error('Error notifying other tabs:', error);
        }
    }

    showMultiTabNotification(message, timestamp) {
        if (typeof window === "undefined" || typeof document === "undefined") return;
        const timeAgo = this.formatTimeAgo(timestamp);
        const notification = document.createElement('div');
        notification.className = 'multi-tab-notification';
        notification.innerHTML = `
            <div class="notification-content">
                <p>${message} ${timeAgo}</p>
                <div class="notification-actions">
                    <button onclick="window.location.reload()">Reload</button>
                    <button onclick="this.closest('.multi-tab-notification')?.remove()">Keep Mine</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-dismiss after 10 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 10000);
    }

    // Visibility change and beforeunload handlers
    setupVisibilityChangeListener() {
        if (typeof window === "undefined" || typeof document === "undefined") return;
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.dirtyFlag) {
                // Save draft when tab becomes hidden
                const form = document.getElementById('healthForm');
                if (form) {
                    this.saveFormAsDraft(form);
                }
            }
        });
    }

    setupBeforeUnloadListener() {
        if (typeof window === "undefined") return;
        window.addEventListener('beforeunload', (event) => {
            if (this.dirtyFlag && (Date.now() - this.lastSaveTime) > 5000) {
                event.preventDefault();
                event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
                return event.returnValue;
            }
        });
    }

    // Retention and cleanup
    async cleanupOldDrafts() {
        if (typeof window === "undefined") return 0;
        const drafts = await this.getDrafts();
        const cutoffTime = Date.now() - this.draftTTL;
        
        const oldDrafts = drafts.filter(draft => 
            new Date(draft.updatedAt).getTime() < cutoffTime
        );
        
        for (const draft of oldDrafts) {
            await this.deleteDraft(draft.id);
        }
        
        return oldDrafts.length;
    }

    async clearAllData() {
        if (typeof window === "undefined") return;
        
        // Clear IndexedDB
        if (this.db) {
            const transaction = this.db.transaction(['submissions', 'drafts', 'settings'], 'readwrite');
            await Promise.all([
                transaction.objectStore('submissions').clear(),
                transaction.objectStore('drafts').clear(),
                transaction.objectStore('settings').clear()
            ]);
        }
        
        // Clear localStorage
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('tamos_')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        
        // Clear sessionStorage
        const sessionKeysToRemove = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && key.startsWith('tamos_')) {
                sessionKeysToRemove.push(key);
            }
        }
        sessionKeysToRemove.forEach(key => sessionStorage.removeItem(key));
        
        this.dirtyFlag = false;
    }

    // Portability - Export/Import
    async exportData(format = 'json') {
        if (typeof window === "undefined") return '';
        const [submissions, drafts] = await Promise.all([
            this.getSubmissions(),
            this.getDrafts()
        ]);
        
        const exportData = {
            version: this.formVersion,
            exportDate: new Date().toISOString(),
            submissions,
            drafts
        };
        
        if (format === 'csv') {
            return this.exportToCSV(exportData);
        }
        
        return JSON.stringify(exportData, null, 2);
    }

    exportToCSV(data) {
        const headers = [
            'ID', 'Customer Name', 'Email', 'Status', 'Health Score', 
            'Renewal Likelihood', 'TBR Count', 'Hours Per Week', 'Created Date'
        ];
        
        const rows = data.submissions.map(sub => [
            sub.id,
            sub.payload.customerName || '',
            sub.payload.email || '',
            sub.status,
            sub.payload.stakeholderRelationshipHealth || '',
            sub.payload.renewalLikelihood || '',
            sub.payload.tbrCount || '',
            sub.payload.hoursPerWeek || '',
            new Date(sub.createdAt).toLocaleDateString()
        ]);
        
        return [headers, ...rows].map(row => 
            row.map(cell => `"${cell}"`).join(',')
        ).join('\n');
    }

    async importData(jsonData) {
        if (typeof window === "undefined") return false;
        try {
            const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
            
            if (data.submissions) {
                for (const submission of data.submissions) {
                    await this.saveSubmission(submission);
                }
            }
            
            if (data.drafts) {
                for (const draft of data.drafts) {
                    await this.saveDraft(draft);
                }
            }
            
            return true;
        } catch (error) {
            console.error('Error importing data:', error);
            return false;
        }
    }

    // Utility methods
    extractFormData(formElement) {
        if (typeof window === "undefined" || !formElement) return {};
        const formData = new FormData(formElement);
        const data = {};
        
        for (let [key, value] of formData.entries()) {
            if (data[key]) {
                if (Array.isArray(data[key])) {
                    data[key].push(value);
                } else {
                    data[key] = [data[key], value];
                }
            } else {
                data[key] = value;
            }
        }
        
        // Handle checkbox groups
        const projectPlanOwners = [];
        const checkboxes = formElement.querySelectorAll('input[name="projectPlanOwner"]:checked');
        checkboxes.forEach(checkbox => {
            projectPlanOwners.push(checkbox.value);
        });
        data.projectPlanOwner = projectPlanOwners;
        
        return data;
    }

    filterSubmissions(submissions, filter) {
        return submissions.filter(submission => {
            if (filter.status && submission.status !== filter.status) return false;
            if (filter.customerName && !submission.payload.customerName?.toLowerCase().includes(filter.customerName.toLowerCase())) return false;
            if (filter.dateFrom && new Date(submission.createdAt) < new Date(filter.dateFrom)) return false;
            if (filter.dateTo && new Date(submission.createdAt) > new Date(filter.dateTo)) return false;
            return true;
        });
    }

    generateId() {
        return 'tamos_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    formatTimeAgo(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        
        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'just now';
    }

    // Storage usage information
    async getStorageUsage() {
        if (typeof window === "undefined") return { localStorage: 0, sessionStorage: 0, indexedDB: 0 };
        
        const usage = {
            localStorage: 0,
            sessionStorage: 0,
            indexedDB: 0
        };
        
        // Calculate localStorage usage
        if (typeof localStorage !== "undefined") {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('tamos_')) {
                    usage.localStorage += localStorage.getItem(key).length;
                }
            }
        }
        
        // Calculate sessionStorage usage
        if (typeof sessionStorage !== "undefined") {
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                if (key && key.startsWith('tamos_')) {
                    usage.sessionStorage += sessionStorage.getItem(key).length;
                }
            }
        }
        
        return usage;
    }
}

// Export for use in React components
if (typeof module !== "undefined" && module.exports) {
    module.exports = StorageManager;
    module.exports.default = StorageManager;
    module.exports.StorageManager = StorageManager;
}

// Also make available globally in browser
if (typeof window !== "undefined") {
    window.StorageManager = StorageManager;
    // Initialize instance for backward compatibility
    window.storageManager = new StorageManager();
}

