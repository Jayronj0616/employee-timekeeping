'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  calcHours,
  getPayrollWeekDates,
  getPayrollWeekLogs,
  savePayroll,
  getPayrollByWeek,
  getPayrollWeekList,
} from '@/lib/services/timekeeping.service'
import { Employee, TimeLog, Payroll } from '@/types'

type TabMode = 'compute' | 'history'

interface ComputedRow {
  employee: Employee
  daysWorked: number
  regularHours: number
  otHours: number
  regularPay: number
  otPay: number
  totalSalary: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPeso(amount: number) {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatWeekLabel(weekStart: string, weekEnd: string) {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  return `${new Date(weekStart + 'T00:00:00').toLocaleDateString('en-PH', opts)} – ${new Date(weekEnd + 'T00:00:00').toLocaleDateString('en-PH', opts)}`
}

function getWeekNavDates(weekStart: string, direction: -1 | 1): Date {
  const d = new Date(weekStart + 'T00:00:00')
  d.setDate(d.getDate() + direction * 7)
  return d
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PayrollPage() {
  const [tab, setTab] = useState<TabMode>('compute')

  // Compute tab
  const [weekDate, setWeekDate] = useState<Date>(new Date())
  const [computedRows, setComputedRows] = useState<ComputedRow[]>([])
  const [loadingCompute, setLoadingCompute] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedWeek, setSavedWeek] = useState<string | null>(null)

  // History tab
  const [weekList, setWeekList] = useState<string[]>([])
  const [selectedHistoryWeek, setSelectedHistoryWeek] = useState<string | null>(null)
  const [historyRecords, setHistoryRecords] = useState<(Payroll & { employee: Employee })[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const { weekStart, weekEnd, dates } = getPayrollWeekDates(weekDate)

  // ── Compute ──────────────────────────────────────────────────────────────────

  async function computePayroll() {
    setLoadingCompute(true)
    setSavedWeek(null)

    const { data: employees } = await supabase
      .from('employees')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true })

    const logs = await getPayrollWeekLogs(weekStart, weekEnd)

    const logsByEmployee = new Map<string, TimeLog[]>()
    logs.forEach((log) => {
      if (!logsByEmployee.has(log.employee_id)) logsByEmployee.set(log.employee_id, [])
      logsByEmployee.get(log.employee_id)!.push(log)
    })

    const rows: ComputedRow[] = ((employees as Employee[]) || []).map((emp) => {
      const empLogs = logsByEmployee.get(emp.id) ?? []
      const dailyRate = Number(emp.daily_rate ?? 0)
      const hourlyRate = dailyRate / 8

      let totalRegularHours = 0
      let totalOtHours = 0
      let daysWorked = 0

      empLogs.forEach((log) => {
        if (!log.time_in) return
        const { regular, ot } = calcHours(log)
        if (regular > 0 || ot > 0) {
          daysWorked += 1
          totalRegularHours += regular
          totalOtHours += ot
        }
      })

      const regularPay = Number((totalRegularHours * hourlyRate).toFixed(2))
      const otPay = Number((totalOtHours * hourlyRate).toFixed(2))
      const totalSalary = Number((regularPay + otPay).toFixed(2))

      return {
        employee: emp,
        daysWorked,
        regularHours: Number(totalRegularHours.toFixed(2)),
        otHours: Number(totalOtHours.toFixed(2)),
        regularPay,
        otPay,
        totalSalary,
      }
    })

    setComputedRows(rows)
    setLoadingCompute(false)
  }

  async function handleSavePayroll() {
    setSaving(true)
    const records = computedRows
      .filter((r) => r.daysWorked > 0)
      .map((r) => ({
        employee_id: r.employee.id,
        week_start: weekStart,
        week_end: weekEnd,
        days_worked: r.daysWorked,
        regular_hours: r.regularHours,
        overtime_hours: r.otHours,
        daily_rate: Number(r.employee.daily_rate ?? 0),
        regular_pay: r.regularPay,
        overtime_pay: r.otPay,
        total_salary: r.totalSalary,
      }))

    try {
      await savePayroll(records)
      setSavedWeek(weekStart)
      loadWeekList()
    } catch (e) {
      console.error(e)
    }
    setSaving(false)
  }

  // ── History ──────────────────────────────────────────────────────────────────

  async function loadWeekList() {
    const list = await getPayrollWeekList()
    setWeekList(list)
    if (list.length > 0 && !selectedHistoryWeek) setSelectedHistoryWeek(list[0])
  }

  async function loadHistoryRecords(ws: string) {
    setLoadingHistory(true)
    const records = await getPayrollByWeek(ws)
    setHistoryRecords(records)
    setLoadingHistory(false)
  }

  useEffect(() => {
    computePayroll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart])

  useEffect(() => {
    if (tab === 'history') loadWeekList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  useEffect(() => {
    if (selectedHistoryWeek) loadHistoryRecords(selectedHistoryWeek)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHistoryWeek])

  const totalSalary = computedRows.reduce((s, r) => s + r.totalSalary, 0)
  const totalOtPay = computedRows.reduce((s, r) => s + r.otPay, 0)
  const historyTotal = historyRecords.reduce((s, r) => s + r.total_salary, 0)
  const historyOtTotal = historyRecords.reduce((s, r) => s + r.overtime_pay, 0)

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-8">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Payroll</h1>
            <p className="text-gray-400 text-sm">Weekly salary computation</p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <a href="/admin/dashboard" className="bg-gray-800 hover:bg-gray-700 rounded-lg px-4 py-2 text-sm font-semibold transition-colors">Dashboard</a>
            <a href="/admin/employees" className="bg-gray-800 hover:bg-gray-700 rounded-lg px-4 py-2 text-sm font-semibold transition-colors">Employees</a>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-gray-800 rounded-lg overflow-hidden mb-6 w-fit">
          <button
            onClick={() => setTab('compute')}
            className={`px-6 py-2 text-sm font-semibold transition-colors ${tab === 'compute' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            Compute
          </button>
          <button
            onClick={() => setTab('history')}
            className={`px-6 py-2 text-sm font-semibold transition-colors ${tab === 'history' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            History
          </button>
        </div>

        {/* ── COMPUTE TAB ── */}
        {tab === 'compute' && (
          <div>
            {/* Week navigator */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <button onClick={() => setWeekDate(getWeekNavDates(weekStart, -1))} className="bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-2 text-sm font-semibold transition-colors">← Prev</button>
              <span className="text-white font-medium text-sm">{formatWeekLabel(weekStart, weekEnd)}</span>
              <button onClick={() => setWeekDate(getWeekNavDates(weekStart, 1))} className="bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-2 text-sm font-semibold transition-colors">Next →</button>
              <button onClick={() => setWeekDate(new Date())} className="bg-blue-700 hover:bg-blue-600 rounded-lg px-3 py-2 text-sm font-semibold transition-colors">This Week</button>
            </div>

            {/* Days reference */}
            <div className="flex gap-2 mb-5 flex-wrap">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, i) => (
                <span key={label} className="text-xs bg-gray-800 rounded px-2 py-1 text-gray-400">
                  {label} {dates[i].slice(5)}
                </span>
              ))}
            </div>

            {loadingCompute ? (
              <p className="text-gray-400">Computing...</p>
            ) : (
              <>
                <div className="bg-gray-800 rounded-xl overflow-x-auto mb-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700 text-xs text-gray-400 font-semibold">
                        <th className="text-left px-4 py-3">Employee</th>
                        <th className="text-center px-3 py-3">Days</th>
                        <th className="text-center px-3 py-3">Reg Hrs</th>
                        <th className="text-center px-3 py-3">OT Hrs</th>
                        <th className="text-center px-3 py-3">Reg Pay</th>
                        <th className="text-center px-3 py-3">OT Pay</th>
                        <th className="text-right px-4 py-3">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {computedRows.filter(r => r.daysWorked > 0).length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center text-gray-500 py-10">No attendance records for this week.</td>
                        </tr>
                      ) : (
                        computedRows.map((row) => {
                          if (row.daysWorked === 0) return null
                          return (
                            <tr key={row.employee.id} className="border-b border-gray-700 last:border-0">
                              <td className="px-4 py-3">
                                <p className="font-semibold">{row.employee.name}</p>
                                <p className="text-xs text-gray-500">₱{Number(row.employee.daily_rate).toLocaleString()}/day</p>
                              </td>
                              <td className="text-center px-3 py-3">{row.daysWorked}</td>
                              <td className="text-center px-3 py-3 text-blue-400">{row.regularHours}h</td>
                              <td className="text-center px-3 py-3 text-purple-400">{row.otHours > 0 ? `${row.otHours}h` : '—'}</td>
                              <td className="text-center px-3 py-3">{formatPeso(row.regularPay)}</td>
                              <td className="text-center px-3 py-3 text-purple-400">{row.otPay > 0 ? formatPeso(row.otPay) : '—'}</td>
                              <td className="text-right px-4 py-3 font-bold text-green-400">{formatPeso(row.totalSalary)}</td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Totals summary */}
                {computedRows.some(r => r.daysWorked > 0) && (
                  <>
                    <div className="bg-gray-800 rounded-xl px-4 py-3 flex flex-wrap justify-between gap-3 mb-4 text-sm">
                      <div>
                        <span className="text-gray-400">Total OT Pay: </span>
                        <span className="text-purple-400 font-semibold">{formatPeso(totalOtPay)}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Total Payroll: </span>
                        <span className="text-green-400 font-bold text-lg">{formatPeso(totalSalary)}</span>
                      </div>
                    </div>

                    {savedWeek === weekStart ? (
                      <div className="bg-green-900 text-green-400 rounded-xl px-4 py-3 text-sm font-semibold text-center">
                        ✓ Payroll saved for this week
                      </div>
                    ) : (
                      <button
                        onClick={handleSavePayroll}
                        disabled={saving}
                        className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-xl py-3 font-semibold transition-colors"
                      >
                        {saving ? 'Saving...' : 'Save Payroll'}
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {tab === 'history' && (
          <div>
            {weekList.length === 0 ? (
              <p className="text-gray-500 text-center py-10">No saved payrolls yet.</p>
            ) : (
              <>
                {/* Week selector */}
                <div className="flex gap-2 flex-wrap mb-5">
                  {weekList.map((ws) => {
                    const we = new Date(ws + 'T00:00:00')
                    we.setDate(we.getDate() + 6)
                    const weStr = `${we.getFullYear()}-${String(we.getMonth() + 1).padStart(2, '0')}-${String(we.getDate()).padStart(2, '0')}`
                    return (
                      <button
                        key={ws}
                        onClick={() => setSelectedHistoryWeek(ws)}
                        className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                          selectedHistoryWeek === ws ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                        }`}
                      >
                        {formatWeekLabel(ws, weStr)}
                      </button>
                    )
                  })}
                </div>

                {loadingHistory ? (
                  <p className="text-gray-400">Loading...</p>
                ) : (
                  <>
                    <div className="bg-gray-800 rounded-xl overflow-x-auto mb-4">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-700 text-xs text-gray-400 font-semibold">
                            <th className="text-left px-4 py-3">Employee</th>
                            <th className="text-center px-3 py-3">Days</th>
                            <th className="text-center px-3 py-3">Reg Hrs</th>
                            <th className="text-center px-3 py-3">OT Hrs</th>
                            <th className="text-center px-3 py-3">Reg Pay</th>
                            <th className="text-center px-3 py-3">OT Pay</th>
                            <th className="text-right px-4 py-3">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historyRecords.map((record) => (
                            <tr key={record.id} className="border-b border-gray-700 last:border-0">
                              <td className="px-4 py-3">
                                <p className="font-semibold">{record.employee?.name ?? '—'}</p>
                                <p className="text-xs text-gray-500">₱{Number(record.daily_rate).toLocaleString()}/day</p>
                              </td>
                              <td className="text-center px-3 py-3">{record.days_worked}</td>
                              <td className="text-center px-3 py-3 text-blue-400">{record.regular_hours}h</td>
                              <td className="text-center px-3 py-3 text-purple-400">{record.overtime_hours > 0 ? `${record.overtime_hours}h` : '—'}</td>
                              <td className="text-center px-3 py-3">{formatPeso(record.regular_pay)}</td>
                              <td className="text-center px-3 py-3 text-purple-400">{record.overtime_pay > 0 ? formatPeso(record.overtime_pay) : '—'}</td>
                              <td className="text-right px-4 py-3 font-bold text-green-400">{formatPeso(record.total_salary)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="bg-gray-800 rounded-xl px-4 py-3 flex flex-wrap justify-between gap-3 text-sm">
                      <div>
                        <span className="text-gray-400">Total OT Pay: </span>
                        <span className="text-purple-400 font-semibold">{formatPeso(historyOtTotal)}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Total Payroll: </span>
                        <span className="text-green-400 font-bold text-lg">{formatPeso(historyTotal)}</span>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
