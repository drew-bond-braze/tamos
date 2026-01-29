import { useSession, signIn, signOut } from "next-auth/react"
import { useRouter } from "next/router"
import Link from "next/link"
import Head from "next/head"
import { useEffect, useState } from "react"

export default function Home() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [accounts, setAccounts] = useState([])
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [updates, setUpdates] = useState([])
  const [isPageLoading, setIsPageLoading] = useState(true)

  const buildSheetCacheKey = (userId) => `tamos_sheet_cache_${userId}`

  const readSheetCache = (userId) => {
    if (typeof window === "undefined" || !userId) return null
    try {
      const cached = localStorage.getItem(buildSheetCacheKey(userId))
      return cached ? JSON.parse(cached) : null
    } catch (error) {
      console.error('Error reading dashboard cache:', error)
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
      console.error('Error writing dashboard cache:', error)
    }
  }

  const CACHE_TTL_MS = 10 * 60 * 1000

  const isCacheFresh = (cached) => {
    if (!cached?.cachedAt) return false
    const cachedAt = typeof cached.cachedAt === 'number' ? cached.cachedAt : Date.parse(cached.cachedAt)
    if (!Number.isFinite(cachedAt)) return false
    return Date.now() - cachedAt < CACHE_TTL_MS
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

  const normalizeUpdateRecord = (update, fallbackId) => {
    if (!update) return null
    const createdAt = update.createdAt || update.created_at || update.created || update.date
    return {
      id: update.id || fallbackId,
      taskId: update.taskId || update.task_id || null,
      accountId: update.accountId || update.account_id || null,
      projectId: update.projectId || update.project_id || null,
      userId: update.userId || update.user_id || null,
      userName: update.userName || update.user_name || update.author || update.userEmail || update.user_email || 'Unknown',
      author: update.author || update.userName || update.user_name || update.userEmail || update.user_email || 'Unknown',
      note: update.note || update.body || update.message || '',
      updateType: update.updateType || update.type || update.category || 'Update',
      body: update.body || update.note || '',
      statusAfter: update.statusAfter || update.status_after || null,
      createdAt: createdAt || new Date().toISOString(),
      updatedAt: update.updatedAt || update.updated_at || null
    }
  }

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
      const nextUpdates = Array.isArray(updates) ? updates.map((update, index) => normalizeUpdateRecord(update, `sheet-${index}`)).filter(Boolean) : []

      setAccounts(nextAccounts)
      setProjects(nextProjects)
      setTasks(nextTasks)
      setUpdates(nextUpdates)

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

    let isCancelled = false

    const run = async () => {
      setIsPageLoading(true)
      const cached = readSheetCache(userId)
      if (cached) {
        setAccounts(cached.accounts || cached.tamUnits || [])
        setProjects(cached.projects || [])
        setTasks((cached.tasks || []).map(normalizeTaskRecord).filter(Boolean))
        setUpdates((cached.updates || []).map((update, index) => normalizeUpdateRecord(update, `cached-${index}`)).filter(Boolean))
      }

      const skipSheetFetch = Boolean(cached && isCacheFresh(cached))
      try {
        if (!skipSheetFetch) {
          const encodedUserId = encodeURIComponent(userId)
          const [summary, updatesResponse] = await Promise.all([
            fetchSheetData(`/api/google_sheets/summary?userId=${encodedUserId}`, 'summary'),
            fetchSheetData(`/api/google_sheets/updates?userId=${encodedUserId}`, 'updates')
          ])

          if (summary) {
            const nextAccounts = summary?.accounts ?? []
            const nextProjects = summary?.projects ?? []
            const nextTasks = (summary?.tasks ?? []).map(normalizeTaskRecord).filter(Boolean)
            const nextUpdates = Array.isArray(updatesResponse)
              ? updatesResponse.map((update, index) => normalizeUpdateRecord(update, `sheet-${index}`)).filter(Boolean)
              : []

            if (!isCancelled) {
              setAccounts(nextAccounts)
              setProjects(nextProjects)
              setTasks(nextTasks)
              setUpdates(nextUpdates)
            }

            writeSheetCache(userId, {
              accounts: nextAccounts,
              projects: nextProjects,
              tasks: nextTasks,
              updates: nextUpdates
            })
          }
        }
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
  }, [status, session?.user?.id])

  if (status === "loading") {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p>Loading...</p>
      </div>
    )
  }

  if (!session) {
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
                <h1>TAMos</h1>
              </div>
            </div>
          </nav>
          <div className="app-main">
            <div className="page-topbar">
              <button 
                onClick={async () => {
                  try {
                    await signIn('google', { callbackUrl: '/' })
                  } catch (error) {
                    console.error('Sign in error:', error)
                    alert('Error signing in. Please check the browser console for details.')
                  }
                }} 
                className="btn btn-secondary auth-button"
              >
                Sign in
              </button>
            </div>
            <main className="main-content">
              <section className="hero">
                <div className="hero-content">
                  <h1 className="hero-title">TAM OS Task Tracker</h1>
                  <p className="hero-subtitle">Track tasks and projects per client. Keep managers informed and ownership clear.</p>
                  <p style={{ marginTop: '20px', fontSize: '0.9rem', opacity: 0.8 }}>
                    Access restricted to @braze.com email addresses
                  </p>
                </div>
              </section>
            </main>
            <footer className="footer">
              <div className="container">
                <p>&copy; 2026 TAMos. All rights reserved.</p>
              </div>
            </footer>
          </div>
        </div>
      </div>
    )
  }

  if (isPageLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p>Loading dashboard...</p>
      </div>
    )
  }

  const now = new Date()
  const getDateValue = (value) => {
    if (!value) return null
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const getTaskDueDate = (task) => getDateValue(task?.dueDate || task?.dueAt || task?.date || task?.targetDate)
  const getProjectDueDate = (project) => getDateValue(project?.dueDate || project?.dueAt || project?.date || project?.targetDate)

  const isTaskComplete = (task) => {
    if (typeof task?.completed === 'boolean') return task.completed
    return task?.status === 'Done'
  }

  const getRelativeDueLabel = (date) => {
    if (!date) return 'No due date'
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfDue = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const diffDays = Math.round((startOfDue - startOfToday) / (24 * 60 * 60 * 1000))
    if (diffDays === 0) return 'Due today'
    if (diffDays === 1) return 'Due tomorrow'
    if (diffDays < 0) return `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'}`
    if (diffDays < 7) return `Due in ${diffDays} day${diffDays === 1 ? '' : 's'}`
    const weeks = Math.round(diffDays / 7)
    return `Due in ${weeks} week${weeks === 1 ? '' : 's'}`
  }

  const formatRelativeTime = (value) => {
    if (!value) return 'just now'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'just now'
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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

  const tasksWithDueDates = tasks
    .map(normalizeTaskRecord)
    .filter((task) => getTaskDueDate(task))

  const upcomingDeadlines = [
    ...projects
      .map((project) => ({
        id: project.id,
        type: 'Project',
        title: project.name || project.projectName || 'Untitled project',
        dueDate: getProjectDueDate(project)
      }))
      .filter((item) => item.dueDate),
    ...tasksWithDueDates.map((task) => ({
      id: task.id,
      type: 'Task',
      title: task.title || task.name || 'Untitled task',
      dueDate: getTaskDueDate(task)
    }))
  ]
    .filter((item) => item.dueDate)
    .sort((a, b) => a.dueDate - b.dueDate)
    .slice(0, 3)

  const focusTasks = tasks
    .map(normalizeTaskRecord)
    .filter((task) => !isTaskComplete(task))
    .sort((a, b) => {
      const aDate = getTaskDueDate(a)
      const bDate = getTaskDueDate(b)
      if (aDate && bDate) return aDate - bDate
      if (aDate) return -1
      if (bDate) return 1
      return 0
    })
    .slice(0, 4)

  const tasksDueToday = tasks
    .map(normalizeTaskRecord)
    .filter((task) => {
      const dueDate = getTaskDueDate(task)
      if (!dueDate) return false
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const startOfDue = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
      return startOfDue.getTime() === startOfToday.getTime()
    })

  const getAccountName = (accountId) => {
    if (!accountId) return 'Personal'
    const account = accounts.find((unit) => unit.id === accountId)
    return account?.accountName || account?.name || 'Unknown Account'
  }

  const accountProjectsMap = projects.reduce((acc, project) => {
    const accountId = project.accountId || project.tamUnitId
    if (!accountId) return acc
    acc[accountId] = acc[accountId] ? [...acc[accountId], project] : [project]
    return acc
  }, {})

  const getAccountStatus = (accountId) => {
    const accountTasks = tasks
      .map(normalizeTaskRecord)
      .filter((task) => (task.accountId || task.tamUnitId) === accountId)
      .filter((task) => !isTaskComplete(task))

    const hasOverdue = accountTasks.some((task) => {
      const dueDate = getTaskDueDate(task)
      return dueDate && dueDate < now
    })
    if (hasOverdue) return { label: 'At Risk', className: 'danger' }

    const needsAttention = accountTasks.some((task) => {
      const dueDate = getTaskDueDate(task)
      if (dueDate) {
        const diffDays = Math.floor((dueDate - now) / (24 * 60 * 60 * 1000))
        if (diffDays <= 7) return true
      }
      const status = String(task.status || '').toLowerCase()
      return status.includes('blocked')
    })
    if (needsAttention) return { label: 'Needs Attention', className: 'warning' }

    return { label: 'On Track', className: 'success' }
  }

  const accountCards = accounts.map((account) => {
    const accountId = account.id
    const accountName = account.accountName || account.name || 'Account'
    const projectsForAccount = accountProjectsMap[accountId] || []
    const status = getAccountStatus(accountId)

    return {
      id: accountId,
      name: accountName,
      projectCount: projectsForAccount.length,
      status
    }
  })

  const recentTasks = tasks
    .map(normalizeTaskRecord)
    .filter(Boolean)
    .slice(0, 4)

  const riskProjects = projects.filter((project) => {
    const status = String(project.status || project.health || project.healthStatus || project.risk || '').toLowerCase()
    return status.includes('risk') || status.includes('blocked') || status.includes('attention')
  })

  // User is authenticated - show the app
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
              <h1>TAMos</h1>
            </div>
            <div className="nav-menu">
              <Link href="/" className="nav-link active">My Dashboard</Link>
              <Link href="/tasks" className="nav-link">My Tasks</Link>
              <Link href="/projects" className="nav-link">My Projects</Link>
              <Link href="/accounts" className="nav-link">My Accounts</Link>
              <Link href="/my-ics" className="nav-link">My Team</Link>
            </div>
          </div>
        </nav>

        <div className="app-main">
          <main className="main-content">
            <div className="page-container">
              <div className="page-actions">
                <div className="dashboard-user">
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
                  <span>{session.user?.name || session.user?.email}</span>
                  <div className="avatar">{(session.user?.name || 'U').charAt(0)}</div>
                  <button
                    onClick={() => signOut({ callbackUrl: '/' })}
                    className="btn btn-secondary auth-button"
                  >
                    Sign out
                  </button>
                </div>
              </div>
              <div className="dashboard-header">
                <div>
                  <h1>Welcome back, {session.user?.name || 'there'}</h1>
                  <p>You have {tasksDueToday.length} tasks due today and {riskProjects.length} projects at risk.</p>
                </div>
              </div>

              <div className="dashboard-section">
                <section className="card">
                  <div className="card-title">Upcoming Deadlines</div>
                  <div className="card-list card-list-row">
                    {upcomingDeadlines.length === 0 ? (
                      <div className="card-list-item">
                        <div className="card-item-title">No upcoming deadlines</div>
                        <div className="card-item-subtitle">Add due dates to see them here.</div>
                      </div>
                    ) : (
                      upcomingDeadlines.map((item) => (
                        <div key={`${item.type}-${item.id}`} className="card-list-item">
                          <div className="card-item-title">{item.title}</div>
                          <div className="card-item-subtitle">{item.type} {getRelativeDueLabel(item.dueDate)}</div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>

              <div className="dashboard-section">
                <section className="card">
                  <div className="card-title">Today's Focus</div>
                  <div className="focus-list">
                    {focusTasks.length === 0 ? (
                      <div className="card-list-item">No tasks to focus on right now.</div>
                    ) : (
                      focusTasks.map((task) => {
                        const dueDate = getTaskDueDate(task)
                        const dueLabel = getRelativeDueLabel(dueDate)
                        const isToday = dueLabel === 'Due today'
                        const isTomorrow = dueLabel === 'Due tomorrow'
                        const pillClass = isToday ? 'danger' : isTomorrow ? 'neutral' : 'warning'
                        return (
                          <label key={task.id} className="focus-item">
                            <input type="checkbox" checked={Boolean(task.completed)} readOnly />
                            <span>{task.title || task.name || 'Untitled task'}</span>
                            <span className={`pill ${pillClass}`}>{dueLabel}</span>
                          </label>
                        )
                      })
                    )}
                  </div>
                </section>
              </div>

              <div className="dashboard-grid">
                <section className="card card-wide">
                  <div className="card-title">My Accounts</div>
                  <div className="units-grid">
                    {accountCards.length === 0 ? (
                      <div className="unit-card">
                        <div>
                          <div className="card-item-title">No accounts yet</div>
                          <div className="card-item-subtitle">Create an account to get started.</div>
                        </div>
                      </div>
                    ) : (
                      accountCards.map((account) => (
                        <div key={account.id} className="unit-card">
                          <div>
                            <div className="card-item-title">{account.name}</div>
                            <div className="card-item-subtitle">
                              {account.projectCount} Active Project{account.projectCount === 1 ? '' : 's'}
                            </div>
                          </div>
                          <span className={`pill ${account.status.className}`}>{account.status.label}</span>
                        </div>
                      ))
                    )}
                  </div>
                </section>
                <section className="card">
                  <div className="card-title">Recent Activity</div>
                  <div className="card-list">
                    {recentTasks.length === 0 ? (
                      <div className="card-list-item">No recent activity yet.</div>
                    ) : (
                      recentTasks.map((task) => (
                        <div key={task.id} className="card-list-item">
                          {task.title || task.name || 'Untitled task'}
                          <span className="muted"> {task.status || '—'}</span>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            </div>
          </main>

          <footer className="footer">
            <div className="container">
              <p>&copy; 2026 TAMos. All rights reserved.</p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}

