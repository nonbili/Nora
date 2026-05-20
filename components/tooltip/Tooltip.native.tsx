import React from 'react'

type TooltipProps = {
  title: string
  children: React.ReactNode
}

export const Tooltip: React.FC<TooltipProps> = ({ children }) => {
  return <>{children}</>
}
