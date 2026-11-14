// App defaults. No farm or location is pre-selected: the user always chooses their own.
export const DEFAULT_PRIORITIES = { water: 5, income: 5, soil: 5, erosion: 5 }
// NASA POWER serves the current year as it becomes available; fill values are
// excluded by the parser and incomplete years are not used in annual trends.
export const WINDOW = { startYear: 2005, endYear: new Date().getUTCFullYear() }
