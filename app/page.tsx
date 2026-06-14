'use client'

import { useEffect, useRef, useState } from 'react'
import { startCamera, captureFrame, uploadPhoto, getLocation } from '@/lib/camera'
import {
  verifyPin,
  getTodayLog,
  recordTimeIn,
  recordTimeOut,
  findOrCreateEmployeeByName,
} from '@/lib/services/timekeeping.service'

type Mode = 'in' | 'out' | null
type Stage = 'select_mode' | 'pin' | 'name_input' | 'name_processing' | 'processing' | 'done' | 'error_state' | 'resetting'

const RESET_DELAY_MS = 3000
const RESETTING_DURATION_MS = 600

export default function KioskPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [mode, setMode] = useState<Mode>(null)
  const [pin, setPin] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [stage, setStage] = useState<Stage>('select_mode')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Start camera once on mount
  useEffect(() => {
    if (videoRef.current) {
      startCamera(videoRef.current).catch(() => {
        setError('Camera access is required for this kiosk.')
      })
    }
  }, [])

  function selectMode(selected: 'in' | 'out') {
    setMode(selected)
    setStage('pin')
    setPin('')
    setError('')
  }

  function backToModeSelect() {
    setMode(null)
    setStage('select_mode')
    setPin('')
    setNameInput('')
    setError('')
  }

  function goToNameInput() {
    setPin('')
    setNameInput('')
    setError('')
    setStage('name_input')
  }

  function backToPin() {
    setNameInput('')
    setError('')
    setStage('pin')
  }

  async function handleNameSubmit() {
    const trimmed = nameInput.trim()
    if (!trimmed) {
      setError('Please enter a name')
      return
    }

    setStage('name_processing')

    try {
      const employee = await findOrCreateEmployeeByName(trimmed)
      await processEmployee(employee)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setStage('error_state')
      goToResettingThenPin(1800)
    }
  }

  function resetToPinEntry() {
    setPin('')
    setNameInput('')
    setError('')
    setMessage('')
    setStage('pin')
  }

  function goToResettingThenPin(delay: number) {
    setTimeout(() => {
      setStage('resetting')
      setTimeout(resetToPinEntry, RESETTING_DURATION_MS)
    }, delay)
  }

  function scheduleResetToPin() {
    goToResettingThenPin(RESET_DELAY_MS)
  }

  async function handlePinDigit(digit: string) {
    if (pin.length >= 4) return
    const newPin = pin + digit
    setPin(newPin)

    if (newPin.length === 4) {
      await processPin(newPin)
    }
  }

  function handleBackspace() {
    setPin((p) => p.slice(0, -1))
  }

  async function processPin(enteredPin: string) {
    setStage('processing')

    const employee = await verifyPin(enteredPin)
    if (!employee) {
      setError('Invalid PIN')
      setStage('error_state')
      goToResettingThenPin(1500)
      return
    }

    await processEmployee(employee)
  }

  async function processEmployee(employee: import('@/types').Employee) {
    const todayLog = await getTodayLog(employee.id)

    if (mode === 'in') {
      if (todayLog?.time_in) {
        setError(`${employee.name} already timed in today`)
        setStage('error_state')
        goToResettingThenPin(1800)
        return
      }
    } else {
      // mode === 'out'
      if (!todayLog?.time_in) {
        setError(`${employee.name} has not timed in yet`)
        setStage('error_state')
        goToResettingThenPin(1800)
        return
      }
      if (todayLog?.time_out) {
        setError(`${employee.name} already timed out today`)
        setStage('error_state')
        goToResettingThenPin(1800)
        return
      }
    }

    try {
      if (!videoRef.current) throw new Error('Camera not ready')

      const blob = await captureFrame(videoRef.current)
      const photoUrl = await uploadPhoto(blob, employee.id, mode!)

      let location: { lat: number; lng: number } | undefined
      try {
        location = await getLocation()
      } catch {
        location = undefined
      }

      if (mode === 'in') {
        await recordTimeIn(employee.id, photoUrl, location)
        setMessage(`Time In recorded for ${employee.name}`)
      } else {
        await recordTimeOut(todayLog!.id, photoUrl, location)
        setMessage(`Time Out recorded for ${employee.name}`)
      }

      setStage('done')
      scheduleResetToPin()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setStage('error_state')
      goToResettingThenPin(1800)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white p-4">
      {/* Hidden camera feed */}
      <video ref={videoRef} className="hidden" muted playsInline />

      <div className="w-full max-w-sm">
        {stage === 'select_mode' && (
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">Employee Time Clock</h1>
            <p className="text-gray-400 mb-8">Select an action</p>

            <div className="flex flex-col gap-4">
              <button
                onClick={() => selectMode('in')}
                className="bg-green-600 hover:bg-green-500 rounded-xl py-8 text-2xl font-bold transition-colors"
              >
                Time In
              </button>
              <button
                onClick={() => selectMode('out')}
                className="bg-blue-600 hover:bg-blue-500 rounded-xl py-8 text-2xl font-bold transition-colors"
              >
                Time Out
              </button>
            </div>
          </div>
        )}

        {stage === 'name_processing' && (
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-10 h-10 border-4 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
            </div>
            <p className="text-gray-400">Processing...</p>
          </div>
        )}

        {stage === 'name_input' && (
          <div className="text-center">
            <div className="flex items-center justify-between mb-2">
              <button onClick={backToPin} className="text-gray-400 text-sm underline">
                ← Back
              </button>
              <span
                className={`text-sm font-semibold px-3 py-1 rounded-full ${
                  mode === 'in' ? 'bg-green-900 text-green-400' : 'bg-blue-900 text-blue-400'
                }`}
              >
                {mode === 'in' ? 'Time In' : 'Time Out'}
              </span>
            </div>

            <p className="text-gray-400 mb-6 mt-4">Enter your name</p>

            <input
              type="text"
              value={nameInput}
              onChange={(e) => { setNameInput(e.target.value); setError('') }}
              onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
              placeholder="Full name"
              autoFocus
              className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-4 text-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-400 mb-4"
            />

            {error && <p className="text-red-400 mb-4">{error}</p>}

            <button
              onClick={handleNameSubmit}
              className={`w-full rounded-xl py-4 text-lg font-semibold transition-colors ${
                mode === 'in'
                  ? 'bg-green-600 hover:bg-green-500'
                  : 'bg-blue-600 hover:bg-blue-500'
              }`}
            >
              Continue
            </button>
          </div>
        )}

        {(stage === 'pin' || stage === 'processing' || stage === 'error_state') && (
          <div className="text-center">
            <div className="flex items-center justify-between mb-2">
              <button onClick={backToModeSelect} className="text-gray-400 text-sm underline">
                ← Back
              </button>
              <span
                className={`text-sm font-semibold px-3 py-1 rounded-full ${
                  mode === 'in' ? 'bg-green-900 text-green-400' : 'bg-blue-900 text-blue-400'
                }`}
              >
                {mode === 'in' ? 'Time In' : 'Time Out'}
              </span>
            </div>

            <p className="text-gray-400 mb-6 mt-4">Enter your 4-digit PIN</p>

            <div className="flex justify-center gap-3 mb-6">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-12 h-12 border-2 border-gray-600 rounded-lg flex items-center justify-center text-xl"
                >
                  {pin[i] ? '●' : ''}
                </div>
              ))}
            </div>

            {stage === 'processing' && <p className="text-gray-400 mb-4">Processing...</p>}
            {error && <p className="text-red-400 mb-4">{error}</p>}

            <button
              onClick={goToNameInput}
              className="text-gray-500 text-sm underline mb-4 block w-full text-center"
            >
              No PIN? Enter name instead
            </button>

            <div className="grid grid-cols-3 gap-3">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  onClick={() => handlePinDigit(digit)}
                  disabled={stage === 'processing'}
                  className="bg-gray-800 hover:bg-gray-700 active:bg-gray-600 disabled:opacity-50 rounded-xl py-5 text-2xl font-semibold transition-colors"
                >
                  {digit}
                </button>
              ))}
              <button
                onClick={handleBackspace}
                disabled={stage === 'processing'}
                className="bg-gray-800 hover:bg-gray-700 active:bg-gray-600 disabled:opacity-50 rounded-xl py-5 text-xl font-semibold transition-colors"
              >
                ⌫
              </button>
              <button
                onClick={() => handlePinDigit('0')}
                disabled={stage === 'processing'}
                className="bg-gray-800 hover:bg-gray-700 active:bg-gray-600 disabled:opacity-50 rounded-xl py-5 text-2xl font-semibold transition-colors"
              >
                0
              </button>
              <div />
            </div>
          </div>
        )}

        {stage === 'done' && (
          <div className="text-center">
            <div className="text-5xl mb-4">✓</div>
            <p className="text-xl font-semibold">{message}</p>
            <p className="text-gray-400 mt-2">
              {new Date().toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila' })}
            </p>
            <p className="text-gray-500 text-sm mt-4">Returning to PIN entry...</p>
          </div>
        )}
        {stage === 'resetting' && (
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-10 h-10 border-4 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
            </div>
            <p className="text-gray-400">Getting ready for next employee...</p>
          </div>
        )}
      </div>
    </div>
  )
}
