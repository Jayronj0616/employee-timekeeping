'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Employee, TimeLog } from '@/types'

interface LogRow extends TimeLog {
  employee: Employee
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function calculateRegularHours(timeIn: string | null, timeOut: string | null, overtimeHours: number) {
  if (!timeIn || !timeOut) return 0
  const totalHours = (new Date(timeOut).getTime() - new Date(timeIn).getTime()) / (1000 * 60 * 60)
  return Number((totalHours - overtimeHours).toFixed(2))
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogRow[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  async function loadEmployees() {
    const { data } = await supabase.from('employees').select('*').order('name')
    if (data) setEmployees(data as Employee[])
  }

  async function loadLogs() {
    setLoading(true)
    let query = supabase
      .from('time_logs')
      .select('*, employee:employees(*)')
      .order('date', { ascending: false })
      .eq('is_deleted', false)

    if (employeeFilter) query = query.eq('employee_id', employeeFilter)
    if (startDate) query = query.gte('date', startDate)
    if (endDate) query = query.lte('date', endDate)

    const { data, error } = await query
    if (!error && data) setLogs(data as unknown as LogRow[])
    setLoading(false)
  }

  useEffect(() => {
    loadEmployees()
  }, [])

  useEffect(() => {
    loadLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeFilter, startDate, endDate])

  function exportCSV() {
    const header = 'Employee Name,Date,Time In,Time Out,Regular Hours,Overtime Hours\n'
    const rows = logs.map((log) => {
      const regular = calculateRegularHours(log.time_in, log.time_out, log.overtime_hours)
      return [
        log.employee?.name ?? '',
        log.date,
        formatDateTime(log.time_in),
        formatDateTime(log.time_out),
        regular,
        log.overtime_hours,
      ].join(',')
    })
    const csv = header + rows.join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `time-logs-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Time Logs</h1>
          <a
            href="/admin/dashboard"
            className="bg-gray-800 hover:bg-gray-700 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
          >
            ← Dashboard
          </a>
        </div>

        <div className="bg-gray-800 rounded-xl p-4 mb-6 flex flex-col md:flex-row gap-3">
          <select
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
            className="flex-1 bg-gray-700 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Employees</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-gray-700 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-gray-700 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={exportCSV}
            className="bg-green-600 hover:bg-green-500 rounded-lg px-6 py-2 font-semibold transition-colors whitespace-nowrap"
          >
            Export CSV
          </button>
        </div>

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : (
          <div className="bg-gray-800 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-700">
                  <th className="p-3">Employee</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Time In</th>
                  <th className="p-3">Time Out</th>
                  <th className="p-3">Regular Hrs</th>
                  <th className="p-3">OT Hrs</th>
                  <th className="p-3">Photos</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-700 last:border-0">
                    <td className="p-3 font-semibold">{log.employee?.name}</td>
                    <td className="p-3">{log.date}</td>
                    <td className="p-3">{formatDateTime(log.time_in)}</td>
                    <td className="p-3">{formatDateTime(log.time_out)}</td>
                    <td className="p-3">{calculateRegularHours(log.time_in, log.time_out, log.overtime_hours)}</td>
                    <td className="p-3">
                      {log.is_overtime ? (
                        <span className="text-purple-400">{log.overtime_hours}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        {log.photo_in_url && (
                          <img src={log.photo_in_url} alt="In" className="w-8 h-8 rounded object-cover" />
                        )}
                        {log.photo_out_url && (
                          <img src={log.photo_out_url} alt="Out" className="w-8 h-8 rounded object-cover" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
