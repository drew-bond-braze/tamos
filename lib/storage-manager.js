// TAM OS Storage Manager - Task Tracker
// Handles tasks, clients, and task updates
// Browser-only: Guards against server-side execution

class StorageManager {
    constructor() {
        // Guard against server-side execution
        if (typeof window === "undefined") {
            return;
        }

        this.dataVersion = '4.0'; // TAM unit + project model
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
        await this.ensureDefaultData();
        this.setupStorageEventListeners();
    }

    // IndexedDB initialization
    async initIndexedDB() {
        if (typeof window === "undefined" || typeof indexedDB === "undefined") {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open('TAMosDB', 4); // Version 4 for TAM unit model
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create clients store
                if (!db.objectStoreNames.contains('clients')) {
                    const clientsStore = db.createObjectStore('clients', { keyPath: 'id' });
                    clientsStore.createIndex('name', 'name', { unique: false });
                }

                // Create TAM units store
                if (!db.objectStoreNames.contains('tamUnits')) {
                    const tamUnitsStore = db.createObjectStore('tamUnits', { keyPath: 'id' });
                    tamUnitsStore.createIndex('name', 'name', { unique: false });
                }

                // Create projects store
                if (!db.objectStoreNames.contains('projects')) {
                    const projectsStore = db.createObjectStore('projects', { keyPath: 'id' });
                    projectsStore.createIndex('name', 'name', { unique: false });
                    projectsStore.createIndex('tamUnitId', 'tamUnitId', { unique: false });
                    projectsStore.createIndex('isPersonal', 'isPersonal', { unique: false });
                    projectsStore.createIndex('dueDate', 'dueDate', { unique: false });
                }
                
                // Create tasks store
                if (!db.objectStoreNames.contains('tasks')) {
                    const tasksStore = db.createObjectStore('tasks', { keyPath: 'id' });
                    tasksStore.createIndex('clientId', 'clientId', { unique: false });
                    tasksStore.createIndex('projectId', 'projectId', { unique: false });
                    tasksStore.createIndex('tamUnitId', 'tamUnitId', { unique: false });
                    tasksStore.createIndex('owner', 'owner', { unique: false });
                    tasksStore.createIndex('status', 'status', { unique: false });
                    tasksStore.createIndex('ballWith', 'ballWith', { unique: false });
                    tasksStore.createIndex('priority', 'priority', { unique: false });
                    tasksStore.createIndex('dueDate', 'dueDate', { unique: false });
                    tasksStore.createIndex('managerAttention', 'managerAttention', { unique: false });
                    tasksStore.createIndex('lastUpdateAt', 'lastUpdateAt', { unique: false });
                    tasksStore.createIndex('createdAt', 'createdAt', { unique: false });
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

    // Data Models
    createClient(name) {
        return {
            id: this.generateUUID(),
            name: name,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    createTamUnit(name) {
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
            tamUnitId: projectData.tamUnitId || null,
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
            tamUnitId: taskData.tamUnitId || null,
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

    async ensureDefaultData() {
        if (typeof window === "undefined") return;

        const defaultTamUnitNames = [
            'Bell Media',
            'Papa Johns',
            'P&G',
            'ELC',
            'Questrade',
            'Amazon Games',
            'Personal'
        ];

        const tamUnits = await this.getTamUnits();
        const existingTamUnitNames = new Set(tamUnits.map((unit) => unit.name));
        const missingTamUnits = defaultTamUnitNames.filter((name) => !existingTamUnitNames.has(name));

        for (const name of missingTamUnits) {
            await this.saveTamUnit(this.createTamUnit(name));
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

        const allowedTamUnitNames = new Set(defaultTamUnitNames);
        const prunedTamUnits = (await this.getTamUnits()).filter((unit) => allowedTamUnitNames.has(unit.name));
        this.saveToLocalStorage('tamos_tam_units', prunedTamUnits);
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

    // TAM Unit operations
    async saveTamUnit(tamUnit) {
        if (typeof window === "undefined") return tamUnit;

        if (!this.db) {
            const tamUnits = this.loadFromLocalStorage('tamos_tam_units') || [];
            const existingIndex = tamUnits.findIndex(u => u.id === tamUnit.id);
            if (existingIndex >= 0) {
                tamUnits[existingIndex] = { ...tamUnit, updatedAt: new Date().toISOString() };
            } else {
                tamUnits.push(tamUnit);
            }
            this.saveToLocalStorage('tamos_tam_units', tamUnits);
            return tamUnit;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tamUnits'], 'readwrite');
            const store = transaction.objectStore('tamUnits');
            const request = store.put({ ...tamUnit, updatedAt: new Date().toISOString() });

            request.onsuccess = () => {
                const tamUnits = this.loadFromLocalStorage('tamos_tam_units') || [];
                const existingIndex = tamUnits.findIndex(u => u.id === tamUnit.id);
                if (existingIndex >= 0) {
                    tamUnits[existingIndex] = tamUnit;
                } else {
                    tamUnits.push(tamUnit);
                }
                this.saveToLocalStorage('tamos_tam_units', tamUnits);
                resolve(tamUnit);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getTamUnits() {
        if (typeof window === "undefined") return [];

        if (!this.db) {
            return this.loadFromLocalStorage('tamos_tam_units') || [];
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tamUnits'], 'readonly');
            const store = transaction.objectStore('tamUnits');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Project operations
    async saveProject(project) {
        if (typeof window === "undefined") return project;

        const projectToSave = { ...project, updatedAt: new Date().toISOString() };

        if (!this.db) {
            const projects = this.loadFromLocalStorage('tamos_projects') || [];
            const existingIndex = projects.findIndex(p => p.id === project.id);
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
                const existingIndex = projects.findIndex(p => p.id === project.id);
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
            return this.loadFromLocalStorage('tamos_projects') || [];
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['projects'], 'readonly');
            const store = transaction.objectStore('projects');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
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
        
        const taskToSave = { ...task, updatedAt: new Date().toISOString() };
        
        if (!this.db) {
            const tasks = this.loadFromLocalStorage('tamos_tasks') || [];
            const existingIndex = tasks.findIndex(t => t.id === task.id);
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
                const existingIndex = tasks.findIndex(t => t.id === task.id);
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
            tasks = this.loadFromLocalStorage('tamos_tasks') || [];
        } else {
            tasks = await new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['tasks'], 'readonly');
                const store = transaction.objectStore('tasks');
                const request = store.getAll();
                
                request.onsuccess = () => resolve(request.result);
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
        const [tasks, clients, projects, tamUnits, updates] = await Promise.all([
            this.getTasks(),
            this.getClients(),
            this.getProjects(),
            this.getTamUnits(),
            this.getAllTaskUpdates()
        ]);
        
        return {
            version: this.dataVersion,
            exportDate: new Date().toISOString(),
            clients,
            projects,
            tamUnits,
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
            const transaction = this.db.transaction(['clients', 'tamUnits', 'projects', 'tasks', 'taskUpdates'], 'readwrite');
            await Promise.all([
                transaction.objectStore('clients').clear(),
                transaction.objectStore('tamUnits').clear(),
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
