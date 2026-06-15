'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const ADMIN_PIN = '061601'
const PIN_LENGTH = 6

export default function LoginPage() {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [shaking, setShaking] = useState(false)

  function handleDigit(digit: string) {
    if (pin.length >= PIN_LENGTH) return
    const next = pin + digit
    setPin(next)
    setError('')

    if (next.length === PIN_LENGTH) {
      if (next === ADMIN_PIN) {
        document.cookie = 'admin_session=true; path=/; max-age=86400'
        router.push('/admin/dashboard')
      } else {
        setShaking(true)
        setError('Incorrect PIN')
        setTimeout(() => {
          setPin('')
          setShaking(false)
        }, 600)
      }
    }
  }

  function handleBackspace() {
    setPin((p) => p.slice(0, -1))
    setError('')
  }

  const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-4">
      <div className="w-full max-w-xs bg-gray-800 rounded-2xl p-8">
        <h1 className="text-2xl font-bold mb-2 text-center">Admin</h1>
        <p className="text-gray-400 text-sm text-center mb-8">Enter your PIN</p>

        {/* PIN dots */}
        <div className={`flex justify-center gap-4 mb-6 ${shaking ? 'animate-bounce' : ''}`}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-colors ${
                i < pin.length
                  ? error ? 'bg-red-500 border-red-500' : 'bg-white border-white'
                  : 'border-gray-600'
              }`}
            />
          ))}
        </div>

        {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3">
          {DIGITS.map((d, i) => {
            if (d === '') return <div key={i} />
            if (d === '⌫') {
              return (
                <button
                  key={i}
                  onClick={handleBackspace}
                  className="bg-gray-700 hover:bg-gray-600 rounded-xl py-4 text-xl font-semibold transition-colors"
                >
                  ⌫
                </button>
              )
            }
            return (
              <button
                key={i}
                onClick={() => handleDigit(d)}
                className="bg-gray-700 hover:bg-gray-600 active:bg-gray-500 rounded-xl py-4 text-xl font-semibold transition-colors"
              >
                {d}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
