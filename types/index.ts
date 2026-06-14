export interface Employee {
  id: string
  name: string
  pin: string
  is_active: boolean
  created_at: string
}

export interface TimeLog {
  id: string
  employee_id: string
  date: string
  time_in: string | null
  time_out: string | null
  is_overtime: boolean
  overtime_hours: number
  is_deleted: boolean
  photo_in_url: string | null
  photo_out_url: string | null
  lat_in: number | null
  lng_in: number | null
  lat_out: number | null
  lng_out: number | null
  created_at: string
  employee?: Employee
}

export type AttendanceStatus = 'on_time' | 'late' | 'absent'

export interface DailyAttendance {
  employee: Employee
  log: TimeLog | null
  status: AttendanceStatus
}
