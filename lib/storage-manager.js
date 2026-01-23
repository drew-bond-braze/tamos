// TAM OS Storage Manager - Task Tracker
// Handles tasks, clients, and task updates
// Browser-only: Guards against server-side execution

class StorageManager {
    constructor() {
        // Guard against server-side execution
        if (typeof window === "undefined") {
            return;
        }

        this.dataVersion = '5.0'; // Account + project model
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
        await this.migrateAccountData();
        await this.ensureDefaultData();
        this.setupStorageEventListeners();
    }

    // IndexedDB initialization
    async initIndexedDB() {
        if (typeof window === "undefined" || typeof indexedDB === "undefined") {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open('TAMosDB', 5); // Version 5 for account model
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const transaction = event.target.transaction;
                
                // Create clients store
                if (!db.objectStoreNames.contains('clients')) {
                    const clientsStore = db.createObjectStore('clients', { keyPath: 'id' });
                    clientsStore.createIndex('name', 'name', { unique: false });
                }

                // Create accounts store
                if (!db.objectStoreNames.contains('accounts')) {
                    const accountsStore = db.createObjectStore('accounts', { keyPath: 'id' });
                    accountsStore.createIndex('name', 'name', { unique: false });
                }

                // Create projects store
                if (!db.objectStoreNames.contains('projects')) {
                    const projectsStore = db.createObjectStore('projects', { keyPath: 'id' });
                    projectsStore.createIndex('name', 'name', { unique: false });
                    projectsStore.createIndex('accountId', 'accountId', { unique: false });
                    projectsStore.createIndex('isPersonal', 'isPersonal', { unique: false });
                    projectsStore.createIndex('dueDate', 'dueDate', { unique: false });
                }
                
                // Create tasks store
                if (!db.objectStoreNames.contains('tasks')) {
                    const tasksStore = db.createObjectStore('tasks', { keyPath: 'id' });
                    tasksStore.createIndex('clientId', 'clientId', { unique: false });
                    tasksStore.createIndex('projectId', 'projectId', { unique: false });
                    tasksStore.createIndex('accountId', 'accountId', { unique: false });
                    tasksStore.createIndex('owner', 'owner', { unique: false });
                    tasksStore.createIndex('status', 'status', { unique: false });
                    tasksStore.createIndex('ballWith', 'ballWith', { unique: false });
                    tasksStore.createIndex('priority', 'priority', { unique: false });
                    tasksStore.createIndex('dueDate', 'dueDate', { unique: false });
                    tasksStore.createIndex('managerAttention', 'managerAttention', { unique: false });
                    tasksStore.createIndex('lastUpdateAt', 'lastUpdateAt', { unique: false });
                    tasksStore.createIndex('createdAt', 'createdAt', { unique: false });
                }

                if (db.objectStoreNames.contains('accounts')) {
                    const accountsStore = transaction.objectStore('accounts');
                    if (!accountsStore.indexNames.contains('name')) {
                        accountsStore.createIndex('name', 'name', { unique: false });
                    }
                }

                if (db.objectStoreNames.contains('projects')) {
                    const projectsStore = transaction.objectStore('projects');
                    if (!projectsStore.indexNames.contains('accountId')) {
                        projectsStore.createIndex('accountId', 'accountId', { unique: false });
                    }
                    if (projectsStore.indexNames.contains('tamUnitId')) {
                        projectsStore.deleteIndex('tamUnitId');
                    }
                }

                if (db.objectStoreNames.contains('tasks')) {
                    const tasksStore = transaction.objectStore('tasks');
                    if (!tasksStore.indexNames.contains('accountId')) {
                        tasksStore.createIndex('accountId', 'accountId', { unique: false });
                    }
                    if (tasksStore.indexNames.contains('tamUnitId')) {
                        tasksStore.deleteIndex('tamUnitId');
                    }
                }
                
                // Create task updates store
                if (!db.objectStoreNames.contains('taskUpdates')) {
                    const updatesStore = db.createObjectStore('taskUpdates', { keyPath: 'id' });
                    updatesStore.createIndex('taskId', 'taskId', { unique: false });
                    updatesStore.createIndex('createdAt', 'createdAt', { unique: false });
                }
            };
        });
    }

    async migrateAccountData() {
        if (typeof window === "undefined") return;

        const legacyAccounts = this.loadFromLocalStorage('tamos_tam_units');
        const currentAccounts = this.loadFromLocalStorage('tamos_accounts');
        if (legacyAccounts && (!currentAccounts || currentAccounts.length === 0)) {
            this.saveToLocalStorage('tamos_accounts', legacyAccounts);
        }
        if (legacyAccounts) {
            localStorage.removeItem('tamos_tam_units');
        }

        this.migrateAccountIdsInLocalStorage('tamos_projects');
        this.migrateAccountIdsInLocalStorage('tamos_tasks');

        if (this.db) {
            await this.migrateAccountStore();
            await this.migrateAccountIdsInStore('projects');
            await this.migrateAccountIdsInStore('tasks');
        }
    }

    migrateAccountIdsInLocalStorage(storageKey) {
        const items = this.loadFromLocalStorage(storageKey);
        if (!Array.isArray(items)) return;
        const migrated = items.map((item) => this.normalizeAccountId(item));
        this.saveToLocalStorage(storageKey, migrated);
    }

    async migrateAccountStore() {
        if (!this.db) return;
        if (!this.db.objectStoreNames.contains('accounts')) return;
        if (!this.db.objectStoreNames.contains('tamUnits')) return;

        const existingAccounts = await new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['accounts'], 'readonly');
            const store = transaction.objectStore('accounts');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });

        if (existingAccounts.length > 0) return;

        await new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['accounts', 'tamUnits'], 'readwrite');
            const legacyStore = transaction.objectStore('tamUnits');
            const accountsStore = transaction.objectStore('accounts');
            const request = legacyStore.getAll();
            request.onsuccess = () => {
                const legacyAccounts = request.result || [];
                legacyAccounts.forEach((account) => {
                    accountsStore.put(account);
                });
            };
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async migrateAccountIdsInStore(storeName) {
        if (!this.db) return;
        if (!this.db.objectStoreNames.contains(storeName)) return;

        await new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => {
                const items = request.result || [];
                items.forEach((item) => {
                    const normalized = this.normalizeAccountId(item);
                    if (normalized !== item) {
                        store.put(normalized);
                    }
                });
            };
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    // Data Models
    createClient(name) {
        return {
            id: this.generateUUID(),
            name: name,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    createAccount(name) {
        return {
            id: this.generateUUID(),
            name: name,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    createProject(projectData) {
        const now = new Date().toISOString();
        return {
            id: this.generateUUID(),
            name: projectData.name || '',
            accountId: projectData.accountId || projectData.tamUnitId || null,
            isPersonal: projectData.isPersonal || false,
            dueDate: projectData.dueDate || null,
            createdAt: now,
            updatedAt: now
        };
    }

    createTask(taskData) {
        const now = new Date().toISOString();
        return {
            id: this.generateUUID(),
            clientId: taskData.clientId || null,
            projectId: taskData.projectId || null,
            accountId: taskData.accountId || taskData.tamUnitId || null,
            title: taskData.title || '',
            status: taskData.status || 'Not started', // Not started, In progress, Blocked, Waiting on client, Waiting on internal, Done
            dueDate: taskData.dueDate || null,
            priority: taskData.priority || 'Medium', // High, Medium, Low or P0, P1, P2
            owner: taskData.owner || '',
            description: taskData.description || '',
            lastUpdateAt: now,
            lastUpdateSummary: taskData.lastUpdateSummary || '',
            createdAt: now,
            updatedAt: now
        };
    }

    createTaskUpdate(updateData) {
        const now = new Date().toISOString();
        return {
            id: this.generateUUID(),
            taskId: updateData.taskId,
            author: updateData.author || '',
            updateType: updateData.updateType || 'Comment', // Comment, Status change, Risk, Next step, Decision
            body: updateData.body || '',
            statusAfter: updateData.statusAfter || null,
            createdAt: now
        };
    }

    normalizeAccountId(record) {
        if (!record) return record;
        if (record.accountId && !Object.prototype.hasOwnProperty.call(record, 'tamUnitId')) {
            return record;
        }
        if (!record.accountId && !record.tamUnitId) {
            return record;
        }
        const { tamUnitId, ...rest } = record;
        if (rest.accountId) {
            return rest;
        }
        return { ...rest, accountId: tamUnitId };
    }

    async ensureDefaultData() {
        if (typeof window === "undefined") return;

        const defaultAccountNames = [
            'Bell Media',
            'Papa Johns',
            'P&G',
            'ELC',
            'Questrade',
            'Amazon Games',
            'Personal'
        ];

        const accounts = await this.getAccounts();
        const existingAccountNames = new Set(accounts.map((unit) => unit.name));
        const missingAccounts = defaultAccountNames.filter((name) => !existingAccountNames.has(name));

        for (const name of missingAccounts) {
            await this.saveAccount(this.createAccount(name));
        }

        const hasClearedProjects = this.loadFromLocalStorage('tamos_projects_cleared_v4');
        if (!hasClearedProjects) {
            const existingProjects = await this.getProjects();
            if (existingProjects.length > 0) {
                await this.clearProjectsData();
            }
            const existingTasks = await this.getTasks();
            if (existingTasks.length > 0) {
                for (const task of existingTasks) {
                    if (task.projectId) {
                        await this.saveTask({ ...task, projectId: null });
                    }
                }
            }
            this.saveToLocalStorage('tamos_projects_cleared_v4', true);
        }

        const allowedAccountNames = new Set(defaultAccountNames);
        const prunedAccounts = (await this.getAccounts()).filter((unit) => allowedAccountNames.has(unit.name));
        this.saveToLocalStorage('tamos_accounts', prunedAccounts);
    }

    async clearProjectsData() {
        if (typeof window === "undefined") return;

        if (this.db) {
            await new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['projects'], 'readwrite');
                const store = transaction.objectStore('projects');
                const request = store.clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }

        this.saveToLocalStorage('tamos_projects', []);
    }

    // Account operations
    async saveAccount(account) {
        if (typeof window === "undefined") return account;

        if (!this.db) {
            const accounts = this.loadFromLocalStorage('tamos_accounts') || [];
            const existingIndex = accounts.findIndex(u => u.id === account.id);
            if (existingIndex >= 0) {
                accounts[existingIndex] = { ...account, updatedAt: new Date().toISOString() };
            } else {
                accounts.push(account);
            }
            this.saveToLocalStorage('tamos_accounts', accounts);
            return account;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['accounts'], 'readwrite');
            const store = transaction.objectStore('accounts');
            const request = store.put({ ...account, updatedAt: new Date().toISOString() });

            request.onsuccess = () => {
                const accounts = this.loadFromLocalStorage('tamos_accounts') || [];
                const existingIndex = accounts.findIndex(u => u.id === account.id);
                if (existingIndex >= 0) {
                    accounts[existingIndex] = account;
                } else {
                    accounts.push(account);
                }
                this.saveToLocalStorage('tamos_accounts', accounts);
                resolve(account);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getAccounts() {
        if (typeof window === "undefined") return [];

        if (!this.db) {
            return this.loadFromLocalStorage('tamos_accounts') || [];
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['accounts'], 'readonly');
            const store = transaction.objectStore('accounts');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Project operations
    async saveProject(project) {
        if (typeof window === "undefined") return project;

        const projectToSave = this.normalizeAccountId({ ...project, updatedAt: new Date().toISOString() });

        if (!this.db) {
            const projects = this.loadFromLocalStorage('tamos_projects') || [];
            const existingIndex = projects.findIndex(p => p.id === projectToSave.id);
            if (existingIndex >= 0) {
                projects[existingIndex] = projectToSave;
            } else {
                projects.push(projectToSave);
            }
            this.saveToLocalStorage('tamos_projects', projects);
            return projectToSave;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['projects'], 'readwrite');
            const store = transaction.objectStore('projects');
            const request = store.put(projectToSave);

            request.onsuccess = () => {
                const projects = this.loadFromLocalStorage('tamos_projects') || [];
                const existingIndex = projects.findIndex(p => p.id === projectToSave.id);
                if (existingIndex >= 0) {
                    projects[existingIndex] = projectToSave;
                } else {
                    projects.push(projectToSave);
                }
                this.saveToLocalStorage('tamos_projects', projects);
                resolve(projectToSave);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getProjects() {
        if (typeof window === "undefined") return [];

        if (!this.db) {
            const projects = this.loadFromLocalStorage('tamos_projects') || [];
            return projects.map((project) => this.normalizeAccountId(project));
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['projects'], 'readonly');
            const store = transaction.objectStore('projects');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result.map((project) => this.normalizeAccountId(project)));
            request.onerror = () => reject(request.error);
        });
    }

    // Client operations
    async saveClient(client) {
        if (typeof window === "undefined") return client;
        
        if (!this.db) {
            const clients = this.loadFromLocalStorage('tamos_clients') || [];
            const existingIndex = clients.findIndex(c => c.id === client.id);
            if (existingIndex >= 0) {
                clients[existingIndex] = { ...client, updatedAt: new Date().toISOString() };
            } else {
                clients.push(client);
            }
            this.saveToLocalStorage('tamos_clients', clients);
            return client;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['clients'], 'readwrite');
            const store = transaction.objectStore('clients');
            const request = store.put({ ...client, updatedAt: new Date().toISOString() });
            
            request.onsuccess = () => {
                const clients = this.loadFromLocalStorage('tamos_clients') || [];
                const existingIndex = clients.findIndex(c => c.id === client.id);
                if (existingIndex >= 0) {
                    clients[existingIndex] = client;
                } else {
                    clients.push(client);
                }
                this.saveToLocalStorage('tamos_clients', clients);
                resolve(client);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getClients() {
        if (typeof window === "undefined") return [];
        
        if (!this.db) {
            return this.loadFromLocalStorage('tamos_clients') || [];
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['clients'], 'readonly');
            const store = transaction.objectStore('clients');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Task operations
    async saveTask(task) {
        if (typeof window === "undefined") return task;
        
        const taskToSave = this.normalizeAccountId({ ...task, updatedAt: new Date().toISOString() });
        
        if (!this.db) {
            const tasks = this.loadFromLocalStorage('tamos_tasks') || [];
            const existingIndex = tasks.findIndex(t => t.id === taskToSave.id);
            if (existingIndex >= 0) {
                tasks[existingIndex] = taskToSave;
            } else {
                tasks.push(taskToSave);
            }
            this.saveToLocalStorage('tamos_tasks', tasks);
            return taskToSave;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tasks'], 'readwrite');
            const store = transaction.objectStore('tasks');
            const request = store.put(taskToSave);
            
            request.onsuccess = () => {
                const tasks = this.loadFromLocalStorage('tamos_tasks') || [];
                const existingIndex = tasks.findIndex(t => t.id === taskToSave.id);
                if (existingIndex >= 0) {
                    tasks[existingIndex] = taskToSave;
                } else {
                    tasks.push(taskToSave);
                }
                this.saveToLocalStorage('tamos_tasks', tasks);
                resolve(taskToSave);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getTasks(filter = {}) {
        if (typeof window === "undefined") return [];
        
        let tasks;
        
        if (!this.db) {
            tasks = (this.loadFromLocalStorage('tamos_tasks') || []).map((task) => this.normalizeAccountId(task));
        } else {
            tasks = await new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['tasks'], 'readonly');
                const store = transaction.objectStore('tasks');
                const request = store.getAll();
                
                request.onsuccess = () => resolve(request.result.map((task) => this.normalizeAccountId(task)));
                request.onerror = () => reject(request.error);
            });
        }
        
        return this.filterTasks(tasks, filter);
    }

    async getTask(taskId) {
        if (typeof window === "undefined") return null;
        
        const tasks = await this.getTasks();
        return tasks.find(t => t.id === taskId) || null;
    }

    async deleteTask(taskId) {
        if (typeof window === "undefined") return;
        
        // Also delete all updates for this task
        const updates = await this.getTaskUpdates(taskId);
        for (const update of updates) {
            await this.deleteTaskUpdate(update.id);
        }
        
        if (!this.db) {
            const tasks = this.loadFromLocalStorage('tamos_tasks') || [];
            const filteredTasks = tasks.filter(t => t.id !== taskId);
            this.saveToLocalStorage('tamos_tasks', filteredTasks);
            return;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tasks'], 'readwrite');
            const store = transaction.objectStore('tasks');
            const request = store.delete(taskId);
            
            request.onsuccess = () => {
                const tasks = this.loadFromLocalStorage('tamos_tasks') || [];
                const filteredTasks = tasks.filter(t => t.id !== taskId);
                this.saveToLocalStorage('tamos_tasks', filteredTasks);
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Task update operations
    async saveTaskUpdate(update) {
        if (typeof window === "undefined") return update;
        
        if (!this.db) {
            const updates = this.loadFromLocalStorage('tamos_task_updates') || [];
            updates.push(update);
            this.saveToLocalStorage('tamos_task_updates', updates);
        } else {
            await new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['taskUpdates'], 'readwrite');
                const store = transaction.objectStore('taskUpdates');
                const request = store.add(update);
                
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }

        // Update task's last update timestamp and summary
        const task = await this.getTask(update.taskId);
        if (task) {
            task.lastUpdateAt = update.createdAt;
            if (update.body && update.body.length > 0) {
                task.lastUpdateSummary = update.body.substring(0, 100);
            }
            // Apply status/ball-with changes if present
            if (update.statusAfter) {
                task.status = update.statusAfter;
            }
            await this.saveTask(task);
        }

        // Also save to localStorage for immediate access
        const updates = this.loadFromLocalStorage('tamos_task_updates') || [];
        updates.push(update);
        this.saveToLocalStorage('tamos_task_updates', updates);

        return update;
    }

    async getTaskUpdates(taskId) {
        if (typeof window === "undefined") return [];
        
        let updates;
        
        if (!this.db) {
            updates = this.loadFromLocalStorage('tamos_task_updates') || [];
        } else {
            updates = await new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['taskUpdates'], 'readonly');
                const store = transaction.objectStore('taskUpdates');
                const index = store.index('taskId');
                const request = index.getAll(taskId);
                
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }
        
        // Filter by taskId and sort by date (newest first)
        return updates
            .filter(u => u.taskId === taskId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    async deleteTaskUpdate(updateId) {
        if (typeof window === "undefined") return;
        
        if (!this.db) {
            const updates = this.loadFromLocalStorage('tamos_task_updates') || [];
            const filteredUpdates = updates.filter(u => u.id !== updateId);
            this.saveToLocalStorage('tamos_task_updates', filteredUpdates);
            return;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['taskUpdates'], 'readwrite');
            const store = transaction.objectStore('taskUpdates');
            const request = store.delete(updateId);
            
            request.onsuccess = () => {
                const updates = this.loadFromLocalStorage('tamos_task_updates') || [];
                const filteredUpdates = updates.filter(u => u.id !== updateId);
                this.saveToLocalStorage('tamos_task_updates', filteredUpdates);
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Filtering and querying
    filterTasks(tasks, filter) {
        return tasks.filter(task => {
            if (filter.clientId && task.clientId !== filter.clientId) return false;
            if (filter.owner && task.owner !== filter.owner) return false;
            if (filter.status && task.status !== filter.status) return false;
            if (filter.priority && task.priority !== filter.priority) return false;
            
            // Date filters
            if (filter.dueThisWeek) {
                const now = new Date();
                const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                if (!task.dueDate || new Date(task.dueDate) > weekFromNow) return false;
            }
            
            if (filter.recentlyUpdated) {
                const daysAgo = new Date();
                daysAgo.setDate(daysAgo.getDate() - 7);
                if (!task.lastUpdateAt || new Date(task.lastUpdateAt) < daysAgo) return false;
            }
            
            return true;
        });
    }

    // LocalStorage operations
    saveToLocalStorage(key, data) {
        if (typeof window === "undefined" || typeof localStorage === "undefined") return;
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (error) {
            console.error('Error saving to localStorage:', error);
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
        // Handle cross-tab updates
        if (event.key === 'tamos_task_updated') {
            const data = JSON.parse(event.newValue);
            this.notifyOtherTabs('task_updated', data);
        }
    }

    notifyOtherTabs(eventType, data) {
        if (typeof window === "undefined" || typeof localStorage === "undefined") return;
        try {
            localStorage.setItem(`tamos_${eventType}`, JSON.stringify({
                ...data,
                timestamp: Date.now()
            }));
            setTimeout(() => {
                localStorage.removeItem(`tamos_${eventType}`);
            }, 1000);
        } catch (error) {
            console.error('Error notifying other tabs:', error);
        }
    }

    // Utility methods
    generateUUID() {
        // Generate a stable UUID for Google Sheets integration
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    generateId() {
        return 'tamos_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Export/Import for Google Sheets sync
    async exportTasks() {
        if (typeof window === "undefined") return '';
        const [tasks, clients, projects, accounts, updates] = await Promise.all([
            this.getTasks(),
            this.getClients(),
            this.getProjects(),
            this.getAccounts(),
            this.getAllTaskUpdates()
        ]);
        
        return {
            version: this.dataVersion,
            exportDate: new Date().toISOString(),
            clients,
            projects,
            accounts,
            tasks,
            updates
        };
    }

    async getAllTaskUpdates() {
        if (typeof window === "undefined") return [];
        
        if (!this.db) {
            return this.loadFromLocalStorage('tamos_task_updates') || [];
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['taskUpdates'], 'readonly');
            const store = transaction.objectStore('taskUpdates');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async clearAllData() {
        if (typeof window === "undefined") return;
        
        if (this.db) {
            const transaction = this.db.transaction(['clients', 'accounts', 'projects', 'tasks', 'taskUpdates'], 'readwrite');
            await Promise.all([
                transaction.objectStore('clients').clear(),
                transaction.objectStore('accounts').clear(),
                transaction.objectStore('projects').clear(),
                transaction.objectStore('tasks').clear(),
                transaction.objectStore('taskUpdates').clear()
            ]);
        }
        
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('tamos_')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
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
    window.storageManager = new StorageManager();
}
