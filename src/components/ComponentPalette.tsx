import { useMemo, useState } from 'react'
import { categoryLabels, componentCatalog } from '../circuit/catalog'
import type { ComponentCategory, ComponentKind } from '../circuit/types'
import { Icon } from './Icon'

interface ComponentPaletteProps {
  onAdd: (kind: ComponentKind) => void
  mobileOpen?: boolean
  onClose?: () => void
}

const categoryOrder: ComponentCategory[] = ['sources', 'ssi', 'passives', 'utility']

export function ComponentPalette({ onAdd, mobileOpen = false, onClose }: ComponentPaletteProps) {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = useMemo(() => componentCatalog.filter((component) =>
    component.kind !== 'unknown' && (
      !normalizedQuery ||
      component.name.toLowerCase().includes(normalizedQuery) ||
      component.description.toLowerCase().includes(normalizedQuery) ||
      component.shortName.toLowerCase().includes(normalizedQuery)
    )), [normalizedQuery])

  return (
    <aside className={`component-palette ${mobileOpen ? 'is-mobile-open' : ''}`} aria-label="Component library">
      <div className="panel-heading palette-heading">
        <div>
          <span className="eyebrow">LIBRARY</span>
          <h2>Components</h2>
        </div>
        <div className="palette-heading-actions">
          <button className="icon-button subtle" aria-label="Library options"><Icon name="grid" size={16} /></button>
          <button className="icon-button subtle mobile-palette-close" onClick={onClose} aria-label="Close component library"><Icon name="close" size={16} /></button>
        </div>
      </div>

      <label className="palette-search">
        <Icon name="search" size={16} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search parts"
          aria-label="Search components"
        />
        <kbd>/</kbd>
      </label>

      <div className="palette-scroll">
        {categoryOrder.map((category) => {
          const components = filtered.filter((component) => component.category === category)
          if (components.length === 0) return null
          return (
            <section className="palette-section" key={category}>
              <div className="palette-section-title">
                <span>{categoryLabels[category]}</span>
                <span>{String(components.length).padStart(2, '0')}</span>
              </div>
              <div className="palette-list">
                {components.map((component) => (
                  <button
                    key={component.kind}
                    className={`palette-item ${component.category === 'ssi' ? 'is-featured' : ''}`}
                    onClick={() => {
                      onAdd(component.kind)
                      onClose?.()
                    }}
                    title={`Add ${component.name}`}
                  >
                    <span className="part-mark" style={{ '--part-color': component.color } as React.CSSProperties}>
                      {component.shortName}
                    </span>
                    <span className="part-copy">
                      <strong>{component.name}</strong>
                      <small>{component.description}</small>
                    </span>
                    <Icon name="plus" size={15} />
                  </button>
                ))}
              </div>
            </section>
          )
        })}

        {filtered.length === 0 && (
          <div className="empty-state compact">
            <span>No matching parts</span>
            <button onClick={() => setQuery('')}>Clear search</button>
          </div>
        )}
      </div>

      <div className="library-status">
        <span className="status-orbit"><i /><i /><i /></span>
        <div>
          <strong>SSI voice set</strong>
          <small>3 pin-mapped behavioral previews</small>
        </div>
        <Icon name="chevron" size={15} />
      </div>
    </aside>
  )
}
