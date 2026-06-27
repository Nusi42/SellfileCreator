import { test } from 'node:test'
import assert from 'node:assert/strict'
import { refractor } from 'refractor'
import '../../src/lib/prismDynamicOverrides.js'

// The editor source mirror highlights with `language-markdown`, into which
// prismDynamicOverrides injects custom blocks so every bespoke `<!--` tag gets the
// same recognizable colour as `<!-- dungeon-simulator -->` instead of the muted grey
// generic HTML-comment treatment. These tests pin that the wrapper/structure markers
// (collapse, conditional, prose-language) tokenize through `note-markers-block` and
// resolve to the inner classes (`marker-kw`, `comment-delimiter`, `punctuation`) that
// styles.css colours.

type HastNode = {
  type: string
  value?: string
  properties?: { className?: string[] }
  children?: HastNode[]
}

// Top-level token classes produced for `source` under the markdown grammar.
function topClasses(source: string): string[] {
  const tree = refractor.highlight(source, 'markdown') as unknown as HastNode
  return (tree.children ?? [])
    .filter((c) => c.type === 'element')
    .map((c) => (c.properties?.className ?? []).join('.'))
}

// Flattened `class:"text"` pairs for every nested token inside `source`, excluding the
// outer block wrapper, so we can assert the keyword/delimiter sub-tokens.
function innerTokens(source: string): string[] {
  const out: string[] = []
  const walk = (node: HastNode): void => {
    if (node.type === 'element' && node.properties?.className) {
      const cls = node.properties.className.join('.')
      if (cls !== 'token.note-markers-block') {
        const text = (node.children ?? []).filter((c) => c.type === 'text').map((c) => c.value).join('')
        out.push(`${cls}:${text}`)
      }
    }
    ;(node.children ?? []).forEach(walk)
  }
  walk(refractor.highlight(source, 'markdown') as unknown as HastNode)
  return out
}

test('every bespoke wrapper/structure marker tokenizes through note-markers-block', () => {
  const markers = [
    '<!-- lang -->',
    '<!-- lang:de -->',
    '<!-- lang:pt-BR -->',
    '<!-- /lang -->',
    '<!-- collapse -->',
    '<!-- /collapse -->',
    '<!-- if-no-endpoint -->',
    '<!-- /if-no-endpoint -->',
    '<!-- end-if -->', // legacy conditional close
    '<!-- dungeon-simulator -->',
  ]
  for (const m of markers) {
    assert.deepEqual(topClasses(m), ['token.note-markers-block'], `marker not colorized: ${m}`)
  }
})

test('lang carries its locale code inside one keyword unit; the close slash is punctuation', () => {
  // `lang:de` stays a single marker-kw so the whole tag reads as one coloured unit.
  assert.deepEqual(innerTokens('<!-- lang:de -->'), [
    'token.comment-delimiter:<!-- ',
    'token.marker-kw:lang:de',
    'token.comment-delimiter:-->',
  ])
  // The close form splits the leading slash off as punctuation, then the bare keyword.
  assert.deepEqual(innerTokens('<!-- /lang -->'), [
    'token.comment-delimiter:<!-- ',
    'token.punctuation:/',
    'token.marker-kw:lang',
    'token.comment-delimiter:-->',
  ])
})

test('argument-less wrapper keywords resolve to marker-kw between the delimiters', () => {
  for (const [marker, kw] of [
    ['<!-- collapse -->', 'collapse'],
    ['<!-- if-no-endpoint -->', 'if-no-endpoint'],
    ['<!-- end-if -->', 'end-if'],
  ] as const) {
    assert.deepEqual(innerTokens(marker), [
      'token.comment-delimiter:<!-- ',
      `token.marker-kw:${kw}`,
      'token.comment-delimiter:-->',
    ])
  }
})

test('authored inline HTML exposes tag / attr-name / attr-value classes for colouring', () => {
  // styles.css colours `.token.tag`, `.token.attr-name`, `.token.attr-value` in the mirror;
  // this pins that the markdown grammar still emits those classes for the note's `<span>` HTML.
  const leaves = innerTokens('<span data-color="red" data-blink>Hi</span>')
    .map((t) => t.split(':')[0])
  assert.ok(leaves.includes('token.tag'), 'no token.tag (element name)')
  assert.ok(leaves.includes('token.attr-name'), 'no token.attr-name (data-color/data-blink)')
  assert.ok(leaves.includes('token.attr-value'), 'no token.attr-value (red)')
  // `<br>` is a bare tag with no attributes.
  assert.ok(innerTokens('a<br>b').some((t) => t === 'token.tag:br'), 'no token.tag for <br>')
})

test('the inline data markers still tokenize as before (no regression)', () => {
  assert.deepEqual(topClasses('<!-- recipes: 1,2 -->'), ['token.note-markers-block'])
  assert.deepEqual(innerTokens('<!-- recipes-re: "speed" -->'), [
    'token.comment-delimiter:<!-- ',
    'token.marker-kw:recipes-re',
    'token.punctuation::',
    'token.string:"speed"',
    'token.comment-delimiter:-->',
  ])
})

export {}
