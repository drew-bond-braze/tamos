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
    console.error('Error reading TAM units cache:', error)
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
    console.error('Error writing TAM units cache:', error)
  }
}

export default function TamUnits() {
  const { data: session, status } = useSession()
  const [storageManager, setStorageManager] = useState(null)
  const [tamUnits, setTamUnits] = useState([])
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [expandedUnits, setExpandedUnits] = useState({})
  const [expandedProjects, setExpandedProjects] = useState({})
  const [newTamUnitName, setNewTamUnitName] = useState('')
  const [isCreatingTamUnit, setIsCreatingTamUnit] = useState(false)

  // const allowedTamUnits = [
    // 'Bell Media',
    // 'Papa Johns',
    // 'P&G',
    // 'ELC',
    // 'Questrade',
    // 'Amazon Games',
    // 'Personal'
  // ]

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
      const [sheetAccounts, sheetProjects, sheetTasks] = await Promise.all([
        fetchSheetData(`/api/google_sheets/accounts?userId=${encodedUserId}`, 'accounts'),
        fetchSheetData(`/api/google_sheets/projects?userId=${encodedUserId}`, 'projects'),
        fetchSheetData(`/api/google_sheets/tasks?userId=${encodedUserId}`, 'tasks')
      ])

      const nextTamUnits = sheetAccounts ?? cachedData.tamUnits ?? []
      const nextProjects = sheetProjects ?? cachedData.projects ?? []
      const nextTasks = sheetTasks ?? cachedData.tasks ?? []

      setTamUnits(nextTamUnits)
      setProjects(nextProjects)
      setTasks(nextTasks)

      writeSheetCache(userId, {
        tamUnits: nextTamUnits,
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
      setTamUnits(cached.tamUnits || [])
      setProjects(cached.projects || [])
      setTasks(cached.tasks || [])
    }

    loadData(userId, cached)
  }, [status, session?.user?.id])

  const toggleUnit = (unitId) => {
    setExpandedUnits((prev) => ({
      ...prev,
      [unitId]: !prev[unitId]
    }))
  }

  const toggleProject = (projectId) => {
    setExpandedProjects((prev) => ({
      ...prev,
      [projectId]: !prev[projectId]
    }))
  }

  const getUnitProjects = (unit) => {
    return projects.filter((project) => project.accountId === unit.id)
  }

  const getProjectTasks = (projectId) => {
    return tasks.filter((task) => task.projectId === projectId)
  }
  // const filteredTamUnits = tamUnits
  //   .filter((unit) => allowedTamUnits.includes(unit.accountName))
  //   .filter((unit, index, list) => list.findIndex((item) => item.accountName === unit.accountName) === index)

  // const handleCreateTamUnit = async () => {
  //   if (!newTamUnitName.trim() || !storageManager) return

  //   setIsCreatingTamUnit(true)
  //   try {
  //     const unit = storageManager.createTamUnit(newTamUnitName.trim())
  //     await storageManager.saveTamUnit(unit)
  //     setNewTamUnitName('')
  //     await loadData(storageManager)
  //   } catch (error) {
  //     console.error('Error creating TAM unit:', error)
  //     alert('Error creating TAM unit')
  //   } finally {
  //     setIsCreatingTamUnit(false)
  //   }
  // }

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
              <Link href="/projects" className="nav-link">My Projects</Link>
              <Link href="/tam-units" className="nav-link active">My Accounts</Link>
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
                <h1>My Accounts</h1>
                <p>See projects by account and roll up tasks under each project.</p>
              </div>
            </div>

            <section className="card">
              <div className="card-title">Accounts</div>
              <div className="card-list">
                {tamUnits.map((unit) => {
                  const unitProjects = getUnitProjects(unit)
                  return (
                    <div key={unit.id} className="card-list-item">
                      <div className="disclosure-row">
                        <div>
                          <div className="card-item-title">{unit.accountName}</div>
                          <div className="disclosure-meta">{unitProjects.length} projects</div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          onClick={() => toggleUnit(unit.id)}
                        >
                          {expandedUnits[unit.id] ? 'Hide projects' : 'View projects'}
                        </button>
                      </div>
                      {expandedUnits[unit.id] && (
                        <div className="nested-list">
                          {unitProjects.length === 0 ? (
                            <div className="nested-item muted">No projects yet.</div>
                          ) : (
                            unitProjects.map((project) => {
                              const projectTasks = getProjectTasks(project.id)
                              return (
                                <div key={project.id} className="nested-item">
                                  <div className="disclosure-row">
                                    <div>
                                      <div className="card-item-title">{project.name}</div>
                                      <div className="disclosure-meta">{projectTasks.length} tasks</div>
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
                                            <span>{task.name}</span>
                                            <span className="muted">{task.status}</span>
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  )}
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

            {/* <section className="card">
              <div className="card-title">Add Account</div>
              <div className="form-row">
                <div className="form-group">
                  <label>New Account</label>
                  <input
                    type="text"
                    value={newTamUnitName}
                    onChange={(e) => setNewTamUnitName(e.target.value)}
                    placeholder="Account name"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleCreateTamUnit}
                className="btn btn-secondary btn-xs"
                disabled={isCreatingTamUnit}
              >
                {isCreatingTamUnit ? 'Creating...' : 'Add Account'}
              </button>
            </section> */}
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
