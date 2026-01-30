// Componente Input reutilizable

export function Input({
  type = 'text',
  value,
  onChange,
  placeholder = '',
  label = '',
  error = '',
  className = '',
  ...props
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label className="text-sm text-gray-400">
          {label}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`
          px-3 py-2 rounded-lg
          bg-gray-700 border border-gray-600
          text-gray-100 placeholder-gray-500
          focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500
          ${error ? 'border-red-500' : ''}
        `}
        {...props}
      />
      {error && (
        <span className="text-sm text-red-400">
          {error}
        </span>
      )}
    </div>
  );
}

export default Input;
