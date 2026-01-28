import { useSession, signIn, signOut } from "next-auth/react"
import { useRouter } from "next/router"
import Link from "next/link"
import Head from "next/head"
import { useEffect, useState } from "react"

export default function Home() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const buildSheetCacheKey = (userId) => `tamos_sheet_cache_${userId}`

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

      writeSheetCache(userId, {
        accounts: summary?.accounts ?? [],
        projects: summary?.projects ?? [],
        tasks: summary?.tasks ?? [],
        updates: Array.isArray(updates) ? updates : []
      })
    } catch (error) {
      console.error('Error refreshing sheet data:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    if (status === "authenticated" && session) {
      // User is signed in, they can access the app
    }
  }, [status, session])

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
              <Link href="/my-ics" className="nav-link">My Team</Link>
              <Link href="/accounts" className="nav-link">My Accounts</Link>
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
                  <p>You have 3 tasks due today and 2 projects at risk.</p>
                </div>
              </div>

              <div className="dashboard-section">
                <section className="card">
                  <div className="card-title">Upcoming Deadlines</div>
                  <div className="card-list card-list-row">
                    <div className="card-list-item">
                      <div className="card-item-title">Yum! US QBR</div>
                      <div className="card-item-subtitle">Project due in 1 week</div>
                    </div>
                    <div className="card-list-item">
                      <div className="card-item-title">Walmart Onboarding</div>
                      <div className="card-item-subtitle">Project due in 2 weeks</div>
                    </div>
                    <div className="card-list-item">
                      <div className="card-item-title">Taco Bell Renewal</div>
                      <div className="card-item-subtitle">Project due in 3 weeks</div>
                    </div>
                  </div>
                </section>
              </div>

              <div className="dashboard-section">
                <section className="card">
                  <div className="card-title">Today's Focus</div>
                  <div className="focus-list">
                    <label className="focus-item">
                      <input type="checkbox" />
                      <span>Finalize Q3 Business Review deck for Yum! US</span>
                      <span className="pill danger">Due Today</span>
                    </label>
                    <label className="focus-item">
                      <input type="checkbox" />
                      <span>Send follow-up email to Walmart stakeholders</span>
                      <span className="pill danger">Due Today</span>
                    </label>
                    <label className="focus-item">
                      <input type="checkbox" />
                      <span>Prepare agenda for Spark Driver sync</span>
                      <span className="pill danger">Due Today</span>
                    </label>
                    <label className="focus-item">
                      <input type="checkbox" />
                      <span>Review BEES Global usage data</span>
                      <span className="pill neutral">Due Tomorrow</span>
                    </label>
                  </div>
                </section>
              </div>

              <div className="dashboard-grid">
                <section className="card card-wide">
                  <div className="card-title">My Accounts</div>
                  <div className="units-grid">
                    <div className="unit-card">
                      <div>
                        <div className="card-item-title">Spark Driver</div>
                        <div className="card-item-subtitle">4 Active Projects</div>
                      </div>
                      <span className="pill danger">At Risk</span>
                    </div>
                    <div className="unit-card">
                      <div>
                        <div className="card-item-title">Walmart</div>
                        <div className="card-item-subtitle">2 Active Projects</div>
                      </div>
                      <span className="pill warning">Needs Attention</span>
                    </div>
                    <div className="unit-card">
                      <div>
                        <div className="card-item-title">BEES Global</div>
                        <div className="card-item-subtitle">3 Active Projects</div>
                      </div>
                      <span className="pill success">On Track</span>
                    </div>
                    <div className="unit-card">
                      <div>
                        <div className="card-item-title">Yum! US</div>
                        <div className="card-item-subtitle">1 Active Project</div>
                      </div>
                      <span className="pill success">On Track</span>
                    </div>
                  </div>
                </section>
                <section className="card">
                  <div className="card-title">Recent Activity</div>
                  <div className="card-list">
                    <div className="card-list-item">Sara assigned Bundle "TAM Sidecar(e) Kirat" <span className="muted">Just now</span></div>
                    <div className="card-list-item">You completed task "Send follow-up to Taco Bell" <span className="muted">2h ago</span></div>
                    <div className="card-list-item">You added a new note to "Yum! US" <span className="muted">Yesterday</span></div>
                    <div className="card-list-item">You updated the status of "Spark Driver" to At Risk <span className="muted">Yesterday</span></div>
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

