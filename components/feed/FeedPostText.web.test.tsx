import { expect, it } from 'bun:test'

// Keep the web platform mock in its own process so it cannot affect native feed tests.
it('detects clamped web text and lets it expand without making the text a button', async () => {
  const child = Bun.spawn([
    process.execPath, '--preload', './test/setup.ts', './test/fixtures/feed-post-text-web.tsx',
  ], { cwd: new URL('../..', import.meta.url).pathname, stdout: 'pipe', stderr: 'pipe' })
  const [code, stdout, stderr] = await Promise.all([
    child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
  ])
  expect({ code, output: code ? stdout + stderr : '' }).toEqual({ code: 0, output: '' })
})
