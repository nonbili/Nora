import { createContext, useContext } from 'react'

export const ContentJsContext = createContext('')

export const useContentJs = () => {
  return useContext(ContentJsContext)
}
