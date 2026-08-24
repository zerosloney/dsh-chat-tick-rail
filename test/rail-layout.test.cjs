const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

function datasetKey(attribute) {
  return attribute.slice(5).replace(/-([a-z])/g, function (_, letter) { return letter.toUpperCase() })
}

function setConnected(node, connected) {
  node.isConnected = connected
  for (const child of node.children) setConnected(child, connected)
}

function makeElement(tagName) {
  const attributes = new Map()
  const classNames = new Set()
  const element = {
    tagName,
    children: [],
    parentNode: null,
    nextElementSibling: null,
    isConnected: false,
    dataset: {},
    style: {},
    className: '',
    listeners: new Map(),
    classList: {
      toggle(name, force) {
        const next = force === undefined ? !classNames.has(name) : force
        if (next) classNames.add(name)
        else classNames.delete(name)
        return next
      },
      add(name) { classNames.add(name) },
      remove(name) { classNames.delete(name) },
      contains(name) { return classNames.has(name) },
    },
    textContent: '',
    innerText: '',
    setAttribute(name, value) {
      attributes.set(name, String(value))
      if (name.startsWith('data-')) element.dataset[datasetKey(name)] = String(value)
    },
    getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null },
    hasAttribute(name) { return attributes.has(name) },
    removeAttribute(name) {
      attributes.delete(name)
      if (name.startsWith('data-')) delete element.dataset[datasetKey(name)]
    },
    appendChild(child) {
      child.parentNode = element
      element.children.push(child)
      setConnected(child, element.isConnected)
      return child
    },
    remove() {
      if (element.parentNode !== null) {
        const siblings = element.parentNode.children
        const index = siblings.indexOf(element)
        if (index !== -1) siblings.splice(index, 1)
      }
      element.parentNode = null
      setConnected(element, false)
    },
    addEventListener(name, listener) {
      const handlers = element.listeners.get(name) || []
      handlers.push(listener)
      element.listeners.set(name, handlers)
    },
    removeEventListener(name, listener) {
      const handlers = element.listeners.get(name) || []
      element.listeners.set(name, handlers.filter(handler => handler !== listener))
    },
    dispatchEvent(name) {
      for (const listener of element.listeners.get(name) || []) listener({ type: name, target: element })
    },
    getBoundingClientRect() { return { top: 0, bottom: 0, height: 0, left: 0, right: 0 } },
    querySelector() { return null },
    querySelectorAll() { return [] },
  }
  return element
}

class MutationObserverMock {
  observe() {}
  disconnect() {}
}

function loadPlugin(document, windowObject) {
  const sourcePath = path.resolve(__dirname, '..', 'lib', 'client.js')
  const source = fs.readFileSync(sourcePath, 'utf8')
  let exports
  windowObject.__ModuleLoader__ = {
    load(module) { exports = module.factory(function () {}) },
  }
  const context = {
    window: windowObject,
    document,
    MutationObserver: MutationObserverMock,
    requestAnimationFrame(callback) { callback(); return 0 },
    cancelAnimationFrame() {},
    console,
  }
  vm.runInNewContext(source, context, { filename: sourcePath })
  return exports
}

function assertAlmost(actual, expected, label) {
  const value = Number.parseFloat(actual)
  assert.ok(Number.isFinite(value), `${label} should be numeric, got ${actual}`)
  assert.ok(Math.abs(value - expected) < 1e-6, `${label}: expected ${expected}, got ${actual}`)
}

test('renders a compact index rail and pins clicked previews', () => {
  const columnRect = { top: -500, bottom: 1500, height: 2000, left: 0, right: 800 }
  const centers = [150, 650, 1150, 1650, 1850]
  const userTexts = [
    'message 0',
    'User request opening that should remain visible while this intentionally long request provides enough context to exercise the combined summary limit. '.repeat(2),
    'message 2',
    'message 3',
    'message 4',
  ]
  const rows = centers.map((center, index) => {
    const row = makeElement('div')
    row.setAttribute('data-chat-anchor-key', `message-${index}`)
    row.setAttribute('data-chat-flow-kind', 'user')
    row.innerText = userTexts[index]
    row.getBoundingClientRect = function () {
      return { top: columnRect.top + center - 10, bottom: columnRect.top + center + 10, height: 20, left: 0, right: 800 }
    }
    row.isConnected = true
    return row
  })
  const spacer = makeElement('div')
  spacer.setAttribute('data-chat-flow-kind', 'meta')
  const assistant = makeElement('div')
  assistant.setAttribute('data-chat-flow-kind', 'assistant')
  assistant.innerText = 'Reasoning opening that should survive as the first thought sentence and continue past the seventy-two character limit. Further details should not appear.'
  rows[0].nextElementSibling = rows[1]
  rows[1].nextElementSibling = spacer
  spacer.nextElementSibling = assistant
  assistant.nextElementSibling = rows[2]
  rows[2].nextElementSibling = rows[3]
  rows[3].nextElementSibling = rows[4]
  rows[4].nextElementSibling = null

  const column = makeElement('div')
  column.isConnected = true
  column.scrollHeight = 2000
  column.getBoundingClientRect = function () { return columnRect }
  column.querySelectorAll = function (selector) {
    return selector === ':scope > [data-chat-flow-kind="user"]' ? rows : []
  }
  column.querySelector = function (selector) {
    const match = /^\[data-chat-anchor-key="([^"]+)"\]$/.exec(selector)
    return match === null ? null : rows.find(row => row.getAttribute('data-chat-anchor-key') === match[1]) || null
  }

  const portRect = { top: 300, bottom: 700, height: 400, left: 100, right: 900 }
  const port = makeElement('div')
  port.isConnected = true
  port.scrollHeight = 10000
  port.scrollTop = 800
  port.clientHeight = 400
  const scrollCalls = []
  port.scrollBy = function (options) { scrollCalls.push(options) }
  port.getBoundingClientRect = function () { return portRect }
  port.querySelector = function (selector) { return selector === '[data-chat-flow]' ? column : null }

  const body = makeElement('body')
  const head = makeElement('head')
  body.isConnected = true
  head.isConnected = true
  const document = {
    body,
    head,
    createElement: makeElement,
    querySelector() { return null },
    querySelectorAll(selector) { return selector === '[data-conversation-scroll]' ? [port] : [] },
    addEventListener() {},
  }
  const windowObject = {
    CSS: undefined,
    innerHeight: 1000,
    addEventListener() {},
    removeEventListener() {},
    matchMedia() { return { matches: false } },
  }
  const effects = []
  const plugin = loadPlugin(document, windowObject)
  plugin.apply({
    effect(effect) {
      const teardown = effect()
      effects.push(teardown)
      return teardown
    },
  })

  const rail = body.children.find(child => child.dataset.dshTickRail === '')
  assert.ok(rail, 'rail should be mounted')
  const ticks = rail.children.filter(child => child.className === 'tick')
  assert.equal(ticks.length, 5)
  assert.equal(rail.style.height, '50px')
  assert.equal(rail.style.top, '475px')
  assertAlmost(ticks[0].style.top, 5, 'first tick top')
  assertAlmost(ticks[1].style.top, 15, 'second tick top')
  assertAlmost(ticks[2].style.top, 25, 'third tick top')
  assertAlmost(ticks[3].style.top, 35, 'fourth tick top')
  assertAlmost(ticks[4].style.top, 45, 'fifth tick top')
  assertAlmost(parseFloat(ticks[1].style.top) - parseFloat(ticks[0].style.top), 10, 'first tick gap')
  assertAlmost(parseFloat(ticks[2].style.top) - parseFloat(ticks[1].style.top), 10, 'second tick gap')

  const marker = rail.children.find(child => child.className === 'marker')
  assert.ok(marker, 'marker should be mounted')
  assert.equal(marker.hasAttribute('data-hidden'), false)
  assert.equal(marker.style.top, '20px')
  assert.equal(marker.style.height, '10px')

  const tooltip = body.children.find(child => child.dataset.dshTickRailTooltip === '')
  assert.ok(tooltip, 'tooltip should be mounted')
  ticks[2].dispatchEvent('pointerenter')
  assert.equal(rail.hasAttribute('data-hovering'), true)
  assert.equal(ticks[1].classList.contains('near'), true)
  assert.equal(ticks[1].classList.contains('approach'), true)
  assert.equal(ticks[3].classList.contains('approach'), true)
  assert.equal(ticks[0].classList.contains('approach-far'), true)
  assert.equal(ticks[4].classList.contains('approach-far'), true)
  const style = head.children.find(child => child.tagName === 'style')
  assert.ok(style.textContent.includes('[data-dsh-tick-rail][data-hovering] .tick.near'))
  assert.ok(style.textContent.includes('.tick.approach-far'))
  ticks[2].dispatchEvent('pointerleave')
  assert.equal(rail.hasAttribute('data-hovering'), false)
  assert.equal(ticks[0].classList.contains('approach'), false)
  assert.equal(ticks[0].classList.contains('approach-far'), false)
  assert.equal(ticks[1].classList.contains('approach'), false)
  assert.equal(ticks[3].classList.contains('approach'), false)
  assert.equal(ticks[4].classList.contains('approach-far'), false)

  ticks[1].dispatchEvent('click')
  assert.equal(scrollCalls.length, 1)
  assert.equal(scrollCalls[0].top, -220)
  assert.equal(scrollCalls[0].behavior, 'smooth')
  assert.equal(tooltip.hasAttribute('data-hidden'), false)
  const pinnedSummary = tooltip.textContent
  assert.ok(pinnedSummary.includes('User request opening'))
  assert.ok(pinnedSummary.includes('Reasoning opening'))
  assert.ok(pinnedSummary.length <= 160)
  assert.ok(pinnedSummary.split(' · ')[1].length <= 72)

  ticks[0].dispatchEvent('pointerenter')
  assert.equal(tooltip.textContent, 'message 0')
  ticks[0].dispatchEvent('pointerleave')
  assert.equal(tooltip.hasAttribute('data-hidden'), false)
  assert.equal(tooltip.textContent, pinnedSummary)

  ticks[2].dispatchEvent('click')
  assert.equal(scrollCalls.length, 2)
  assert.equal(tooltip.hasAttribute('data-hidden'), false)
  assert.equal(tooltip.textContent, 'message 2')

  for (const teardown of effects) {
    if (typeof teardown === 'function') teardown()
  }
  assert.equal(body.children.includes(rail), false)
  assert.equal(body.children.includes(tooltip), false)
})
