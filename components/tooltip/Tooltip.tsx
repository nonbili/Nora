import React from 'react'

type TooltipProps = {
  title: string
  children: React.ReactNode
}

export const Tooltip: React.FC<TooltipProps> = ({ title, children }) => {
  return React.createElement('div', { title }, children)
}
