// src/modules/delivery/components/driver/PhotoCapture.jsx
import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'

export default function PhotoCapture({ onCapture, onSkip }) {
  const inputRef = useRef(null)
  const [preview, setPreview] = useState(null)

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setPreview(URL.createObjectURL(file))
    onCapture(file)
  }

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />

      {preview ? (
        <div className="space-y-3">
          <img src={preview} alt="Preuve" className="w-full rounded-xl object-cover max-h-64" />
          <button
            onClick={() => { setPreview(null); inputRef.current?.click() }}
            className="w-full py-3 border border-gray-300 rounded-xl text-gray-600 text-sm"
          >
            Reprendre la photo
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full py-6 border-2 border-dashed border-gray-300 rounded-xl
                     flex flex-col items-center gap-2 text-gray-500 active:bg-gray-50"
        >
          <Camera size={32} />
          <span className="text-sm font-medium">Prendre une photo de preuve</span>
          <span className="text-xs text-gray-400">Optionnel</span>
        </button>
      )}

      <button onClick={onSkip} className="w-full py-3 text-gray-500 text-sm underline">
        Passer cette étape
      </button>
    </div>
  )
}
