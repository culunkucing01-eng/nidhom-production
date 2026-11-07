import type { InputHTMLAttributes } from 'react'

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'size'> {
  id: string
  label: string
  helperText?: string
  errorMessage?: string
}

export function Input({
  disabled = false,
  errorMessage,
  helperText,
  id,
  label,
  ...props
}: InputProps) {
  const helperId = helperText ? `${id}-helper` : undefined
  const errorId = errorMessage ? `${id}-error` : undefined
  const describedBy = [helperId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={disabled ? 'field field--disabled' : 'field'}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        {...props}
        aria-describedby={describedBy}
        aria-invalid={errorMessage ? true : undefined}
        className="field__control"
        disabled={disabled}
        id={id}
      />
      {helperText && (
        <p className="field__support" id={helperId}>
          {helperText}
        </p>
      )}
      {errorMessage && (
        <p className="field__error" id={errorId}>
          {errorMessage}
        </p>
      )}
    </div>
  )
}
