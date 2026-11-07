import type { ReactNode } from 'react'

export interface CardProps {
  title?: string
  description?: string
  children: ReactNode
  className?: string
}

export function Card({ children, className, description, title }: CardProps) {
  const classes = ['card', className].filter(Boolean).join(' ')

  return (
    <article className={classes}>
      {(title || description) && (
        <header className="card__header">
          {title && <h3 className="card__title">{title}</h3>}
          {description && <p className="card__description">{description}</p>}
        </header>
      )}
      <div className="card__content">{children}</div>
    </article>
  )
}
