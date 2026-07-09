import type { SVGProps } from 'react'

type IconName =
  | 'play'
  | 'pause'
  | 'reset'
  | 'undo'
  | 'redo'
  | 'upload'
  | 'download'
  | 'save'
  | 'search'
  | 'cursor'
  | 'wire'
  | 'probe'
  | 'plus'
  | 'trash'
  | 'copy'
  | 'chevron'
  | 'headphones'
  | 'info'
  | 'warning'
  | 'close'
  | 'command'
  | 'grid'

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName
  size?: number
}

const paths: Record<IconName, React.ReactNode> = {
  play: <path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none" />,
  pause: <><path d="M8 5v14M16 5v14" /><path d="M8 5h1v14H8zM15 5h1v14h-1z" fill="currentColor" stroke="none" /></>,
  reset: <><path d="M4 8V4m0 0h4M4 4l3.2 3.2A8 8 0 1 1 5 15" /><path d="M12 8v4l3 2" /></>,
  undo: <path d="m9 7-5 5 5 5M5 12h8a6 6 0 0 1 6 6" />,
  redo: <path d="m15 7 5 5-5 5m4-5h-8a6 6 0 0 0-6 6" />,
  upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M5 15v4h14v-4" /></>,
  download: <><path d="M12 4v12m0 0 5-5m-5 5-5-5" /><path d="M5 19h14" /></>,
  save: <><path d="M5 4h12l2 2v14H5Z" /><path d="M8 4v6h8V4M8 20v-6h8v6" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>,
  cursor: <path d="m6 4 12 9-6 1-3 5Z" />,
  wire: <><circle cx="5" cy="17" r="2" /><circle cx="19" cy="7" r="2" /><path d="M7 17h4V7h6" /></>,
  probe: <><path d="m5 19 8-8 3 3-8 8Z" /><path d="m12 10 5-5 2 2-3 3M4 20l3-3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" /><path d="M10 11v5M14 11v5" /></>,
  copy: <><rect x="8" y="8" width="11" height="11" rx="1" /><path d="M16 8V5H5v11h3" /></>,
  chevron: <path d="m9 7 5 5-5 5" />,
  headphones: <><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><path d="M4 14h4v6H6a2 2 0 0 1-2-2Zm16 0h-4v6h2a2 2 0 0 0 2-2Z" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
  warning: <><path d="M12 3 2.5 20h19Z" /><path d="M12 9v5M12 17h.01" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  command: <><path d="M9 8V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3Z" /></>,
  grid: <><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" /></>,
}

export function Icon({ name, size = 18, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  )
}
