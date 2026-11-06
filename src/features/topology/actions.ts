import { createContext } from 'react'

export const TwinActions = createContext<{ toggle: (id: string) => void }>({ toggle: () => {} })
