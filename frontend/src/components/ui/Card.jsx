// Componente Card reutilizable

export function Card({ children, className = '', variant = 'default' }) {
  const baseStyles = 'rounded-lg p-4';

  const variants = {
    default: 'bg-gray-800 border border-gray-700',
    highlighted: 'bg-gray-800 border-2 border-blue-500 shadow-lg shadow-blue-500/20'
  };

  return (
    <div className={`${baseStyles} ${variants[variant]} ${className}`}>
      {children}
    </div>
  );
}

export default Card;
