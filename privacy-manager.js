// TAMos Privacy Manager - Optional encryption for sensitive data
// Uses Web Crypto API for client-side encryption

class PrivacyManager {
    constructor() {
        this.isEncryptionEnabled = false;
        this.encryptionKey = null;
        this.init();
    }

    async init() {
        // Check if encryption is enabled in settings
        const settings = await this.getSettings();
        this.isEncryptionEnabled = settings.encryptionEnabled || false;
        
        if (this.isEncryptionEnabled && settings.encryptionKey) {
            this.encryptionKey = await this.importKey(settings.encryptionKey);
        }
    }

    async enableEncryption(password) {
        try {
            // Generate encryption key from password
            const keyMaterial = await crypto.subtle.importKey(
                'raw',
                new TextEncoder().encode(password),
                { name: 'PBKDF2' },
                false,
                ['deriveBits', 'deriveKey']
            );

            const salt = crypto.getRandomValues(new Uint8Array(16));
            const key = await crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: salt,
                    iterations: 100000,
                    hash: 'SHA-256'
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );

            this.encryptionKey = key;
            this.isEncryptionEnabled = true;

            // Save settings
            await this.saveSettings({
                encryptionEnabled: true,
                encryptionKey: await this.exportKey(key),
                salt: Array.from(salt)
            });

            return true;
        } catch (error) {
            console.error('Error enabling encryption:', error);
            return false;
        }
    }

    async disableEncryption() {
        this.isEncryptionEnabled = false;
        this.encryptionKey = null;
        
        await this.saveSettings({
            encryptionEnabled: false,
            encryptionKey: null,
            salt: null
        });
    }

    async encryptData(data) {
        if (!this.isEncryptionEnabled || !this.encryptionKey) {
            return data;
        }

        try {
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encodedData = new TextEncoder().encode(JSON.stringify(data));
            
            const encryptedData = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                this.encryptionKey,
                encodedData
            );

            return {
                encrypted: true,
                data: Array.from(new Uint8Array(encryptedData)),
                iv: Array.from(iv)
            };
        } catch (error) {
            console.error('Error encrypting data:', error);
            return data;
        }
    }

    async decryptData(encryptedData) {
        if (!encryptedData.encrypted || !this.isEncryptionEnabled || !this.encryptionKey) {
            return encryptedData;
        }

        try {
            const iv = new Uint8Array(encryptedData.iv);
            const data = new Uint8Array(encryptedData.data);
            
            const decryptedData = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                this.encryptionKey,
                data
            );

            return JSON.parse(new TextDecoder().decode(decryptedData));
        } catch (error) {
            console.error('Error decrypting data:', error);
            return encryptedData;
        }
    }

    async exportKey(key) {
        const exported = await crypto.subtle.exportKey('raw', key);
        return Array.from(new Uint8Array(exported));
    }

    async importKey(keyData) {
        const keyBuffer = new Uint8Array(keyData);
        return await crypto.subtle.importKey(
            'raw',
            keyBuffer,
            { name: 'AES-GCM' },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async getSettings() {
        try {
            const settings = localStorage.getItem('tamos_privacy_settings');
            return settings ? JSON.parse(settings) : {};
        } catch (error) {
            console.error('Error loading privacy settings:', error);
            return {};
        }
    }

    async saveSettings(settings) {
        try {
            localStorage.setItem('tamos_privacy_settings', JSON.stringify(settings));
        } catch (error) {
            console.error('Error saving privacy settings:', error);
        }
    }

    // Show privacy warning dialog
    showPrivacyWarning() {
        const dialog = document.createElement('div');
        dialog.className = 'privacy-warning-dialog';
        dialog.innerHTML = `
            <div class="dialog-content">
                <h3>🔒 Data Privacy Notice</h3>
                <div class="privacy-content">
                    <p><strong>Local Storage:</strong> All form data is stored locally in your browser. This data is not sent to any external servers.</p>
                    <p><strong>Data Security:</strong> Your data is stored using browser storage APIs (localStorage, sessionStorage, IndexedDB).</p>
                    <p><strong>Data Access:</strong> Only you can access this data through this application.</p>
                    <p><strong>Data Persistence:</strong> Data will persist until you clear your browser data or use the "Clear All Data" function.</p>
                    <div class="privacy-options">
                        <label>
                            <input type="checkbox" id="enableEncryption"> Enable password protection for sensitive data
                        </label>
                    </div>
                    <div id="passwordSection" style="display: none;">
                        <input type="password" id="encryptionPassword" placeholder="Enter password for encryption" style="width: 100%; padding: 8px; margin: 10px 0; border: 1px solid #ddd; border-radius: 4px;">
                        <input type="password" id="confirmPassword" placeholder="Confirm password" style="width: 100%; padding: 8px; margin: 10px 0; border: 1px solid #ddd; border-radius: 4px;">
                    </div>
                </div>
                <div class="dialog-actions">
                    <button id="acceptPrivacy" class="btn btn-primary">Accept & Continue</button>
                    <button id="declinePrivacy" class="btn btn-secondary">Decline</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        // Show password section when encryption is checked
        document.getElementById('enableEncryption').addEventListener('change', (e) => {
            const passwordSection = document.getElementById('passwordSection');
            passwordSection.style.display = e.target.checked ? 'block' : 'none';
        });
        
        // Handle accept button
        document.getElementById('acceptPrivacy').addEventListener('click', async () => {
            const enableEncryption = document.getElementById('enableEncryption').checked;
            const password = document.getElementById('encryptionPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            
            if (enableEncryption) {
                if (!password || password !== confirmPassword) {
                    alert('Please enter matching passwords');
                    return;
                }
                
                const success = await this.enableEncryption(password);
                if (!success) {
                    alert('Error setting up encryption. Please try again.');
                    return;
                }
            }
            
            dialog.remove();
        });
        
        // Handle decline button
        document.getElementById('declinePrivacy').addEventListener('click', () => {
            dialog.remove();
        });
    }

    // Check if this is the first time user is accessing the app
    async checkFirstTimeUser() {
        const settings = await this.getSettings();
        if (!settings.privacyAccepted) {
            this.showPrivacyWarning();
            await this.saveSettings({ ...settings, privacyAccepted: true });
        }
    }
}

// Initialize privacy manager
const privacyManager = new PrivacyManager();

// Make it globally available
window.privacyManager = privacyManager;
