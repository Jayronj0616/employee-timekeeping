'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const ADMIN_USERNAME = 'Javier0616'
const ADMIN_PASSWORD = 'Lokigood17!'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      document.cookie = 'admin_session=true; path=/; max-age=86400'
      router.push('/admin/dashboard')
    } else {
      setError('Invalid username or password')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-gray-800 rounded-xl p-8"
      >
        <h1 className="text-2xl font-bold mb-6 text-center">Admin Login</h1>

        {error && <p className="text-red-400 mb-4 text-center">{error}</p>}

        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-1">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full bg-gray-700 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
            autoComplete="username"
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-gray-700 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
            autoComplete="current-password"
          />
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 hover:bg-blue-500 rounded-lg py-3 font-semibold transition-colors"
        >
          Login
        </button>
      </form>
    </div>
  )
}
