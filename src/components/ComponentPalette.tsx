import { useMemo, useState } from 'react'
import { categoryLabels, componentCatalog } from '../circuit/catalog'
import { circuitTemplates } from '../circuit/templates'
import type { CircuitTemplateId } from '../circuit/templates'
import type { ComponentCategory, ComponentKind } from '../circuit/types'
import { Icon } from './Icon'

interface ComponentPaletteProps {
  onAdd: (kind: ComponentKind) => void
  onAddTemplate?: (id: CircuitTemplateId) => void
  mobileOpen?: boolean
  onClose?: () => void
}

const categoryOrder: ComponentCategory[] = ['sources', 'ssi', 'passives', 'utility']

export function ComponentPalette({ onAdd, onAddTemplate, mobileOpen = false, onClose }: ComponentPaletteProps) {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = useMemo(() => componentCatalog.filter((component) =>
    component.kind !== 'unknown' && (
      !normalizedQuery ||
      component.name.toLowerCase().includes(normalizedQuery) ||
      component.description.toLowerCase().includes(normalizedQuery) ||
      component.shortName.toLowerCase().includes(normalizedQuery)
    )), [normalizedQuery])
  const filteredTemplates = useMemo(() => circuitTemplates.filter((template) =>
    !normalizedQuery ||
    template.name.toLowerCase().includes(normalizedQuery) ||
    template.description.toLowerCase().includes(normalizedQuery) ||
    template.shortName.toLowerCase().includes(normalizedQuery)
  ), [normalizedQuery])

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
          placeholder="Search parts & circuits"
          aria-label="Search parts and application circuits"
        />
        <kbd>/</kbd>
      </label>

      <div className="palette-scroll">
        {filteredTemplates.length > 0 && (
          <section className="palette-section template-section">
            <div className="palette-section-title template-section-title">
              <span>Application templates</span>
              <span>{String(filteredTemplates.length).padStart(2, '0')}</span>
            </div>
            <p className="template-section-intro">Datasheet circuits, ready to place and customize.</p>
            <div className="palette-list template-list">
              {filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  className="template-item"
                  disabled={!onAddTemplate}
                  onClick={() => {
                    onAddTemplate?.(template.id)
                    if (onAddTemplate) onClose?.()
                  }}
                  title={`Place ${template.name} circuit`}
                >
                  <span className="template-mark" aria-hidden="true">
                    <span>{template.shortName}</span>
                    <i /><i /><i />
                  </span>
                  <span className="template-copy">
                    <span className="template-kind">Circuit template</span>
                    <strong>{template.name}</strong>
                    <small>{template.description}</small>
                    <span className="template-action">Place circuit <Icon name="plus" size={11} /></span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

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

        {filtered.length === 0 && filteredTemplates.length === 0 && (
          <div className="empty-state compact">
            <span>No matching parts or circuits</span>
            <button onClick={() => setQuery('')}>Clear search</button>
          </div>
        )}
      </div>

      <div className="library-status">
        <span className="status-orbit"><i /><i /><i /></span>
        <div>
          <strong>Fabrication-aware library</strong>
          <small>Full pin maps · footprints · circuit templates</small>
        </div>
        <Icon name="chevron" size={15} />
      </div>
    </aside>
  )
}
