export default function ToggleButton({ options, value, onChange }) {
  return (
    <div className="inline-flex bg-gray-100 rounded-xl p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
            value === option.value
              ? 'bg-[#313ADF] text-white shadow-md'
              : 'text-gray-600 hover:text-[#040741]'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
