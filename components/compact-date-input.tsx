import { labelDateShort } from '@/lib/months'

interface CompactDateInputProps {
  id: string
  value: string
  onChange: (isoDate: string) => void
  required?: boolean
  disabled?: boolean
}

/** Muestra DD/MM/YY; el value interno sigue siendo YYYY-MM-DD (type=date nativo). */
export function CompactDateInput({
  id,
  value,
  onChange,
  required,
  disabled
}: CompactDateInputProps) {
  return (
    <div className="date-compact">
      <span className="date-compact__display" aria-hidden>
        {value ? labelDateShort(value) : '—'}
      </span>
      <input
        id={id}
        className="date-compact__native"
        type="date"
        value={value}
        required={required}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
