'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  getAttendanceStatus,
  softDeleteLog,
  softDeleteLogsByDate,
  updateLogTimes,
} from '@/lib/services/timekeeping.service'
import { Employee, TimeLog, AttendanceStatus } from '@/types'

type ViewMode = 'today' | 'weekly'

interface Row {
  employee: Employee
  log: TimeLog | null
  status: AttendanceStatus
}

interface WeeklyCell {
  log: TimeLog | null
  regularHours: number
  otHours: number
  status: AttendanceStatus
}

interface WeeklyRow {
  employee: Employee
  days: WeeklyCell[]
}

interface EditState {
  logId: string
  employeeName: string
  date: string
  timeIn: string
  timeOut: string
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function getPhDate(date: Date) {
  const phString = date.toLocaleString('en-US', { timeZone: 'Asia/Manila' })
  return new Date(phString)
}

function toDateStr(date: Date) {
  const d = getPhDate(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getTodayDateStr() {
  return toDateStr(new Date())
}

function getMondayOf(date: Date): Date {
  const d = getPhDate(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

function getWeekDates(monday: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return toDateStr(d)
  })
}

function formatWeekLabel(monday: Date): string {
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  return `${monday.toLocaleDateString('en-PH', opts)} – ${sunday.toLocaleDateString('en-PH', opts)}`
}

// ── Hours calculation ─────────────────────────────────────────────────────────

const WORK_START_MINUTES = 8 * 60
const OVERTIME_START_MINUTES = 18 * 60

function calcHours(log: TimeLog | null): { regular: number; ot: number } {
  if (!log?.time_in || !log?.time_out) return { regular: 0, ot: 0 }

  const inDate = getPhDate(new Date(log.time_in))
  const outDate = getPhDate(new Date(log.time_out))

  const inMinutes = inDate.getHours() * 60 + inDate.getMinutes()
  const outMinutes = outDate.getHours() * 60 + outDate.getMinutes()

  const effectiveStart = Math.max(inMinutes, WORK_START_MINUTES)
  if (outMinutes <= effectiveStart) return { regular: 0, ot: 0 }

  let regular = 0
  let ot = 0

  if (outMinutes > OVERTIME_START_MINUTES) {
    regular = (OVERTIME_START_MINUTES - effectiveStart) / 60
    ot = (outMinutes - OVERTIME_START_MINUTES) / 60
  } else {
    regular = (outMinutes - effectiveStart) / 60
  }

  return {
    regular: Math.max(0, Number(regular.toFixed(2))),
    ot: Math.max(0, Number(ot.toFixed(2))),
  }
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-PH', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toTimeInput(iso: string | null): string {
  if (!iso) return ''
  const d = getPhDate(new Date(iso))
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatHours(h: number) {
  if (h === 0) return '—'
  return `${h}h`
}

// ── Badges ────────────────────────────────────────────────────────────────────

function statusBadge(status: AttendanceStatus) {
  const styles: Record<AttendanceStatus, string> = {
    on_time: 'bg-green-900 text-green-400',
    late: 'bg-yellow-900 text-yellow-400',
    absent: 'bg-gray-700 text-gray-400',
  }
  const labels: Record<AttendanceStatus, string> = {
    on_time: 'On Time',
    late: 'Late',
    absent: 'Absent',
  }
  return (
    <span className={`text-xs px-2 py-1 rounded-full ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

function cellBg(cell: WeeklyCell, isToday: boolean) {
  if (isToday) return 'bg-gray-700'
  if (!cell.log?.time_in) return ''
  if (cell.status === 'late') return 'bg-yellow-950'
  return 'bg-green-950'
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

function EditModal({
  edit,
  onClose,
  onSave,
}: {
  edit: EditState
  onClose: () => void
  onSave: (logId: string, timeIn: string, timeOut: string | null) => Promise<void>
}) {
  const [timeIn, setTimeIn] = useState(edit.timeIn)
  const [timeOut, setTimeOut] = useState(edit.timeOut)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!timeIn) { setError('Time In is required'); return }
    setSaving(true)
    setError('')
    try {
      await onSave(edit.logId, timeIn, timeOut || null)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-1">Edit Record</h2>
        <p className="text-gray-400 text-sm mb-5">{edit.employeeName} — {edit.date}</p>

        <div className="flex flex-col gap-4">
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Time In</label>
            <input
              type="time"
              value={timeIn}
              onChange={(e) => setTimeIn(e.target.value)}
              className="w-full bg-gray-700 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Time Out <span className="text-gray-600">(leave blank if not yet out)</span></label>
            <input
              type="time"
              value={timeOut}
              onChange={(e) => setTimeOut(e.target.value)}
              className="w-full bg-gray-700 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-700 hover:bg-gray-600 rounded-xl py-3 text-sm font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl py-3 text-sm font-semibold transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Confirm Modal ─────────────────────────────────────────────────────────────

function ConfirmModal({
  message,
  onConfirm,
  onCancel,
}: {
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={onCancel}>
      <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <p className="text-white mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 bg-gray-700 hover:bg-gray-600 rounded-xl py-3 text-sm font-semibold transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} className="flex-1 bg-red-600 hover:bg-red-500 rounded-xl py-3 text-sm font-semibold transition-colors">
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('today')

  const [rows, setRows] = useState<Row[]>([])
  const [loadingToday, setLoadingToday] = useState(true)
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null)

  const [weeklyRows, setWeeklyRows] = useState<WeeklyRow[]>([])
  const [loadingWeekly, setLoadingWeekly] = useState(false)
  const [weekMonday, setWeekMonday] = useState<Date>(() => getMondayOf(new Date()))

  const [editState, setEditState] = useState<EditState | null>(null)
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null)

  // ── Loaders ─────────────────────────────────────────────────────────────────

  async function loadToday() {
    setLoadingToday(true)
    const today = getTodayDateStr()

    const { data: employees } = await supabase
      .from('employees')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true })

    const { data: logs } = await supabase
      .from('time_logs')
      .select('*')
      .eq('date', today)
      .eq('is_deleted', false)

    const logsByEmployee = new Map<string, TimeLog>()
    ;(logs as TimeLog[] | null)?.forEach((log) => {
      logsByEmployee.set(log.employee_id, log)
    })

    const result: Row[] = ((employees as Employee[]) || []).map((emp) => {
      const log = logsByEmployee.get(emp.id) || null
      return { employee: emp, log, status: getAttendanceStatus(log?.time_in ?? null) }
    })

    setRows(result)
    setLoadingToday(false)
  }

  async function loadWeekly(monday: Date) {
    setLoadingWeekly(true)
    const weekDates = getWeekDates(monday)

    const { data: employees } = await supabase
      .from('employees')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true })

    const { data: logs } = await supabase
      .from('time_logs')
      .select('*')
      .gte('date', weekDates[0])
      .lte('date', weekDates[6])
      .eq('is_deleted', false)

    const logMap = new Map<string, Map<string, TimeLog>>()
    ;(logs as TimeLog[] | null)?.forEach((log) => {
      if (!logMap.has(log.employee_id)) logMap.set(log.employee_id, new Map())
      logMap.get(log.employee_id)!.set(log.date, log)
    })

    const result: WeeklyRow[] = ((employees as Employee[]) || []).map((emp) => {
      const empLogs = logMap.get(emp.id)
      const days: WeeklyCell[] = weekDates.map((dateStr) => {
        const log = empLogs?.get(dateStr) ?? null
        const { regular, ot } = calcHours(log)
        return { log, regularHours: regular, otHours: ot, status: getAttendanceStatus(log?.time_in ?? null) }
      })
      return { employee: emp, days }
    })

    setWeeklyRows(result)
    setLoadingWeekly(false)
  }

  useEffect(() => {
    loadToday()
    const interval = setInterval(loadToday, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (viewMode === 'weekly') loadWeekly(weekMonday)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, weekMonday])

  // ── Actions ──────────────────────────────────────────────────────────────────

  function confirmAction(message: string, action: () => void) {
    setConfirmState({ message, onConfirm: action })
  }

  async function handleSoftDeleteOne(logId: string, reload: () => void) {
    await softDeleteLog(logId)
    reload()
  }

  async function handleClearAllToday() {
    await softDeleteLogsByDate(getTodayDateStr())
    loadToday()
  }

  async function handleSaveEdit(logId: string, timeIn: string, timeOut: string | null) {
    await updateLogTimes(logId, timeIn, timeOut)
    loadToday()
    if (viewMode === 'weekly') loadWeekly(weekMonday)
  }

  function openEdit(log: TimeLog, employeeName: string) {
    setEditState({
      logId: log.id,
      employeeName,
      date: log.date,
      timeIn: toTimeInput(log.time_in),
      timeOut: toTimeInput(log.time_out),
    })
  }

  function prevWeek() {
    const d = new Date(weekMonday)
    d.setDate(d.getDate() - 7)
    setWeekMonday(d)
  }

  function nextWeek() {
    const d = new Date(weekMonday)
    d.setDate(d.getDate() + 7)
    setWeekMonday(d)
  }

  function logout() {
    document.cookie = 'admin_session=; path=/; max-age=0'
    window.location.href = '/admin/login'
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const weekDates = getWeekDates(weekMonday)
  const todayStr = getTodayDateStr()
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Attendance</h1>
            <p className="text-gray-400 text-sm">
              {new Date().toLocaleDateString('en-PH', {
                timeZone: 'Asia/Manila',
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <div className="flex bg-gray-800 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('today')}
                className={`px-4 py-2 text-sm font-semibold transition-colors ${viewMode === 'today' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                Today
              </button>
              <button
                onClick={() => setViewMode('weekly')}
                className={`px-4 py-2 text-sm font-semibold transition-colors ${viewMode === 'weekly' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                Weekly
              </button>
            </div>
            <a href="/admin/employees" className="bg-gray-800 hover:bg-gray-700 rounded-lg px-4 py-2 text-sm font-semibold transition-colors">Employees</a>
            <a href="/admin/logs" className="bg-gray-800 hover:bg-gray-700 rounded-lg px-4 py-2 text-sm font-semibold transition-colors">Logs</a>
            <button onClick={logout} className="bg-red-900 hover:bg-red-800 rounded-lg px-4 py-2 text-sm font-semibold transition-colors">Logout</button>
          </div>
        </div>

        {/* ── TODAY VIEW ── */}
        {viewMode === 'today' && (
          <>
            <div className="flex justify-end mb-3">
              <button
                onClick={() => confirmAction('Clear all of today\'s records from the dashboard? This will not delete the data.', handleClearAllToday)}
                className="bg-gray-700 hover:bg-gray-600 rounded-lg px-4 py-2 text-sm font-semibold transition-colors text-red-400"
              >
                Clear All Today
              </button>
            </div>

            {loadingToday ? (
              <p className="text-gray-400">Loading...</p>
            ) : rows.every(r => !r.log) ? (
              <p className="text-gray-500 text-center py-12">No records for today.</p>
            ) : (
              <div className="bg-gray-800 rounded-xl overflow-hidden">
                {rows.filter(r => r.log).map((row) => {
                  const { regular, ot } = calcHours(row.log)
                  return (
                    <div
                      key={row.employee.id}
                      className="flex flex-col md:flex-row md:items-center gap-3 p-4 border-b border-gray-700 last:border-0"
                    >
                      <div className="flex-1">
                        <p className="font-semibold">{row.employee.name}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          {statusBadge(row.status)}
                          {row.log?.time_in && row.log?.time_out && (
                            <>
                              <span className="text-xs px-2 py-1 rounded-full bg-blue-900 text-blue-400">{regular}h regular</span>
                              {ot > 0 && <span className="text-xs px-2 py-1 rounded-full bg-purple-900 text-purple-400">OT: {ot}h</span>}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">In:</span>
                          <span>{formatTime(row.log?.time_in ?? null)}</span>
                          {row.log?.photo_in_url && (
                            <img src={row.log.photo_in_url} alt="Time in" className="w-10 h-10 rounded-lg object-cover cursor-pointer" onClick={() => setPreviewPhoto(row.log!.photo_in_url)} />
                          )}
                          {row.log?.lat_in != null && row.log?.lng_in != null && (
                            <a href={`https://www.google.com/maps?q=${row.log.lat_in},${row.log.lng_in}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline text-xs">📍</a>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">Out:</span>
                          <span className={!row.log?.time_out ? 'text-yellow-500' : ''}>{formatTime(row.log?.time_out ?? null)}</span>
                          {row.log?.photo_out_url && (
                            <img src={row.log.photo_out_url} alt="Time out" className="w-10 h-10 rounded-lg object-cover cursor-pointer" onClick={() => setPreviewPhoto(row.log!.photo_out_url)} />
                          )}
                          {row.log?.lat_out != null && row.log?.lng_out != null && (
                            <a href={`https://www.google.com/maps?q=${row.log.lat_out},${row.log.lng_out}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline text-xs">📍</a>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => openEdit(row.log!, row.employee.name)}
                          className="bg-gray-700 hover:bg-gray-600 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => confirmAction(`Remove ${row.employee.name}'s record from dashboard?`, () => handleSoftDeleteOne(row.log!.id, loadToday))}
                          className="bg-gray-700 hover:bg-red-900 rounded-lg px-3 py-1.5 text-xs font-semibold text-red-400 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ── WEEKLY VIEW ── */}
        {viewMode === 'weekly' && (
          <div>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <button onClick={prevWeek} className="bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-2 text-sm font-semibold transition-colors">← Prev</button>
              <span className="text-gray-300 text-sm font-medium">{formatWeekLabel(weekMonday)}</span>
              <button onClick={nextWeek} className="bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-2 text-sm font-semibold transition-colors">Next →</button>
              <button onClick={() => setWeekMonday(getMondayOf(new Date()))} className="bg-blue-700 hover:bg-blue-600 rounded-lg px-3 py-2 text-sm font-semibold transition-colors">This Week</button>
            </div>

            {loadingWeekly ? (
              <p className="text-gray-400">Loading...</p>
            ) : (
              <div className="overflow-x-auto rounded-xl">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-800">
                      <th className="text-left p-3 text-gray-400 font-semibold min-w-[140px]">Employee</th>
                      {DAY_LABELS.map((label, i) => {
                        const isToday = weekDates[i] === todayStr
                        return (
                          <th key={label} className={`p-3 text-center font-semibold min-w-[110px] ${isToday ? 'text-blue-400' : 'text-gray-400'}`}>
                            <div>{label}</div>
                            <div className={`text-xs font-normal mt-0.5 ${isToday ? 'text-blue-500' : 'text-gray-600'}`}>{weekDates[i].slice(5)}</div>
                          </th>
                        )
                      })}
                      <th className="p-3 text-center text-gray-400 font-semibold min-w-[100px]">Week Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyRows.map((row) => {
                      const weekRegular = Number(row.days.reduce((s, d) => s + d.regularHours, 0).toFixed(2))
                      const weekOt = Number(row.days.reduce((s, d) => s + d.otHours, 0).toFixed(2))

                      return (
                        <tr key={row.employee.id} className="border-t border-gray-700 hover:bg-gray-800/50">
                          <td className="p-3 font-semibold text-white">{row.employee.name}</td>
                          {row.days.map((cell, i) => {
                            const isToday = weekDates[i] === todayStr
                            const absent = !cell.log?.time_in

                            return (
                              <td key={i} className={`p-2 text-center align-top ${cellBg(cell, isToday)}`}>
                                {absent ? (
                                  <span className="text-gray-600 text-xs">—</span>
                                ) : (
                                  <div className="flex flex-col items-center gap-0.5">
                                    <span className={`text-xs font-medium ${cell.status === 'late' ? 'text-yellow-400' : 'text-green-400'}`}>
                                      {cell.status === 'late' ? 'Late' : 'On Time'}
                                    </span>
                                    <span className="text-gray-300 text-xs">{formatTime(cell.log?.time_in ?? null)}</span>
                                    <span className="text-gray-500 text-xs">↓</span>
                                    <span className="text-gray-300 text-xs">
                                      {cell.log?.time_out
                                        ? formatTime(cell.log.time_out)
                                        : <span className="text-yellow-600">No out</span>}
                                    </span>
                                    <div className="mt-0.5 flex flex-col items-center gap-0.5">
                                      {cell.regularHours > 0 && <span className="text-blue-400 text-xs">{formatHours(cell.regularHours)}</span>}
                                      {cell.otHours > 0 && <span className="text-purple-400 text-xs">OT {formatHours(cell.otHours)}</span>}
                                    </div>
                                    {/* Actions */}
                                    <div className="flex gap-1 mt-1">
                                      <button
                                        onClick={() => openEdit(cell.log!, row.employee.name)}
                                        className="bg-gray-700 hover:bg-gray-600 rounded px-1.5 py-0.5 text-xs transition-colors"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        onClick={() => confirmAction(`Remove ${row.employee.name}'s record for ${weekDates[i]}?`, () => handleSoftDeleteOne(cell.log!.id, () => loadWeekly(weekMonday)))}
                                        className="bg-gray-700 hover:bg-red-900 rounded px-1.5 py-0.5 text-xs text-red-400 transition-colors"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </td>
                            )
                          })}
                          <td className="p-3 text-center align-middle">
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-blue-400 text-xs font-semibold">{weekRegular}h</span>
                              {weekOt > 0 && <span className="text-purple-400 text-xs">OT {weekOt}h</span>}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex gap-4 mt-4 text-xs text-gray-500 flex-wrap">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-700 inline-block" /> On Time</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-700 inline-block" /> Late</span>
              <span className="flex items-center gap-1"><span className="text-blue-400 font-medium">Xh</span> = Regular</span>
              <span className="flex items-center gap-1"><span className="text-purple-400 font-medium">OT Xh</span> = Overtime</span>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {editState && (
        <EditModal
          edit={editState}
          onClose={() => setEditState(null)}
          onSave={handleSaveEdit}
        />
      )}

      {confirmState && (
        <ConfirmModal
          message={confirmState.message}
          onConfirm={() => { confirmState.onConfirm(); setConfirmState(null) }}
          onCancel={() => setConfirmState(null)}
        />
      )}

      {previewPhoto && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50" onClick={() => setPreviewPhoto(null)}>
          <img src={previewPhoto} alt="Preview" className="max-w-full max-h-full rounded-xl" />
        </div>
      )}
    </div>
  )
}
