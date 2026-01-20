import { useSession, signOut } from "next-auth/react"
import Link from "next/link"
import Head from "next/head"
import { useEffect, useState } from "react"

let StorageManager = null
if (typeof window !== "undefined") {
  const StorageManagerModule = require("../lib/storage-manager")
  StorageManager = StorageManagerModule.default || StorageManagerModule.StorageManager || StorageManagerModule
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

  const allowedTamUnits = [
    'Bell Media',
    'Papa Johns',
    'P&G',
    'ELC',
    'Questrade',
    'Amazon Games',
    'Personal'
  ]

  useEffect(() => {
    if (typeof window !== "undefined" && StorageManager) {
      const sm = new StorageManager()
      setStorageManager(sm)
      loadData(sm)
    }
  }, [])

  const loadData = async (sm) => {
    try {
      const [tamUnitsData, projectsData, tasksData] = await Promise.all([
        sm.getTamUnits(),
        sm.getProjects(),
        sm.getTasks()
      ])
      setTamUnits(tamUnitsData)
      setProjects(projectsData)
      setTasks(tasksData)
    } catch (error) {
      console.error('Error loading data:', error)
    }
  }

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
    if (unit.name === 'Personal') {
      return projects.filter((project) => project.tamUnitId === unit.id)
    }
    return projects.filter((project) => project.tamUnitId === unit.id)
  }

  const getProjectTasks = (projectId) => {
    return tasks.filter((task) => task.projectId === projectId)
  }

  const filteredTamUnits = tamUnits
    .filter((unit) => allowedTamUnits.includes(unit.name))
    .filter((unit, index, list) => list.findIndex((item) => item.name === unit.name) === index)

  const handleCreateTamUnit = async () => {
    if (!newTamUnitName.trim() || !storageManager) return

    setIsCreatingTamUnit(true)
    try {
      const unit = storageManager.createTamUnit(newTamUnitName.trim())
      await storageManager.saveTamUnit(unit)
      setNewTamUnitName('')
      await loadData(storageManager)
    } catch (error) {
      console.error('Error creating TAM unit:', error)
      alert('Error creating TAM unit')
    } finally {
      setIsCreatingTamUnit(false)
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
              <Link href="/projects" className="nav-link">My Projects</Link>
              <Link href="/tam-units" className="nav-link active">My TAM Units</Link>
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
                <h1>My TAM Units</h1>
                <p>See projects by TAM unit and roll up tasks under each project.</p>
              </div>
            </div>

            <section className="card">
              <div className="card-title">TAM Units</div>
              <div className="card-list">
                {filteredTamUnits.map((unit) => {
                  const unitProjects = getUnitProjects(unit)
                  return (
                    <div key={unit.id} className="card-list-item">
                      <div className="disclosure-row">
                        <div>
                          <div className="card-item-title">{unit.name}</div>
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
                                            <span>{task.title}</span>
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

            <section className="card">
              <div className="card-title">Add TAM Unit</div>
              <div className="form-row">
                <div className="form-group">
                  <label>New TAM Unit</label>
                  <input
                    type="text"
                    value={newTamUnitName}
                    onChange={(e) => setNewTamUnitName(e.target.value)}
                    placeholder="TAM unit name"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleCreateTamUnit}
                className="btn btn-secondary btn-xs"
                disabled={isCreatingTamUnit}
              >
                {isCreatingTamUnit ? 'Creating...' : 'Add TAM Unit'}
              </button>
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
