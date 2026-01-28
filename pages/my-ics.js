import { useSession, signOut } from "next-auth/react"
import Link from "next/link"
import Head from "next/head"
import { useMemo, useState } from "react"

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

  const visibleIcs = useMemo(() => {
    if (selectedIc === "all") return icProfiles
    return icProfiles.filter((ic) => ic.id === selectedIc)
  }, [selectedIc])

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
              <Link href="/my-ics" className="nav-link active">My Team</Link>
              <Link href="/accounts" className="nav-link">My Accounts</Link>
            </div>
          </div>
        </nav>

        <div className="app-main">
          <main className="main-content">
            <div className="page-container">
              <div className="page-actions">
                <div className="dashboard-user">
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
                <div className="filter-tabs ic-tabs">
                  <button
                    className={selectedIc === "all" ? "filter-tab active" : "filter-tab"}
                    onClick={() => setSelectedIc("all")}
                  >
                    All Team Members
                  </button>
                  {icProfiles.map((ic) => (
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
                        <details className="ic-disclosure">
                          <summary>
                            <span>TAM Units</span>
                            <span className="disclosure-meta">{ic.tamUnits.length} total</span>
                          </summary>
                          <div className="nested-list">
                            {ic.tamUnits.map((unit) => (
                              <div key={unit.name} className="nested-item">
                                <div className="card-item-title">{unit.name}</div>
                                <div className="card-item-subtitle">{unit.status}</div>
                              </div>
                            ))}
                          </div>
                        </details>
                      </div>

                      <div className="ic-section">
                        <details className="ic-disclosure">
                          <summary>
                            <span>Projects</span>
                            <span className="disclosure-meta">{ic.projects.length} total</span>
                          </summary>
                          <div className="nested-list">
                            {ic.projects.map((project) => (
                              <div key={project.name} className="nested-item">
                                <div className="card-item-title">{project.name}</div>
                                <div className="card-item-subtitle">{project.status}</div>
                              </div>
                            ))}
                          </div>
                        </details>
                      </div>

                      <div className="ic-section">
                        <details className="ic-disclosure">
                          <summary>
                            <span>Tasks</span>
                            <span className="disclosure-meta">{ic.tasks.length} total</span>
                          </summary>
                          <div className="nested-list">
                            {ic.tasks.map((task) => (
                              <div key={task} className="nested-item">{task}</div>
                            ))}
                          </div>
                        </details>
                      </div>
                    </div>
                  ))}
                </div>
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
