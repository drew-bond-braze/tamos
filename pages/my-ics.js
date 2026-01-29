import { useSession, signOut } from "next-auth/react"
import Link from "next/link"
import Head from "next/head"
import { useEffect, useMemo, useState } from "react"

const icProfiles = [
  {
    id: "drew",
    name: "Drew",
    summary: "3 TAM units • 4 projects • 6 tasks",
    tamUnits: [
      { name: "Spark Driver", status: "At Risk" },
      { name: "Walmart", status: "Needs Attention" },
      { name: "Yum! US", status: "On Track" }
    ],
    projects: [
      { name: "Yum! US QBR", status: "Due in 1 week" },
      { name: "Walmart Onboarding", status: "Due in 2 weeks" },
      { name: "Spark Driver Renewal", status: "Planning" },
      { name: "Walmart Metrics Review", status: "In Progress" }
    ],
    tasks: [
      "Finalize Q3 Business Review deck",
      "Send follow-up email to Walmart stakeholders",
      "Prepare agenda for Spark Driver sync",
      "Draft renewal notes for Yum! US",
      "Review onboarding checklist",
      "Update Spark Driver success plan"
    ]
  },
  {
    id: "laura",
    name: "Laura",
    summary: "2 TAM units • 3 projects • 5 tasks",
    tamUnits: [
      { name: "BEES Global", status: "On Track" },
      { name: "Taco Bell", status: "Needs Attention" }
    ],
    projects: [
      { name: "BEES Global Expansion", status: "In Progress" },
      { name: "Taco Bell Renewal", status: "Due in 3 weeks" },
      { name: "BEES Adoption Playbook", status: "Planning" }
    ],
    tasks: [
      "Coordinate BEES training session",
      "Draft renewal analysis for Taco Bell",
      "Align on BEES metrics dashboard",
      "Confirm executive sponsor check-in",
      "Update project status notes"
    ]
  },
  {
    id: "john",
    name: "John",
    summary: "2 TAM units • 2 projects • 4 tasks",
    tamUnits: [
      { name: "Amazon Games", status: "At Risk" },
      { name: "P&G", status: "On Track" }
    ],
    projects: [
      { name: "Amazon Games Integration", status: "At Risk" },
      { name: "P&G Health Check", status: "In Progress" }
    ],
    tasks: [
      "Draft integration timeline",
      "Compile health scorecards",
      "Confirm blockers with Amazon Games",
      "Schedule P&G QBR planning"
    ]
  }
]

export default function MyICs() {
  const { data: session, status } = useSession()
  const [selectedIc, setSelectedIc] = useState("all")
  const [teamProfiles, setTeamProfiles] = useState([])
  const [isTeamLoading, setIsTeamLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [teamError, setTeamError] = useState(null)

  const isUpcomingWithinTwoWeeks = (value) => {
    if (!value) return false
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return false
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endOfWindow = new Date(startOfToday.getTime() + 14 * 24 * 60 * 60 * 1000)
    return date >= startOfToday && date <= endOfWindow
  }

  const getDueDateValue = (record) => (
    record?.dueAt ||
    record?.due_at ||
    record?.dueDate ||
    record?.date ||
    record?.targetDate ||
    record?.targetdate ||
    null
  )

  const formatDueInDays = (value) => {
    if (!value) return null
    const dueDate = new Date(value)
    if (Number.isNaN(dueDate.getTime())) return null
    const now = new Date()
    const msDiff = dueDate.getTime() - now.getTime()
    const dayMs = 24 * 60 * 60 * 1000
    const days = Math.ceil(msDiff / dayMs)
    if (days <= 0) return 'Due today'
    return `Due in ${days} day${days === 1 ? '' : 's'}`
  }

  const visibleIcs = useMemo(() => {
    if (selectedIc === "all") return teamProfiles
    return teamProfiles.filter((ic) => ic.id === selectedIc)
  }, [selectedIc, teamProfiles])

  const loadTeamProfiles = async ({ force = false, useLoading = false } = {}) => {
    if (status !== "authenticated") return

    let isCancelled = false

    const buildUserName = (user) => {
      const fullName = user.fullName || user.full_name || ''
      if (fullName) return fullName
      const firstName = user.firstName || user.first_name || ''
      const lastName = user.lastName || user.last_name || ''
      const combined = `${firstName} ${lastName}`.trim()
      if (combined) return combined
      return user.email || user.email_address || 'Unknown'
    }

    const buildSummary = (accounts = [], projects = [], tasks = []) => (
      `${accounts.length} TAM units • ${projects.length} projects • ${tasks.length} tasks`
    )

    const normalizeProject = (project) => {
      if (!project) return null
      const accountId = project.accountId || project.tamUnitId || project.account_id
      return {
        ...project,
        accountId,
        name: project.name || project.projectName || 'Project',
        status: project.status || project.health || project.healthStatus || '—'
      }
    }

    const normalizeTask = (task) => {
      if (!task) return null
      const accountId = task.accountId || task.tamUnitId || task.account_id
      const projectId = task.projectId || task.project_id || task.projectID || task.project
      return {
        ...task,
        accountId,
        projectId,
        title: task.title || task.name || task.taskName || task.summary || 'Untitled task',
        status: task.status || task.state || '—'
      }
    }

    const buildProfile = (user, summary) => {
      const accounts = summary?.accounts ?? []
      const projects = (summary?.projects ?? []).map(normalizeProject).filter(Boolean)
      const tasks = (summary?.tasks ?? []).map(normalizeTask).filter(Boolean)

      return {
        id: user.id || user.user_id || user.userId || user.email || user.email_address,
        name: buildUserName(user),
        summary: buildSummary(accounts, projects, tasks),
        tamUnits: accounts.map((account) => ({
          id: account.id,
          name: account.accountName || account.name || 'Account',
          status: account.status || account.health || account.healthStatus || '—',
          projects: projects.filter((project) => project.accountId === account.id),
          tasks: tasks.filter((task) => task.accountId === account.id)
        }))
      }
    }

    if (useLoading) {
      setIsTeamLoading(true)
    } else {
      setIsRefreshing(true)
    }
    setTeamError(null)

    try {
      const usersResponse = await fetch('/api/google_sheets/users?testManager=test_ic', { method: 'GET' })
      if (!usersResponse.ok) {
        throw new Error('Failed to load team users')
      }
      const users = await usersResponse.json()
      const normalizedUsers = Array.isArray(users) ? users : []

      const profiles = await Promise.all(
        normalizedUsers.map(async (user) => {
          const userId = user.id || user.user_id || user.userId || user.email || user.email_address
          if (!userId) {
            return buildProfile(user, null)
          }
          const summaryResponse = await fetch(
            `/api/google_sheets/summary?userId=${encodeURIComponent(userId)}${force ? '&force=1' : ''}`,
            { method: 'GET' }
          )
          const summary = summaryResponse.ok ? await summaryResponse.json() : null
          return buildProfile(user, summary)
        })
      )

      if (!isCancelled) {
        setTeamProfiles(profiles)
      }
    } catch (error) {
      console.error('Error loading team data:', error)
      if (!isCancelled) {
        setTeamError('Unable to load team members.')
        setTeamProfiles([])
      }
    } finally {
      if (!isCancelled) {
        setIsTeamLoading(false)
        setIsRefreshing(false)
      }
    }

    return () => {
      isCancelled = true
    }
  }

  useEffect(() => {
    if (status !== "authenticated") return
    loadTeamProfiles({ useLoading: true })
  }, [status])

  if (status === "loading") {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <p>Loading...</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
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
              <h1>TAMos</h1>
            </div>
            <div className="nav-menu">
              <Link href="/" className="nav-link">My Dashboard</Link>
              <Link href="/tasks" className="nav-link">My Tasks</Link>
              <Link href="/projects" className="nav-link">My Projects</Link>
              <Link href="/accounts" className="nav-link">My Accounts</Link>
              <Link href="/my-ics" className="nav-link active">My Team</Link>
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
                    onClick={() => loadTeamProfiles({ force: true })}
                    disabled={isRefreshing || isTeamLoading}
                    aria-label="Refresh from Google Sheets"
                    title="Refresh"
                  >
                    ↻
                  </button>
                  <span>{session.user?.name || session.user?.email}</span>
                  <div className="avatar">{(session.user?.name || 'U').charAt(0)}</div>
                  <button
                    onClick={() => signOut({ callbackUrl: "/" })}
                    className="btn btn-secondary auth-button"
                  >
                    Sign out
                  </button>
                </div>
              </div>
              <div className="dashboard-header">
                <div>
                  <h1>My Team</h1>
                  <p>View each team member and drill into their accounts, projects, and tasks.</p>
                </div>
              </div>

              <section className="card">
                <div className="card-title">Team Overview</div>
                {isTeamLoading && (
                  <div className="card-list-item">Loading team members...</div>
                )}
                {!isTeamLoading && teamError && (
                  <div className="card-list-item">{teamError}</div>
                )}
                {!isTeamLoading && !teamError && (
                  <>
                    <div className="filter-tabs ic-tabs">
                      <button
                        className={selectedIc === "all" ? "filter-tab active" : "filter-tab"}
                        onClick={() => setSelectedIc("all")}
                      >
                        All Team Members
                      </button>
                      {teamProfiles.map((ic) => (
                        <button
                          key={ic.id}
                          className={selectedIc === ic.id ? "filter-tab active" : "filter-tab"}
                          onClick={() => setSelectedIc(ic.id)}
                        >
                          {ic.name}
                        </button>
                      ))}
                    </div>

                    <div className="ic-grid">
                      {visibleIcs.map((ic) => (
                        <div key={ic.id} className="card ic-card">
                          <div className="ic-header">
                            <div>
                              <div className="card-item-title">{ic.name}</div>
                              <div className="card-item-subtitle">{ic.summary}</div>
                            </div>
                            <span className="pill neutral">IC</span>
                          </div>

                      <div className="ic-section">
                        <div className="disclosure-meta">TAM Units • {ic.tamUnits.length} total</div>
                        <div className="nested-list" style={{ marginTop: '10px' }}>
                          {ic.tamUnits.map((unit) => (
                            <details key={unit.id || unit.name} className="ic-disclosure">
                              <summary className="ic-disclosure-summary-left">
                                <span>{unit.name}</span>
                                {(() => {
                                  const unitProjects = unit.projects || []
                                  const unitTasks = unit.tasks || []
                                  const upcomingTaskCount = unitTasks.filter((task) =>
                                    isUpcomingWithinTwoWeeks(getDueDateValue(task))
                                  ).length
                                  return (
                                    <>
                                      <span className="pill neutral">
                                        {upcomingTaskCount} tasks upcoming
                                      </span>
                                    </>
                                  )
                                })()}
                              </summary>
                              {(() => {
                                const unitProjects = unit.projects || []
                                const unitTasks = unit.tasks || []
                                const upcomingProjectTaskCount = (projectId) => (
                                  unitTasks.filter(
                                    (task) =>
                                      task.projectId === projectId &&
                                      isUpcomingWithinTwoWeeks(getDueDateValue(task))
                                  ).length
                                )
                                const unitUpcomingTasks = unitTasks.filter((task) =>
                                  isUpcomingWithinTwoWeeks(getDueDateValue(task))
                                ).length
                                return (
                                  <>
                              <div className="nested-list">
                                <details className="ic-disclosure">
                                  <summary>
                                    <span>Projects</span>
                                    <span className="disclosure-meta"> - {unitProjects.length} total</span>
                                    <span className="pill neutral">{unitUpcomingTasks} tasks upcoming</span>
                                  </summary>
                                  {unitProjects.length === 0 ? (
                                    <div className="nested-item muted">No projects yet.</div>
                                  ) : (
                                    unitProjects.map((project) => {
                                      const projectTasks = unitTasks.filter(
                                        (task) => task.projectId && task.projectId === project.id
                                      )
                                      const projectUpcomingTasks = upcomingProjectTaskCount(project.id)
                                      return (
                                        <div key={project.id || project.name} className="nested-item">
                                          <div className="card-item-title">{project.name}</div>
                                          <div className="card-item-subtitle">
                                            {project.status}
                                            {(() => {
                                              const dueLabel = formatDueInDays(getDueDateValue(project))
                                              return dueLabel ? ` - ${dueLabel}` : ''
                                            })()}
                                          </div>
                                          <div className="disclosure-meta" style={{ marginTop: '4px' }}>
                                            {projectUpcomingTasks} tasks upcoming
                                          </div>
                                          {projectTasks.length > 0 && (
                                            <div className="nested-list" style={{ marginTop: '8px' }}>
                                              {projectTasks.map((task) => (
                                                <div key={task.id || task.title} className="nested-item">
                                                  <span>{task.title}</span>
                                                  <span className="muted">
                                                    {' '} - {task.status}
                                                    {(() => {
                                                      const dueLabel = formatDueInDays(getDueDateValue(task))
                                                      return dueLabel ? ` - ${dueLabel}` : ''
                                                    })()}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      )
                                    })
                                  )}
                                </details>
                              </div>
                                  </>
                                )
                              })()}
                            </details>
                          ))}
                        </div>
                      </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>
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
