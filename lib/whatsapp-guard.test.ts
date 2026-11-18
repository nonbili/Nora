import { describe, expect, it } from 'bun:test'
import { whatsAppKeyboardGuardScript } from './whatsapp-guard'

const setup = (hostname = 'web.whatsapp.com') => {
  const win = new EventTarget() as any
  const vv = new EventTarget() as any
  win.top = win
  win.innerWidth = 400
  win.visualViewport = vv
  vv.width = 400
  const doc = { activeElement: null as any }
  new Function('window', 'location', 'document', whatsAppKeyboardGuardScript)(win, { hostname }, doc)
  const calls: string[] = []
  win.addEventListener('resize', () => calls.push('window'))
  vv.addEventListener('resize', { handleEvent: () => calls.push('vv') })
  const resize = () => {
    win.dispatchEvent(new Event('resize'))
    vv.dispatchEvent(new Event('resize'))
  }
  return { win, vv, doc, calls, resize }
}

describe('whatsAppKeyboardGuardScript', () => {
  it('stops a height-only resize while a text field has focus', () => {
    const { doc, calls, resize } = setup()
    doc.activeElement = { tagName: 'INPUT', type: 'text' }
    resize()
    expect(calls).toEqual([])
  })

  it('passes a resize when nothing is being edited', () => {
    const { calls, resize } = setup()
    resize()
    expect(calls).toEqual(['window', 'vv'])
  })

  it('passes a resize while a checkbox has focus', () => {
    const { doc, calls, resize } = setup()
    doc.activeElement = { tagName: 'INPUT', type: 'checkbox' }
    resize()
    expect(calls).toEqual(['window', 'vv'])
  })

  it('passes a change of width even while editing', () => {
    const { win, vv, doc, calls, resize } = setup()
    doc.activeElement = { isContentEditable: true }
    win.innerWidth = vv.width = 800
    resize()
    expect(calls).toEqual(['window', 'vv'])
  })

  it('does nothing on other sites', () => {
    const { doc, calls, resize } = setup('www.whatsapp.com')
    doc.activeElement = { tagName: 'INPUT', type: 'text' }
    resize()
    expect(calls).toEqual(['window', 'vv'])
  })
})
