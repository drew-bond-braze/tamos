import { useSession, signIn, signOut } from "next-auth/react"
import { useRouter } from "next/router"
import Link from "next/link"
import { useEffect } from "react"

export default function Home() {
  const { data: session, status } = useSession()
  const router = useRouter()

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
        <nav className="navbar">
          <div className="nav-container">
            <div className="nav-logo">
              <h1>TAMos</h1>
            </div>
          </div>
        </nav>
        <main className="main-content">
          <section className="hero">
            <div className="hero-content">
              <h1 className="hero-title">TAMos Client Health Monitoring</h1>
              <p className="hero-subtitle">Streamline your client health assessments with our comprehensive monitoring platform</p>
              <div className="hero-actions">
                <button 
                  onClick={async () => {
                    try {
                      await signIn('google', { callbackUrl: '/' })
                    } catch (error) {
                      console.error('Sign in error:', error)
                      alert('Error signing in. Please check the browser console for details.')
                    }
                  }} 
                  className="btn btn-primary"
                >
                  Sign in with Google
                </button>
              </div>
              <p style={{ marginTop: '20px', fontSize: '0.9rem', opacity: 0.8 }}>
                Access restricted to @braze.com email addresses
              </p>
            </div>
          </section>
        </main>
        <footer className="footer">
          <div className="container">
            <p>&copy; 2024 TAMos. All rights reserved.</p>
          </div>
        </footer>
      </div>
    )
  }

  // User is authenticated - show the app
  return (
    <div>
      <nav className="navbar">
        <div className="nav-container">
          <div className="nav-logo">
            <h1>TAMos</h1>
          </div>
          <div className="nav-menu">
            <Link href="/" className="nav-link active">Home</Link>
            <Link href="/form" className="nav-link">Submit Form</Link>
            <Link href="/review" className="nav-link">Review Forms</Link>
          </div>
          <div className="nav-user">
            <span className="user-email">{session.user?.email || session.user?.name}</span>
            <button 
              onClick={() => signOut({ callbackUrl: '/' })} 
              className="btn-logout"
              title="Sign out"
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      <main className="main-content">
        <section className="hero">
          <div className="hero-content">
            <h1 className="hero-title">TAMos Client Health Monitoring</h1>
            <p className="hero-subtitle">Streamline your client health assessments with our comprehensive monitoring platform</p>
            <div className="hero-actions">
              <Link href="/form" className="btn btn-primary">Start New Assessment</Link>
              <Link href="/review" className="btn btn-secondary">View Previous Forms</Link>
            </div>
          </div>
        </section>

        <section className="features">
          <div className="container">
            <h2 className="section-title">Key Features</h2>
            <div className="features-grid">
              <div className="feature-card">
                <div className="feature-icon">📋</div>
                <h3>Easy Form Submission</h3>
                <p>Quickly submit client health assessment forms with our intuitive interface.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">📊</div>
                <h3>Form Review Dashboard</h3>
                <p>Review and analyze previously submitted forms with our comprehensive dashboard.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">💾</div>
                <h3>Data Persistence</h3>
                <p>Your form data is securely stored locally and accessible anytime.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container">
          <p>&copy; 2024 TAMos. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

