import 'react-native-get-random-values'
import { nanoid } from 'nanoid'
import { ReactNode } from 'react'

export const isWeb = typeof document != 'undefined'

export const clsx = (...classes: Array<any>) => classes.filter(Boolean).join(' ')

// In react-native, writing {condition && <Cmp/>} triggers `A text node cannot be a child of a <View>` warning.
export const nIf = (condition: any, node: ReactNode) => (condition ? node : null)

export function genId(size = 6) {
  return nanoid(size)
}
