import { kindGroup } from './placeSearchUtils.js'

// Simple line icons (24 x 24). The icon follows the kind of place, like in map apps.
const PATHS = {
  shop: 'M6 8h12l-1 11H7L6 8z M9 8V6a3 3 0 016 0v2',
  worship: 'M12 3l7 6v11H5V9l7-6z M10 20v-5h4v5',
  school: 'M3 9l9-4 9 4-9 4-9-4z M7 11v4c0 1.5 2.5 3 5 3s5-1.5 5-3v-4',
  health: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6V4z',
  transport: 'M5 5h14v11H5z M5 12h14 M8 19v-3 M16 19v-3',
  food: 'M7 4v7 M5 4v4a2 2 0 004 0V4 M7 11v9 M16 4c-2 1-3 3-3 6h3v10',
  nature: 'M5 19c0-8 5-13 14-14 0 9-5 14-14 14z M5 19l7-7',
  farm: 'M5 19c0-8 5-13 14-14 0 9-5 14-14 14z M5 19l7-7',
  place: 'M12 21s-6-5.5-6-10a6 6 0 0112 0c0 4.5-6 10-6 10z',
  other: 'M12 8a4 4 0 100 8 4 4 0 000-8z',
}

export default function KindIcon({ kind, locate = false }) {
  if (locate) {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4" /><path d="M12 2v3 M12 19v3 M2 12h3 M19 12h3" />
      </svg>
    )
  }
  const g = kindGroup(kind)
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[g]} />
      {g === 'place' && <circle cx="12" cy="11" r="2" />}
    </svg>
  )
}
