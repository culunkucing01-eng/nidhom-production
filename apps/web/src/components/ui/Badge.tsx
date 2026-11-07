import type { HTMLAttributes, ReactNode } from 'react'

export type BadgeVariant =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode
  variant?: BadgeVariant
}

export function Badge({
  children,
  className,
  variant = 'neutral',
  ...props
}: BadgeProps) {
  const classes = ['badge', `badge--${variant}`, className]
    .filter(Boolean)
    .join(' ')

  return (
    <span {...props} className={classes}>
      {children}
    </span>
  )
}
