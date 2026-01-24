import { useState, useRef, useEffect } from 'react'

export default function Select({
  options = [],
  value,
  onChange,
  placeholder = 'Sélectionner...',
  searchable = false,
  label,
  required = false,
  error,
  className = ''
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const wrapperRef = useRef(null)

  const selectedOption = options.find(opt => opt.value === value)

  const filteredOptions = searchable
    ? options.filter(opt =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : options

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false)
        setSearchTerm('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (option) => {
    onChange(option.value)
    setIsOpen(false)
    setSearchTerm('')
  }

  return (
    <div className={`flex flex-col gap-1 ${className}`} ref={wrapperRef}>
      {label && (
        <label className="text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full px-3 py-2 border rounded-lg text-left bg-white flex items-center justify-between transition-all duration-200
            ${error ? 'border-red-500' : 'border-gray-300 focus:border-[#7c3aed]'}
            ${isOpen ? 'ring-2 ring-[#7c3aed]/20' : ''}`}
        >
          <span className={selectedOption ? 'text-gray-900' : 'text-gray-400'}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <svg
            className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
            {searchable && (
              <div className="p-2 border-b">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Rechercher..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-[#7c3aed]"
                  autoFocus
                />
              </div>
            )}
            <div className="py-1">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-2 text-gray-500 text-center">Aucun résultat</div>
              ) : (
                filteredOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelect(option)}
                    className={`w-full px-3 py-2 text-left hover:bg-[#7c3aed]/10 transition-colors
                      ${option.value === value ? 'bg-[#7c3aed]/20 text-[#7c3aed]' : 'text-gray-900'}`}
                  >
                    {option.label}
                    {option.description && (
                      <span className="block text-sm text-gray-500">{option.description}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
      {error && <span className="text-sm text-red-500">{error}</span>}
    </div>
  )
}
