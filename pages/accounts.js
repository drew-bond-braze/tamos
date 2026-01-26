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
    console.error('Error reading accounts cache:', error)
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
    console.error('Error writing accounts cache:', error)
  }
}

const CACHE_TTL_MS = 10 * 60 * 1000

const isCacheFresh = (cached) => {
  if (!cached?.cachedAt) return false
  const cachedAt = typeof cached.cachedAt === 'number' ? cached.cachedAt : Date.parse(cached.cachedAt)
  if (!Number.isFinite(cachedAt)) return false
  return Date.now() - cachedAt < CACHE_TTL_MS
}

export default function Accounts() {
  const { data: session, status } = useSession()
  const [storageManager, setStorageManager] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [expandedAccounts, setExpandedAccounts] = useState({})
  const [expandedProjects, setExpandedProjects] = useState({})
  const [newAccountName, setNewAccountName] = useState('')
  const [isCreatingAccount, setIsCreatingAccount] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // const allowedAccounts = [
  //   'Bell Media',
  //   'Papa Johns',
  //   'P&G',
  //   'ELC',
  //   'Questrade',
  //   'Amazon Games',
  //   'Personal'
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
      const summary = await fetchSheetData(
        `/api/google_sheets/summary?userId=${encodedUserId}`,
        'summary'
      )

      const nextAccounts = summary?.accounts ?? cachedData.accounts ?? cachedData.tamUnits ?? []
      const nextProjects = summary?.projects ?? cachedData.projects ?? []
      const nextTasks = summary?.tasks ?? cachedData.tasks ?? []

      setAccounts(nextAccounts)
      setProjects(nextProjects)
      setTasks(nextTasks)

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

      const nextAccounts = summary?.accounts ?? []
      const nextProjects = summary?.projects ?? []
      const nextTasks = summary?.tasks ?? []
      const nextUpdates = Array.isArray(updates) ? updates : []

      setAccounts(nextAccounts)
      setProjects(nextProjects)
      setTasks(nextTasks)

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
      setAccounts(cached.accounts || cached.tamUnits || [])
      setProjects(cached.projects || [])
      setTasks(cached.tasks || [])
    }

    if (cached && isCacheFresh(cached)) return
    loadData(userId, cached)
  }, [status, session?.user?.id])

  const toggleAccount = (accountId) => {
    setExpandedAccounts((prev) => ({
      ...prev,
      [accountId]: !prev[accountId]
    }))
  }

  const toggleProject = (projectId) => {
    setExpandedProjects((prev) => ({
      ...prev,
      [projectId]: !prev[projectId]
    }))
  }

  const getAccountProjects = (account) => {
    return projects.filter((project) => (project.accountId || project.tamUnitId) === account.id)
  }

  const getProjectTasks = (projectId) => {
    return tasks.filter((task) => task.projectId === projectId)
  }
  // const filteredAccounts = accounts
  //   .filter((account) => allowedAccounts.includes(account.accountName))
  //   .filter((account, index, list) => list.findIndex((item) => item.accountName === account.accountName) === index)

  // const handleCreateAccount = async () => {
  //   if (!newAccountName.trim() || !storageManager) return

  //   setIsCreatingAccount(true)
  //   try {
  //     const account = storageManager.createAccount(newAccountName.trim())
  //     await storageManager.saveAccount(account)
  //     setNewAccountName('')
  //     await loadData(storageManager)
  //   } catch (error) {
  //     console.error('Error creating account:', error)
  //     alert('Error creating account')
  //   } finally {
  //     setIsCreatingAccount(false)
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
              <Link href="/accounts" className="nav-link active">My Accounts</Link>
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
                  <h1>My Accounts</h1>
                  <p>See projects by account and roll up tasks under each project.</p>
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
                    {isRefreshing ? '↻' : '↻'}
                  </button>
                </div>
              </div>

              <section className="card">
                <div className="card-title">Accounts</div>
                <div className="card-list">
                  {accounts.map((account) => {
                    const accountProjects = getAccountProjects(account)
                    const accountName = account.accountName || account.name || 'Account'
                    return (
                      <div key={account.id} className="card-list-item">
                        <div className="disclosure-row">
                          <div>
                            <div className="card-item-title">{accountName}</div>
                            <div className="disclosure-meta">{accountProjects.length} projects</div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            onClick={() => toggleAccount(account.id)}
                          >
                            {expandedAccounts[account.id] ? 'Hide projects' : 'View projects'}
                          </button>
                        </div>
                        {expandedAccounts[account.id] && (
                          <div className="nested-list">
                            {accountProjects.length === 0 ? (
                              <div className="nested-item muted">No projects yet.</div>
                            ) : (
                              accountProjects.map((project) => {
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
            </div>

            {/* <section className="card">
              <div className="card-title">Add Account</div>
              <div className="form-row">
                <div className="form-group">
                  <label>New Account</label>
                  <input
                    type="text"
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    placeholder="Account name"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleCreateAccount}
                className="btn btn-secondary btn-xs"
                disabled={isCreatingAccount}
              >
                {isCreatingAccount ? 'Creating...' : 'Add Account'}
              </button>
            </section> */}
          </main>

          <footer className="footer">
            <div className="container">
              <p>&copy; 2026 TAM OS. All rights reserved.</p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}
