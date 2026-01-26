import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/router"
import Link from "next/link"
import { useEffect, useState } from "react"

// Dynamically import storage manager (client-side only)
let StorageManager = null
if (typeof window !== "undefined") {
  const StorageManagerModule = require("../lib/storage-manager")
  StorageManager = StorageManagerModule.default || StorageManagerModule.StorageManager || StorageManagerModule
}

export default function Review() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [storageManager, setStorageManager] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [drafts, setDrafts] = useState([])
  const [filterStatus, setFilterStatus] = useState('all')
  const [selectedForm, setSelectedForm] = useState(null)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/")
      return
    }

    if (typeof window !== "undefined" && StorageManager) {
      const sm = new StorageManager()
      setStorageManager(sm)
      loadData(sm)
    }

    // Refresh when page becomes visible
    const handleVisibilityChange = () => {
      if (!document.hidden && storageManager) {
        loadData(storageManager)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleVisibilityChange)
    }
  }, [status, router])

  const loadData = async (sm) => {
    try {
      const [subs, drs] = await Promise.all([
        sm.getSubmissions(),
        sm.getDrafts()
      ])
      setSubmissions(subs)
      setDrafts(drs)
    } catch (error) {
      console.error('Error loading data:', error)
    }
  }

  const updateDashboardStats = () => {
    // Stats are calculated in render
  }

  const displayForms = (statusFilter = 'all') => {
    setFilterStatus(statusFilter)
  }

  const openDraft = (draftId) => {
    sessionStorage.setItem('tamos_load_draft', draftId)
    router.push('/form')
  }

  const deleteDraft = async (draftId) => {
    if (!confirm('Are you sure you want to delete this draft? This action cannot be undone.')) {
      return
    }

    try {
      if (storageManager) {
        await storageManager.deleteDraft(draftId)
        const localDrafts = JSON.parse(localStorage.getItem('tamos_drafts') || '[]')
        const filteredDrafts = localDrafts.filter(d => d.id !== draftId)
        localStorage.setItem('tamos_drafts', JSON.stringify(filteredDrafts))
        await loadData(storageManager)
      }
    } catch (error) {
      console.error('Error deleting draft:', error)
    }
  }

  const openFormModal = (formId) => {
    const allForms = [...submissions, ...drafts]
    const form = allForms.find(f => f.id === formId)
    if (form) {
      setSelectedForm(form)
      setShowModal(true)
    }
  }

  const closeModal = () => {
    setShowModal(false)
    setSelectedForm(null)
  }

  const createFormCard = (form) => {
    const submittedDate = new Date(form.createdAt || form.updatedAt).toLocaleDateString()
    const statusClass = form.status === 'submitted' ? 'completed' : 'draft'
    const statusText = form.status === 'submitted' ? 'Completed' : 'Draft'
    const payload = form.payload || form

    const clickAction = form.status === 'draft' 
      ? () => openDraft(form.id)
      : () => openFormModal(form.id)

    const deleteButton = form.status === 'draft' 
      ? <button 
          className="delete-draft-btn" 
          onClick={(e) => {
            e.stopPropagation()
            deleteDraft(form.id)
          }} 
          title="Delete Draft"
        >
          🗑️
        </button>
      : null

    return (
      <div key={form.id} className="form-card" onClick={clickAction}>
        <div className="form-card-header">
          <div className="form-card-title">{payload.customerName || 'Unnamed Customer'}</div>
          <div className="form-card-actions">
            <span className={`form-status ${statusClass}`}>{statusText}</span>
            {deleteButton}
          </div>
        </div>
        <div className="form-card-details">
          <p><strong>Email:</strong> {payload.email || 'N/A'}</p>
          <p><strong>Relationship Health:</strong> {formatHealthScore(payload.stakeholderRelationshipHealth)}</p>
          <p><strong>Renewal Likelihood:</strong> {formatRenewalLikelihood(payload.renewalLikelihood)}</p>
          <p><strong>{form.status === 'submitted' ? 'Submitted' : 'Updated'}:</strong> {submittedDate}</p>
        </div>
      </div>
    )
  }

  const createFormDetailsHTML = (form) => {
    const payload = form.payload || form
    
    return (
      <div className="form-details">
        <h3>Section 1 – General Information</h3>
        <div className="detail-grid">
          <div className="detail-item"><strong>Email:</strong> {payload.email || 'N/A'}</div>
          <div className="detail-item"><strong>Customer Name:</strong> {payload.customerName || 'N/A'}</div>
          <div className="detail-item"><strong>Status:</strong> <span className={`form-status ${form.status}`}>{form.status.charAt(0).toUpperCase() + form.status.slice(1)}</span></div>
          <div className="detail-item"><strong>{form.status === 'submitted' ? 'Submitted' : 'Updated'}:</strong> {new Date(form.createdAt || form.updatedAt).toLocaleString()}</div>
        </div>

        <h3>Section 2 – Account Governance</h3>
        <div className="detail-grid">
          <div className="detail-item"><strong>Confluence - Stakeholder Map:</strong> {formatDocStatus(payload.confluenceStakeholderMap)}</div>
          <div className="detail-item"><strong>Confluence - Work Streams:</strong> {formatDocStatus(payload.confluenceWorkStreams)}</div>
          <div className="detail-item"><strong>Confluence - Deliverables:</strong> {formatDocStatus(payload.confluenceDeliverables)}</div>
          <div className="detail-item"><strong>Environment Summary:</strong> {formatDocStatus(payload.environmentSummary)}</div>
          <div className="detail-item"><strong>Google Drive Folder:</strong> {formatDocStatus(payload.googleDriveFolder)}</div>
          <div className="detail-item"><strong>Project Plan:</strong> {formatDocStatus(payload.projectPlan)}</div>
          {payload.governanceComments && (
            <div className="detail-item"><strong>Additional Comments:</strong> {payload.governanceComments}</div>
          )}
        </div>

        <h3>Section 3 – Project Plan</h3>
        <div className="detail-grid">
          <div className="detail-item"><strong>Project Landscape State:</strong> {formatProjectState(payload.projectLandscapeState)}</div>
          <div className="detail-item"><strong>Project Plan Extent:</strong> {payload.projectPlanExtent ? new Date(payload.projectPlanExtent).toLocaleDateString() : 'N/A'}</div>
          <div className="detail-item"><strong>Project Plan Owner:</strong> {formatProjectOwners(payload.projectPlanOwner)}</div>
          {payload.projectManagementDescription && (
            <div className="detail-item"><strong>Project Management Description:</strong> {payload.projectManagementDescription}</div>
          )}
          {payload.projectPlanComments && (
            <div className="detail-item"><strong>Additional Comments:</strong> {payload.projectPlanComments}</div>
          )}
        </div>

        <h3>Section 4 – Account Health</h3>
        <div className="detail-grid">
          <div className="detail-item"><strong>Stakeholder Relationship Health:</strong> {formatHealthScore(payload.stakeholderRelationshipHealth)}</div>
          <div className="detail-item"><strong>Health Score Reasoning:</strong> {payload.healthScoreReasoning || 'N/A'}</div>
          <div className="detail-item"><strong>Technical Health Review Link:</strong> {payload.technicalHealthReviewLink ? <a href={payload.technicalHealthReviewLink} target="_blank" rel="noopener noreferrer">View Review</a> : 'N/A'}</div>
          {payload.accountHealthComments && (
            <div className="detail-item"><strong>Additional Comments:</strong> {payload.accountHealthComments}</div>
          )}
        </div>

        <h3>Section 5 – Technical Business Reviews (TBRs)</h3>
        <div className="detail-grid">
          <div className="detail-item"><strong>TBRs Performed:</strong> {payload.tbrCount || 'N/A'}</div>
          <div className="detail-item"><strong>Engagement Criteria Established:</strong> {payload.tamEngagementCriteria === 'yes' ? 'Yes' : payload.tamEngagementCriteria === 'no' ? 'No' : 'N/A'}</div>
          {payload.tamEngagementCriteriaDescription && (
            <div className="detail-item"><strong>Engagement Criteria:</strong> {payload.tamEngagementCriteriaDescription}</div>
          )}
          {payload.tamServicesMeetingCriteria && (
            <div className="detail-item"><strong>How TAM Meets Criteria:</strong> {payload.tamServicesMeetingCriteria}</div>
          )}
          {payload.tbrComments && (
            <div className="detail-item"><strong>Additional Comments:</strong> {payload.tbrComments}</div>
          )}
        </div>

        <h3>Section 6 – Day-To-Day Operations</h3>
        <div className="detail-grid">
          <div className="detail-item"><strong>Cadence Call Frequency:</strong> {formatCadenceFrequency(payload.cadenceCallFrequency)}</div>
          <div className="detail-item"><strong>Hours Per Week:</strong> {payload.hoursPerWeek || 'N/A'}</div>
          <div className="detail-item"><strong>Contractual Hours:</strong> {payload.contractualHours || 'N/A'}</div>
          {payload.dayToDayComments && (
            <div className="detail-item"><strong>Additional Comments:</strong> {payload.dayToDayComments}</div>
          )}
        </div>

        <h3>Section 7 – Final Summary</h3>
        <div className="detail-grid">
          <div className="detail-item"><strong>Renewal Likelihood:</strong> {formatRenewalLikelihood(payload.renewalLikelihood)}</div>
          <div className="detail-item"><strong>Renewal Reasoning:</strong> {payload.renewalReasoning || 'N/A'}</div>
          {payload.finalNotes && (
            <div className="detail-item"><strong>Final Notes:</strong> {payload.finalNotes}</div>
          )}
        </div>
      </div>
    )
  }

  // Formatting helper methods
  const formatHealthScore = (score) => {
    if (!score) return 'N/A'
    const colors = {
      'red': '🔴 Red',
      'yellow': '🟡 Yellow', 
      'green': '🟢 Green'
    }
    return colors[score] || score
  }

  const formatRenewalLikelihood = (likelihood) => {
    if (!likelihood) return 'N/A'
    const emojis = {
      'very-likely': '🟢 Very Likely',
      'likely': '🟡 Likely',
      'unsure': '⚪ Unsure',
      'unlikely': '🟠 Unlikely',
      'very-unlikely': '🔴 Very Unlikely'
    }
    return emojis[likelihood] || likelihood
  }

  const formatDocStatus = (status) => {
    if (!status) return 'N/A'
    const icons = {
      'not-created': '❌ Not Created',
      'needs-updating': '⚠️ Needs Updating',
      'up-to-date': '✅ Up To Date'
    }
    return icons[status] || status
  }

  const formatProjectState = (state) => {
    if (!state) return 'N/A'
    const icons = {
      'ahead-of-schedule': '🚀 Ahead Of Schedule',
      'on-track': '✅ On Track',
      'behind-schedule': '⚠️ Behind Schedule'
    }
    return icons[state] || state
  }

  const formatProjectOwners = (owners) => {
    if (!owners || !Array.isArray(owners) || owners.length === 0) return 'N/A'
    return owners.map(owner => {
      const labels = {
        'customer': 'Customer',
        'cs': 'CS',
        'tam': 'TAM'
      }
      return labels[owner] || owner
    }).join(', ')
  }

  const formatCadenceFrequency = (frequency) => {
    if (!frequency) return 'N/A'
    const labels = {
      'daily': 'Daily',
      'few-times-week': 'A few times a week',
      'weekly': 'Weekly',
      'fortnightly': 'Fortnightly',
      'monthly': 'Monthly',
      'sporadically': 'Sporadically',
      'other': 'Other'
    }
    return labels[frequency] || frequency
  }

  if (status === "loading") {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>
  }

  if (!session) {
    return null
  }

  const totalForms = submissions.length + drafts.length
  const completedForms = submissions.length
  const draftForms = drafts.length

  let allForms = [...submissions, ...drafts]
  let filteredForms = allForms
  
  if (filterStatus === 'completed') {
    filteredForms = submissions
  } else if (filterStatus === 'draft') {
    filteredForms = drafts
  }

  // Sort by date (newest first)
  filteredForms.sort((a, b) => {
    const dateA = new Date(a.createdAt || a.updatedAt)
    const dateB = new Date(b.createdAt || b.updatedAt)
    return dateB - dateA
  })

  return (
    <div>
      <nav className="navbar">
        <div className="nav-container">
          <div className="nav-logo">
            <h1>TAMos</h1>
          </div>
          <div className="nav-menu">
            <Link href="/" className="nav-link">Home</Link>
            <Link href="/form" className="nav-link">Submit Form</Link>
            <Link href="/review" className="nav-link active">Review Forms</Link>
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
        <section className="review-section">
          <div className="container">
            <h1 className="page-title">Form Review Dashboard</h1>
            <p className="page-subtitle">Review and analyze previously submitted client health assessment forms.</p>
            
            <div className="dashboard-stats">
              <div className="stat-card">
                <div className="stat-number">{totalForms}</div>
                <div className="stat-label">Total Forms</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{completedForms}</div>
                <div className="stat-label">Completed Forms</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{draftForms}</div>
                <div className="stat-label">Draft Forms</div>
              </div>
            </div>

            <div className="forms-list">
              <div className="list-header">
                <h2>Forms & Drafts</h2>
                <div className="filter-controls">
                  <select 
                    id="statusFilter" 
                    value={filterStatus}
                    onChange={(e) => displayForms(e.target.value)}
                  >
                    <option value="all">All Forms</option>
                    <option value="completed">Completed</option>
                    <option value="draft">Drafts</option>
                  </select>
                </div>
              </div>
              
              <div id="formsList" className="forms-grid">
                {filteredForms.length === 0 ? (
                  <div className="no-forms-message">
                    <p>No forms found matching your criteria.</p>
                    <Link href="/form" className="btn btn-primary">Create New Form</Link>
                  </div>
                ) : (
                  filteredForms.map(form => createFormCard(form))
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Modal for viewing form details */}
      {showModal && selectedForm && (
        <div id="formModal" className="modal" onClick={closeModal} style={{ display: 'block' }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 id="modalTitle">
                TAM Status Review - {(selectedForm.payload || selectedForm).customerName || 'Unnamed Customer'}
              </h2>
              <span className="close" onClick={closeModal}>&times;</span>
            </div>
            <div className="modal-body" id="modalBody">
              {createFormDetailsHTML(selectedForm)}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeModal}>Close</button>
            </div>
          </div>
        </div>
      )}

      <footer className="footer">
        <div className="container">
          <p>&copy; 2026 TAMos. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

