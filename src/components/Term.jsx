import { GLOSSARY } from '../data/glossary.js'

/** Shows a word with a tooltip (hover, focus or tap) that explains it in plain language. */
export default function Term({ id, children }) {
  const g = GLOSSARY[id]
  if (!g) return <>{children}</>
  return (
    <span className="term" tabIndex={0} title={`${g.term}: ${g.text}`}>
      {children ?? g.term}
      <span className="term-text" role="tooltip">
        <strong>{g.term}.</strong> {g.text}
      </span>
    </span>
  )
}
