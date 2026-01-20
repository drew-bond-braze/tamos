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

export default function Tasks() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [storageManager, setStorageManager] = useState(null)
  const [tasks, setTasks] = useState([])
  const [clients, setClients] = useState([])
  const [filterView, setFilterView] = useState('all')
  const [selectedClient, setSelectedClient] = useState('all')
  const [selectedTask, setSelectedTask] = useState(null)
  const [showTaskDrawer, setShowTaskDrawer] = useState(false)
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [editingTask, setEditingTask] = useState(null)

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
  }, [status, router])

  const loadData = async (sm) => {
    try {
      const [localTasks, clientsData] = await Promise.all([
        sm.getTasks(),
        sm.getClients()
      ]);

      let sheetTasks = [];
      if (session?.user?.id) {
        try {
          // Pass the ID in the URL string
          const response = await fetch(`/api/google_sheets/tasks?id=${encodeURIComponent(session?.user?.id)}`, {
            method: 'GET'
          });

          if (response.ok) {
            sheetTasks = await response.json();
          } else {
            console.error('Failed to fetch tasks:', response.statusText);
          }
        } catch (err) {
          console.error('Network error fetching sheet tasks:', err);
        }
      }
      console.log('Sheet tasks:', sheetTasks);

      const combinedTasks = [...localTasks, ...sheetTasks];

      console.log(combinedTasks);

      const uniqueTasks = Array.from(new Map(combinedTasks.map(t => [t.id, t])).values());

      setTasks(uniqueTasks);
      setClients(clientsData);

    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  const getFilteredTasks = () => {
    let filtered = [...tasks]

    // Apply view filters
    switch (filterView) {
      case 'my-tasks':
        filtered = filtered.filter(t => t.user_id === session?.user?.id)
        break
      case 'waiting-client':
        filtered = filtered.filter(t => t.ballWith === 'Client')
        break
      case 'manager-attention':
        filtered = filtered.filter(t => t.managerAttention === true)
        break
      case 'due-this-week':
        const now = new Date()
        const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
        filtered = filtered.filter(t => {
          if (!t.dueDate) return false
          const dueDate = new Date(t.dueDate)
          return dueDate <= weekFromNow && dueDate >= now
        })
        break
      case 'recently-updated':
        const daysAgo = new Date()
        daysAgo.setDate(daysAgo.getDate() - 7)
        filtered = filtered.filter(t => {
          if (!t.lastUpdateAt) return false
          return new Date(t.lastUpdateAt) >= daysAgo
        })
        break
      case 'by-client':
        if (selectedClient !== 'all') {
          filtered = filtered.filter(t => t.clientId === selectedClient)
        }
        break
    }

    // Sort by priority and due date
    filtered.sort((a, b) => {
      const priorityOrder = { 'P0': 0, 'High': 0, 'P1': 1, 'Medium': 1, 'P2': 2, 'Low': 2 }
      const aPriority = priorityOrder[a.priority] ?? 3
      const bPriority = priorityOrder[b.priority] ?? 3
      if (aPriority !== bPriority) return aPriority - bPriority
      
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate) - new Date(b.dueDate)
      }
      if (a.dueDate) return -1
      if (b.dueDate) return 1
      
      return new Date(b.lastUpdateAt || b.createdAt) - new Date(a.lastUpdateAt || a.createdAt)
    })

    return filtered
  }

  const formatDate = (dateString) => {
    if (!dateString) return '—'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })
  }

  const formatDateTime = (dateString) => {
    if (!dateString) return '—'
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return formatDate(dateString)
  }

  const getPriorityBadge = (priority) => {
    const colors = {
      'P0': { bg: '#fee', color: '#c00', text: 'P0' },
      'High': { bg: '#fee', color: '#c00', text: 'High' },
      'P1': { bg: '#ffe', color: '#c60', text: 'P1' },
      'Medium': { bg: '#ffe', color: '#c60', text: 'Med' },
      'P2': { bg: '#efe', color: '#060', text: 'P2' },
      'Low': { bg: '#efe', color: '#060', text: 'Low' }
    }
    const style = colors[priority] || { bg: '#eee', color: '#666', text: priority }
    return (
      <span style={{
        backgroundColor: style.bg,
        color: style.color,
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '0.75rem',
        fontWeight: '600'
      }}>
        {style.text}
      </span>
    )
  }

  const getStatusBadge = (status) => {
    const colors = {
      'Not started': { bg: '#e0e0e0', color: '#666' },
      'In progress': { bg: '#e3f2fd', color: '#1976d2' },
      'Blocked': { bg: '#ffebee', color: '#c62828' },
      'Waiting on client': { bg: '#fff3e0', color: '#e65100' },
      'Waiting on internal': { bg: '#f3e5f5', color: '#7b1fa2' },
      'Done': { bg: '#e8f5e9', color: '#2e7d32' }
    }
    const style = colors[status] || { bg: '#eee', color: '#666' }
    return (
      <span style={{
        backgroundColor: style.bg,
        color: style.color,
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '0.75rem',
        fontWeight: '500'
      }}>
        {status}
      </span>
    )
  }

  const openTaskDetail = async (task) => {
    setSelectedTask(task)
    setShowTaskDrawer(true)
  }

  const closeTaskDrawer = () => {
    setShowTaskDrawer(false)
    setSelectedTask(null)
  }

  const handleNewTask = () => {
    setEditingTask(null)
    setShowTaskForm(true)
  }

  const handleEditTask = (task) => {
    setEditingTask(task)
    setShowTaskForm(true)
  }

  const handleTaskSaved = () => {
    setShowTaskForm(false)
    setEditingTask(null)
    if (storageManager) {
      loadData(storageManager)
    }
  }

  const handleTaskDeleted = async (taskId) => {
    if (!storageManager) return
    if (!confirm('Are you sure you want to delete this task?')) return
    
    try {
      await storageManager.deleteTask(taskId)
      await loadData(storageManager)
      if (selectedTask?.id === taskId) {
        closeTaskDrawer()
      }
    } catch (error) {
      console.error('Error deleting task:', error)
      alert('Error deleting task')
    }
  }

  if (status === "loading") {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>
  }

  if (!session) {
    return null
  }

  const filteredTasks = getFilteredTasks()

  return (
    <div>
      <nav className="navbar">
        <div className="nav-container">
          <div className="nav-logo">
            <h1>TAM OS</h1>
          </div>
          <div className="nav-menu">
            <Link href="/" className="nav-link">Home</Link>
            <Link href="/tasks" className="nav-link active">Tasks</Link>
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
        <div className="tasks-container">
          <div className="tasks-header">
            <div>
              <h1 className="page-title">Task Tracker</h1>
              <p className="page-subtitle">Track tasks and projects per client</p>
            </div>
            <button onClick={handleNewTask} className="btn btn-primary">
              + New Task
            </button>
          </div>

          <div className="tasks-filters">
            <div className="filter-tabs">
              <button 
                className={filterView === 'all' ? 'filter-tab active' : 'filter-tab'}
                onClick={() => setFilterView('all')}
              >
                All Tasks
              </button>
              <button 
                className={filterView === 'my-tasks' ? 'filter-tab active' : 'filter-tab'}
                onClick={() => setFilterView('my-tasks')}
              >
                My Tasks
              </button>
              <button 
                className={filterView === 'waiting-client' ? 'filter-tab active' : 'filter-tab'}
                onClick={() => setFilterView('waiting-client')}
              >
                Waiting on Client
              </button>
              <button 
                className={filterView === 'manager-attention' ? 'filter-tab active' : 'filter-tab'}
                onClick={() => setFilterView('manager-attention')}
              >
                Manager Attention
              </button>
              <button 
                className={filterView === 'due-this-week' ? 'filter-tab active' : 'filter-tab'}
                onClick={() => setFilterView('due-this-week')}
              >
                Due This Week
              </button>
              <button 
                className={filterView === 'recently-updated' ? 'filter-tab active' : 'filter-tab'}
                onClick={() => setFilterView('recently-updated')}
              >
                Recently Updated
              </button>
              <button 
                className={filterView === 'by-client' ? 'filter-tab active' : 'filter-tab'}
                onClick={() => setFilterView('by-client')}
              >
                By Client
              </button>
            </div>

            {filterView === 'by-client' && (
              <div className="client-filter">
                <select 
                  value={selectedClient}
                  onChange={(e) => setSelectedClient(e.target.value)}
                  className="client-select"
                >
                  <option value="all">All Clients</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>{client.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="tasks-table-container">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Task</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Ball With</th>
                  <th>Next Step</th>
                  <th>Due Date</th>
                  <th>Priority</th>
                  <th>Owner</th>
                  <th>Last Update</th>
                  <th>⚠️</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan="11" style={{ textAlign: 'center', padding: '40px' }}>
                      <p>No tasks found. <button onClick={handleNewTask} className="btn-link">Create your first task</button></p>
                    </td>
                  </tr>
                ) : (
                  filteredTasks.map(task => (
                    <tr 
                      key={task.id} 
                      className="task-row"
                      onClick={() => openTaskDetail(task)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>{task.account_name}</td>
                      <td className="task-title-cell">
                        <strong>{task.title}</strong>
                      </td>
                      <td>{task.category}</td>
                      <td>{getStatusBadge(task.status)}</td>
                      <td>{task.ballWith}</td>
                      <td className="next-step-cell">{task.next_step || '—'}</td>
                      <td>{formatDate(task.date)}</td>
                      <td>{getPriorityBadge(task.priority)}</td>
                      <td>{task.user_first_name || '—'}</td>
                      <td className="last-update-cell">{formatDateTime(task.lastUpdateAt)}</td>
                      <td>{task.managerAttention ? '⚠️' : ''}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Task Detail Drawer */}
      {showTaskDrawer && selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          clients={clients}
          storageManager={storageManager}
          session={session}
          onClose={closeTaskDrawer}
          onEdit={() => {
            closeTaskDrawer()
            handleEditTask(selectedTask)
          }}
          onDelete={() => handleTaskDeleted(selectedTask.id)}
          onUpdate={() => {
            if (storageManager) {
              loadData(storageManager)
              storageManager.getTask(selectedTask.id).then(updated => {
                setSelectedTask(updated)
              })
            }
          }}
        />
      )}

      {/* Task Form Modal */}
      {showTaskForm && (
        <TaskFormModal
          task={editingTask}
          clients={clients}
          storageManager={storageManager}
          session={session}
          onClose={() => {
            setShowTaskForm(false)
            setEditingTask(null)
          }}
          onSave={handleTaskSaved}
          onClientCreated={() => {
            if (storageManager) {
              loadData(storageManager)
            }
          }}
        />
      )}

      <footer className="footer">
        <div className="container">
          <p>&copy; 2024 TAM OS. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

// Task Detail Drawer Component
function TaskDetailDrawer({ task, clients, storageManager, session, onClose, onEdit, onDelete, onUpdate }) {
  const [updates, setUpdates] = useState([])
  const [newUpdate, setNewUpdate] = useState({ body: '', updateType: 'Comment' })
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (storageManager && task) {
      loadUpdates()
    }
  }, [task, storageManager])

  const loadUpdates = async () => {
    if (!storageManager || !task) return
    try {
      const taskUpdates = await storageManager.getTaskUpdates(task.id)
      setUpdates(taskUpdates)
    } catch (error) {
      console.error('Error loading updates:', error)
    }
  }

  const getClientName = (clientId) => {
    if (!clientId) return 'No Client'
    const client = clients.find(c => c.id === clientId)
    return client ? client.name : 'Unknown Client'
  }

  const handleAddUpdate = async () => {
    if (!newUpdate.body.trim() || !storageManager) return
    
    setIsSaving(true)
    try {
      const update = storageManager.createTaskUpdate({
        taskId: task.id,
        author: session.user?.email || session.user?.name || 'Unknown',
        updateType: newUpdate.updateType,
        body: newUpdate.body,
        statusAfter: newUpdate.statusAfter || null,
        ballWithAfter: newUpdate.ballWithAfter || null
      })
      
      await storageManager.saveTaskUpdate(update)
      setNewUpdate({ body: '', updateType: 'Comment' })
      await loadUpdates()
      onUpdate()
    } catch (error) {
      console.error('Error adding update:', error)
      alert('Error adding update')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="task-drawer-overlay" onClick={onClose}>
      <div className="task-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="task-drawer-header">
          <div>
            <h2>{task.title}</h2>
            <p className="task-drawer-meta">
              {getClientName(task.clientId)} • {task.category} • Owner: {task.owner || 'Unassigned'}
            </p>
          </div>
          <div className="task-drawer-actions">
            <button onClick={onEdit} className="btn btn-secondary">Edit</button>
            <button onClick={onDelete} className="btn btn-danger">Delete</button>
            <button onClick={onClose} className="btn-close">×</button>
          </div>
        </div>

        <div className="task-drawer-body">
          <div className="task-drawer-section">
            <h3>Details</h3>
            <div className="task-details-grid">
              <div><strong>Status:</strong> {task.status}</div>
              <div><strong>Ball With:</strong> {task.ballWith}</div>
              <div><strong>Priority:</strong> {task.priority}</div>
              <div><strong>Due Date:</strong> {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '—'}</div>
              <div><strong>Next Step:</strong> {task.next_step || '—'}</div>
              <div><strong>Manager Attention:</strong> {task.managerAttention ? 'Yes ⚠️' : 'No'}</div>
            </div>
          </div>

          {task.description && (
            <div className="task-drawer-section">
              <h3>Description</h3>
              <p>{task.description}</p>
            </div>
          )}

          {task.links && task.links.length > 0 && (
            <div className="task-drawer-section">
              <h3>Links</h3>
              <ul>
                {task.links.map((link, idx) => (
                  <li key={idx}>
                    <a href={link.url} target="_blank" rel="noopener noreferrer">{link.label || link.url}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {task.stakeholders && task.stakeholders.length > 0 && (
            <div className="task-drawer-section">
              <h3>Stakeholders</h3>
              <ul>
                {task.stakeholders.map((stakeholder, idx) => (
                  <li key={idx}>{stakeholder}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="task-drawer-section">
            <h3>Timeline</h3>
            <div className="timeline">
              {updates.length === 0 ? (
                <p style={{ color: '#666', fontStyle: 'italic' }}>No updates yet</p>
              ) : (
                updates.map(update => (
                  <div key={update.id} className="timeline-item">
                    <div className="timeline-header">
                      <strong>{update.author}</strong>
                      <span className="timeline-type">{update.updateType}</span>
                      <span className="timeline-date">
                        {new Date(update.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="timeline-body">{update.body}</div>
                    {(update.statusAfter || update.ballWithAfter) && (
                      <div className="timeline-changes">
                        {update.statusAfter && <span>Status → {update.statusAfter}</span>}
                        {update.ballWithAfter && <span>Ball → {update.ballWithAfter}</span>}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="task-drawer-section">
            <h3>Add Update</h3>
            <div className="update-form">
              <select 
                value={newUpdate.updateType}
                onChange={(e) => setNewUpdate({ ...newUpdate, updateType: e.target.value })}
                className="update-type-select"
              >
                <option value="Comment">Comment</option>
                <option value="Status change">Status change</option>
                <option value="Risk">Risk</option>
                <option value="Next step">Next step</option>
                <option value="Decision">Decision</option>
              </select>
              {newUpdate.updateType === 'Status change' && (
                <select 
                  value={newUpdate.statusAfter || ''}
                  onChange={(e) => setNewUpdate({ ...newUpdate, statusAfter: e.target.value })}
                  className="status-select"
                >
                  <option value="">Select new status</option>
                  <option value="Not started">Not started</option>
                  <option value="In progress">In progress</option>
                  <option value="Blocked">Blocked</option>
                  <option value="Waiting on client">Waiting on client</option>
                  <option value="Waiting on internal">Waiting on internal</option>
                  <option value="Done">Done</option>
                </select>
              )}
              {newUpdate.updateType === 'Status change' && (
                <select 
                  value={newUpdate.ballWithAfter || ''}
                  onChange={(e) => setNewUpdate({ ...newUpdate, ballWithAfter: e.target.value })}
                  className="ball-with-select"
                >
                  <option value="">Select ball with</option>
                  <option value="TAM">TAM</option>
                  <option value="Client">Client</option>
                  <option value="Internal">Internal</option>
                  <option value="Vendor">Vendor</option>
                </select>
              )}
              <textarea
                value={newUpdate.body}
                onChange={(e) => setNewUpdate({ ...newUpdate, body: e.target.value })}
                placeholder="Add an update..."
                rows="4"
                className="update-textarea"
              />
              <button 
                onClick={handleAddUpdate}
                disabled={!newUpdate.body.trim() || isSaving}
                className="btn btn-primary"
              >
                {isSaving ? 'Saving...' : 'Add Update'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Task Form Modal Component
function TaskFormModal({ task, clients, storageManager, session, onClose, onSave, onClientCreated }) {
  const [formData, setFormData] = useState({
    clientId: task?.clientId || '',
    title: task?.title || '',
    type: task?.type || 'Other',
    status: task?.status || 'Not started',
    ballWith: task?.ballWith || 'TAM',
    next_step: task?.next_step || '',
    dueDate: task?.dueDate || '',
    priority: task?.priority || 'Medium',
    owner: task?.owner || session?.user?.email || '',
    description: task?.description || '',
    managerAttention: task?.managerAttention || false,
    links: task?.links || [],
    stakeholders: task?.stakeholders || []
  })
  const [newLink, setNewLink] = useState({ label: '', url: '' })
  const [newStakeholder, setNewStakeholder] = useState('')
  const [newClientName, setNewClientName] = useState('')
  const [showNewClientInput, setShowNewClientInput] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isCreatingClient, setIsCreatingClient] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.title.trim() || !formData.next_step.trim()) {
      alert('Title and Next Step are required')
      return
    }

    setIsSaving(true)
    try {
      let taskToSave
      if (task) {
        taskToSave = { ...task, ...formData }
      } else {
        taskToSave = storageManager.createTask(formData)
      }
      
      await storageManager.saveTask(taskToSave)
      onSave()
    } catch (error) {
      console.error('Error saving task:', error)
      alert('Error saving task')
    } finally {
      setIsSaving(false)
    }
  }

  const addLink = () => {
    if (newLink.url.trim()) {
      setFormData({
        ...formData,
        links: [...formData.links, { label: newLink.label || newLink.url, url: newLink.url }]
      })
      setNewLink({ label: '', url: '' })
    }
  }

  const removeLink = (index) => {
    setFormData({
      ...formData,
      links: formData.links.filter((_, i) => i !== index)
    })
  }

  const addStakeholder = () => {
    if (newStakeholder.trim()) {
      setFormData({
        ...formData,
        stakeholders: [...formData.stakeholders, newStakeholder]
      })
      setNewStakeholder('')
    }
  }

  const removeStakeholder = (index) => {
    setFormData({
      ...formData,
      stakeholders: formData.stakeholders.filter((_, i) => i !== index)
    })
  }

  const handleCreateClient = async () => {
    if (!newClientName.trim() || !storageManager) return
    
    setIsCreatingClient(true)
    try {
      const client = storageManager.createClient(newClientName.trim())
      await storageManager.saveClient(client)
      setFormData({ ...formData, clientId: client.id })
      setNewClientName('')
      setShowNewClientInput(false)
      if (onClientCreated) {
        onClientCreated()
      }
    } catch (error) {
      console.error('Error creating client:', error)
      alert('Error creating client')
    } finally {
      setIsCreatingClient(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content task-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{task ? 'Edit Task' : 'New Task'}</h2>
          <button onClick={onClose} className="btn-close">×</button>
        </div>
        <form onSubmit={handleSubmit} className="task-form">
          <div className="form-group">
            <label>Client *</label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <select 
                value={formData.clientId}
                onChange={(e) => {
                  if (e.target.value === 'new') {
                    setShowNewClientInput(true)
                  } else {
                    setFormData({ ...formData, clientId: e.target.value })
                  }
                }}
                required={!showNewClientInput}
                style={{ flex: 1 }}
              >
                <option value="">Select Client</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
                <option value="new">+ Create New Client</option>
              </select>
            </div>
            {showNewClientInput && (
              <div style={{ marginTop: '10px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Client name"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleCreateClient())}
                  style={{ flex: 1, padding: '8px 12px', border: '2px solid #e1e8ed', borderRadius: '5px' }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleCreateClient}
                  disabled={!newClientName.trim() || isCreatingClient}
                  className="btn btn-primary"
                  style={{ padding: '8px 16px' }}
                >
                  {isCreatingClient ? 'Creating...' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewClientInput(false)
                    setNewClientName('')
                  }}
                  className="btn btn-secondary"
                  style={{ padding: '8px 16px' }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Task Title *</label>
            <input 
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Task Type *</label>
              <select 
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                required
              >
                <option value="Integration">Integration</option>
                <option value="Deliverability">Deliverability</option>
                <option value="Enablement">Enablement</option>
                <option value="Bug/Issue">Bug/Issue</option>
                <option value="Launch">Launch</option>
                <option value="Strategy">Strategy</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="form-group">
              <label>Status *</label>
              <select 
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                required
              >
                <option value="Not started">Not started</option>
                <option value="In progress">In progress</option>
                <option value="Blocked">Blocked</option>
                <option value="Waiting on client">Waiting on client</option>
                <option value="Waiting on internal">Waiting on internal</option>
                <option value="Done">Done</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Ball Is With *</label>
              <select 
                value={formData.ballWith}
                onChange={(e) => setFormData({ ...formData, ballWith: e.target.value })}
                required
              >
                <option value="TAM">TAM</option>
                <option value="Client">Client</option>
                <option value="Internal">Internal</option>
                <option value="Vendor">Vendor</option>
              </select>
            </div>

            <div className="form-group">
              <label>Priority *</label>
              <select 
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                required
              >
                <option value="P0">P0</option>
                <option value="High">High</option>
                <option value="P1">P1</option>
                <option value="Medium">Medium</option>
                <option value="P2">P2</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Next Step *</label>
            <input 
              type="text"
              value={formData.next_step}
              onChange={(e) => setFormData({ ...formData, next_step: e.target.value })}
              placeholder="Short description of next action"
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Due Date</label>
              <input 
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>Owner *</label>
              <input 
                type="text"
                value={formData.owner}
                onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>
              <input 
                type="checkbox"
                checked={formData.managerAttention}
                onChange={(e) => setFormData({ ...formData, managerAttention: e.target.checked })}
              />
              Manager Attention Needed
            </label>
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows="4"
            />
          </div>

          <div className="form-group">
            <label>Links</label>
            <div className="links-list">
              {formData.links.map((link, idx) => (
                <div key={idx} className="link-item">
                  <a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>
                  <button type="button" onClick={() => removeLink(idx)}>×</button>
                </div>
              ))}
            </div>
            <div className="add-link-form">
              <input 
                type="text"
                placeholder="Label"
                value={newLink.label}
                onChange={(e) => setNewLink({ ...newLink, label: e.target.value })}
              />
              <input 
                type="url"
                placeholder="URL"
                value={newLink.url}
                onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
              />
              <button type="button" onClick={addLink}>Add Link</button>
            </div>
          </div>

          <div className="form-group">
            <label>Stakeholders</label>
            <div className="stakeholders-list">
              {formData.stakeholders.map((stakeholder, idx) => (
                <div key={idx} className="stakeholder-item">
                  <span>{stakeholder}</span>
                  <button type="button" onClick={() => removeStakeholder(idx)}>×</button>
                </div>
              ))}
            </div>
            <div className="add-stakeholder-form">
              <input 
                type="text"
                placeholder="Stakeholder name/email"
                value={newStakeholder}
                onChange={(e) => setNewStakeholder(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addStakeholder())}
              />
              <button type="button" onClick={addStakeholder}>Add Stakeholder</button>
            </div>
          </div>

          <div className="form-actions">
            <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              {isSaving ? 'Saving...' : task ? 'Update Task' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

