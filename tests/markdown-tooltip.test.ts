/* eslint-disable import/no-unused-modules */ // node:test runner picks this up via scripts/run-tests, so the module isn't imported elsewhere.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderMarkdownTooltipContent } from '../src/components/MarkdownTooltip.js'

test('renderMarkdownTooltipContent splits paragraphs and lists', () => {
  const markdown = [
    'Primary line',
    '',
    '- Item one',
    '- Item two',
  ].join('\n')
  const content = renderMarkdownTooltipContent(markdown)
  assert.ok(React.isValidElement(content))
  const segments = React.Children.toArray(content.props.children)
  assert.equal(segments.length, 2)
  const paragraph = segments[0] as React.ReactElement
  assert.equal(paragraph.props.component, 'p')
  const list = segments[1] as React.ReactElement
  assert.equal(list.props.component, 'ul')
  const items = React.Children.toArray(list.props.children)
  assert.equal(items.length, 2)
})

test('renderMarkdownTooltipContent formats inline markdown tokens', () => {
  const markdown = '**Bold** text with _italics_ and `code`.'
  const content = renderMarkdownTooltipContent(markdown)
  assert.ok(React.isValidElement(content))
  const childElements = React.Children.toArray(content.props.children) as React.ReactElement[]
  const paragraph = childElements.find((node) => (node as React.ReactElement).props?.component === 'p') as React.ReactElement | undefined
  assert.ok(paragraph, 'expected a paragraph element')
  const inlineNodes = React.Children.toArray(paragraph.props.children).filter(Boolean) as React.ReactElement[]
  const strong = inlineNodes.find((node) => node.props?.component === 'strong')
  const em = inlineNodes.find((node) => node.props?.component === 'em')
  const code = inlineNodes.find((node) => node.props?.component === 'code')
  assert.equal(strong?.props.children, 'Bold')
  assert.equal(em?.props.children, 'italics')
  assert.equal(code?.props.children, 'code')
})

export {}
