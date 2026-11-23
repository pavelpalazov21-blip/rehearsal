export interface ReleaseListing {
  commit: string
  origin: string
  files: { label: string; path: string; content: string }[]
}

export function ReleasedSource({ release }: { release: ReleaseListing }) {
  return (
    <div className="source-review">
      <style>{sourceStyles}</style>
      <nav aria-label="Source navigation">
        <div>Rehearsal</div>
      </nav>
      <main>
        <a href="/">Open Rehearsal</a>
        <h1>Source code</h1>
        <p>
          Code for revision <code>{release.commit.slice(0, 12)}</code> of
          Rehearsal.
        </p>
        <a className="download" href="/release-source/rehearsal.zip" download>
          Download source ZIP
        </a>
        <h2>Clone the read-only repository</h2>
        <pre>
          <code>git clone {release.origin}/release-source/git rehearsal</code>
        </pre>
        <h2>Browse the code</h2>
        {release.files.map((file) => (
          <details key={file.path}>
            <summary>
              {file.label} <span>{file.path}</span>
            </summary>
            <pre>
              <code>{file.content}</code>
            </pre>
          </details>
        ))}
      </main>
    </div>
  )
}

const sourceStyles = `*{box-sizing:border-box}body,.source-review{margin:0;background:#0c1010;color:#eef2ec;font:16px/1.5 Inter,Arial,sans-serif}nav{background:#172018;color:#d2f1a5}nav div,main{max-width:930px;margin:auto;padding:17px max(20px,4vw)}nav div{font-size:20px;font-weight:700}main{padding-block:34px 70px}h1{font-size:clamp(2.4rem,7vw,3.8rem);line-height:1.06;letter-spacing:-.065em;margin:14px 0}h2{font-size:1.1rem;margin-top:29px}a{color:#c2ed91;text-underline-offset:3px}p{margin:10px 0;color:#b4c2bb}code{font: .88em/1.5 ui-monospace,monospace}pre{background:#101614;color:#dce7df;padding:12px;border-radius:5px;overflow:auto}details{background:#171f1a;border:1px solid #39483d;border-radius:6px;margin:7px 0;padding:11px 15px;min-width:0}summary{cursor:pointer;font-weight:650;overflow-wrap:anywhere}summary span{color:#adbcaf;font: .78em ui-monospace,monospace;margin-left:8px}.download{display:inline-block;background:#b8f36c;color:#15200f;font-weight:650;text-decoration:none;border-radius:5px;padding:8px 14px;margin:6px 0}`
