import { test } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderMarkdownTooltipContent } from '../../src/components/MarkdownTooltip.js'

/** React 19 types `ReactElement.props` as `{}`. Cast through this to access children/component. */
type TooltipSegmentProps = { children?: React.ReactNode; component?: string }
/** Typed accessor for ReactElement props in these tests. */
const propsOf = (el: React.ReactElement): TooltipSegmentProps => el.props as TooltipSegmentProps

test('renderMarkdownTooltipContent splits paragraphs and lists', () => {
  const markdown = [
    'Primary line',
    '',
    '- Item one',
    '- Item two',
  ].join('\n')
  const content = renderMarkdownTooltipContent(markdown)
  assert.ok(React.isValidElement(content))
  // eslint-disable-next-line @eslint-react/no-children-to-array -- test inspects rendered tree structure
  const segments = React.Children.toArray(propsOf(content).children)
  assert.equal(segments.length, 2)
  const paragraph = segments[0] as React.ReactElement
  assert.equal(propsOf(paragraph).component, 'p')
  const list = segments[1] as React.ReactElement
  assert.equal(propsOf(list).component, 'ul')
  // eslint-disable-next-line @eslint-react/no-children-to-array -- test inspects rendered tree structure
  const items = React.Children.toArray(propsOf(list).children)
  assert.equal(items.length, 2)
})

test('renderMarkdownTooltipContent formats inline markdown tokens', () => {
  const markdown = '**Bold** text with _italics_ and `code`.'
  const content = renderMarkdownTooltipContent(markdown)
  assert.ok(React.isValidElement(content))
  // eslint-disable-next-line @eslint-react/no-children-to-array -- test inspects rendered tree structure
  const childElements = React.Children.toArray(propsOf(content).children) as React.ReactElement[]
  const paragraph = childElements.find((node) => React.isValidElement(node) && propsOf(node).component === 'p') as React.ReactElement | undefined
  assert.ok(paragraph, 'expected a paragraph element')
  // eslint-disable-next-line @eslint-react/no-children-to-array -- test inspects rendered tree structure
  const inlineNodes = React.Children.toArray(propsOf(paragraph).children).filter(Boolean) as React.ReactElement[]
  const strong = inlineNodes.find((node) => React.isValidElement(node) && propsOf(node).component === 'strong')
  const em = inlineNodes.find((node) => React.isValidElement(node) && propsOf(node).component === 'em')
  const code = inlineNodes.find((node) => React.isValidElement(node) && propsOf(node).component === 'code')
  assert.equal(propsOf(strong!).children, 'Bold')
  assert.equal(propsOf(em!).children, 'italics')
  assert.equal(propsOf(code!).children, 'code')
})

export {}
