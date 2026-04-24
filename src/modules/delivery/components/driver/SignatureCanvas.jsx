// src/modules/delivery/components/driver/SignatureCanvas.jsx
import { useRef, useState } from 'react'

export default function SignatureCanvas({ onSave, onCancel }) {
  const canvasRef = useRef(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const src = e.touches ? e.touches[0] : e
    return {
      x: (src.clientX - rect.left) * (canvas.width / rect.width),
      y: (src.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  const startDraw = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    setIsDrawing(true)
    setHasSignature(true)
  }

  const draw = (e) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const pos = getPos(e, canvas)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = '#111827'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.stroke()
  }

  const stopDraw = () => setIsDrawing(false)

  const clear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  const save = () => {
    const canvas = canvasRef.current
    if (!canvas || !hasSignature) return
    onSave(canvas.toDataURL('image/png'))
  }

  return (
    <div className="space-y-3">
      <div className="relative border border-gray-300 rounded-xl overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          width={480}
          height={180}
          className="w-full touch-none cursor-crosshair"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
        />
        {!hasSignature && (
          <p className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm pointer-events-none select-none">
            Le client signe ici
          </p>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={clear}
          className="flex-1 py-3 border border-gray-300 rounded-xl text-gray-600 text-sm font-medium"
        >
          Recommencer
        </button>
        <button
          onClick={save}
          disabled={!hasSignature}
          className="flex-1 py-3 bg-[#313ADF] text-white rounded-xl text-sm font-semibold disabled:opacity-40"
        >
          Valider la signature
        </button>
      </div>

      {onCancel && (
        <button onClick={onCancel} className="w-full py-2 text-gray-500 text-sm underline">
          Annuler
        </button>
      )}
    </div>
  )
}
