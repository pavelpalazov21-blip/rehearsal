import { useSearchParams } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { seo } from '../seo'
import { LiveApp } from '../rollout/LiveApp'
import '../rehearsal/studio-theme.css'
export default function Landing() {
  const [params] = useSearchParams()
  if (params.has('space')) return <LiveApp />
  return (
    <main className="rh-app rh-landing">
      <Seo {...seo} path="/" />
      <section className="rh-intro">
        <div className="rh-kicker">REHEARSAL / INCIDENT STUDIO</div>
        <h1>
          Checkout is failing.
          <br />
          <em>Can your team fix it?</em>
        </h1>
        <p>
          Practice a software outage with two teammates or on your own.
          Investigate logs, repair JavaScript, and prove the fix works before
          the commander approves it.
        </p>
        <div className="rh-landing-links">
          <a className="rh-primary" href="/rehearsal-studio">
            Open the incident studio →
          </a>
          <a href="/rehearsal-source/">Read the source and tests</a>
        </div>
        <aside>
          <strong>First drill · Checkout retries</strong>
          <p>
            A customer pays once, but a timeout triggers another attempt. Which
            requests should the system retry?
          </p>
        </aside>
      </section>
    </main>
  )
}
