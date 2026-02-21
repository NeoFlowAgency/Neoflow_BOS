import { useState, useEffect } from 'react'

/**
 * Overlay with a spotlight "hole" around a target element identified by data-tour attribute.
 * If no target is found, shows a centered tooltip without spotlight.
 */
export default function SpotlightOverlay({ targetSelector, children, position = 'bottom' }) {
  const [rect, setRect] = useState(null)

  useEffect(() => {
    const updateRect = () => {
      if (!targetSelector) {
        setRect(null)
        return
      }
      const el = document.querySelector(`[data-tour="${targetSelector}"]`)
      if (el) {
        const r = el.getBoundingClientRect()
        setRect({
          top: r.top - 8,
          left: r.left - 8,
          width: r.width + 16,
          height: r.height + 16,
        })
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else {
        setRect(null)
      }
    }

    updateRect()
    const timer = setTimeout(updateRect, 300)
    window.addEventListener('resize', updateRect)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', updateRect)
    }
  }, [targetSelector])

  // Calculate tooltip position
  const getTooltipStyle = () => {
    if (!rect) {
      // Center on screen
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      }
    }

    const pad = 16
    if (position === 'bottom') {
      return {
        top: `${rect.top + rect.height + pad}px`,
        left: `${Math.max(16, Math.min(rect.left, window.innerWidth - 420))}px`,
      }
    }
    if (position === 'top') {
      return {
        bottom: `${window.innerHeight - rect.top + pad}px`,
        left: `${Math.max(16, Math.min(rect.left, window.innerWidth - 420))}px`,
      }
    }
    if (position === 'right') {
      return {
        top: `${rect.top}px`,
        left: `${rect.left + rect.width + pad}px`,
      }
    }
    // left
    return {
      top: `${rect.top}px`,
      right: `${window.innerWidth - rect.left + pad}px`,
    }
  }

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Dark overlay with hole */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
        <defs>
          <mask id="spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={rect.left}
                y={rect.top}
                width={rect.width}
                height={rect.height}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.6)"
          mask="url(#spotlight-mask)"
        />
      </svg>

      {/* Spotlight border glow */}
      {rect && (
        <div
          className="absolute border-2 border-[#313ADF] rounded-xl shadow-[0_0_0_4px_rgba(49,58,223,0.2)] pointer-events-none"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className="absolute bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 max-w-md w-[400px] z-[10000]"
        style={getTooltipStyle()}
      >
        {children}
      </div>
    </div>
  )
}
