'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Employee } from '@/types'

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPin, setEditPin] = useState('')
  const [editRate, setEditRate] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPin, setNewPin] = useState('')
  const [newRate, setNewRate] = useState('')
  const [error, setError] = useState('')

  async function loadEmployees() {
    setLoading(true)
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('is_deleted', false)
      .order('name', { ascending: true })

    if (!error && data) setEmployees(data as Employee[])
    setLoading(false)
  }

  useEffect(() => {
    loadEmployees()
  }, [])

  function startEdit(emp: Employee) {
    setEditingId(emp.id)
    setEditName(emp.name)
    setEditPin(emp.pin)
    setEditRate(String(emp.daily_rate ?? ''))
    setError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
    setEditPin('')
    setEditRate('')
    setError('')
  }

  async function saveEdit(id: string) {
    if (!/^\d{4}$/.test(editPin)) {
      setError('PIN must be exactly 4 digits')
      return
    }
    const rate = parseFloat(editRate)
    if (isNaN(rate) || rate < 0) {
      setError('Daily rate must be a valid number')
      return
    }

    const { error } = await supabase
      .from('employees')
      .update({ name: editName, pin: editPin, daily_rate: rate })
      .eq('id', id)

    if (error) {
      setError(error.message.includes('duplicate') ? 'PIN already in use' : error.message)
      return
    }

    cancelEdit()
    loadEmployees()
  }

  async function toggleActive(emp: Employee) {
    await supabase
      .from('employees')
      .update({ is_active: !emp.is_active })
      .eq('id', emp.id)
    loadEmployees()
  }

  async function addEmployee() {
    if (!newName.trim()) {
      setError('Name is required')
      return
    }
    if (!/^\d{4}$/.test(newPin)) {
      setError('PIN must be exactly 4 digits')
      return
    }
    const rate = parseFloat(newRate)
    if (isNaN(rate) || rate < 0) {
      setError('Daily rate must be a valid number')
      return
    }

    const { error } = await supabase
      .from('employees')
      .insert({ name: newName.trim(), pin: newPin, daily_rate: rate, is_active: true })

    if (error) {
      setError(error.message.includes('duplicate') ? 'PIN already in use' : error.message)
      return
    }

    setNewName('')
    setNewPin('')
    setNewRate('')
    setShowAddForm(false)
    setError('')
    loadEmployees()
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Employees</h1>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-blue-600 hover:bg-blue-500 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
          >
            {showAddForm ? 'Cancel' : '+ Add Employee'}
          </button>
        </div>

        {error && (
          <p className="text-red-400 mb-4 bg-red-950 rounded-lg px-4 py-2">{error}</p>
        )}

        {showAddForm && (
          <div className="bg-gray-800 rounded-xl p-4 mb-6 flex flex-col md:flex-row gap-3">
            <input
              type="text"
              placeholder="Employee name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 bg-gray-700 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="4-digit PIN"
              maxLength={4}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
              className="md:w-32 bg-gray-700 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="number"
              placeholder="Daily rate (₱)"
              min={0}
              value={newRate}
              onChange={(e) => setNewRate(e.target.value)}
              className="md:w-40 bg-gray-700 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={addEmployee}
              className="bg-green-600 hover:bg-green-500 rounded-lg px-6 py-2 font-semibold transition-colors"
            >
              Save
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : (
          <div className="bg-gray-800 rounded-xl overflow-hidden">
            {employees.map((emp) => (
              <div
                key={emp.id}
                className="flex flex-col md:flex-row md:items-center gap-3 p-4 border-b border-gray-700 last:border-0"
              >
                {editingId === emp.id ? (
                  <>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 bg-gray-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      maxLength={4}
                      value={editPin}
                      onChange={(e) => setEditPin(e.target.value.replace(/\D/g, ''))}
                      className="md:w-28 bg-gray-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="Daily rate (₱)"
                      value={editRate}
                      onChange={(e) => setEditRate(e.target.value)}
                      className="md:w-36 bg-gray-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(emp.id)}
                        className="bg-green-600 hover:bg-green-500 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="bg-gray-700 hover:bg-gray-600 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex-1">
                      <p className="font-semibold">{emp.name}</p>
                      <p className="text-sm text-gray-400">PIN: {emp.pin}</p>
                      <p className="text-sm text-gray-400">Rate: ₱{Number(emp.daily_rate ?? 0).toLocaleString()}/day</p>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        emp.is_active
                          ? 'bg-green-900 text-green-400'
                          : 'bg-gray-700 text-gray-400'
                      }`}
                    >
                      {emp.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEdit(emp)}
                        className="bg-blue-600 hover:bg-blue-500 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggleActive(emp)}
                        className="bg-gray-700 hover:bg-gray-600 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                      >
                        {emp.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
