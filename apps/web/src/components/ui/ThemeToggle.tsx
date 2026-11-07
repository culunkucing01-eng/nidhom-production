export type Theme = 'light' | 'dark'

export interface ThemeToggleProps {
  theme: Theme
  onToggle: () => void
}

export function ThemeToggle({ onToggle, theme }: ThemeToggleProps) {
  const nextTheme = theme === 'light' ? 'dark' : 'light'

  return (
    <button
      aria-label={`Aktifkan tema ${nextTheme === 'dark' ? 'gelap' : 'terang'}`}
      className="theme-toggle"
      onClick={onToggle}
      type="button"
    >
      <span aria-hidden="true" className="theme-toggle__marker" />
      <span>{theme === 'light' ? 'Terang' : 'Gelap'}</span>
    </button>
  )
}
