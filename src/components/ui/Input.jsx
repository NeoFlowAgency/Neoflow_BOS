export default function Input({
  type = 'text',
  value,
  onChange,
  placeholder,
  required = false,
  error,
  label,
  disabled = false,
  readOnly = false,
  className = '',
  min,
  step
}) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        min={min}
        step={step}
        className={`px-3 py-2 border rounded-lg transition-all duration-200 outline-none
          ${error ? 'border-red-500 focus:ring-2 focus:ring-red-200' : 'border-gray-300 focus:border-[#7c3aed] focus:ring-2 focus:ring-[#7c3aed]/20'}
          ${disabled || readOnly ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
          ${className}`}
      />
      {error && <span className="text-sm text-red-500">{error}</span>}
    </div>
  )
}
