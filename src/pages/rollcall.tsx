import { Seo } from '../components/Seo'
import { seo } from '../seo'
import { LiveApp } from '../rollout/LiveApp'
export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <LiveApp />
    </>
  )
}
