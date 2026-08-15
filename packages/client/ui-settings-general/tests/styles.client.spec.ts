/** Settings shell stylesheet contracts asserted against the CSS text on disk. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/SettingsRoot.module.css', import.meta.url)), 'utf8')

function blocks(selector: string): string[] {
  return [...css.matchAll(new RegExp(`^[ \\t]*\\${selector} \\{([^}]*)\\}`, 'gm'))]
    .map(match => match[1] ?? '')
}

describe('SettingsRoot responsive styles', () => {
  it('closes every block, so no rule is swallowed by the one above it', () => {
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect((bare.match(/\}/g) ?? []).length).toBe((bare.match(/\{/g) ?? []).length)
  })

  it('stacks the two-column panel into a full sheet below 720px', () => {
    expect(css).toMatch(/@media \(max-width: 720px\)/)
    expect(blocks('.panel')).toContainEqual(expect.stringMatching(/flex-direction:\s*column/))
    expect(blocks('.panel')).toContainEqual(expect.stringMatching(/max-width:\s*none/))
    expect(blocks('.panel')).toContainEqual(expect.stringMatching(/border-radius:\s*0/))
    expect(blocks('.navList')).toContainEqual(expect.stringMatching(/flex-direction:\s*row/))
  })
})
