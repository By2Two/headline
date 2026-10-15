export default function Tabs({ tabs, value, onChange, className = '' }) {
  return (
    <nav className={`tabs ${className}`} role="tablist">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          className={value === id ? 'on' : ''}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
