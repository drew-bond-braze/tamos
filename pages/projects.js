import { useSession, signOut } from "next-auth/react"
import Link from "next/link"
import Head from "next/head"
import { useEffect, useState } from "react"

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
    console.error('Error reading projects cache:', error)
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
    console.error('Error writing projects cache:', error)
  }
}

const CACHE_TTL_MS = 10 * 60 * 1000

const isCacheFresh = (cached) => {
  if (!cached?.cachedAt) return false
  const cachedAt = typeof cached.cachedAt === 'number' ? cached.cachedAt : Date.parse(cached.cachedAt)
  if (!Number.isFinite(cachedAt)) return false
  return Date.now() - cachedAt < CACHE_TTL_MS
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

const pruneLocalProjectsAgainstSheet = async (storageManager, localProjects, sheetProjects) => {
  if (!storageManager || !Array.isArray(sheetProjects)) return
  const sheetProjectIds = new Set(sheetProjects.map((project) => project?.id).filter(Boolean))
  const staleProjects = (localProjects || []).filter((project) => project?.id && !sheetProjectIds.has(project.id))
  for (const project of staleProjects) {
    await storageManager.deleteProject(project.id)
  }
}

export default function Projects() {
  const { data: session, status } = useSession()
  const [storageManager, setStorageManager] = useState(null)
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [accounts, setAccounts] = useState([])
  const [expandedProjects, setExpandedProjects] = useState({})
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectAccount, setNewProjectAccount] = useState('')
  const [newProjectDueDate, setNewProjectDueDate] = useState('')
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined" && StorageManager) {
      const sm = new StorageManager()
      setStorageManager(sm)
    }
  }, [])

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

  const loadData = async (userId, cachedData = {}) => {
    try {
      if (!userId) return

      const encodedUserId = encodeURIComponent(userId)
      const summary = await fetchSheetData(
        `/api/google_sheets/summary?userId=${encodedUserId}`,
        'summary'
      )

      const sheetProjects = summary?.projects
      const nextProjects = sheetProjects ?? cachedData.projects ?? []
      const nextTasks = summary?.tasks ?? cachedData.tasks ?? []
      const nextAccounts = summary?.accounts ?? cachedData.accounts ?? cachedData.tamUnits ?? []

      if (storageManager && Array.isArray(sheetProjects)) {
        const localProjects = await storageManager.getProjects()
        await pruneLocalProjectsAgainstSheet(storageManager, localProjects, sheetProjects)
      }

      setProjects(nextProjects)
      setTasks(nextTasks)
      setAccounts(nextAccounts)

      writeSheetCache(userId, {
        accounts: nextAccounts,
        projects: nextProjects,
        tasks: nextTasks
      })
    } catch (error) {
      console.error('Error loading data:', error)
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

      const nextProjects = summary?.projects ?? []
      const nextTasks = summary?.tasks ?? []
      const nextAccounts = summary?.accounts ?? []
      const nextUpdates = Array.isArray(updates) ? updates : []

      setProjects(nextProjects)
      setTasks(nextTasks)
      setAccounts(nextAccounts)

      writeSheetCache(userId, {
        accounts: nextAccounts,
        projects: nextProjects,
        tasks: nextTasks,
        updates: nextUpdates
      })
    } catch (error) {
      console.error('Error refreshing sheet data:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    if (status !== "authenticated") return
    const userId = session?.user?.id
    if (!userId) return

    const cached = readSheetCache(userId)
    if (cached) {
      setProjects(cached.projects || [])
      setTasks(cached.tasks || [])
      setAccounts(cached.accounts || cached.tamUnits || [])
    }

    loadData(userId, cached)
  }, [status, session?.user?.id, storageManager])

  const toggleProject = (projectId) => {
    setExpandedProjects((prev) => ({
      ...prev,
      [projectId]: !prev[projectId]
    }))
  }

  const getAccountName = (accountId) => {
    if (!accountId) return 'Personal'
    const account = accounts.find((u) => u.id === accountId)
    if (!account) return 'Unknown Account'
    return account.accountName || account.name || 'Unknown Account'
  }

  const getProjectTasks = (projectId) => {
    return tasks.filter((task) => {
      const taskProjectId = task.projectId || task.project_id || task.projectID || task.project
      if (!taskProjectId) return false
      return String(taskProjectId) === String(projectId)
    })
  }

  const visibleProjects = projects

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || !storageManager) return
    if (!newProjectAccount) {
      alert('Select an account for this project')
      return
    }

    setIsCreatingProject(true)
    try {
      const account = accounts.find((u) => u.id === newProjectAccount)
      const accountName = account?.accountName || account?.name
      const isPersonal = accountName === 'Personal'

      const project = storageManager.createProject({
        name: newProjectName.trim(),
        accountId: newProjectAccount,
        isPersonal,
        dueDate: newProjectDueDate || null
      })
      await storageManager.saveProject(project)
      const nextProjects = mergeListsById(projects, [project])
      setProjects(nextProjects)

      const userId = session?.user?.id
      if (userId) {
        const cached = readSheetCache(userId) || {}
        const mergedProjects = mergeListsById(cached.projects, [project])
        writeSheetCache(userId, {
          accounts: cached.accounts || cached.tamUnits || accounts || [],
          projects: mergedProjects,
          tasks: cached.tasks || tasks || []
        })
      }
      setNewProjectName('')
      setNewProjectAccount('')
      setNewProjectDueDate('')
      setShowNewProject(false)
    } catch (error) {
      console.error('Error creating project:', error)
      alert('Error creating project')
    } finally {
      setIsCreatingProject(false)
    }
  }

  if (status === "loading") {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p>Loading...</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p>Redirecting to sign in...</p>
      </div>
    )
  }

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
              <Link href="/tasks" className="nav-link">My Tasks</Link>
              <Link href="/projects" className="nav-link active">My Projects</Link>
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
              <div className="dashboard-header">
                <div>
                  <h1>My Projects</h1>
                  <p>Track projects and roll up the tasks underneath each one.</p>
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
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setShowNewProject(true)}
                >
                  + New Project
                </button>
                </div>
              </div>

              <section className="card">
                <div className="card-title">Projects</div>
                {showNewProject && (
                  <div className="modal-overlay" onClick={() => setShowNewProject(false)}>
                    <div className="modal-content task-form-modal" onClick={(e) => e.stopPropagation()}>
                      <div className="modal-header">
                        <h2>New Project</h2>
                        <button onClick={() => setShowNewProject(false)} className="btn-close">×</button>
                      </div>
                      <div className="task-form">
                        <div className="form-group">
                          <label>Project Name *</label>
                          <input
                            type="text"
                            value={newProjectName}
                            onChange={(e) => setNewProjectName(e.target.value)}
                            placeholder="Project name"
                          />
                        </div>
                        <div className="form-group">
                          <label>Account *</label>
                          <select
                            value={newProjectAccount}
                            onChange={(e) => setNewProjectAccount(e.target.value)}
                          >
                            <option value="">Select Account</option>
                            {accounts.map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.accountName || account.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Due Date</label>
                          <input
                            type="date"
                            value={newProjectDueDate}
                            onChange={(e) => setNewProjectDueDate(e.target.value)}
                          />
                        </div>
                        <div className="form-actions">
                          <button type="button" className="btn btn-secondary" onClick={() => setShowNewProject(false)}>
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleCreateProject}
                            className="btn btn-primary"
                            disabled={isCreatingProject}
                          >
                            {isCreatingProject ? 'Creating...' : 'Create Project'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="card-list">
                  {visibleProjects.length === 0 && (
                    <div className="card-list-item">No projects yet.</div>
                  )}
                  {visibleProjects.map((project) => {
                    const projectTasks = getProjectTasks(project.id)
                    return (
                      <div key={project.id} className="card-list-item">
                        <div className="disclosure-row">
                          <div>
                            <div className="card-item-title">{project.name}</div>
                            <div className="disclosure-meta">
                              {getAccountName(project.accountId || project.tamUnitId)} • {projectTasks.length} tasks
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            onClick={() => toggleProject(project.id)}
                          >
                            {expandedProjects[project.id] ? 'Hide tasks' : 'View tasks'}
                          </button>
                        </div>
                        {expandedProjects[project.id] && (
                          <div className="nested-list">
                            {projectTasks.length === 0 ? (
                              <div className="nested-item muted">No tasks assigned yet.</div>
                            ) : (
                              projectTasks.map((task, index) => {
                                const taskTitle = task.title || task.name || task.taskName || task.summary || 'Untitled task'
                                const taskStatus = task.status || task.state || '—'
                                return (
                                  <div key={task.id || `${project.id}-${index}`} className="nested-item">
                                    <span>{taskTitle}</span>
                                    <span className="muted">{taskStatus}</span>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            </div>
          </main>

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
