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
      JSON.stringify({ ...data, cachedAt: new Date().toISOString() })
    )
  } catch (error) {
    console.error('Error writing projects cache:', error)
  }
}

export default function Projects() {
  const { data: session, status } = useSession()
  const [storageManager, setStorageManager] = useState(null)
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [tamUnits, setTamUnits] = useState([])
  const [expandedProjects, setExpandedProjects] = useState({})
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectTamUnit, setNewProjectTamUnit] = useState('')
  const [newProjectDueDate, setNewProjectDueDate] = useState('')
  const [isCreatingProject, setIsCreatingProject] = useState(false)

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
      const [sheetProjects, sheetTasks, sheetAccounts] = await Promise.all([
        fetchSheetData(`/api/google_sheets/projects?userId=${encodedUserId}`, 'projects'),
        fetchSheetData(`/api/google_sheets/tasks?userId=${encodedUserId}`, 'tasks'),
        fetchSheetData(`/api/google_sheets/accounts?userId=${encodedUserId}`, 'accounts')
      ])

      const nextProjects = sheetProjects ?? cachedData.projects ?? []
      const nextTasks = sheetTasks ?? cachedData.tasks ?? []
      const nextAccounts = sheetAccounts ?? cachedData.tamUnits ?? []

      setProjects(nextProjects)
      setTasks(nextTasks)
      setTamUnits(nextAccounts)

      writeSheetCache(userId, {
        tamUnits: nextAccounts,
        projects: nextProjects,
        tasks: nextTasks
      })
    } catch (error) {
      console.error('Error loading data:', error)
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
      setTamUnits(cached.tamUnits || [])
    }

    loadData(userId, cached)
  }, [status, session?.user?.id])

  const toggleProject = (projectId) => {
    setExpandedProjects((prev) => ({
      ...prev,
      [projectId]: !prev[projectId]
    }))
  }

  const getTamUnitName = (tamUnitId) => {
    if (!tamUnitId) return 'Personal'
    const unit = tamUnits.find((u) => u.id === tamUnitId)
    return unit ? unit.name : 'Unknown Account'
  }

  const getProjectTasks = (projectId) => {
    return tasks.filter((task) => task.projectId === projectId)
  }

  const visibleProjects = projects

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || !storageManager) return
    if (!newProjectTamUnit) {
      alert('Select an account for this project')
      return
    }

    setIsCreatingProject(true)
    try {
      const unit = tamUnits.find((u) => u.id === newProjectTamUnit)
      const isPersonal = unit?.name === 'Personal'

      const project = storageManager.createProject({
        name: newProjectName.trim(),
        tamUnitId: newProjectTamUnit,
        isPersonal,
        dueDate: newProjectDueDate || null
      })
      await storageManager.saveProject(project)
      setNewProjectName('')
      setNewProjectTamUnit('')
      setNewProjectDueDate('')
      setShowNewProject(false)
      if (session?.user?.id) {
        await loadData(session.user.id, readSheetCache(session.user.id))
      }
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
              <Link href="/tam-units" className="nav-link">My Accounts</Link>
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
            <div className="dashboard-header">
              <div>
                <h1>My Projects</h1>
                <p>Track projects and roll up the tasks underneath each one.</p>
              </div>
            </div>

            <section className="card">
              <div className="card-title">Projects</div>
              <div className="card-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => setShowNewProject(true)}
                >
                  + New Project
                </button>
              </div>
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
                          value={newProjectTamUnit}
                          onChange={(e) => setNewProjectTamUnit(e.target.value)}
                        >
                          <option value="">Select Account</option>
                          {tamUnits.map((unit) => (
                            <option key={unit.id} value={unit.id}>{unit.name}</option>
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
                          <div className="disclosure-meta">{getTamUnitName(project.tamUnitId)} • {projectTasks.length} tasks</div>
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
                            projectTasks.map((task) => (
                              <div key={task.id} className="nested-item">
                                <span>{task.title}</span>
                                <span className="muted">{task.status}</span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
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
