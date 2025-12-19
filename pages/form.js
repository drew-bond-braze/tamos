import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/router"
import Link from "next/link"
import { useEffect, useState, useRef } from "react"
import dynamic from "next/dynamic"

// Dynamically import storage manager (client-side only)
let StorageManager = null
if (typeof window !== "undefined") {
  const StorageManagerModule = require("../lib/storage-manager")
  StorageManager = StorageManagerModule.default || StorageManagerModule.StorageManager || StorageManagerModule
}

export default function Form() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const formRef = useRef(null)
  const [storageManager, setStorageManager] = useState(null)
  const [notification, setNotification] = useState(null)
  const [isSavingDraft, setIsSavingDraft] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/")
      return
    }

    if (typeof window !== "undefined" && StorageManager) {
      const sm = new StorageManager()
      setStorageManager(sm)
      
      // Set default date to today
      const dateInput = document.getElementById('projectPlanExtent')
      if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().split('T')[0]
      }

      // Check for existing draft and offer recovery
      checkForDraftRecovery(sm)
    }
  }, [status, router])

  const checkForDraftRecovery = async (sm) => {
    if (typeof window === "undefined") return
    const loadDraftId = sessionStorage.getItem('tamos_load_draft')
    if (loadDraftId) {
      const draft = await sm.loadDraft(loadDraftId)
      if (draft && formRef.current) {
        await restoreDraft(draft, formRef.current)
        sessionStorage.setItem('tamos_current_draft_id', loadDraftId)
        showNotification('Draft loaded successfully', 'success')
      }
      sessionStorage.removeItem('tamos_load_draft')
    } else {
      sessionStorage.removeItem('tamos_current_draft_id')
    }
  }

  const restoreDraft = async (draft, form) => {
    if (!form || !draft) return
    try {
      const payload = draft.payload || draft
      Object.keys(payload).forEach(key => {
        if (key === 'projectPlanOwner' && Array.isArray(payload[key])) {
          payload[key].forEach(value => {
            const checkbox = form.querySelector(`input[name="projectPlanOwner"][value="${value}"]`)
            if (checkbox) checkbox.checked = true
          })
        } else {
          const input = form.querySelector(`[name="${key}"]`)
          if (input && payload[key]) {
            if (input.type === 'checkbox') {
              input.checked = true
            } else if (input.type === 'radio') {
              const radio = form.querySelector(`input[name="${key}"][value="${payload[key]}"]`)
              if (radio) radio.checked = true
            } else {
              input.value = payload[key]
            }
          }
        }
      })
    } catch (error) {
      console.error('Error restoring draft:', error)
      showNotification('Error restoring draft', 'error')
    }
  }

  const handleFormSubmit = async (e) => {
    e.preventDefault()
    if (!storageManager || !formRef.current) return

    const formData = storageManager.extractFormData(formRef.current)
    const submission = storageManager.createSubmission(formData)

    try {
      await storageManager.saveSubmission(submission)
      storageManager.stopAutoSave()
      localStorage.removeItem('tamos_drafts')
      sessionStorage.removeItem('tamos_current_draft_id')
      
      showNotification('TAM Status Review submitted successfully!', 'success')
      
      setTimeout(() => {
        router.push('/review')
      }, 1500)
    } catch (error) {
      console.error('Error submitting form:', error)
      showNotification('Error submitting form. Please try again.', 'error')
    }
  }

  const saveDraft = async () => {
    if (!storageManager || !formRef.current) return
    if (isSavingDraft) {
      console.log('Draft save already in progress, skipping...')
      return
    }

    setIsSavingDraft(true)

    try {
      const loadDraftId = sessionStorage.getItem('tamos_load_draft')
      const currentDraftId = sessionStorage.getItem('tamos_current_draft_id')
      let draftId = loadDraftId || currentDraftId
      
      if (!draftId) {
        draftId = 'draft_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
        sessionStorage.setItem('tamos_current_draft_id', draftId)
      }

      const formData = storageManager.extractFormData(formRef.current)
      const draft = {
        id: draftId,
        formVersion: '1.0',
        status: 'draft',
        updatedAt: new Date().toISOString(),
        payload: formData
      }
      
      await storageManager.saveDraft(draft)
      showNotification('Draft saved successfully', 'success')
    } catch (error) {
      console.error('Error saving draft:', error)
      showNotification('Error saving draft', 'error')
    } finally {
      setTimeout(() => {
        setIsSavingDraft(false)
      }, 1000)
    }
  }

  const showNotification = (message, type = 'info') => {
    setNotification({ message, type })
    setTimeout(() => {
      setNotification(null)
    }, 3000)
  }

  if (status === "loading") {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>
  }

  if (!session) {
    return null
  }

  return (
    <div>
      <nav className="navbar">
        <div className="nav-container">
          <div className="nav-logo">
            <h1>TAMos</h1>
          </div>
          <div className="nav-menu">
            <Link href="/" className="nav-link">Home</Link>
            <Link href="/form" className="nav-link active">Submit Form</Link>
            <Link href="/review" className="nav-link">Review Forms</Link>
          </div>
          <div className="nav-user">
            <span className="user-email">{session.user?.email || session.user?.name}</span>
            <button 
              onClick={() => signOut({ callbackUrl: '/' })} 
              className="btn-logout"
              title="Sign out"
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      <main className="main-content">
        <section className="form-section">
          <div className="container">
            <h1 className="page-title">🧾 Technical Account Management - Status Review</h1>
            <p className="page-subtitle">Please complete all sections below for your Technical Account Management status review.</p>
            
            <form id="healthForm" ref={formRef} className="health-form" onSubmit={handleFormSubmit}>
              {/* Section 1 - General Information */}
              <div className="form-section-header">
                <h2>Section 1 – General Information</h2>
              </div>
              
              <div className="form-group">
                <label htmlFor="email">Email *</label>
                <input type="email" id="email" name="email" required />
              </div>

              <div className="form-group">
                <label htmlFor="customerName">Customer Name / Business Unit Name *</label>
                <select id="customerName" name="customerName" required>
                  <option value="">Select Customer</option>
                  <option value="Bell Media">Bell Media</option>
                  <option value="P&G">P&G</option>
                  <option value="Amazon Games">Amazon Games</option>
                </select>
              </div>

              {/* Section 2 - Account Governance */}
              <div className="form-section-header">
                <h2>Section 2 – Account Governance</h2>
                <p className="section-description">Select for each: Not Created / Needs Updating / Up To Date</p>
              </div>

              <div className="governance-table-container">
                <table className="governance-table">
                  <thead>
                    <tr>
                      <th>Document Type</th>
                      <th>Not Created</th>
                      <th>Needs Updating</th>
                      <th>Up To Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>Confluence - Stakeholder Map *</strong></td>
                      <td className="checkbox-cell">
                        <input type="radio" name="confluenceStakeholderMap" value="not-created" required />
                      </td>
                      <td className="checkbox-cell">
                        <input type="radio" name="confluenceStakeholderMap" value="needs-updating" required />
                      </td>
                      <td className="checkbox-cell">
                        <input type="radio" name="confluenceStakeholderMap" value="up-to-date" required />
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Confluence - Current Work Streams and On-Going Project Statuses *</strong></td>
                      <td className="checkbox-cell">
                        <input type="radio" name="confluenceWorkStreams" value="not-created" required />
                      </td>
                      <td className="checkbox-cell">
                        <input type="radio" name="confluenceWorkStreams" value="needs-updating" required />
                      </td>
                      <td className="checkbox-cell">
                        <input type="radio" name="confluenceWorkStreams" value="up-to-date" required />
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Confluence - List of Deliverables *</strong></td>
                      <td className="checkbox-cell">
                        <input type="radio" name="confluenceDeliverables" value="not-created" required />
                      </td>
                      <td className="checkbox-cell">
                        <input type="radio" name="confluenceDeliverables" value="needs-updating" required />
                      </td>
                      <td className="checkbox-cell">
                        <input type="radio" name="confluenceDeliverables" value="up-to-date" required />
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Environment Summary *</strong></td>
                      <td className="checkbox-cell">
                        <input type="radio" name="environmentSummary" value="not-created" required />
                      </td>
                      <td className="checkbox-cell">
                        <input type="radio" name="environmentSummary" value="needs-updating" required />
                      </td>
                      <td className="checkbox-cell">
                        <input type="radio" name="environmentSummary" value="up-to-date" required />
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Google Drive Folder *</strong></td>
                      <td className="checkbox-cell">
                        <input type="radio" name="googleDriveFolder" value="not-created" required />
                      </td>
                      <td className="checkbox-cell">
                        <input type="radio" name="googleDriveFolder" value="needs-updating" required />
                      </td>
                      <td className="checkbox-cell">
                        <input type="radio" name="googleDriveFolder" value="up-to-date" required />
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Project Plan *</strong></td>
                      <td className="checkbox-cell">
                        <input type="radio" name="projectPlan" value="not-created" required />
                      </td>
                      <td className="checkbox-cell">
                        <input type="radio" name="projectPlan" value="needs-updating" required />
                      </td>
                      <td className="checkbox-cell">
                        <input type="radio" name="projectPlan" value="up-to-date" required />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="form-group">
                <label htmlFor="governanceComments">Additional Comments (Account Governance)</label>
                <textarea id="governanceComments" name="governanceComments" rows="4" placeholder="If some docs are not created, please provide justification (e.g. 'No stakeholder map as this is managed by CS')."></textarea>
              </div>

              {/* Section 3 - Project Plan */}
              <div className="form-section-header">
                <h2>Section 3 – Project Plan</h2>
              </div>

              <div className="form-group">
                <label htmlFor="projectLandscapeState">What is the state of the project landscape? *</label>
                <select id="projectLandscapeState" name="projectLandscapeState" required>
                  <option value="">Select State</option>
                  <option value="ahead-of-schedule">Ahead Of Schedule</option>
                  <option value="on-track">On Track</option>
                  <option value="behind-schedule">Behind Schedule</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="projectPlanExtent">How far into the future does the current project plan extend? *</label>
                <input type="date" id="projectPlanExtent" name="projectPlanExtent" required />
                <small className="form-help">(If there are no future plans, add today's date.)</small>
              </div>

              <div className="form-group">
                <label>Who owns the project plan? * (Check all that apply)</label>
                <div className="checkbox-group">
                  <label className="checkbox-label">
                    <input type="checkbox" name="projectPlanOwner" value="customer" /> Customer
                  </label>
                  <label className="checkbox-label">
                    <input type="checkbox" name="projectPlanOwner" value="cs" /> CS
                  </label>
                  <label className="checkbox-label">
                    <input type="checkbox" name="projectPlanOwner" value="tam" /> TAM
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="projectManagementDescription">If not managed by TAM, please briefly describe how Braze-centric projects are managed by/for the customer.</label>
                <textarea id="projectManagementDescription" name="projectManagementDescription" rows="3"></textarea>
              </div>

              <div className="form-group">
                <label htmlFor="projectPlanComments">Additional Comments (Project Plan)</label>
                <textarea id="projectPlanComments" name="projectPlanComments" rows="4"></textarea>
              </div>

              {/* Section 4 - Account Health */}
              <div className="form-section-header">
                <h2>Section 4 – Account Health</h2>
              </div>

              <div className="form-group">
                <label htmlFor="stakeholderRelationshipHealth">What is the Technical Stakeholder Relationship Health? *</label>
                <select id="stakeholderRelationshipHealth" name="stakeholderRelationshipHealth" required>
                  <option value="">Select Health Score</option>
                  <option value="red">Red</option>
                  <option value="yellow">Yellow</option>
                  <option value="green">Green</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="healthScoreReasoning">Why did you choose that health score? *</label>
                <textarea id="healthScoreReasoning" name="healthScoreReasoning" rows="4" required placeholder="e.g. Green – The technical stakeholders are active participants in all meetings, I receive positive feedback from calls, and the team's willingness to take my advice onboard shows that I am a trusted technical resource."></textarea>
              </div>

              <div className="form-group">
                <label htmlFor="technicalHealthReviewLink">Link To Technical Health Review *</label>
                <input type="url" id="technicalHealthReviewLink" name="technicalHealthReviewLink" required placeholder="https://..." />
                <small className="form-help">(This is a prerequisite for the form.)</small>
              </div>

              <div className="form-group">
                <label htmlFor="accountHealthComments">Additional Comments (Account Health)</label>
                <textarea id="accountHealthComments" name="accountHealthComments" rows="4"></textarea>
              </div>

              {/* Section 5 - Technical Business Reviews */}
              <div className="form-section-header">
                <h2>Section 5 – Technical Business Reviews (TBRs)</h2>
              </div>

              <div className="form-group">
                <label htmlFor="tbrCount">How many TBRs have been performed in this contract cycle? *</label>
                <input type="number" id="tbrCount" name="tbrCount" min="0" required />
              </div>

              <div className="form-group">
                <label htmlFor="tamEngagementCriteria">Have you established some criteria with the customer by which you can measure the success of TAM engagement? *</label>
                <select id="tamEngagementCriteria" name="tamEngagementCriteria" required>
                  <option value="">Select</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="tamEngagementCriteriaDescription">If so, please outline the criteria below.</label>
                <textarea id="tamEngagementCriteriaDescription" name="tamEngagementCriteriaDescription" rows="4"></textarea>
              </div>

              <div className="form-group">
                <label htmlFor="tamServicesMeetingCriteria">If so, how does TAM services meet the criteria above?</label>
                <textarea id="tamServicesMeetingCriteria" name="tamServicesMeetingCriteria" rows="4"></textarea>
              </div>

              <div className="form-group">
                <label htmlFor="tbrComments">Additional Comments (Technical Business Review)</label>
                <textarea id="tbrComments" name="tbrComments" rows="4"></textarea>
              </div>

              {/* Section 6 - Day-To-Day Operations */}
              <div className="form-section-header">
                <h2>Section 6 – Day-To-Day Operations</h2>
              </div>

              <div className="form-group">
                <label htmlFor="cadenceCallFrequency">How frequent are your cadence calls with the customer? *</label>
                <select id="cadenceCallFrequency" name="cadenceCallFrequency" required>
                  <option value="">Select Frequency</option>
                  <option value="daily">Daily</option>
                  <option value="few-times-week">A few times a week</option>
                  <option value="weekly">Weekly</option>
                  <option value="fortnightly">Fortnightly</option>
                  <option value="monthly">Monthly</option>
                  <option value="sporadically">Sporadically</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="hoursPerWeek">How many hours per week on average are you spending on this customer? *</label>
                <input type="number" id="hoursPerWeek" name="hoursPerWeek" min="0" step="0.5" required />
                <small className="form-help">(Calculate from Certinia.)</small>
              </div>

              <div className="form-group">
                <label htmlFor="contractualHours">What is the customer's contractual allocation of hours? *</label>
                <input type="number" id="contractualHours" name="contractualHours" min="0" step="0.5" required />
              </div>

              <div className="form-group">
                <label htmlFor="dayToDayComments">Additional Comments (Day To Day Operations)</label>
                <textarea id="dayToDayComments" name="dayToDayComments" rows="4"></textarea>
              </div>

              {/* Section 7 - Final Summary */}
              <div className="form-section-header">
                <h2>Section 7 – Final Summary</h2>
              </div>

              <div className="form-group">
                <label htmlFor="renewalLikelihood">In your opinion, what is the likelihood of renewal? *</label>
                <select id="renewalLikelihood" name="renewalLikelihood" required>
                  <option value="">Select Likelihood</option>
                  <option value="very-likely">Very Likely</option>
                  <option value="likely">Likely</option>
                  <option value="unsure">Unsure</option>
                  <option value="unlikely">Unlikely</option>
                  <option value="very-unlikely">Very Unlikely</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="renewalReasoning">Please outline the reasoning behind your opinion. *</label>
                <textarea id="renewalReasoning" name="renewalReasoning" rows="4" required placeholder="Include any securities/risks that have not previously been addressed on this form that have informed your opinion."></textarea>
              </div>

              <div className="form-group">
                <label htmlFor="finalNotes">Final Notes</label>
                <textarea id="finalNotes" name="finalNotes" rows="4" placeholder="Last opportunity to provide any important context."></textarea>
              </div>

              <div className="form-actions">
                <button type="button" onClick={saveDraft} className="btn btn-secondary" disabled={isSavingDraft}>
                  {isSavingDraft ? 'Saving...' : 'Save Draft'}
                </button>
                <button type="submit" className="btn btn-primary">Submit Form</button>
              </div>
            </form>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container">
          <p>&copy; 2024 TAMos. All rights reserved.</p>
        </div>
      </footer>

      {notification && (
        <div 
          className={`notification notification-${notification.type}`}
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '15px 20px',
            borderRadius: '5px',
            color: 'white',
            fontWeight: '500',
            zIndex: 3000,
            maxWidth: '300px',
            backgroundColor: notification.type === 'success' ? '#27ae60' : notification.type === 'error' ? '#e74c3c' : '#3498db',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          {notification.message}
        </div>
      )}
    </div>
  )
}

