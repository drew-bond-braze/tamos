import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/router"
import Link from "next/link"
import Head from "next/head"
import { useEffect, useState } from "react"

// Dynamically import storage manager (client-side only)
let StorageManager = null
if (typeof window !== "undefined") {
  const StorageManagerModule = require("../lib/storage-manager")
  StorageManager = StorageManagerModule.default || StorageManagerModule.StorageManager || StorageManagerModule
}

const buildSheetCacheKey = (userId) => `tamos_sheet_cache_${userId}`

const readSheetCache = (userId) => {
  if (typeof window === "undefined" || !userId) return null
  try {
    const cached = localStorage.getItem(buildSheetCacheKey(userId))
    return cached ? JSON.parse(cached) : null
  } catch (error) {
    console.error('Error reading tasks cache:', error)
    return null
  }
}

const writeSheetCache = (userId, data) => {
  if (typeof window === "undefined" || !userId) return
  try {
    localStorage.setItem(
      buildSheetCacheKey(userId),
      JSON.stringify({ ...data, cachedAt: Date.now() })
    )
  } catch (error) {
    console.error('Error writing tasks cache:', error)
  }
}

const CACHE_TTL_MS = 10 * 60 * 1000

const isCacheFresh = (cached) => {
  if (!cached?.cachedAt) return false
  const cachedAt = typeof cached.cachedAt === 'number' ? cached.cachedAt : Date.parse(cached.cachedAt)
  if (!Number.isFinite(cachedAt)) return false
  return Date.now() - cachedAt < CACHE_TTL_MS
}

const mergeById = (items = [], item) => {
  if (!item?.id) return items
  const nextItems = [...items]
  const existingIndex = nextItems.findIndex((existing) => existing.id === item.id)
  if (existingIndex >= 0) {
    nextItems[existingIndex] = item
    return nextItems
  }
  nextItems.push(item)
  return nextItems
}

const mergeListsById = (...lists) => {
  const merged = new Map()
  lists.forEach((list) => {
    (list || []).forEach((item) => {
      if (!item?.id) return
      merged.set(item.id, item)
    })
  })
  return Array.from(merged.values())
}

const pruneLocalAgainstSheet = async (storageManager, localTasks, localProjects, sheetTasks, sheetProjects) => {
  const sheetTaskIds = new Set((sheetTasks || []).map((task) => task?.id).filter(Boolean))
  const sheetProjectIds = new Set((sheetProjects || []).map((project) => project?.id).filter(Boolean))

  const prunedTasks = (localTasks || []).filter((task) => task?.id && sheetTaskIds.has(task.id))
  const prunedProjects = (localProjects || []).filter((project) => project?.id && sheetProjectIds.has(project.id))

  if (storageManager) {
    const staleTasks = (localTasks || []).filter((task) => task?.id && !sheetTaskIds.has(task.id))
    const staleProjects = (localProjects || []).filter((project) => project?.id && !sheetProjectIds.has(project.id))

    for (const task of staleTasks) {
      await storageManager.deleteTask(task.id)
    }

    if (typeof storageManager.deleteProject === 'function') {
      for (const project of staleProjects) {
        await storageManager.deleteProject(project.id)
      }
    }
  }

  return { prunedTasks, prunedProjects }
}

const getInitials = (name) => {
  if (!name || name === 'Unassigned') return '?'
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase()
}

const getOwnerDisplayName = (task, session) => {
  const firstName = task?.userFirstName || task?.user_first_name || ''
  const lastName = task?.userLastName || task?.user_last_name || ''
  if (firstName) return firstName
  if (lastName) return lastName

  if (task?.owner) {
    return task.owner.includes('@') ? task.owner.split('@')[0] : task.owner
  }

  if (task?.userEmail || task?.user_email) {
    const email = task.userEmail || task.user_email
    return email.includes('@') ? email.split('@')[0] : email
  }

  if (session?.user?.name) {
    return session.user.name.split(/\s+/)[0]
  }

  return 'Unassigned'
}

const getOwnerProfile = (task, session) => {
  const name = getOwnerDisplayName(task, session)
  const sessionEmail = session?.user?.email
  const sessionUserId = session?.user?.id
  const matchesSession =
    (sessionUserId && (task?.userId === sessionUserId || task?.user_id === sessionUserId)) ||
    (sessionEmail && (task?.userEmail === sessionEmail || task?.user_email === sessionEmail))

  return {
    name,
    avatarUrl: matchesSession ? session?.user?.image : null,
    initials: getInitials(name)
  }
}

const normalizeTaskRecord = (task) => {
  if (!task) return task
  const normalized = { ...task }

  const accountId = normalized.accountId || normalized.tamUnitId || normalized.account_id
  if (accountId && !normalized.accountId) normalized.accountId = accountId

  const projectId = normalized.projectId || normalized.project_id || normalized.projectID || normalized.project
  if (projectId && !normalized.projectId) normalized.projectId = projectId

  const title = normalized.title || normalized.name || normalized.taskName || normalized.task || normalized.summary
  if (title && !normalized.title) normalized.title = title

  const description = normalized.description || normalized.details || normalized.nextStep || normalized.notes
  if (description && !normalized.description) normalized.description = description

  const dueDate = normalized.dueDate || normalized.dueAt || normalized.date || normalized.targetDate || normalized.targetdate
  if (dueDate && !normalized.dueDate) normalized.dueDate = dueDate
  if (normalized.dueAt || dueDate) {
    normalized.dueAt = normalized.dueAt || dueDate
  }

  const userId = normalized.userId || normalized.user_id || normalized.ownerId || normalized.owner_id
  if (userId && !normalized.userId) normalized.userId = userId
  if (userId && !normalized.user_id) normalized.user_id = userId

  const owner = normalized.owner || normalized.userEmail || normalized.user_email || normalized.assignee || normalized.assignedTo
  if (owner && !normalized.owner) normalized.owner = owner

  const firstName = normalized.userFirstName || normalized.user_first_name || ''
  const lastName = normalized.userLastName || normalized.user_last_name || ''
  if ((firstName || lastName) && (!normalized.owner || normalized.owner.includes('@'))) {
    normalized.owner = firstName || lastName
  }
  if (!normalized.owner && normalized.userEmail) {
    normalized.owner = normalized.userEmail.split('@')[0]
  }

  const createdAt = normalized.createdAt || normalized.created_at || normalized.createddate || normalized.createdDate
  if (createdAt && !normalized.createdAt) normalized.createdAt = createdAt

  const updatedAt = normalized.updatedAt || normalized.updated_at || normalized.updateddate || normalized.updatedDate || normalized.lastUpdateAt
  if (updatedAt && !normalized.updatedAt) normalized.updatedAt = updatedAt
  if (updatedAt && !normalized.lastUpdateAt) normalized.lastUpdateAt = updatedAt

  const accountName = normalized.accountName || normalized.tamUnitName || normalized.account_name
  if (accountName && !normalized.accountName) normalized.accountName = accountName

  const projectName = normalized.projectName || normalized.project_name
  if (projectName && !normalized.projectName) normalized.projectName = projectName

  if (typeof normalized.completed === 'undefined' && normalized.status) {
    normalized.completed = normalized.status === 'Done'
  }

  if (!normalized.lastUpdateSummary) {
    const summary = normalized.nextStep || normalized.details
    if (summary) normalized.lastUpdateSummary = summary
  }

  return normalized
}

export default function Tasks() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [storageManager, setStorageManager] = useState(null)
  const [tasks, setTasks] = useState([])
  const [clients, setClients] = useState([])
  const [projects, setProjects] = useState([])
  const [accounts, setAccounts] = useState([])
  const [filterView, setFilterView] = useState('all')
  const [selectedAccount, setSelectedAccount] = useState('all')
  const [selectedTask, setSelectedTask] = useState(null)
  const [showTaskDrawer, setShowTaskDrawer] = useState(false)
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isPageLoading, setIsPageLoading] = useState(true)

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/")
      return
    }

    if (typeof window !== "undefined" && StorageManager) {
      const sm = new StorageManager()
      setStorageManager(sm)
    }
  }, [status, router])

  const fetchSheetData = async (url, label) => {
    try {
      const response = await fetch(url, { method: 'GET' })
      if (!response.ok) {
        console.error(`Failed to fetch ${label}:`, response.statusText)
        return null
      }
      return await response.json()
    } catch (error) {
      console.error(`Network error fetching ${label}:`, error)
      return null
    }
  }

  const loadData = async (sm, userId, cachedData = {}, skipSheetFetch = false) => {
    try {
      const [localTasks, clientsData, localProjects, localAccounts] = await Promise.all([
        sm.getTasks(),
        sm.getClients(),
        sm.getProjects(),
        sm.getAccounts()
      ])

      let summary = null
      if (!skipSheetFetch && userId) {
        summary = await fetchSheetData(
          `/api/google_sheets/summary?userId=${encodeURIComponent(userId)}`,
          'summary'
        )
      }

      const nextAccounts = summary?.accounts ?? cachedData.accounts ?? cachedData.tamUnits ?? localAccounts ?? []
      const sheetProjects = summary?.projects ?? cachedData.projects ?? []
      const sheetTasks = summary?.tasks ?? cachedData.tasks ?? []

      let filteredLocalTasks = localTasks || []
      let filteredLocalProjects = localProjects || []

      if (summary && Array.isArray(summary.tasks) && Array.isArray(summary.projects)) {
        const pruned = await pruneLocalAgainstSheet(storageManager, localTasks, localProjects, summary.tasks, summary.projects)
        filteredLocalTasks = pruned.prunedTasks
        filteredLocalProjects = pruned.prunedProjects
      }

      const nextProjects = mergeListsById(filteredLocalProjects, cachedData.projects, summary?.projects)
      const combinedTasks = [...filteredLocalTasks, ...(sheetTasks || [])]
      const normalizedTasks = combinedTasks.map(normalizeTaskRecord).filter(Boolean)
      const uniqueTasks = Array.from(new Map(normalizedTasks.map(t => [t.id, t])).values())

      setTasks(uniqueTasks)
      setClients(clientsData)
      setProjects(nextProjects)
      setAccounts(nextAccounts)

      if (summary && userId) {
        writeSheetCache(userId, {
          accounts: nextAccounts,
          projects: nextProjects,
          tasks: sheetTasks
        })
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  const refreshTaskData = async () => {
    if (!storageManager) return
    const userId = session?.user?.id
    const cached = userId ? readSheetCache(userId) : null
    await loadData(storageManager, userId, cached || {})
  }

  useEffect(() => {
    if (status !== "authenticated" || !storageManager) return
    const userId = session?.user?.id
    if (!userId) return

    let isCancelled = false

    const run = async () => {
      setIsPageLoading(true)
      const cached = readSheetCache(userId)
      if (cached) {
        setAccounts(cached.accounts || cached.tamUnits || [])
        setProjects(cached.projects || [])
        setTasks(cached.tasks || [])
      }

      const skipSheetFetch = Boolean(cached && isCacheFresh(cached))
      try {
        await loadData(storageManager, userId, cached || {}, skipSheetFetch)
      } finally {
        if (!isCancelled) {
          setIsPageLoading(false)
        }
      }
    }

    run()

    return () => {
      isCancelled = true
    }
  }, [status, session?.user?.id, storageManager])

  const getFilteredTasks = () => {
    let filtered = [...tasks]
    let hasCustomSort = false

    // Apply view filters
    switch (filterView) {
      case 'my-tasks': {
        const userId = session?.user?.id
        filtered = filtered.filter(t => t.user_id === userId || t.userId === userId)
        break
      }
      case 'due-this-week':
        const now = new Date()
        const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
        filtered = filtered.filter(t => {
          if (!t.dueDate) return false
          const dueDate = new Date(t.dueDate)
          return dueDate <= weekFromNow && dueDate >= now
        })
        break
      case 'recently-updated': {
        const daysAgo = new Date()
        daysAgo.setDate(daysAgo.getDate() - 7)
        filtered = filtered.filter(t => {
          const updatedAt = t.lastUpdateAt || t.updatedAt
          if (!updatedAt) return false
          return new Date(updatedAt) >= daysAgo
        })
        filtered.sort((a, b) => {
          const aUpdated = new Date(a.lastUpdateAt || a.updatedAt || 0)
          const bUpdated = new Date(b.lastUpdateAt || b.updatedAt || 0)
          return bUpdated - aUpdated
        })
        hasCustomSort = true
        break
      }
      case 'by-client':
        if (selectedAccount !== 'all') {
          filtered = filtered.filter(t => (t.accountId || t.tamUnitId) === selectedAccount)
        }
        break
    }

    if (!hasCustomSort) {
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

        return new Date(b.lastUpdateAt || b.updatedAt || b.createdAt) - new Date(a.lastUpdateAt || a.updatedAt || a.createdAt)
      })
    }

    return filtered
  }

  const getAccountName = (accountId) => {
    if (!accountId) return 'Personal'
    const account = accounts.find(u => u.id === accountId)
    if (!account) return 'Unknown Account'
    return account.accountName || account.name || 'Unknown Account'
  }

  const getProjectName = (projectId) => {
    if (!projectId) return 'No Project'
    const project = projects.find(p => p.id === projectId)
    return project ? project.name : 'Unknown Project'
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

  const handleTaskSaved = (savedTask) => {
    setShowTaskForm(false)
    setEditingTask(null)
    if (savedTask) {
      const normalizedTask = normalizeTaskRecord(savedTask)
      setTasks((prev) => mergeById(prev, normalizedTask))

      const userId = session?.user?.id
      if (userId) {
        const cached = readSheetCache(userId) || {}
        const nextTasks = mergeById(cached.tasks || tasks || [], normalizedTask)
        writeSheetCache(userId, {
          accounts: cached.accounts || cached.tamUnits || accounts || [],
          projects: cached.projects || projects || [],
          tasks: nextTasks
        })
      }
      return
    }
    refreshTaskData()
  }

  const handleTaskDeleted = async (taskId) => {
    if (!storageManager) return
    if (!confirm('Are you sure you want to delete this task?')) return
    
    try {
      await storageManager.deleteTask(taskId)
      await refreshTaskData()
      if (selectedTask?.id === taskId) {
        closeTaskDrawer()
      }
    } catch (error) {
      console.error('Error deleting task:', error)
      alert('Error deleting task')
    }
  }

  const handleRefresh = async () => {
    const userId = session?.user?.id
    if (!userId) return

    setIsRefreshing(true)
    try {
      const encodedUserId = encodeURIComponent(userId)
      const [summary, updates] = await Promise.all([
        fetchSheetData(`/api/google_sheets/summary?userId=${encodedUserId}&force=1`, 'summary'),
        fetchSheetData(`/api/google_sheets/updates?userId=${encodedUserId}`, 'updates')
      ])

      if (!summary) return

      const nextAccounts = summary?.accounts ?? []
      const nextProjects = summary?.projects ?? []
      const nextTasks = (summary?.tasks ?? []).map(normalizeTaskRecord).filter(Boolean)
      const nextUpdates = Array.isArray(updates) ? updates : []

      setAccounts(nextAccounts)
      setProjects(nextProjects)
      setTasks(nextTasks)

      if (storageManager && Array.isArray(summary?.tasks) && Array.isArray(summary?.projects)) {
        const [localTasks, localProjects] = await Promise.all([
          storageManager.getTasks(),
          storageManager.getProjects()
        ])
        await pruneLocalAgainstSheet(storageManager, localTasks, localProjects, summary.tasks, summary.projects)
      }

      writeSheetCache(userId, {
        accounts: nextAccounts,
        projects: nextProjects,
        tasks: summary?.tasks ?? [],
        updates: nextUpdates
      })
    } catch (error) {
      console.error('Error refreshing sheet data:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleProjectCreated = (project) => {
    if (!project) return
    setProjects((prev) => mergeById(prev, project))

    const userId = session?.user?.id
    if (!userId) return

    const cached = readSheetCache(userId) || {}
    const nextProjects = mergeById(cached.projects || [], project)
    writeSheetCache(userId, {
      accounts: cached.accounts || cached.tamUnits || accounts || [],
      projects: nextProjects,
      tasks: cached.tasks || tasks || []
    })
  }

  if (status === "loading") {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>
  }

  if (!session) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p>Redirecting to sign in...</p>
      </div>
    )
  }

  if (isPageLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p>Loading tasks...</p>
      </div>
    )
  }

  const filteredTasks = getFilteredTasks()

  return (
    <div>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>
      <div className="app-shell">
        <nav className="navbar">
          <div className="nav-container">
            <div className="nav-logo">
              <h1>TAM OS</h1>
            </div>
            <div className="nav-menu">
              <Link href="/" className="nav-link">My Dashboard</Link>
              <Link href="/tasks" className="nav-link active">My Tasks</Link>
              <Link href="/projects" className="nav-link">My Projects</Link>
              <Link href="/accounts" className="nav-link">My Accounts</Link>
            </div>
          </div>
        </nav>

        <div className="app-main">
          <div className="page-topbar">
            <button 
              onClick={() => signOut({ callbackUrl: '/' })} 
              className="btn btn-secondary auth-button"
            >
              Sign out
            </button>
          </div>
          <main className="main-content">
            <div className="page-container">
              <div className="tasks-container">
                <div className="dashboard-header">
                  <div>
                    <h1>Task Tracker</h1>
                    <p>Track tasks and projects per client</p>
                  </div>
                  <div className="dashboard-header-actions">
                    <button
                      type="button"
                      className="refresh-button"
                      onClick={handleRefresh}
                      disabled={isRefreshing}
                      aria-label="Refresh from Google Sheets"
                      title="Refresh"
                    >
                      ↻
                    </button>
                    <button onClick={handleNewTask} className="btn btn-primary">
                      + New Task
                    </button>
                  </div>
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
                      By Account
                    </button>

                  {filterView === 'by-client' && (
                    <div className="client-filter">
                      <select 
                        value={selectedAccount}
                        onChange={(e) => setSelectedAccount(e.target.value)}
                        className="client-select"
                      >
                        <option value="all">All Accounts</option>
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.accountName || account.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="tasks-table-container">
                  <table className="tasks-table">
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th>Project</th>
                        <th>Task</th>
                        <th>Status</th>
                        <th>Due Date</th>
                        <th>Priority</th>
                        <th>Owner</th>
                        <th>Last Update</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTasks.length === 0 ? (
                        <tr>
                          <td colSpan="8" style={{ textAlign: 'center', padding: '40px' }}>
                            <p>No tasks found. <button onClick={handleNewTask} className="btn-link">Create your first task</button></p>
                          </td>
                        </tr>
                      ) : (
                        filteredTasks.map(task => {
                          const ownerProfile = getOwnerProfile(task, session)
                          return (
                            <tr 
                              key={task.id} 
                              className="task-row"
                              onClick={() => openTaskDetail(task)}
                              style={{ cursor: 'pointer' }}
                            >
                              <td>{task.accountName || getAccountName(task.accountId || task.tamUnitId)}</td>
                              <td>{task.projectName || getProjectName(task.projectId)}</td>
                              <td className="task-title-cell">
                                <strong>{task.title || task.name || task.taskName || task.task || 'Untitled task'}</strong>
                              </td>
                              <td>{getStatusBadge(task.status)}</td>
                              <td>{formatDate(task.dueDate || task.dueAt || task.date)}</td>
                              <td>{getPriorityBadge(task.priority)}</td>
                              <td>
                                <div className="owner-cell">
                                  <span className="owner-name">{ownerProfile.name}</span>
                                </div>
                              </td>
                              <td className="last-update-cell">{formatDateTime(task.lastUpdateAt)}</td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </main>

      {/* Task Detail Drawer */}
      {showTaskDrawer && selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          projects={projects}
          accounts={accounts}
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
              refreshTaskData()
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
          projects={projects}
          accounts={accounts}
          storageManager={storageManager}
          session={session}
          onClose={() => {
            setShowTaskForm(false)
            setEditingTask(null)
          }}
          onSave={handleTaskSaved}
          onClientCreated={(project) => {
            handleProjectCreated(project)
          }}
        />
      )}

          <footer className="footer">
            <div className="container">
              <p>&copy; 2024 TAM OS. All rights reserved.</p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}

// Task Detail Drawer Component
function TaskDetailDrawer({ task, projects, accounts, storageManager, session, onClose, onEdit, onDelete, onUpdate }) {
  const [updates, setUpdates] = useState([])
  const [newUpdate, setNewUpdate] = useState({ body: '', updateType: 'Comment' })
  const [isSaving, setIsSaving] = useState(false)
  const [editingUpdateId, setEditingUpdateId] = useState(null)
  const [editUpdateForm, setEditUpdateForm] = useState({ body: '', updateType: 'Comment' })

  useEffect(() => {
    if (storageManager && task) {
      loadUpdates()
    }
  }, [task, storageManager])

  const fetchSheetUpdates = async (taskId) => {
    try {
      const response = await fetch(`/api/google_sheets/updates?taskId=${encodeURIComponent(taskId)}`, { method: 'GET' })
      if (!response.ok) {
        console.error('Failed to fetch sheet updates:', response.statusText)
        return null
      }
      const data = await response.json()
      return Array.isArray(data) ? data : []
    } catch (error) {
      console.error('Network error fetching sheet updates:', error)
      return null
    }
  }

  const normalizeUpdateRecord = (update, fallbackId) => {
    if (!update) return null
    const createdAt = update.createdAt || update.created_at || update.createdAt || update.created
    return {
      id: update.id || fallbackId,
      taskId: update.taskId || update.task_id || task.id,
      accountId: update.accountId || update.account_id || task.accountId || task.tamUnitId || null,
      projectId: update.projectId || update.project_id || task.projectId || null,
      userId: update.userId || update.user_id || null,
      userName: update.userName || update.user_name || update.author || update.userEmail || update.user_email || 'Unknown',
      author: update.author || update.userName || update.user_name || update.userEmail || update.user_email || 'Unknown',
      note: update.note || update.body || '',
      updateType: update.updateType || update.type || update.category || 'Comment',
      body: update.body || update.note || '',
      statusAfter: update.statusAfter || update.status_after || null,
      createdAt: createdAt || new Date().toISOString(),
      updatedAt: update.updatedAt || update.updated_at || null,
      updatedUserId: update.updatedUserId || update.updated_user_id || null
    }
  }

  const loadUpdates = async () => {
    if (!task) return
    try {
      const [localUpdates, sheetUpdatesResponse] = await Promise.all([
        storageManager ? storageManager.getTaskUpdates(task.id) : [],
        fetchSheetUpdates(task.id)
      ])

      const sheetUpdates = Array.isArray(sheetUpdatesResponse) ? sheetUpdatesResponse : []
      const normalizedSheetUpdates = sheetUpdates
        .map((update, index) => normalizeUpdateRecord(update, `${task.id}-sheet-${index}`))
        .filter(Boolean)
      const normalizedLocalUpdates = (localUpdates || [])
        .map((update, index) => normalizeUpdateRecord(update, update.id || `${task.id}-local-${index}`))
        .filter(Boolean)

      if (storageManager && Array.isArray(sheetUpdatesResponse)) {
        const sheetUpdateIds = new Set(normalizedSheetUpdates.map((update) => update.id).filter(Boolean))
        const staleUpdates = normalizedLocalUpdates.filter((update) => update.id && !sheetUpdateIds.has(update.id))
        for (const update of staleUpdates) {
          await storageManager.deleteTaskUpdate(update.id)
        }
      }

      const mergedUpdates = Array.from(new Map(
        [...normalizedSheetUpdates, ...normalizedLocalUpdates].map(update => [update.id, update])
      ).values())

      mergedUpdates.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

      setUpdates(mergedUpdates)
    } catch (error) {
      console.error('Error loading updates:', error)
    }
  }

  const getAccountName = (accountId) => {
    if (!accountId) return 'Personal'
    const account = accounts.find(u => u.id === accountId)
    if (!account) return 'Unknown Account'
    return account.accountName || account.name || 'Unknown Account'
  }

  const getProjectName = (projectId) => {
    if (!projectId) return 'No Project'
    const project = projects.find(p => p.id === projectId)
    return project ? project.name : 'Unknown Project'
  }

  const accountLabel = task.accountName || getAccountName(task.accountId || task.tamUnitId)
  const projectLabel = task.projectName || getProjectName(task.projectId)
  const taskTitle = task.title || task.name || task.taskName || task.task || 'Untitled task'
  const taskDescription = task.description || task.details || task.nextStep
  const ownerProfile = getOwnerProfile(task, session)

  const buildUpdateUserName = () => {
    const firstName =
      session?.user?.userFirstName ||
      session?.user?.firstName ||
      session?.user?.first_name ||
      session?.user?.given_name ||
      ''
    const lastName =
      session?.user?.userLastName ||
      session?.user?.lastName ||
      session?.user?.last_name ||
      session?.user?.family_name ||
      ''
    const fullName = [firstName, lastName].filter(Boolean).join(' ')
    if (fullName) return fullName
    if (session?.user?.name) return session.user.name
    if (session?.user?.email) return session.user.email.split('@')[0]
    return 'Unknown'
  }

  const formatUpdateAuthor = (update) => {
    const rawName =
      update?.userName ||
      update?.user_name ||
      update?.author ||
      update?.userEmail ||
      update?.user_email ||
      'Unknown'

    if (!rawName.includes('@')) return rawName

    const localPart = rawName.split('@')[0]
    const parts = localPart.split(/[._-]+/).filter(Boolean)
    if (parts.length === 0) return rawName
    return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
  }

  const syncUpdateToSheet = async (updateRecord, { method = 'POST' } = {}) => {
    const userId = session?.user?.id || session?.user?.userId || session?.user?.user_id || ''
    if (method === 'DELETE') {
      const response = await fetch('/api/google_sheets/updates', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: updateRecord.id })
      })

      if (!response.ok) {
        let message = 'Failed to delete update from Google Sheets'
        try {
          const data = await response.json()
          message = data?.error || data?.details || message
        } catch (error) {
          console.error('Error parsing update delete response:', error)
        }
        throw new Error(message)
      }

      return response.json()
    }

    const now = new Date().toISOString()
    const isUpdate = method === 'PUT'
    const payload = {
      id: updateRecord.id,
      taskId: updateRecord.taskId || task.id,
      accountId: task.accountId || task.tamUnitId || '',
      projectId: task.projectId || '',
      note: updateRecord.body || updateRecord.note || '',
      category: updateRecord.updateType || updateRecord.category || 'Comment',
      userId,
      userName: buildUpdateUserName(),
      createdAt: updateRecord.createdAt || now,
      updatedAt: isUpdate ? now : (updateRecord.updatedAt || updateRecord.createdAt || now),
      updatedUserId: userId
    }

    const response = await fetch('/api/google_sheets/updates', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      let message = 'Failed to sync update to Google Sheets'
      try {
        const data = await response.json()
        message = data?.error || data?.details || message
      } catch (error) {
        console.error('Error parsing update sync response:', error)
      }
      throw new Error(message)
    }

    return response.json()
  }

  const startEditUpdate = (update) => {
    setEditingUpdateId(update.id)
    setEditUpdateForm({
      body: update.body || update.note || '',
      updateType: update.updateType || update.category || 'Comment'
    })
  }

  const cancelEditUpdate = () => {
    setEditingUpdateId(null)
    setEditUpdateForm({ body: '', updateType: 'Comment' })
  }

  const handleSaveUpdateEdit = async (update) => {
    if (!editUpdateForm.body.trim()) return

    setIsSaving(true)
    try {
      const userId = session?.user?.id || session?.user?.userId || session?.user?.user_id || ''
      const now = new Date().toISOString()
      const updatedUpdate = {
        ...update,
        body: editUpdateForm.body,
        note: editUpdateForm.body,
        updateType: editUpdateForm.updateType,
        category: editUpdateForm.updateType,
        updatedAt: now,
        updatedUserId: userId
      }

      if (storageManager) {
        await storageManager.deleteTaskUpdate(update.id)
        await storageManager.saveTaskUpdate({
          ...updatedUpdate,
          createdAt: update.createdAt || now
        })
      }

      await syncUpdateToSheet(updatedUpdate, { method: 'PUT' })
      cancelEditUpdate()
      await loadUpdates()
      onUpdate()
    } catch (error) {
      console.error('Error updating update:', error)
      alert('Error updating update')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteUpdate = async (update) => {
    if (!confirm('Are you sure you want to delete this update?')) return

    setIsSaving(true)
    try {
      if (storageManager) {
        await storageManager.deleteTaskUpdate(update.id)
      }
      await syncUpdateToSheet(update, { method: 'DELETE' })
      await loadUpdates()
      onUpdate()
    } catch (error) {
      console.error('Error deleting update:', error)
      alert('Error deleting update')
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddUpdate = async () => {
    if (!newUpdate.body.trim() || !storageManager) return
    
    setIsSaving(true)
    try {
      const update = storageManager.createTaskUpdate({
        taskId: task.id,
        author: buildUpdateUserName(),
        updateType: newUpdate.updateType,
        body: newUpdate.body,
        statusAfter: newUpdate.statusAfter || null
      })
      
      await storageManager.saveTaskUpdate(update)
      try {
        await syncUpdateToSheet(update)
      } catch (error) {
        console.error('Error syncing update to Google Sheets:', error)
        alert('Update saved locally, but failed to sync to Google Sheets.')
      }
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
            <div className="task-drawer-title">
              <h2>{taskTitle}</h2>
            </div>
            <p className="task-drawer-meta">
              {accountLabel} • {projectLabel} • Owner: {ownerProfile.name}
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
              <div><strong>Project:</strong> {projectLabel}</div>
              <div><strong>Priority:</strong> {task.priority}</div>
              <div><strong>Due Date:</strong> {task.dueDate || task.dueAt || task.date ? new Date(task.dueDate || task.dueAt || task.date).toLocaleDateString() : '—'}</div>
              <div><strong>Account:</strong> {accountLabel}</div>
            </div>
          </div>

          {taskDescription && (
            <div className="task-drawer-section">
              <h3>Description</h3>
              <p>{taskDescription}</p>
            </div>
          )}

          <div className="task-drawer-section">
            <h3>Timeline</h3>
            <div className="timeline">
              {updates.length === 0 ? (
                <p style={{ color: '#666', fontStyle: 'italic' }}>No updates yet</p>
              ) : (
                updates.map(update => {
                  const isEditing = editingUpdateId === update.id
                  return (
                    <div key={update.id} className="timeline-item">
                      <div className="timeline-header">
                        <strong>{formatUpdateAuthor(update)}</strong>
                        <span className="timeline-type">{update.updateType}</span>
                        <div className="timeline-meta">
                          <span className="timeline-date">
                            {new Date(update.createdAt).toLocaleString()}
                          </span>
                          <div className="timeline-actions">
                            <button
                              type="button"
                              className="btn btn-secondary btn-xs"
                              onClick={() => startEditUpdate(update)}
                              disabled={isSaving}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-xs"
                              onClick={() => handleDeleteUpdate(update)}
                              disabled={isSaving}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                      {isEditing ? (
                        <div className="timeline-edit-form">
                          <select
                            value={editUpdateForm.updateType}
                            onChange={(e) => setEditUpdateForm({ ...editUpdateForm, updateType: e.target.value })}
                            className="update-type-select"
                          >
                            <option value="Comment">Comment</option>
                            <option value="Status change">Status change</option>
                            <option value="Risk">Risk</option>
                            <option value="Next step">Next step</option>
                            <option value="Decision">Decision</option>
                          </select>
                          <textarea
                            value={editUpdateForm.body}
                            onChange={(e) => setEditUpdateForm({ ...editUpdateForm, body: e.target.value })}
                            rows="3"
                            className="update-textarea"
                          />
                          <div className="timeline-edit-actions">
                            <button
                              type="button"
                              className="btn btn-secondary btn-xs"
                              onClick={cancelEditUpdate}
                              disabled={isSaving}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary btn-xs"
                              onClick={() => handleSaveUpdateEdit(update)}
                              disabled={!editUpdateForm.body.trim() || isSaving}
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="timeline-body">{update.body || update.note}</div>
                          {update.statusAfter && (
                            <div className="timeline-changes">
                              {update.statusAfter && <span>Status → {update.statusAfter}</span>}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })
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
function TaskFormModal({ task, projects, accounts, storageManager, session, onClose, onSave, onClientCreated }) {
  const getUserNameParts = () => {
    let firstName =
      session?.user?.userFirstName ||
      session?.user?.firstName ||
      session?.user?.first_name ||
      session?.user?.given_name ||
      ''
    let lastName =
      session?.user?.userLastName ||
      session?.user?.lastName ||
      session?.user?.last_name ||
      session?.user?.family_name ||
      ''

    if ((!firstName || !lastName) && session?.user?.name) {
      const parts = session.user.name.trim().split(/\s+/)
      if (!firstName && parts.length >= 1) {
        firstName = parts[0]
      }
      if (!lastName && parts.length >= 2) {
        lastName = parts.slice(1).join(' ')
      }
    }

    return { firstName, lastName }
  }

  const resolveOwnerName = () => {
    if (task?.owner && !task.owner.includes('@')) return task.owner
    if (task?.userFirstName) return task.userFirstName
    if (task?.owner) return task.owner.split('@')[0]
    if (task?.userEmail) return task.userEmail.split('@')[0]
    const { firstName } = getUserNameParts()
    if (firstName) return firstName
    if (session?.user?.email) return session.user.email.split('@')[0]
    return ''
  }

  const [formData, setFormData] = useState({
    accountId: task?.accountId || task?.tamUnitId || '',
    projectId: task?.projectId || '',
    title: task?.title || task?.name || '',
    status: task?.status || 'Not started',
    dueDate: task?.dueDate || task?.dueAt || task?.date || '',
    priority: task?.priority || 'Medium',
    owner: resolveOwnerName(),
    description: task?.description || task?.details || task?.nextStep || ''
  })
  const [titleTouched, setTitleTouched] = useState(false)
  const titleFilled = Boolean(formData.title && formData.title.trim())
  const dueDateFilled = Boolean(formData.dueDate)
  const ownerFilled = Boolean(formData.owner && formData.owner.trim())
  const [isSaving, setIsSaving] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [showNewProjectInput, setShowNewProjectInput] = useState(false)
  const resolvedUserId = session?.user?.id || session?.user?.userId || session?.user?.user_id || task?.userId || task?.user_id || ''

  const getAccountName = (accountId) => {
    if (!accountId) return ''
    const account = accounts.find((u) => u.id === accountId)
    return account?.accountName || account?.name || ''
  }

  const getProjectName = (projectId) => {
    if (!projectId) return ''
    const project = projects.find((p) => p.id === projectId)
    return project?.name || ''
  }

  const buildProjectPayload = (projectRecord) => {
    const accountId = projectRecord.accountId || projectRecord.tamUnitId || formData.accountId || ''
    const accountName = getAccountName(accountId)
    const { firstName, lastName } = getUserNameParts()
    const now = new Date().toISOString()
    const userId = session?.user?.id || session?.user?.userId || session?.user?.user_id || ''
    const userEmail = session?.user?.email || ''

    return {
      ...projectRecord,
      id: projectRecord.id,
      name: projectRecord.name || newProjectName.trim(),
      accountId,
      accountName,
      userId,
      userEmail,
      userFirstName: firstName || '',
      userLastName: lastName || '',
      createdAt: projectRecord.createdAt || now,
      updatedAt: projectRecord.updatedAt || projectRecord.createdAt || now,
      updatedUserId: userId
    }
  }

  const syncProjectToSheet = async (projectRecord) => {
    const response = await fetch('/api/google_sheets/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildProjectPayload(projectRecord))
    })

    if (!response.ok) {
      let message = 'Failed to sync project to Google Sheets'
      try {
        const data = await response.json()
        message = data?.error || data?.details || message
      } catch (error) {
        console.error('Error parsing project sync response:', error)
      }
      throw new Error(message)
    }

    return response.json()
  }

  const buildSheetTaskPayload = (taskRecord, { isUpdate = false } = {}) => {
    const accountId = taskRecord.accountId || taskRecord.tamUnitId || formData.accountId || ''
    const projectId = taskRecord.projectId || formData.projectId || ''
    const accountName = taskRecord.accountName || getAccountName(accountId)
    const projectName = taskRecord.projectName || getProjectName(projectId)
    const { firstName, lastName } = getUserNameParts()
    const name = taskRecord.name || taskRecord.title || formData.title || ''
    const details = taskRecord.details || taskRecord.description || formData.description || ''
    const nextStep = taskRecord.nextStep || taskRecord.lastUpdateSummary || ''
    const dueAt = taskRecord.dueAt || taskRecord.dueDate || taskRecord.date || formData.dueDate || ''
    const createdAt = taskRecord.createdAt || new Date().toISOString()
    const updatedAt = isUpdate ? new Date().toISOString() : (taskRecord.updatedAt || createdAt)
    const updatedUserId = isUpdate
      ? (resolvedUserId || taskRecord.updatedUserId || '')
      : (taskRecord.updatedUserId || resolvedUserId || '')
    const completed =
      typeof taskRecord.completed === 'boolean'
        ? taskRecord.completed
        : (taskRecord.status || formData.status) === 'Done'

    return {
      ...taskRecord,
      id: taskRecord.id,
      name,
      details,
      priority: taskRecord.priority || formData.priority || '',
      nextStep,
      status: taskRecord.status || formData.status || '',
      accountName,
      accountId,
      projectId,
      projectName,
      dueAt,
      userId: resolvedUserId || taskRecord.userId || taskRecord.user_id || '',
      userEmail: session?.user?.email || taskRecord.userEmail || taskRecord.user_email || '',
      userFirstName: firstName || taskRecord.userFirstName || taskRecord.user_first_name || '',
      userLastName: lastName || taskRecord.userLastName || taskRecord.user_last_name || '',
      completed,
      createdAt,
      updatedAt,
      updatedUserId
    }
  }

  const syncTaskToSheet = async (taskRecord, { method = 'POST' } = {}) => {
    if (!resolvedUserId) {
      console.warn('No user id available for Google Sheets sync')
      return { skipped: true }
    }

    const isUpdate = method === 'PUT'
    const response = await fetch('/api/google_sheets/tasks', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildSheetTaskPayload(taskRecord, { isUpdate }))
    })

    if (!response.ok) {
      let message = 'Failed to sync task to Google Sheets'
      try {
        const data = await response.json()
        message = data?.error || data?.details || message
      } catch (error) {
        console.error('Error parsing sheet sync response:', error)
      }
      throw new Error(message)
    }

    return response.json()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.title.trim() || !formData.projectId) {
      alert('Title and Project are required')
      return
    }

    setIsSaving(true)
    try {
      let taskToSave
      if (task) {
        taskToSave = { ...task, ...formData }
      } else {
        taskToSave = storageManager.createTask({ ...formData })
      }

      const { firstName, lastName } = getUserNameParts()
      taskToSave = {
        ...taskToSave,
        owner: formData.owner || firstName || taskToSave.owner || '',
        userFirstName: taskToSave.userFirstName || firstName || '',
        userLastName: taskToSave.userLastName || lastName || '',
        userEmail: taskToSave.userEmail || session?.user?.email || ''
      }

      if (resolvedUserId) {
        taskToSave = { ...taskToSave, userId: resolvedUserId, user_id: resolvedUserId }
      }

      const savedTask = await storageManager.saveTask(taskToSave)
      try {
        await syncTaskToSheet(savedTask, { method: task ? 'PUT' : 'POST' })
      } catch (error) {
        console.error('Error syncing task to Google Sheets:', error)
        alert(task
          ? 'Task updated locally, but failed to sync to Google Sheets.'
          : 'Task saved locally, but failed to sync to Google Sheets.'
        )
      }
      onSave(savedTask)
    } catch (error) {
      console.error('Error saving task:', error)
      alert('Error saving task')
    } finally {
      setIsSaving(false)
    }
  }

  const availableProjects = projects.filter((project) => {
    if (!formData.accountId) return false
    return (project.accountId || project.tamUnitId) === formData.accountId
  })

  const canCreateProject = formData.accountId

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || !storageManager || !formData.accountId) return

    setIsCreatingProject(true)
    try {
      let isPersonal = false

      const account = accounts.find((u) => u.id === formData.accountId)
      const accountName = account?.accountName || account?.name
      isPersonal = accountName === 'Personal'

      const project = storageManager.createProject({
        name: newProjectName.trim(),
        accountId: formData.accountId,
        isPersonal,
        dueDate: null
      })
      await storageManager.saveProject(project)
      try {
        await syncProjectToSheet(project)
      } catch (error) {
        console.error('Error syncing project to Google Sheets:', error)
        alert('Project saved locally, but failed to sync to Google Sheets.')
      }
      setFormData({ ...formData, projectId: project.id })
      setNewProjectName('')
      setShowNewProjectInput(false)
      if (onClientCreated) {
        onClientCreated(project)
      }
    } catch (error) {
      console.error('Error creating project:', error)
      alert('Error creating project')
    } finally {
      setIsCreatingProject(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-content task-form-modal${task ? ' is-editing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{task ? 'Edit Task' : 'New Task'}</h2>
          <button onClick={onClose} className="btn-close">×</button>
        </div>
        <form onSubmit={handleSubmit} className="task-form">
          <div className="form-group">
            <label>Account *</label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <select 
                value={formData.accountId}
                onChange={(e) => {
                  setFormData({ ...formData, accountId: e.target.value, projectId: '' })
                }}
                required
                style={{ flex: 1 }}
              >
                <option value="">Select Account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.accountName || account.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Project *</label>
            <select
              value={formData.projectId}
              onChange={(e) => {
                if (e.target.value === 'new') {
                  setShowNewProjectInput(true)
                  setFormData({ ...formData, projectId: '' })
                } else {
                  setShowNewProjectInput(false)
                  setFormData({ ...formData, projectId: e.target.value })
                }
              }}
              required={!canCreateProject}
            >
              <option value="">Select Project</option>
              {availableProjects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
              <option value="new">+ Create New Project</option>
            </select>
            {showNewProjectInput && (
              <div style={{ marginTop: '10px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="New project name"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  onClick={handleCreateProject}
                  disabled={!newProjectName.trim() || isCreatingProject}
                  className="btn btn-primary"
                  style={{ padding: '8px 16px' }}
                >
                  {isCreatingProject ? 'Creating...' : 'Create'}
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
              onBlur={() => setTitleTouched(true)}
              className={`${titleTouched ? 'input-touched' : ''} ${titleFilled ? 'input-filled' : ''}`.trim()}
              required
            />
          </div>

          <div className="form-row">
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

          <div className="form-row">
            <div className="form-group">
              <label>Due Date</label>
              <input 
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                className={dueDateFilled ? 'input-filled' : ''}
              />
            </div>

            <div className="form-group">
              <label>Owner *</label>
              <input 
                type="text"
                value={formData.owner}
                onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                className={ownerFilled ? 'input-filled' : ''}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows="4"
            />
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

