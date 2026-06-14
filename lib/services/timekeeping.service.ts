import { supabase } from '@/lib/supabase'
import { Employee, TimeLog, AttendanceStatus } from '@/types'

const LATE_CUTOFF_MINUTES = 8 * 60 + 10 // 8:10 AM
const OVERTIME_START_MINUTES = 18 * 60 // 6:00 PM

function getPhilippineDateParts(date: Date) {
  const phString = date.toLocaleString('en-US', { timeZone: 'Asia/Manila' })
  const phDate = new Date(phString)
  return {
    dateStr: `${phDate.getFullYear()}-${String(phDate.getMonth() + 1).padStart(2, '0')}-${String(phDate.getDate()).padStart(2, '0')}`,
    minutesFromMidnight: phDate.getHours() * 60 + phDate.getMinutes(),
  }
}

export async function verifyPin(pin: string): Promise<Employee | null> {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('is_active', true)
    .eq('pin', pin)
    .maybeSingle()

  if (error || !data) return null
  return data as Employee
}

async function getNextDefaultPin(): Promise<string> {
  const { data, error } = await supabase
    .from('employees')
    .select('pin')
    .like('pin', '0%')

  if (error || !data) return '0001'

  // Filter pins that look like default ones (0001–0999)
  const defaultPins = data
    .map((e) => e.pin)
    .filter((p: string) => /^0\d{3}$/.test(p))
    .map((p: string) => parseInt(p, 10))

  if (defaultPins.length === 0) return '0001'

  const max = Math.max(...defaultPins)
  const next = max + 1
  return String(next).padStart(4, '0')
}

export async function findOrCreateEmployeeByName(name: string): Promise<Employee> {
  const trimmedName = name.trim()

  // Case-insensitive search using ilike
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .ilike('name', trimmedName)
    .eq('is_active', true)
    .maybeSingle()

  if (error) throw new Error('Failed to look up employee')

  if (data) return data as Employee

  // Not found — create new employee with next default pin
  const defaultPin = await getNextDefaultPin()

  const { data: newEmployee, error: insertError } = await supabase
    .from('employees')
    .insert({
      name: trimmedName,
      pin: defaultPin,
      is_active: true,
    })
    .select()
    .single()

  if (insertError) throw new Error('Failed to create employee')
  return newEmployee as Employee
}

export async function getTodayLog(employeeId: string): Promise<TimeLog | null> {
  const { dateStr } = getPhilippineDateParts(new Date())

  const { data, error } = await supabase
    .from('time_logs')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('date', dateStr)
    .eq('is_deleted', false)
    .maybeSingle()

  if (error) return null
  return data as TimeLog | null
}

export async function recordTimeIn(
  employeeId: string,
  photoUrl: string,
  location?: { lat: number; lng: number }
): Promise<TimeLog> {
  const { dateStr } = getPhilippineDateParts(new Date())

  const { data, error } = await supabase
    .from('time_logs')
    .insert({
      employee_id: employeeId,
      date: dateStr,
      time_in: new Date().toISOString(),
      photo_in_url: photoUrl,
      lat_in: location?.lat ?? null,
      lng_in: location?.lng ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return data as TimeLog
}

export async function recordTimeOut(
  logId: string,
  photoUrl: string,
  location?: { lat: number; lng: number }
): Promise<TimeLog> {
  const now = new Date()
  const { minutesFromMidnight } = getPhilippineDateParts(now)

  let isOvertime = false
  let overtimeHours = 0

  if (minutesFromMidnight > OVERTIME_START_MINUTES) {
    overtimeHours = Number(((minutesFromMidnight - OVERTIME_START_MINUTES) / 60).toFixed(2))
    isOvertime = true
  }

  const { data, error } = await supabase
    .from('time_logs')
    .update({
      time_out: now.toISOString(),
      photo_out_url: photoUrl,
      is_overtime: isOvertime,
      overtime_hours: overtimeHours,
      lat_out: location?.lat ?? null,
      lng_out: location?.lng ?? null,
    })
    .eq('id', logId)
    .select()
    .single()

  if (error) throw error
  return data as TimeLog
}

export async function softDeleteLog(logId: string): Promise<void> {
  const { error } = await supabase
    .from('time_logs')
    .update({ is_deleted: true })
    .eq('id', logId)
  if (error) throw error
}

export async function softDeleteLogsByDate(dateStr: string): Promise<void> {
  const { error } = await supabase
    .from('time_logs')
    .update({ is_deleted: true })
    .eq('date', dateStr)
    .eq('is_deleted', false)
  if (error) throw error
}

export async function updateLogTimes(
  logId: string,
  timeIn: string,
  timeOut: string | null
): Promise<TimeLog> {
  const now = new Date()
  const phString = now.toLocaleString('en-US', { timeZone: 'Asia/Manila' })
  const phDate = new Date(phString)
  const dateStr = `${phDate.getFullYear()}-${String(phDate.getMonth() + 1).padStart(2, '0')}-${String(phDate.getDate()).padStart(2, '0')}`

  // Reconstruct full ISO from time string (HH:mm) + today's date in PH
  function toISO(timeStr: string) {
    return new Date(`${dateStr}T${timeStr}:00+08:00`).toISOString()
  }

  let isOvertime = false
  let overtimeHours = 0

  if (timeOut) {
    const [h, m] = timeOut.split(':').map(Number)
    const outMinutes = h * 60 + m
    if (outMinutes > OVERTIME_START_MINUTES) {
      overtimeHours = Number(((outMinutes - OVERTIME_START_MINUTES) / 60).toFixed(2))
      isOvertime = true
    }
  }

  const { data, error } = await supabase
    .from('time_logs')
    .update({
      time_in: toISO(timeIn),
      time_out: timeOut ? toISO(timeOut) : null,
      is_overtime: isOvertime,
      overtime_hours: overtimeHours,
    })
    .eq('id', logId)
    .select()
    .single()

  if (error) throw error
  return data as TimeLog
}

export function getAttendanceStatus(timeIn: string | null): AttendanceStatus {
  if (!timeIn) return 'absent'

  const { minutesFromMidnight } = getPhilippineDateParts(new Date(timeIn))
  return minutesFromMidnight > LATE_CUTOFF_MINUTES ? 'late' : 'on_time'
}
