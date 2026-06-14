import { supabase } from '@/lib/supabase'

const STORAGE_BUCKET = 'time-log-photos'

/**
 * Starts the device camera and attaches the stream to a video element.
 * Call this once when the kiosk page loads.
 */
export async function startCamera(videoElement: HTMLVideoElement): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user' },
    audio: false,
  })
  videoElement.srcObject = stream
  await videoElement.play()
  return stream
}

/**
 * Captures the current frame from a video element and returns it as a JPEG Blob.
 */
export function captureFrame(videoElement: HTMLVideoElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = videoElement.videoWidth
    canvas.height = videoElement.videoHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      reject(new Error('Could not get canvas context'))
      return
    }

    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height)

    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Failed to capture frame'))
      },
      'image/jpeg',
      0.9
    )
  })
}

/**
 * Gets the device's current GPS coordinates.
 * Throws if permission is denied or unavailable.
 */
export function getLocation(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported on this device'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
      },
      (err) => {
        reject(new Error(`Location error: ${err.message}`))
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  })
}

/**
 * Uploads a captured photo blob to Supabase Storage and returns its public URL.
 */
export async function uploadPhoto(
  blob: Blob,
  employeeId: string,
  type: 'in' | 'out'
): Promise<string> {
  const timestamp = Date.now()
  const fileName = `${employeeId}_${type}_${timestamp}.jpg`

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(fileName, blob, {
      contentType: 'image/jpeg',
      upsert: false,
    })

  if (error) throw error

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileName)
  return data.publicUrl
}
