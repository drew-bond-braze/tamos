// TAMos Client Health Monitoring - JavaScript

class TAMosApp {
    constructor() {
        this.submissions = [];
        this.drafts = [];
        this.currentFormId = null;
        this.isSavingDraft = false;
        this.init();
    }

    async init() {
        // Initialize privacy manager first
        if (typeof privacyManager !== 'undefined') {
            await privacyManager.checkFirstTimeUser();
        }
        
        await this.loadData();
        this.setupEventListeners();
        this.loadPageSpecificFunctionality();
    }

    async loadData() {
        try {
            // Load from localStorage only for now to prevent duplicates
            const localSubmissions = JSON.parse(localStorage.getItem('tamos_submissions') || '[]');
            const localDrafts = JSON.parse(localStorage.getItem('tamos_drafts') || '[]');
            
            console.log('Loaded from localStorage - drafts:', localDrafts.length); // Debug log
            
            this.submissions = localSubmissions;
            this.drafts = localDrafts;
            
            console.log('Final drafts count:', this.drafts.length); // Debug log
        } catch (error) {
            console.error('Error loading data:', error);
            this.submissions = [];
            this.drafts = [];
        }
    }

    setupEventListeners() {
        // Common event listeners for all pages
        document.addEventListener('DOMContentLoaded', () => {
            this.loadPageSpecificFunctionality();
        });
        
        // Refresh data when page becomes visible (user navigates back to review page)
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && window.location.pathname.includes('review.html')) {
                this.refreshReviewPage();
            }
        });
        
        // Also refresh when window gains focus
        window.addEventListener('focus', () => {
            if (window.location.pathname.includes('review.html')) {
                this.refreshReviewPage();
            }
        });
    }

    loadPageSpecificFunctionality() {
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        
        switch(currentPage) {
            case 'form.html':
                this.initFormPage();
                break;
            case 'review.html':
                this.initReviewPage();
                break;
            default:
                this.initHomePage();
                break;
        }
    }

    // Form Page Functionality
    async initFormPage() {
        const form = document.getElementById('healthForm');
        const saveDraftBtn = document.getElementById('saveDraft');
        
        if (form) {
            form.addEventListener('submit', (e) => this.handleFormSubmit(e));
            
            // Auto-save disabled for now to prevent conflicts with manual save
            // storageManager.startAutoSave(form);
        }

        if (saveDraftBtn) {
            // Remove any existing event listeners first
            saveDraftBtn.removeEventListener('click', this.saveDraft);
            // Add the event listener
            saveDraftBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Save Draft button clicked!');
                this.saveDraft();
            });
        }

        // Set default date to today
        const dateInput = document.getElementById('projectPlanExtent');
        if (dateInput && !dateInput.value) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }

        // Check for existing draft and offer recovery
        await this.checkForDraftRecovery();
    }

    async handleFormSubmit(e) {
        e.preventDefault();
        
        const formData = storageManager.extractFormData(e.target);
        const submission = storageManager.createSubmission(formData);

        try {
            // Save submission
            await storageManager.saveSubmission(submission);
            this.submissions.push(submission);

            // Clear any existing drafts
            localStorage.removeItem('tamos_drafts');
            this.drafts = [];

            // Stop auto-save
            storageManager.stopAutoSave();

            // Show success message
            this.showNotification('TAM Status Review submitted successfully!', 'success');

            // Redirect to review page after a short delay
            setTimeout(() => {
                window.location.href = 'review.html';
            }, 1500);
        } catch (error) {
            console.error('Error submitting form:', error);
            this.showNotification('Error submitting form. Please try again.', 'error');
        }
    }

    async saveDraft() {
        const form = document.getElementById('healthForm');
        if (!form) return;

        // Prevent multiple simultaneous saves
        if (this.isSavingDraft) {
            console.log('Draft save already in progress, skipping...');
            return;
        }

        this.isSavingDraft = true;

        try {
            // Check if we're editing an existing draft
            const loadDraftId = sessionStorage.getItem('tamos_load_draft');
            const currentDraftId = sessionStorage.getItem('tamos_current_draft_id');
            let draftId = loadDraftId || currentDraftId;
            
            // If no existing draft ID, create a new one
            if (!draftId) {
                draftId = 'draft_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                // Store the new draft ID for future updates
                sessionStorage.setItem('tamos_current_draft_id', draftId);
            }

            const formData = this.extractFormData(form);
            const draft = {
                id: draftId,
                formVersion: '1.0',
                status: 'draft',
                updatedAt: new Date().toISOString(),
                payload: formData
            };
            
            console.log('Saving draft with ID:', draft.id); // Debug log
            console.log('Form data extracted:', formData); // Debug log
            
            // Check if draft with this ID already exists
            const existingDrafts = JSON.parse(localStorage.getItem('tamos_drafts') || '[]');
            const existingDraft = existingDrafts.find(d => d.id === draft.id);
            
            if (existingDraft) {
                console.log('Draft with this ID already exists, updating instead of creating new one');
                // Update existing draft
                const index = existingDrafts.findIndex(d => d.id === draft.id);
                existingDrafts[index] = draft;
            } else {
                console.log('Creating new draft');
                existingDrafts.push(draft);
            }
            
            localStorage.setItem('tamos_drafts', JSON.stringify(existingDrafts));
            
            // Update local drafts array
            const localIndex = this.drafts.findIndex(d => d.id === draft.id);
            if (localIndex >= 0) {
                this.drafts[localIndex] = draft;
            } else {
                this.drafts.push(draft);
            }
            
            console.log('Draft saved to localStorage:', existingDrafts.length, 'total drafts'); // Debug log
            
            this.showNotification('Draft saved successfully', 'success');
        } catch (error) {
            console.error('Error saving draft:', error);
            this.showNotification('Error saving draft', 'error');
        } finally {
            // Reset the flag after a short delay
            setTimeout(() => {
                this.isSavingDraft = false;
            }, 1000);
        }
    }

    async checkForDraftRecovery() {
        // Only load a draft if specifically requested from the review page
        const loadDraftId = sessionStorage.getItem('tamos_load_draft');
        if (loadDraftId) {
            // Load the specific draft
            const draft = await storageManager.loadDraft(loadDraftId);
            if (draft) {
                await this.restoreDraft(draft);
                // Set the current draft ID for future updates
                sessionStorage.setItem('tamos_current_draft_id', loadDraftId);
                this.showNotification('Draft loaded successfully', 'success');
            }
            // Clear the load draft flag
            sessionStorage.removeItem('tamos_load_draft');
            return;
        }

        // Clear any existing draft ID to ensure fresh form
        sessionStorage.removeItem('tamos_current_draft_id');
        
        // Don't automatically load drafts - only load when specifically requested
        // This ensures "Start New Assessment" always opens a fresh form
    }

    async restoreDraft(draft) {
        const form = document.getElementById('healthForm');
        if (!form || !draft) return;

        try {
            const payload = draft.payload || draft;
            console.log('Restoring draft with payload:', payload);
            
            // Restore all form fields
            Object.keys(payload).forEach(key => {
                if (key === 'projectPlanOwner' && Array.isArray(payload[key])) {
                    // Handle checkbox group
                    payload[key].forEach(value => {
                        const checkbox = form.querySelector(`input[name="projectPlanOwner"][value="${value}"]`);
                        if (checkbox) {
                            checkbox.checked = true;
                        }
                    });
                } else {
                    const input = form.querySelector(`[name="${key}"]`);
                    if (input && payload[key]) {
                        if (input.type === 'checkbox') {
                            input.checked = true;
                        } else if (input.type === 'radio') {
                            // Handle radio buttons
                            const radio = form.querySelector(`input[name="${key}"][value="${payload[key]}"]`);
                            if (radio) {
                                radio.checked = true;
                            }
                        } else {
                            input.value = payload[key];
                        }
                    }
                }
            });
            
            // Only show notification if we're loading a specific draft from review page
            const loadDraftId = sessionStorage.getItem('tamos_load_draft');
            if (loadDraftId) {
                this.showNotification('Draft loaded successfully', 'success');
            }
        } catch (error) {
            console.error('Error restoring draft:', error);
            this.showNotification('Error restoring draft', 'error');
        }
    }


    // Review Page Functionality
    async initReviewPage() {
        await this.loadData();
        this.updateDashboardStats();
        this.displayForms();
        this.setupModal();
        this.setupFilters();
    }


    async refreshReviewPage() {
        await this.loadData();
        this.updateDashboardStats();
        this.displayForms();
    }

    async clearAllDrafts() {
        if (confirm('Are you sure you want to delete ALL drafts? This action cannot be undone.')) {
            try {
                // Clear from localStorage
                localStorage.removeItem('tamos_drafts');
                
                // Clear from IndexedDB if available
                if (storageManager.db) {
                    const transaction = storageManager.db.transaction(['drafts'], 'readwrite');
                    const store = transaction.objectStore('drafts');
                    await store.clear();
                }
                
                // Clear local array
                this.drafts = [];
                
                // Update display
                this.updateDashboardStats();
                this.displayForms();
                
                this.showNotification('All drafts cleared', 'success');
            } catch (error) {
                console.error('Error clearing drafts:', error);
                this.showNotification('Error clearing drafts', 'error');
            }
        }
    }

    updateDashboardStats() {
        const totalForms = this.submissions.length + this.drafts.length;
        const completedForms = this.submissions.length;
        const draftForms = this.drafts.length;

        document.getElementById('totalForms').textContent = totalForms;
        document.getElementById('completedForms').textContent = completedForms;
        document.getElementById('draftForms').textContent = draftForms;
    }

    displayForms(filterStatus = 'all') {
        const formsList = document.getElementById('formsList');
        if (!formsList) return;

        let allForms = [...this.submissions, ...this.drafts];
        let filteredForms = allForms;
        
        if (filterStatus === 'completed') {
            filteredForms = this.submissions;
        } else if (filterStatus === 'draft') {
            filteredForms = this.drafts;
        }

        if (filteredForms.length === 0) {
            formsList.innerHTML = `
                <div class="no-forms-message">
                    <p>No forms found matching your criteria.</p>
                    <a href="form.html" class="btn btn-primary">Create New Form</a>
                </div>
            `;
            return;
        }

        // Sort by date (newest first)
        filteredForms.sort((a, b) => {
            const dateA = new Date(a.createdAt || a.updatedAt);
            const dateB = new Date(b.createdAt || b.updatedAt);
            return dateB - dateA;
        });

        formsList.innerHTML = filteredForms.map(form => this.createFormCard(form)).join('');
    }

    createFormCard(form) {
        const submittedDate = new Date(form.createdAt || form.updatedAt).toLocaleDateString();
        const statusClass = form.status === 'submitted' ? 'completed' : 'draft';
        const statusText = form.status === 'submitted' ? 'Completed' : 'Draft';
        const payload = form.payload || form;

        // Different click behavior for drafts vs completed forms
        const clickAction = form.status === 'draft' 
            ? `onclick="app.openDraft('${form.id}')"` 
            : `onclick="app.openFormModal('${form.id}')"`;

        // Add delete button for drafts
        const deleteButton = form.status === 'draft' 
            ? `<button class="delete-draft-btn" onclick="event.stopPropagation(); app.deleteDraft('${form.id}')" title="Delete Draft">🗑️</button>`
            : '';

        return `
            <div class="form-card" ${clickAction}>
                <div class="form-card-header">
                    <div class="form-card-title">${payload.customerName || 'Unnamed Customer'}</div>
                    <div class="form-card-actions">
                        <span class="form-status ${statusClass}">${statusText}</span>
                        ${deleteButton}
                    </div>
                </div>
                <div class="form-card-details">
                    <p><strong>Email:</strong> ${payload.email || 'N/A'}</p>
                    <p><strong>Relationship Health:</strong> ${this.formatHealthScore(payload.stakeholderRelationshipHealth)}</p>
                    <p><strong>Renewal Likelihood:</strong> ${this.formatRenewalLikelihood(payload.renewalLikelihood)}</p>
                    <p><strong>${form.status === 'submitted' ? 'Submitted' : 'Updated'}:</strong> ${submittedDate}</p>
                </div>
            </div>
        `;
    }

    setupModal() {
        const modal = document.getElementById('formModal');
        const closeBtn = document.querySelector('.close');
        const closeModalBtn = document.getElementById('closeModal');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeModal());
        }

        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => this.closeModal());
        }

        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal();
                }
            });
        }
    }

    openDraft(draftId) {
        // Find the draft and redirect to form page with the draft ID
        const draft = this.drafts.find(d => d.id === draftId);
        if (draft) {
            // Store the draft ID in sessionStorage so the form page can load it
            sessionStorage.setItem('tamos_load_draft', draftId);
            // Redirect to form page
            window.location.href = 'form.html';
        }
    }

    async deleteDraft(draftId) {
        if (confirm('Are you sure you want to delete this draft? This action cannot be undone.')) {
            try {
                // Remove from storage first
                await storageManager.deleteDraft(draftId);
                
                // Remove from local array
                this.drafts = this.drafts.filter(d => d.id !== draftId);
                
                // Also remove from localStorage directly to prevent duplicates
                const localDrafts = JSON.parse(localStorage.getItem('tamos_drafts') || '[]');
                const filteredDrafts = localDrafts.filter(d => d.id !== draftId);
                localStorage.setItem('tamos_drafts', JSON.stringify(filteredDrafts));
                
                // Update the display
                this.updateDashboardStats();
                this.displayForms();
                
                this.showNotification('Draft deleted successfully', 'success');
            } catch (error) {
                console.error('Error deleting draft:', error);
                this.showNotification('Error deleting draft', 'error');
            }
        }
    }

    openFormModal(formId) {
        const allForms = [...this.submissions, ...this.drafts];
        const form = allForms.find(f => f.id === formId);
        if (!form) return;

        const modal = document.getElementById('formModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        const payload = form.payload || form;

        if (modalTitle) {
            modalTitle.textContent = `TAM Status Review - ${payload.customerName || 'Unnamed Customer'}`;
        }

        if (modalBody) {
            modalBody.innerHTML = this.createFormDetailsHTML(form);
        }

        if (modal) {
            modal.style.display = 'block';
        }
    }

    createFormDetailsHTML(form) {
        let html = '<div class="form-details">';
        const payload = form.payload || form;
        
        // Section 1 - General Information
        html += '<h3>Section 1 – General Information</h3>';
        html += '<div class="detail-grid">';
        html += `<div class="detail-item"><strong>Email:</strong> ${payload.email || 'N/A'}</div>`;
        html += `<div class="detail-item"><strong>Customer Name:</strong> ${payload.customerName || 'N/A'}</div>`;
        html += `<div class="detail-item"><strong>Status:</strong> <span class="form-status ${form.status}">${form.status.charAt(0).toUpperCase() + form.status.slice(1)}</span></div>`;
        html += `<div class="detail-item"><strong>${form.status === 'submitted' ? 'Submitted' : 'Updated'}:</strong> ${new Date(form.createdAt || form.updatedAt).toLocaleString()}</div>`;
        html += '</div>';

        // Section 2 - Account Governance
        html += '<h3>Section 2 – Account Governance</h3>';
        html += '<div class="detail-grid">';
        html += `<div class="detail-item"><strong>Confluence - Stakeholder Map:</strong> ${this.formatDocStatus(payload.confluenceStakeholderMap)}</div>`;
        html += `<div class="detail-item"><strong>Confluence - Work Streams:</strong> ${this.formatDocStatus(payload.confluenceWorkStreams)}</div>`;
        html += `<div class="detail-item"><strong>Confluence - Deliverables:</strong> ${this.formatDocStatus(payload.confluenceDeliverables)}</div>`;
        html += `<div class="detail-item"><strong>Environment Summary:</strong> ${this.formatDocStatus(payload.environmentSummary)}</div>`;
        html += `<div class="detail-item"><strong>Google Drive Folder:</strong> ${this.formatDocStatus(payload.googleDriveFolder)}</div>`;
        html += `<div class="detail-item"><strong>Project Plan:</strong> ${this.formatDocStatus(payload.projectPlan)}</div>`;
        if (payload.governanceComments) {
            html += `<div class="detail-item"><strong>Additional Comments:</strong> ${payload.governanceComments}</div>`;
        }
        html += '</div>';

        // Section 3 - Project Plan
        html += '<h3>Section 3 – Project Plan</h3>';
        html += '<div class="detail-grid">';
        html += `<div class="detail-item"><strong>Project Landscape State:</strong> ${this.formatProjectState(payload.projectLandscapeState)}</div>`;
        html += `<div class="detail-item"><strong>Project Plan Extent:</strong> ${payload.projectPlanExtent ? new Date(payload.projectPlanExtent).toLocaleDateString() : 'N/A'}</div>`;
        html += `<div class="detail-item"><strong>Project Plan Owner:</strong> ${this.formatProjectOwners(payload.projectPlanOwner)}</div>`;
        if (payload.projectManagementDescription) {
            html += `<div class="detail-item"><strong>Project Management Description:</strong> ${payload.projectManagementDescription}</div>`;
        }
        if (payload.projectPlanComments) {
            html += `<div class="detail-item"><strong>Additional Comments:</strong> ${payload.projectPlanComments}</div>`;
        }
        html += '</div>';

        // Section 4 - Account Health
        html += '<h3>Section 4 – Account Health</h3>';
        html += '<div class="detail-grid">';
        html += `<div class="detail-item"><strong>Stakeholder Relationship Health:</strong> ${this.formatHealthScore(payload.stakeholderRelationshipHealth)}</div>`;
        html += `<div class="detail-item"><strong>Health Score Reasoning:</strong> ${payload.healthScoreReasoning || 'N/A'}</div>`;
        html += `<div class="detail-item"><strong>Technical Health Review Link:</strong> ${payload.technicalHealthReviewLink ? `<a href="${payload.technicalHealthReviewLink}" target="_blank">View Review</a>` : 'N/A'}</div>`;
        if (payload.accountHealthComments) {
            html += `<div class="detail-item"><strong>Additional Comments:</strong> ${payload.accountHealthComments}</div>`;
        }
        html += '</div>';

        // Section 5 - Technical Business Reviews
        html += '<h3>Section 5 – Technical Business Reviews (TBRs)</h3>';
        html += '<div class="detail-grid">';
        html += `<div class="detail-item"><strong>TBRs Performed:</strong> ${payload.tbrCount || 'N/A'}</div>`;
        html += `<div class="detail-item"><strong>Engagement Criteria Established:</strong> ${payload.tamEngagementCriteria === 'yes' ? 'Yes' : payload.tamEngagementCriteria === 'no' ? 'No' : 'N/A'}</div>`;
        if (payload.tamEngagementCriteriaDescription) {
            html += `<div class="detail-item"><strong>Engagement Criteria:</strong> ${payload.tamEngagementCriteriaDescription}</div>`;
        }
        if (payload.tamServicesMeetingCriteria) {
            html += `<div class="detail-item"><strong>How TAM Meets Criteria:</strong> ${payload.tamServicesMeetingCriteria}</div>`;
        }
        if (payload.tbrComments) {
            html += `<div class="detail-item"><strong>Additional Comments:</strong> ${payload.tbrComments}</div>`;
        }
        html += '</div>';

        // Section 6 - Day-To-Day Operations
        html += '<h3>Section 6 – Day-To-Day Operations</h3>';
        html += '<div class="detail-grid">';
        html += `<div class="detail-item"><strong>Cadence Call Frequency:</strong> ${this.formatCadenceFrequency(payload.cadenceCallFrequency)}</div>`;
        html += `<div class="detail-item"><strong>Hours Per Week:</strong> ${payload.hoursPerWeek || 'N/A'}</div>`;
        html += `<div class="detail-item"><strong>Contractual Hours:</strong> ${payload.contractualHours || 'N/A'}</div>`;
        if (payload.dayToDayComments) {
            html += `<div class="detail-item"><strong>Additional Comments:</strong> ${payload.dayToDayComments}</div>`;
        }
        html += '</div>';

        // Section 7 - Final Summary
        html += '<h3>Section 7 – Final Summary</h3>';
        html += '<div class="detail-grid">';
        html += `<div class="detail-item"><strong>Renewal Likelihood:</strong> ${this.formatRenewalLikelihood(payload.renewalLikelihood)}</div>`;
        html += `<div class="detail-item"><strong>Renewal Reasoning:</strong> ${payload.renewalReasoning || 'N/A'}</div>`;
        if (payload.finalNotes) {
            html += `<div class="detail-item"><strong>Final Notes:</strong> ${payload.finalNotes}</div>`;
        }
        html += '</div>';

        html += '</div>';
        return html;
    }

    closeModal() {
        const modal = document.getElementById('formModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    setupFilters() {
        const statusFilter = document.getElementById('statusFilter');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.displayForms(e.target.value);
            });
        }
    }


    // Home Page Functionality
    initHomePage() {
        // Add any home page specific functionality here
        console.log('Home page initialized');
    }

    // Utility Methods
    extractFormData(formElement) {
        const data = {};
        
        // Handle all input types
        const inputs = formElement.querySelectorAll('input, select, textarea');
        
        inputs.forEach(input => {
            if (input.type === 'radio') {
                if (input.checked) {
                    data[input.name] = input.value;
                    console.log(`Radio button found: ${input.name} = ${input.value}`);
                }
            } else if (input.type === 'checkbox') {
                if (input.name === 'projectPlanOwner') {
                    // Handle project plan owner checkboxes specially
                    if (!data.projectPlanOwner) {
                        data.projectPlanOwner = [];
                    }
                    if (input.checked) {
                        data.projectPlanOwner.push(input.value);
                    }
                } else {
                    // Handle other checkboxes
                    if (input.checked) {
                        if (data[input.name]) {
                            if (Array.isArray(data[input.name])) {
                                data[input.name].push(input.value);
                            } else {
                                data[input.name] = [data[input.name], input.value];
                            }
                        } else {
                            data[input.name] = input.value;
                        }
                    }
                }
            } else if (input.type === 'text' || input.type === 'email' || input.type === 'url' || input.type === 'number' || input.type === 'date') {
                data[input.name] = input.value;
            } else if (input.tagName === 'SELECT') {
                data[input.name] = input.value;
            } else if (input.tagName === 'TEXTAREA') {
                data[input.name] = input.value;
            }
        });
        
        console.log('Extracted form data:', data); // Debug log
        
        return data;
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Style the notification
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '15px 20px',
            borderRadius: '5px',
            color: 'white',
            fontWeight: '500',
            zIndex: '3000',
            maxWidth: '300px',
            wordWrap: 'break-word',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            transform: 'translateX(100%)',
            transition: 'transform 0.3s ease'
        });

        // Set background color based on type
        const colors = {
            success: '#27ae60',
            error: '#e74c3c',
            info: '#3498db',
            warning: '#f39c12'
        };
        notification.style.backgroundColor = colors[type] || colors.info;

        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    // Formatting helper methods
    formatHealthScore(score) {
        if (!score) return 'N/A';
        const colors = {
            'red': '🔴 Red',
            'yellow': '🟡 Yellow', 
            'green': '🟢 Green'
        };
        return colors[score] || score;
    }

    formatRenewalLikelihood(likelihood) {
        if (!likelihood) return 'N/A';
        const emojis = {
            'very-likely': '🟢 Very Likely',
            'likely': '🟡 Likely',
            'unsure': '⚪ Unsure',
            'unlikely': '🟠 Unlikely',
            'very-unlikely': '🔴 Very Unlikely'
        };
        return emojis[likelihood] || likelihood;
    }

    formatDocStatus(status) {
        if (!status) return 'N/A';
        const icons = {
            'not-created': '❌ Not Created',
            'needs-updating': '⚠️ Needs Updating',
            'up-to-date': '✅ Up To Date'
        };
        return icons[status] || status;
    }

    formatProjectState(state) {
        if (!state) return 'N/A';
        const icons = {
            'ahead-of-schedule': '🚀 Ahead Of Schedule',
            'on-track': '✅ On Track',
            'behind-schedule': '⚠️ Behind Schedule'
        };
        return icons[state] || state;
    }

    formatProjectOwners(owners) {
        if (!owners || !Array.isArray(owners) || owners.length === 0) return 'N/A';
        return owners.map(owner => {
            const labels = {
                'customer': 'Customer',
                'cs': 'CS',
                'tam': 'TAM'
            };
            return labels[owner] || owner;
        }).join(', ');
    }

    formatCadenceFrequency(frequency) {
        if (!frequency) return 'N/A';
        const labels = {
            'daily': 'Daily',
            'few-times-week': 'A few times a week',
            'weekly': 'Weekly',
            'fortnightly': 'Fortnightly',
            'monthly': 'Monthly',
            'sporadically': 'Sporadically',
            'other': 'Other'
        };
        return labels[frequency] || frequency;
    }
}

// Initialize the app
const app = new TAMosApp();

// Make app globally available for debugging
window.app = app;
window.app = app;