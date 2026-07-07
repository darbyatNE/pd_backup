// NERC/FERC on-peak calendar for PJM (Eastern Prevailing Time).
//
// On-peak = the 5x16 block: non-holiday Monday–Friday, HE8–HE23.
// Off-peak = everything else — all weekend hours, weekday HE1–7 & HE24, and the
// six NERC holidays (New Year's, Memorial, Independence, Labor, Thanksgiving,
// Christmas), with the "falls on Sunday ⇒ observed Monday" rule.
//
// Day counts are leap-year aware (Feb = 29 in leap years). Because the modeled
// hourly load/contract shape is day-independent within a month, we never walk
// all 8,760/8,784 hours — we multiply an hourly value by the number of in-scope
// days for that (month, hour), which is exact for the 5x16 calendar.

// all = 7x24 · onpeak = 5x16 (non-holiday M–F HE8–23) · offpeak = the complement
// 5x8 = M–F overnight (HE24 + HE1–7) · 7x8 = all-day overnight · 2x24 = weekend
// (Sat+Sun, all hours) · custom = a plain hour-ending range across all days.
export type PeakMode = 'all' | 'onpeak' | 'offpeak' | '5x8' | '7x8' | '2x24' | 'custom'

// Off-peak overnight hours: HE1–HE7 and HE24.
const isOvernightHE = (he: number) => he <= 7 || he === 24

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

const BASE_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
/** Days in month `m` (1–12) of year `y`, leap-year aware. */
export function daysInMonth(y: number, m: number): number {
  return m === 2 && isLeapYear(y) ? 29 : BASE_DAYS[m - 1]
}
export function daysInYear(y: number): number {
  return isLeapYear(y) ? 366 : 365
}

// ── NERC holidays ────────────────────────────────────────────────────────────
function nthWeekdayOfMonth(y: number, m: number, weekday: number, n: number): number {
  const first = new Date(y, m - 1, 1).getDay() // 0=Sun … 6=Sat
  return 1 + ((7 + weekday - first) % 7) + (n - 1) * 7
}
function lastWeekdayOfMonth(y: number, m: number, weekday: number): number {
  const dim = daysInMonth(y, m)
  const last = new Date(y, m - 1, dim).getDay()
  return dim - ((7 + last - weekday) % 7)
}

const holidayCache = new Map<number, Set<number>>()
// Month*100+day keys of the year's NERC holidays (including Sunday-observed Mondays).
function holidaySet(y: number): Set<number> {
  const cached = holidayCache.get(y)
  if (cached) return cached
  const s = new Set<number>()
  const add = (m: number, d: number) => s.add(m * 100 + d)
  // Fixed-date holidays: if they land on Sunday, the following Monday is observed.
  for (const [m, d] of [[1, 1], [7, 4], [12, 25]] as Array<[number, number]>) {
    add(m, d)
    if (new Date(y, m - 1, d).getDay() === 0) add(m, d + 1)
  }
  add(5, lastWeekdayOfMonth(y, 5, 1))     // Memorial Day — last Monday of May
  add(9, nthWeekdayOfMonth(y, 9, 1, 1))   // Labor Day — first Monday of September
  add(11, nthWeekdayOfMonth(y, 11, 4, 4)) // Thanksgiving — 4th Thursday of November
  holidayCache.set(y, s)
  return s
}
export function isHoliday(y: number, m: number, d: number): boolean {
  return holidaySet(y).has(m * 100 + d)
}

/** True if hour-ending `he` (1–24) on this date is inside the on-peak 5x16 block. */
export function isOnPeakHour(y: number, m: number, d: number, he: number): boolean {
  if (he < 8 || he > 23) return false
  const dow = new Date(y, m - 1, d).getDay()
  if (dow === 0 || dow === 6) return false
  return !isHoliday(y, m, d)
}

const onPeakDayCache = new Map<number, number>()
/** Count of on-peak-eligible days (non-holiday Mon–Fri) in a month. */
export function onPeakDayCount(y: number, m: number): number {
  const key = y * 100 + m
  const cached = onPeakDayCache.get(key)
  if (cached != null) return cached
  let count = 0
  const dim = daysInMonth(y, m)
  for (let d = 1; d <= dim; d++) {
    const dow = new Date(y, m - 1, d).getDay()
    if (dow >= 1 && dow <= 5 && !isHoliday(y, m, d)) count++
  }
  onPeakDayCache.set(key, count)
  return count
}

const dowCache = new Map<string, number>()
/** Count of days in month (y,m) whose day-of-week is in `dows` (0=Sun … 6=Sat). */
function dowDayCount(y: number, m: number, dows: number[]): number {
  const key = `${y}-${m}-${dows.join('')}`
  const cached = dowCache.get(key)
  if (cached != null) return cached
  let count = 0
  const dim = daysInMonth(y, m)
  for (let d = 1; d <= dim; d++) if (dows.includes(new Date(y, m - 1, d).getDay())) count++
  dowCache.set(key, count)
  return count
}
const WEEKDAYS = [1, 2, 3, 4, 5]
const WEEKEND = [0, 6]

/** Wrap-aware membership for a custom contiguous HE range (start > end wraps midnight). */
export function inCustomHE(he: number, startHE: number, endHE: number): boolean {
  return startHE <= endHE ? he >= startHE && he <= endHE : he >= startHE || he <= endHE
}

/**
 * Number of days in month (y,m) for which hour-ending `he` (1–24) is in scope.
 * Multiply a day-independent hourly value by this to get exact calendar-weighted
 * MWh for the selected on/off-peak (or custom) block.
 */
export function scopeDayCount(
  mode: PeakMode, startHE: number, endHE: number, y: number, m: number, he: number,
): number {
  const dim = daysInMonth(y, m)
  switch (mode) {
    case 'onpeak':  return he >= 8 && he <= 23 ? onPeakDayCount(y, m) : 0
    case 'offpeak': return he >= 8 && he <= 23 ? dim - onPeakDayCount(y, m) : dim
    case '5x8':     return isOvernightHE(he) ? dowDayCount(y, m, WEEKDAYS) : 0
    case '7x8':     return isOvernightHE(he) ? dim : 0
    case '2x24':    return dowDayCount(y, m, WEEKEND)
    case 'custom':  return inCustomHE(he, startHE, endHE) ? dim : 0
    default:        return dim // 'all'
  }
}

/** Whether HE column `he` should appear on the hours chart for the mode. */
export function heColumnInScope(mode: PeakMode, startHE: number, endHE: number, he: number): boolean {
  switch (mode) {
    case 'onpeak':  return he >= 8 && he <= 23
    case 'offpeak': return true // every hour has off-peak instances (weekends/holidays)
    case '5x8':
    case '7x8':     return isOvernightHE(he)
    case '2x24':    return true // weekend covers all 24 hours
    case 'custom':  return inCustomHE(he, startHE, endHE)
    default:        return true
  }
}

/** Short label for the active peak mode. */
export function peakModeLabel(mode: PeakMode, startHE: number, endHE: number): string {
  switch (mode) {
    case 'onpeak':  return 'On-peak (5×16)'
    case 'offpeak': return 'Off-peak'
    case '5x8':     return '5×8 (M–F overnight)'
    case '7x8':     return '7×8 (overnight)'
    case '2x24':    return '2×24 (weekend)'
    case 'custom':  return `HE${startHE}–HE${endHE}`
    default:        return 'All hours'
  }
}
