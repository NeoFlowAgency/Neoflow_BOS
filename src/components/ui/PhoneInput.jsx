import { useState, useRef, useEffect } from 'react'

const countryCodes = [
  { code: '+33', country: 'France', flag: '🇫🇷' },
  { code: '+1', country: 'USA', flag: '🇺🇸' },
  { code: '+44', country: 'Royaume-Uni', flag: '🇬🇧' },
  { code: '+49', country: 'Allemagne', flag: '🇩🇪' },
  { code: '+34', country: 'Espagne', flag: '🇪🇸' },
  { code: '+39', country: 'Italie', flag: '🇮🇹' },
  { code: '+32', country: 'Belgique', flag: '🇧🇪' },
  { code: '+41', country: 'Suisse', flag: '🇨🇭' },
  { code: '+352', country: 'Luxembourg', flag: '🇱🇺' },
  { code: '+351', country: 'Portugal', flag: '🇵🇹' },
  { code: '+31', country: 'Pays-Bas', flag: '🇳🇱' },
  { code: '+43', country: 'Autriche', flag: '🇦🇹' },
  { code: '+48', country: 'Pologne', flag: '🇵🇱' },
  { code: '+46', country: 'Suède', flag: '🇸🇪' },
  { code: '+47', country: 'Norvège', flag: '🇳🇴' },
  { code: '+45', country: 'Danemark', flag: '🇩🇰' },
  { code: '+358', country: 'Finlande', flag: '🇫🇮' },
  { code: '+353', country: 'Irlande', flag: '🇮🇪' },
  { code: '+30', country: 'Grèce', flag: '🇬🇷' },
  { code: '+420', country: 'Tchéquie', flag: '🇨🇿' },
  { code: '+36', country: 'Hongrie', flag: '🇭🇺' },
  { code: '+40', country: 'Roumanie', flag: '🇷🇴' },
  { code: '+359', country: 'Bulgarie', flag: '🇧🇬' },
  { code: '+385', country: 'Croatie', flag: '🇭🇷' },
  { code: '+386', country: 'Slovénie', flag: '🇸🇮' },
  { code: '+421', country: 'Slovaquie', flag: '🇸🇰' },
  { code: '+372', country: 'Estonie', flag: '🇪🇪' },
  { code: '+371', country: 'Lettonie', flag: '🇱🇻' },
  { code: '+370', country: 'Lituanie', flag: '🇱🇹' },
  { code: '+356', country: 'Malte', flag: '🇲🇹' },
  { code: '+357', country: 'Chypre', flag: '🇨🇾' },
  { code: '+212', country: 'Maroc', flag: '🇲🇦' },
  { code: '+213', country: 'Algérie', flag: '🇩🇿' },
  { code: '+216', country: 'Tunisie', flag: '🇹🇳' },
  { code: '+7', country: 'Russie', flag: '🇷🇺' },
  { code: '+81', country: 'Japon', flag: '🇯🇵' },
  { code: '+86', country: 'Chine', flag: '🇨🇳' },
  { code: '+82', country: 'Corée du Sud', flag: '🇰🇷' },
  { code: '+91', country: 'Inde', flag: '🇮🇳' },
  { code: '+55', country: 'Brésil', flag: '🇧🇷' },
  { code: '+52', country: 'Mexique', flag: '🇲🇽' },
  { code: '+54', country: 'Argentine', flag: '🇦🇷' },
  { code: '+61', country: 'Australie', flag: '🇦🇺' },
  { code: '+64', country: 'Nouvelle-Zélande', flag: '🇳🇿' },
  { code: '+27', country: 'Afrique du Sud', flag: '🇿🇦' },
  { code: '+971', country: 'Émirats arabes unis', flag: '🇦🇪' },
  { code: '+966', country: 'Arabie saoudite', flag: '🇸🇦' },
  { code: '+90', country: 'Turquie', flag: '🇹🇷' },
  { code: '+972', country: 'Israël', flag: '🇮🇱' },
  { code: '+20', country: 'Égypte', flag: '🇪🇬' },
]

export default function PhoneInput({ value, onChange, onSearch, placeholder = "06 12 34 56 78" }) {
  const [selectedCode, setSelectedCode] = useState(countryCodes[0])
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropdownRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredCodes = countryCodes.filter(
    c => c.country.toLowerCase().includes(search.toLowerCase()) ||
         c.code.includes(search)
  )

  const handlePhoneChange = (e) => {
    const phone = e.target.value
    onChange(phone)
    if (onSearch) onSearch(phone)
  }

  return (
    <div className="flex gap-2 relative" ref={dropdownRef}>
      {/* Country code selector */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-[#313ADF]/10 hover:bg-[#313ADF]/20 border border-[#313ADF]/30 rounded-xl px-3 py-3 text-[#040741] font-medium transition-colors min-w-[100px]"
      >
        <span className="text-lg">{selectedCode.flag}</span>
        <span>{selectedCode.code}</span>
        <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 left-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-64 overflow-hidden w-[calc(100vw-2rem)] sm:w-72">
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              placeholder="Rechercher un pays..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
            />
          </div>
          <div className="overflow-y-auto max-h-48">
            {filteredCodes.map((country) => (
              <button
                key={country.code + country.country}
                type="button"
                onClick={() => {
                  setSelectedCode(country)
                  setIsOpen(false)
                  setSearch('')
                }}
                className={`w-full px-3 py-2 text-left hover:bg-[#313ADF]/10 flex items-center gap-3 transition-colors ${
                  selectedCode.code === country.code ? 'bg-[#313ADF]/5' : ''
                }`}
              >
                <span className="text-lg">{country.flag}</span>
                <span className="font-medium text-[#040741]">{country.country}</span>
                <span className="text-gray-500 ml-auto">{country.code}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Phone number input */}
      <input
        type="tel"
        value={value}
        onChange={handlePhoneChange}
        placeholder={placeholder}
        className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
      />
    </div>
  )
}
