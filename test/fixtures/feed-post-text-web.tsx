import { mock } from 'bun:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import TestRenderer from 'react-test-renderer'

const utils = { ...await import('@/lib/utils') }
mock.module('@/lib/utils', () => ({ ...utils, isWeb: true }))
const { FeedPostText } = await import('../../components/feed/FeedPostText')

const element = { scrollHeight: 300, clientHeight: 176 }
let renderer!: TestRenderer.ReactTestRenderer
await act(async () => {
  renderer = TestRenderer.create(<FeedPostText style={{ fontSize: 14 }}>A long post</FeedPostText>, {
    createNodeMock: () => ({ firstElementChild: element }),
  })
})
const text = () => renderer.root.findAllByType('Text' as never)[0]
assert.equal(text().props.selectable, true)
assert.equal(text().props.onPress, undefined)
const button = () => renderer.root.findByType('Pressable' as never)
await act(async () => button().props.onPress())
assert.equal(text().props.numberOfLines, undefined)
await act(async () => button().props.onPress())
assert.equal(text().props.numberOfLines, 8)
element.scrollHeight = 100
await act(async () => text().props.onLayout())
assert.equal(renderer.root.findAllByType('Pressable' as never).length, 0)
await act(async () => renderer.unmount())
