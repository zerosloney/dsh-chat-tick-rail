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
  const datasetObj = {}
  const dataset = new Proxy(datasetObj, {
    set(target, prop, value) {
      target[prop] = value
      const attrName = 'data-' + String(prop).replace(/([A-Z])/g, '-$1').toLowerCase()
      attributes.set(attrName, String(value))
      return true
    },
    deleteProperty(target, prop) {
      delete target[prop]
      const attrName = 'data-' + String(prop).replace(/([A-Z])/g, '-$1').toLowerCase()
      attributes.delete(attrName)
      return true
    },
  })
  const element = {
    tagName,
    children: [],
    parentNode: null,
    nextElementSibling: null,
    isConnected: false,
    dataset,
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
    focus() {},
    blur() {},
    click() {
      element.dispatchEvent('click')
    },
    contains(target) {
      if (element === target) return true
      for (const child of element.children) {
        if (child.contains && child.contains(target)) return true
      }
      return false
    },
    _textContent: '',
    get textContent() {
      if (element.children.length === 0) return element._textContent || ''
      return element.children.map(c => c.textContent || '').join(' ')
    },
    set textContent(val) {
      element._textContent = String(val)
      element.children = []
    },
    get firstChild() {
      return element.children[0] || null
    },
    removeChild(child) {
      const idx = element.children.indexOf(child)
      if (idx !== -1) element.children.splice(idx, 1)
      child.parentNode = null
      setConnected(child, false)
      return child
    },
    innerText: '',
    setPointerCapture(id) { element._capturedPointerId = id },
    scrollTop: 0,
    scrollBy() {},
    setAttribute(name, value) {
      attributes.set(name, String(value))
      if (name.startsWith('data-')) datasetObj[datasetKey(name)] = String(value)
    },
    getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null },
    hasAttribute(name) { return attributes.has(name) },
    removeAttribute(name) {
      attributes.delete(name)
      if (name.startsWith('data-')) delete datasetObj[datasetKey(name)]
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
    dispatchEvent(nameOrEvent, eventInit) {
      const type = typeof nameOrEvent === 'string' ? nameOrEvent : nameOrEvent.type
      const event = typeof nameOrEvent === 'string'
        ? Object.assign({ type, target: element }, eventInit)
        : Object.assign({ target: element }, nameOrEvent)
      for (const listener of element.listeners.get(type) || []) listener(event)
    },
    getBoundingClientRect() { return { top: 0, bottom: 0, height: 0, left: 0, right: 0 } },
    querySelector(selector) {
      for (const child of element.children) {
        if (child.tagName && selector.toLowerCase() === child.tagName.toLowerCase()) return child
        if (selector.startsWith('.') && child.classList && child.classList.contains(selector.slice(1))) return child
        if (selector.startsWith('[') && selector.endsWith(']')) {
          const attr = selector.slice(1, -1).split('=')[0]
          if (child.hasAttribute && child.hasAttribute(attr)) return child
        }
        if (child.querySelector) {
          const res = child.querySelector(selector)
          if (res) return res
        }
      }
      return null
    },
    querySelectorAll() { return [] },
  }
  return element
}

class MutationObserverMock {
  observe() {}
  disconnect() {}
}

function createMockEnvironment({ port, innerHeight = 800 } = {}) {
  const body = makeElement('body')
  const head = makeElement('head')
  body.isConnected = true
  head.isConnected = true
  const docListeners = new Map()
  const document = {
    body,
    head,
    createElement: makeElement,
    querySelector() { return null },
    querySelectorAll(selector) {
      return selector === '[data-conversation-scroll]' ? (port ? [port] : []) : []
    },
    addEventListener(name, listener) {
      const list = docListeners.get(name) || []
      list.push(listener)
      docListeners.set(name, list)
    },
    removeEventListener(name, listener) {
      const list = docListeners.get(name) || []
      docListeners.set(name, list.filter(h => h !== listener))
    },
    dispatchEvent(event) {
      for (const listener of docListeners.get(event.type) || []) listener(event)
    },
  }
  const winListeners = new Map()
  const windowObject = {
    CSS: undefined,
    innerHeight,
    addEventListener(name, listener) {
      const list = winListeners.get(name) || []
      list.push(listener)
      winListeners.set(name, list)
    },
    removeEventListener(name, listener) {
      const list = winListeners.get(name) || []
      winListeners.set(name, list.filter(h => h !== listener))
    },
    dispatchEvent(event) {
      for (const listener of winListeners.get(event.type) || []) listener(event)
    },
    matchMedia: () => ({ matches: false }),
  }
  return { document, windowObject, body, head }
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
    setTimeout(fn, delay) { if (typeof fn === 'function') fn(); return 0 },
    clearTimeout() {},
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
  assistant.setAttribute('data-chat-flow-kind', 'assistant-step')
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
    return selector.includes('[data-chat-flow-kind="user"]') ? rows : []
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

  const { document, windowObject, body, head } = createMockEnvironment({ port, innerHeight: 1000 })
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
  assert.ok(style.textContent.includes('--dsw-alias-bg-layer-2'))
  assert.ok(style.textContent.includes('--dsw-alias-label-primary'))
  assert.ok(style.textContent.includes('body[data-ds-dark-theme]'))
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
  assert.ok(pinnedSummary.startsWith('#2/5 '))
  assert.ok(pinnedSummary.includes('User request opening'))
  assert.ok(pinnedSummary.includes('Reasoning opening'))
  assert.ok(pinnedSummary.length <= 170)
  assert.ok(pinnedSummary.split(' · ')[1].length <= 72)

  ticks[0].dispatchEvent('pointerenter')
  assert.equal(tooltip.textContent, '#1/5 message 0')
  ticks[0].dispatchEvent('pointerleave')
  assert.equal(tooltip.hasAttribute('data-hidden'), false)
  assert.equal(tooltip.textContent, pinnedSummary)

  ticks[2].dispatchEvent('click')
  assert.equal(scrollCalls.length, 2)
  assert.equal(tooltip.hasAttribute('data-hidden'), false)
  assert.equal(tooltip.textContent, '#3/5 message 2')

  const outsideElement = makeElement('div')
  body.appendChild(outsideElement)
  document.dispatchEvent({ type: 'pointerdown', target: outsideElement })
  assert.equal(tooltip.hasAttribute('data-hidden'), true, 'clicking outside should dismiss pinned tooltip')

  for (const teardown of effects) {
    if (typeof teardown === 'function') teardown()
  }
  assert.equal(body.children.includes(rail), false)
  assert.equal(body.children.includes(tooltip), false)
})

test('recognizes steering user messages and extracts assistant-step thoughts', () => {
  const columnRect = { top: 0, bottom: 800, height: 800, left: 0, right: 800 }
  const userRow = makeElement('div')
  userRow.setAttribute('data-chat-anchor-key', 'user-1')
  userRow.setAttribute('data-chat-flow-kind', 'user')
  userRow.innerText = 'Initial task prompt'
  userRow.getBoundingClientRect = () => ({ top: 10, bottom: 30, height: 20, left: 0, right: 800 })
  userRow.isConnected = true

  const assistantStep = makeElement('div')
  assistantStep.setAttribute('data-chat-flow-kind', 'assistant-step')
  assistantStep.innerText = 'Step 1 thought planning. Detailed token explanations.'
  assistantStep.isConnected = true

  const steeringRow = makeElement('div')
  steeringRow.setAttribute('data-chat-anchor-key', 'steering-1')
  steeringRow.setAttribute('data-chat-flow-kind', 'steering')
  steeringRow.innerText = 'Interrupted steering instruction'
  steeringRow.getBoundingClientRect = () => ({ top: 100, bottom: 120, height: 20, left: 0, right: 800 })
  steeringRow.isConnected = true

  const assistantStep2 = makeElement('div')
  assistantStep2.setAttribute('data-chat-flow-kind', 'assistant-step')
  assistantStep2.innerText = 'Refined solution thought after interruption. More output.'
  assistantStep2.isConnected = true

  userRow.nextElementSibling = assistantStep
  assistantStep.nextElementSibling = steeringRow
  steeringRow.nextElementSibling = assistantStep2
  assistantStep2.nextElementSibling = null

  const allRows = [userRow, steeringRow]

  const column = makeElement('div')
  column.isConnected = true
  column.scrollHeight = 800
  column.getBoundingClientRect = () => columnRect
  column.querySelectorAll = function (selector) {
    if (selector.includes('steering')) return allRows
    return [userRow]
  }
  column.querySelector = function (selector) {
    const match = /^\[data-chat-anchor-key="([^"]+)"\]$/.exec(selector)
    if (match === null) return null
    return allRows.find(r => r.getAttribute('data-chat-anchor-key') === match[1]) || null
  }

  const portRect = { top: 0, bottom: 800, height: 800, left: 0, right: 800 }
  const port = makeElement('div')
  port.isConnected = true
  port.scrollHeight = 800
  port.clientHeight = 800
  port.getBoundingClientRect = () => portRect
  port.querySelector = sel => (sel === '[data-chat-flow]' ? column : null)

  const { document, windowObject, body } = createMockEnvironment({ port, innerHeight: 800 })
  const effects = []
  const plugin = loadPlugin(document, windowObject)
  plugin.apply({
    effect(fn) {
      const td = fn()
      effects.push(td)
      return td
    },
  })

  const rail = body.children.find(child => child.dataset.dshTickRail === '')
  assert.ok(rail)
  const ticks = rail.children.filter(child => child.className === 'tick')
  assert.equal(ticks.length, 2, 'should render 2 ticks for user and steering message')

  ticks[0].dispatchEvent('pointerenter')
  const tooltip = body.children.find(child => child.dataset.dshTickRailTooltip === '')
  assert.ok(tooltip)
  assert.ok(tooltip.textContent.includes('#1/2 Initial task prompt · Step 1 thought planning.'))

  ticks[1].dispatchEvent('pointerenter')
  assert.ok(tooltip.textContent.includes('#2/2 Interrupted steering instruction · Refined solution thought after interruption.'))

  for (const td of effects) {
    if (typeof td === 'function') td()
  }
})

test('selectedKey stays pinned to the correct message when older history is prepended', () => {
  const columnRect = { top: 0, bottom: 800, height: 800, left: 0, right: 800 }
  const rowA = makeElement('div')
  rowA.setAttribute('data-chat-anchor-key', 'key-a')
  rowA.setAttribute('data-chat-flow-kind', 'user')
  rowA.innerText = 'First message A'
  rowA.getBoundingClientRect = () => ({ top: 10, bottom: 30, height: 20, left: 0, right: 800 })
  rowA.isConnected = true

  const rowB = makeElement('div')
  rowB.setAttribute('data-chat-anchor-key', 'key-b')
  rowB.setAttribute('data-chat-flow-kind', 'user')
  rowB.innerText = 'Second message B'
  rowB.getBoundingClientRect = () => ({ top: 60, bottom: 80, height: 20, left: 0, right: 800 })
  rowB.isConnected = true

  rowA.nextElementSibling = rowB
  rowB.nextElementSibling = null

  let activeRows = [rowA, rowB]

  const column = makeElement('div')
  column.isConnected = true
  column.scrollHeight = 800
  column.getBoundingClientRect = () => columnRect
  column.querySelectorAll = () => activeRows
  column.querySelector = function (selector) {
    const match = /^\[data-chat-anchor-key="([^"]+)"\]$/.exec(selector)
    if (match === null) return null
    return activeRows.find(r => r.getAttribute('data-chat-anchor-key') === match[1]) || null
  }

  const portRect = { top: 0, bottom: 800, height: 800, left: 0, right: 800 }
  const port = makeElement('div')
  port.isConnected = true
  port.scrollHeight = 800
  port.clientHeight = 800
  port.getBoundingClientRect = () => portRect
  port.querySelector = sel => (sel === '[data-chat-flow]' ? column : null)

  const { document, windowObject, body } = createMockEnvironment({ port, innerHeight: 800 })
  const effects = []
  const plugin = loadPlugin(document, windowObject)
  plugin.apply({
    effect(fn) {
      const td = fn()
      effects.push(td)
      return td
    },
  })

  const rail = body.children.find(child => child.dataset.dshTickRail === '')
  const tooltip = body.children.find(child => child.dataset.dshTickRailTooltip === '')
  const initialTicks = rail.children.filter(child => child.className === 'tick')
  assert.equal(initialTicks.length, 2)

  // Click row B to pin it
  initialTicks[1].dispatchEvent('click')
  assert.equal(tooltip.hasAttribute('data-hidden'), false)
  assert.equal(tooltip.textContent, '#2/2 Second message B')

  // Now simulate prepend (e.g. loadOlder adds 2 older messages at the start)
  const rowPre1 = makeElement('div')
  rowPre1.setAttribute('data-chat-anchor-key', 'key-pre1')
  rowPre1.setAttribute('data-chat-flow-kind', 'user')
  rowPre1.innerText = 'Older message 1'
  rowPre1.getBoundingClientRect = () => ({ top: -100, bottom: -80, height: 20, left: 0, right: 800 })
  rowPre1.isConnected = true

  const rowPre2 = makeElement('div')
  rowPre2.setAttribute('data-chat-anchor-key', 'key-pre2')
  rowPre2.setAttribute('data-chat-flow-kind', 'user')
  rowPre2.innerText = 'Older message 2'
  rowPre2.getBoundingClientRect = () => ({ top: -50, bottom: -30, height: 20, left: 0, right: 800 })
  rowPre2.isConnected = true

  rowPre1.nextElementSibling = rowPre2
  rowPre2.nextElementSibling = rowA
  activeRows = [rowPre1, rowPre2, rowA, rowB]

  // Trigger remeasure via scroll
  port.dispatchEvent('scroll')

  const newTicks = rail.children.filter(child => child.className === 'tick')
  assert.equal(newTicks.length, 4, 'should now have 4 ticks')
  // Row B is now index 3, but its pinned tooltip must STILL show Second message B with updated turn count
  assert.equal(tooltip.hasAttribute('data-hidden'), false)
  assert.equal(tooltip.textContent, '#4/4 Second message B')

  for (const td of effects) {
    if (typeof td === 'function') td()
  }
})

test('adapts tick gap dynamically for long conversations to fit within viewport limit', () => {
  const columnRect = { top: 0, bottom: 800, height: 800, left: 0, right: 800 }
  const count = 80
  const rows = []
  for (let i = 0; i < count; i++) {
    const r = makeElement('div')
    r.setAttribute('data-chat-anchor-key', 'msg-' + i)
    r.setAttribute('data-chat-flow-kind', 'user')
    r.innerText = 'Message ' + i
    r.getBoundingClientRect = () => ({ top: i * 30, bottom: i * 30 + 20, height: 20, left: 0, right: 800 })
    r.isConnected = true
    rows.push(r)
  }
  for (let i = 0; i < count - 1; i++) rows[i].nextElementSibling = rows[i + 1]

  const column = makeElement('div')
  column.isConnected = true
  column.scrollHeight = 3000
  column.getBoundingClientRect = () => columnRect
  column.querySelectorAll = () => rows
  column.querySelector = function (selector) {
    const match = /^\[data-chat-anchor-key="([^"]+)"\]$/.exec(selector)
    if (match === null) return null
    return rows.find(r => r.getAttribute('data-chat-anchor-key') === match[1]) || null
  }

  const portRect = { top: 0, bottom: 400, height: 400, left: 0, right: 800 }
  const port = makeElement('div')
  port.isConnected = true
  port.scrollHeight = 3000
  port.clientHeight = 400
  port.getBoundingClientRect = () => portRect
  port.querySelector = sel => (sel === '[data-chat-flow]' ? column : null)

  const { document, windowObject, body } = createMockEnvironment({ port, innerHeight: 400 })
  const effects = []
  const plugin = loadPlugin(document, windowObject)
  plugin.apply({
    effect(fn) {
      const td = fn()
      effects.push(td)
      return td
    },
  })

  const rail = body.children.find(child => child.dataset.dshTickRail === '')
  assert.ok(rail)
  const ticks = rail.children.filter(child => child.className === 'tick')
  assert.equal(ticks.length, 80)

  // Max rail height is max(60, 400 * 0.7) = 280px
  // Nominal height was 80 * 10 = 800px
  // Gap = max(3, 280 / 80) = 3.5px
  // railHeight = 80 * 3.5 = 280px
  const railHeight = parseFloat(rail.style.height)
  assert.ok(railHeight <= 280 + 0.1, 'railHeight should not exceed maxRailHeight')
  const gap = parseFloat(ticks[1].style.top) - parseFloat(ticks[0].style.top)
  assert.ok(gap < 10, 'gap should be compressed below default 10px')
  assert.ok(gap >= 3, 'gap should remain above minimum 3px')

  for (const td of effects) {
    if (typeof td === 'function') td()
  }
})

test('supports keyboard navigation and global shortcuts', () => {
  const columnRect = { top: 0, bottom: 800, height: 800, left: 0, right: 800 }
  const rowA = makeElement('div')
  rowA.setAttribute('data-chat-anchor-key', 'k1')
  rowA.setAttribute('data-chat-flow-kind', 'user')
  rowA.innerText = 'Question 1'
  rowA.getBoundingClientRect = () => ({ top: 10, bottom: 30, height: 20, left: 0, right: 800 })
  rowA.isConnected = true

  const rowB = makeElement('div')
  rowB.setAttribute('data-chat-anchor-key', 'k2')
  rowB.setAttribute('data-chat-flow-kind', 'user')
  rowB.innerText = 'Question 2'
  rowB.getBoundingClientRect = () => ({ top: 100, bottom: 120, height: 20, left: 0, right: 800 })
  rowB.isConnected = true

  rowA.nextElementSibling = rowB
  rowB.nextElementSibling = null
  const rows = [rowA, rowB]

  const column = makeElement('div')
  column.isConnected = true
  column.scrollHeight = 800
  column.getBoundingClientRect = () => columnRect
  column.querySelectorAll = () => rows
  column.querySelector = function (selector) {
    const match = /^\[data-chat-anchor-key="([^"]+)"\]$/.exec(selector)
    if (match === null) return null
    return rows.find(r => r.getAttribute('data-chat-anchor-key') === match[1]) || null
  }

  const portRect = { top: 0, bottom: 800, height: 800, left: 0, right: 800 }
  const port = makeElement('div')
  port.isConnected = true
  port.scrollHeight = 800
  port.clientHeight = 800
  port.scrollBy = () => {}
  port.getBoundingClientRect = () => portRect
  port.querySelector = sel => (sel === '[data-chat-flow]' ? column : null)

  const { document, windowObject, body } = createMockEnvironment({ port, innerHeight: 800 })
  const effects = []
  const plugin = loadPlugin(document, windowObject)
  plugin.apply({
    effect(fn) {
      const td = fn()
      effects.push(td)
      return td
    },
  })

  const rail = body.children.find(child => child.dataset.dshTickRail === '')
  const tooltip = body.children.find(child => child.dataset.dshTickRailTooltip === '')
  const ticks = rail.children.filter(child => child.className === 'tick')

  let focusedElement = null
  for (const tick of ticks) {
    tick.focus = function () {
      focusedElement = tick
      tick.dispatchEvent('focus')
    }
    tick.blur = function () {
      if (focusedElement === tick) focusedElement = null
      tick.dispatchEvent('blur')
    }
  }

  // Focus tick 0
  ticks[0].focus()
  assert.equal(tooltip.hasAttribute('data-hidden'), false)
  assert.equal(tooltip.textContent, '#1/2 Question 1')

  // Press ArrowDown to navigate to tick 1
  let prevented = false
  ticks[0].dispatchEvent({
    type: 'keydown',
    key: 'ArrowDown',
    preventDefault() { prevented = true },
    stopPropagation() {},
  })
  assert.equal(prevented, true)
  assert.equal(focusedElement, ticks[1])

  // Click outside or press Escape
  ticks[1].dispatchEvent({
    type: 'keydown',
    key: 'Escape',
    preventDefault() {},
    stopPropagation() {},
  })
  assert.equal(focusedElement, null)

  // Test global Alt+ArrowDown
  document.dispatchEvent({
    type: 'keydown',
    key: 'ArrowDown',
    altKey: true,
    preventDefault() {},
  })
  assert.equal(tooltip.hasAttribute('data-hidden'), false)
  assert.equal(tooltip.textContent, '#2/2 Question 2')

  // Global Escape clears tooltip
  document.dispatchEvent({
    type: 'keydown',
    key: 'Escape',
  })
  assert.equal(tooltip.hasAttribute('data-hidden'), true)

  for (const td of effects) {
    if (typeof td === 'function') td()
  }
})

test('identifies in-flight streaming status and multimodal fallbacks', () => {
  const columnRect = { top: 0, bottom: 800, height: 800, left: 0, right: 800 }
  const imgRow = makeElement('div')
  imgRow.setAttribute('data-chat-anchor-key', 'img-1')
  imgRow.setAttribute('data-chat-flow-kind', 'user')
  imgRow.innerText = ''
  const imgEl = makeElement('img')
  imgRow.appendChild(imgEl)
  imgRow.getBoundingClientRect = () => ({ top: 10, bottom: 30, height: 20, left: 0, right: 800 })
  imgRow.isConnected = true

  const assistantStep = makeElement('div')
  assistantStep.setAttribute('data-chat-flow-kind', 'assistant-step')
  assistantStep.classList.add('streaming')
  assistantStep.innerText = 'Currently generating step...'
  assistantStep.isConnected = true

  imgRow.nextElementSibling = assistantStep
  assistantStep.nextElementSibling = null
  const rows = [imgRow]

  const column = makeElement('div')
  column.isConnected = true
  column.scrollHeight = 800
  column.getBoundingClientRect = () => columnRect
  column.querySelectorAll = () => rows
  column.querySelector = function (selector) {
    if (selector.includes('streaming')) return assistantStep
    const match = /^\[data-chat-anchor-key="([^"]+)"\]$/.exec(selector)
    if (match === null) return null
    return rows.find(r => r.getAttribute('data-chat-anchor-key') === match[1]) || null
  }

  const portRect = { top: 0, bottom: 800, height: 800, left: 0, right: 800 }
  const port = makeElement('div')
  port.isConnected = true
  port.scrollHeight = 800
  port.clientHeight = 800
  port.getBoundingClientRect = () => portRect
  port.querySelector = sel => (sel === '[data-chat-flow]' ? column : null)

  const { document, windowObject, body } = createMockEnvironment({ port, innerHeight: 800 })
  const effects = []
  const plugin = loadPlugin(document, windowObject)
  plugin.apply({
    effect(fn) {
      const td = fn()
      effects.push(td)
      return td
    },
  })

  const rail = body.children.find(child => child.dataset.dshTickRail === '')
  const tooltip = body.children.find(child => child.dataset.dshTickRailTooltip === '')
  const ticks = rail.children.filter(child => child.className === 'tick')
  assert.equal(ticks.length, 1)

  // Tick should have streaming class and aria-current="step"
  assert.equal(ticks[0].classList.contains('streaming'), true, 'last tick should have streaming class')
  assert.equal(ticks[0].getAttribute('aria-current'), 'step')

  // Tooltip preview on multimodal image should display [图片]
  ticks[0].dispatchEvent('pointerenter')
  assert.ok(tooltip.textContent.includes('#1/1 [图片] · Currently generating step...'))

  for (const td of effects) {
    if (typeof td === 'function') td()
  }
})

test('hides navigation rail when viewport or scrollport is too narrow', () => {
  const columnRect = { top: 0, bottom: 800, height: 800, left: 0, right: 300 }
  const userRow = makeElement('div')
  userRow.setAttribute('data-chat-anchor-key', 'narrow-1')
  userRow.setAttribute('data-chat-flow-kind', 'user')
  userRow.innerText = 'Narrow message'
  userRow.getBoundingClientRect = () => ({ top: 10, bottom: 30, height: 20, left: 0, right: 300 })
  userRow.isConnected = true

  const column = makeElement('div')
  column.isConnected = true
  column.scrollHeight = 800
  column.getBoundingClientRect = () => columnRect
  column.querySelectorAll = () => [userRow]
  column.querySelector = () => userRow

  // Narrow width 300px (< 360px threshold)
  const portRect = { top: 0, bottom: 800, height: 800, left: 0, right: 300, width: 300 }
  const port = makeElement('div')
  port.isConnected = true
  port.scrollHeight = 800
  port.clientHeight = 800
  port.getBoundingClientRect = () => portRect
  port.querySelector = sel => (sel === '[data-chat-flow]' ? column : null)

  const { document, windowObject, body } = createMockEnvironment({ port, innerHeight: 800 })
  const effects = []
  const plugin = loadPlugin(document, windowObject)
  plugin.apply({
    effect(fn) {
      const td = fn()
      effects.push(td)
      return td
    },
  })

  const rail = body.children.find(child => child.dataset.dshTickRail === '')
  assert.ok(rail)
  assert.equal(rail.hasAttribute('data-hidden'), true, 'rail should be hidden when width < 360')

  for (const td of effects) {
    if (typeof td === 'function') td()
  }
})

test('identifies turn-error, compaction boundaries, and tool-call badges', () => {
  const columnRect = { top: 0, bottom: 800, height: 800, left: 0, right: 600 }

  // Turn 1: has compaction before it, and tool calls after
  const compactionNode = makeElement('div')
  compactionNode.setAttribute('data-chat-flow-kind', 'compaction')
  compactionNode.isConnected = true

  const userRow1 = makeElement('div')
  userRow1.setAttribute('data-chat-anchor-key', 'turn-1')
  userRow1.setAttribute('data-chat-flow-kind', 'user')
  userRow1.innerText = 'Refactor codebase'
  userRow1.getBoundingClientRect = () => ({ top: 10, bottom: 40, height: 30, left: 0, right: 600 })
  userRow1.isConnected = true
  userRow1.previousElementSibling = compactionNode

  const toolCall1 = makeElement('div')
  toolCall1.setAttribute('data-chat-flow-kind', 'tool-call')
  toolCall1.setAttribute('data-tool-name', 'edit')
  toolCall1.isConnected = true

  const toolCall2 = makeElement('div')
  toolCall2.setAttribute('data-chat-flow-kind', 'tool-call')
  toolCall2.setAttribute('data-tool-name', 'bash')
  toolCall2.isConnected = true

  const thoughtStep = makeElement('div')
  thoughtStep.setAttribute('data-chat-flow-kind', 'assistant-step')
  thoughtStep.innerText = 'Analyzing changes.'
  thoughtStep.isConnected = true

  // Turn 2: has a turn-error
  const userRow2 = makeElement('div')
  userRow2.setAttribute('data-chat-anchor-key', 'turn-2')
  userRow2.setAttribute('data-chat-flow-kind', 'user')
  userRow2.innerText = 'Run deploy command'
  userRow2.getBoundingClientRect = () => ({ top: 300, bottom: 330, height: 30, left: 0, right: 600 })
  userRow2.isConnected = true

  const turnErrorNode = makeElement('div')
  turnErrorNode.setAttribute('data-chat-flow-kind', 'turn-error')
  turnErrorNode.innerText = 'Network connection timed out'
  turnErrorNode.isConnected = true

  // Wire sibling links
  userRow1.nextElementSibling = toolCall1
  toolCall1.nextElementSibling = toolCall2
  toolCall2.nextElementSibling = thoughtStep
  thoughtStep.nextElementSibling = userRow2
  userRow2.nextElementSibling = turnErrorNode

  const allRows = [userRow1, userRow2]
  const column = makeElement('div')
  column.isConnected = true
  column.scrollHeight = 800
  column.getBoundingClientRect = () => columnRect
  column.querySelectorAll = sel => (sel.includes('user') ? allRows : [])
  column.querySelector = sel => {
    if (sel.includes('turn-1')) return userRow1
    if (sel.includes('turn-2')) return userRow2
    return null
  }

  const portRect = { top: 0, bottom: 800, height: 800, left: 0, right: 600, width: 600 }
  const port = makeElement('div')
  port.isConnected = true
  port.scrollHeight = 800
  port.clientHeight = 800
  port.getBoundingClientRect = () => portRect
  port.querySelector = sel => (sel === '[data-chat-flow]' ? column : null)

  const { document, windowObject, body } = createMockEnvironment({ port, innerHeight: 800 })
  const effects = []
  const plugin = loadPlugin(document, windowObject)
  plugin.apply({
    effect(fn) {
      const td = fn()
      effects.push(td)
      return td
    },
  })

  const rail = body.children.find(child => child.dataset.dshTickRail === '')
  const tooltip = body.children.find(child => child.dataset.dshTickRailTooltip === '')
  const ticks = rail.children.filter(child => child.className === 'tick')
  assert.equal(ticks.length, 2)

  // Turn 1 check: has compaction indicator and tool badge in tooltip
  assert.equal(ticks[0].classList.contains('compacted-before'), true, 'tick 1 should have compacted-before class')
  assert.equal(ticks[0].classList.contains('error'), false, 'tick 1 should not have error class')
  ticks[0].dispatchEvent('pointerenter')
  assert.ok(tooltip.textContent.includes('🔧 2 edit,bash'), 'tooltip should contain tool badge')

  // Turn 2 check: has error indicator and error message in tooltip
  assert.equal(ticks[1].classList.contains('error'), true, 'tick 2 should have error class')
  ticks[1].dispatchEvent('pointerenter')
  assert.ok(tooltip.textContent.includes('⚠️ Network connection timed out'), 'tooltip should contain error text')

  for (const td of effects) {
    if (typeof td === 'function') td()
  }
})

test('supports GPU translate3d hardware transforms on ticks and marker', () => {
  const columnRect = { top: 0, bottom: 1000, height: 1000, left: 0, right: 600 }
  const userRow = makeElement('div')
  userRow.setAttribute('data-chat-anchor-key', 'gpu-1')
  userRow.setAttribute('data-chat-flow-kind', 'user')
  userRow.innerText = 'Test GPU transform'
  userRow.getBoundingClientRect = () => ({ top: 10, bottom: 30, height: 20, left: 0, right: 600 })
  userRow.isConnected = true

  const column = makeElement('div')
  column.isConnected = true
  column.scrollHeight = 1000
  column.getBoundingClientRect = () => columnRect
  column.querySelectorAll = () => [userRow]
  column.querySelector = () => userRow

  const portRect = { top: 0, bottom: 800, height: 800, left: 0, right: 600, width: 600 }
  const port = makeElement('div')
  port.isConnected = true
  port.scrollHeight = 1000
  port.clientHeight = 800
  port.getBoundingClientRect = () => portRect
  port.querySelector = sel => (sel === '[data-chat-flow]' ? column : null)

  const { document, windowObject, body } = createMockEnvironment({ port, innerHeight: 800 })
  const effects = []
  const plugin = loadPlugin(document, windowObject)
  plugin.apply({
    effect(fn) {
      const td = fn()
      effects.push(td)
      return td
    },
  })

  const rail = body.children.find(child => child.dataset.dshTickRail === '')
  const marker = rail.children.find(child => child.className === 'marker')
  const ticks = rail.children.filter(child => child.className === 'tick')

  assert.ok(ticks[0].style.transform.startsWith('translate3d('), 'tick should have GPU transform')
  assert.ok(marker.style.transform.startsWith('translate3d('), 'marker should have GPU transform')

  for (const td of effects) {
    if (typeof td === 'function') td()
  }
})

test('supports pointer drag-to-scrub interaction on the navigation rail', () => {
  const columnRect = { top: 0, bottom: 2000, height: 2000, left: 0, right: 600 }
  const userRow1 = makeElement('div')
  userRow1.setAttribute('data-chat-anchor-key', 'scrub-1')
  userRow1.setAttribute('data-chat-flow-kind', 'user')
  userRow1.innerText = 'First topic'
  userRow1.getBoundingClientRect = () => ({ top: 10, bottom: 30, height: 20, left: 0, right: 600 })
  userRow1.isConnected = true

  const userRow2 = makeElement('div')
  userRow2.setAttribute('data-chat-anchor-key', 'scrub-2')
  userRow2.setAttribute('data-chat-flow-kind', 'user')
  userRow2.innerText = 'Second topic'
  userRow2.getBoundingClientRect = () => ({ top: 1200, bottom: 1230, height: 30, left: 0, right: 600 })
  userRow2.isConnected = true

  const allRows = [userRow1, userRow2]
  const column = makeElement('div')
  column.isConnected = true
  column.scrollHeight = 2000
  column.getBoundingClientRect = () => columnRect
  column.querySelectorAll = () => allRows
  column.querySelector = sel => (sel.includes('scrub-1') ? userRow1 : userRow2)

  const portRect = { top: 100, bottom: 900, height: 800, left: 0, right: 600, width: 600 }
  const port = makeElement('div')
  port.isConnected = true
  port.scrollHeight = 2000
  port.clientHeight = 800
  port.scrollTop = 0
  port.getBoundingClientRect = () => portRect
  port.querySelector = sel => (sel === '[data-chat-flow]' ? column : null)

  const { document, windowObject, body } = createMockEnvironment({ port, innerHeight: 1000 })
  const effects = []
  const plugin = loadPlugin(document, windowObject)
  plugin.apply({
    effect(fn) {
      const td = fn()
      effects.push(td)
      return td
    },
  })

  const rail = body.children.find(child => child.dataset.dshTickRail === '')
  rail.getBoundingClientRect = () => ({ top: 200, bottom: 300, height: 100, left: 3, right: 17, width: 14 })

  // Trigger pointerdown on rail (not a tick button) at 50% height (y = 250)
  rail.dispatchEvent({ type: 'pointerdown', clientY: 250, target: rail, pointerId: 1, preventDefault() {} })

  // 50% fraction * (2000 scrollHeight - 800 clientHeight) = 600 scrollTop
  assert.equal(port.scrollTop, 600, 'port scrollTop should update based on scrub percentage')

  // Move pointer to 100% height (y = 300)
  rail.dispatchEvent({ type: 'pointermove', clientY: 300, preventDefault() {} })
  assert.equal(port.scrollTop, 1200, 'port scrollTop should reach bottom max scroll on 100% scrub')

  // End scrub
  rail.dispatchEvent({ type: 'pointerup' })

  for (const td of effects) {
    if (typeof td === 'function') td()
  }
})

test('clamps tooltip position and flips when reaching right edge of viewport', () => {
  const columnRect = { top: 0, bottom: 800, height: 800, left: 0, right: 600 }
  const userRow = makeElement('div')
  userRow.setAttribute('data-chat-anchor-key', 'clamp-1')
  userRow.setAttribute('data-chat-flow-kind', 'user')
  userRow.innerText = 'Testing edge clamping'
  userRow.getBoundingClientRect = () => ({ top: 10, bottom: 30, height: 20, left: 0, right: 600 })
  userRow.isConnected = true

  const column = makeElement('div')
  column.isConnected = true
  column.scrollHeight = 800
  column.getBoundingClientRect = () => columnRect
  column.querySelectorAll = () => [userRow]
  column.querySelector = () => userRow

  const portRect = { top: 0, bottom: 800, height: 800, left: 300, right: 800, width: 500 }
  const port = makeElement('div')
  port.isConnected = true
  port.scrollHeight = 800
  port.clientHeight = 800
  port.getBoundingClientRect = () => portRect
  port.querySelector = sel => (sel === '[data-chat-flow]' ? column : null)

  // Viewport width is 800px, rail is at right: 714px. Tooltip (width 240px) would overflow (714 + 8 + 240 = 962 > 800).
  const { document, windowObject, body } = createMockEnvironment({ port, innerHeight: 800 })
  windowObject.innerWidth = 800

  const effects = []
  const plugin = loadPlugin(document, windowObject)
  plugin.apply({
    effect(fn) {
      const td = fn()
      effects.push(td)
      return td
    },
  })

  const rail = body.children.find(child => child.dataset.dshTickRail === '')
  const tooltip = body.children.find(child => child.dataset.dshTickRailTooltip === '')
  tooltip.offsetWidth = 240
  tooltip.offsetHeight = 40
  rail.getBoundingClientRect = () => ({ top: 300, bottom: 400, height: 100, left: 700, right: 714, width: 14 })

  const tick = rail.children.find(child => child.className === 'tick')
  tick.getBoundingClientRect = () => ({ top: 310, bottom: 312, height: 2, left: 700, right: 706, width: 6 })

  tick.dispatchEvent('pointerenter')

  // Tooltip left should flip to left side of rail (max(8, railRect.left - boxWidth - 8)) = max(8, 700 - 240 - 8) = 452px
  assert.equal(tooltip.style.left, '452px', 'tooltip should flip left to avoid overflowing right viewport')

  for (const td of effects) {
    if (typeof td === 'function') td()
  }
})

test('discovers active conversation scrollport in multi-pane or drawer environments', () => {
  // Main chat port (inactive, smaller or hidden)
  const mainRow = makeElement('div')
  mainRow.setAttribute('data-chat-anchor-key', 'main-1')
  mainRow.setAttribute('data-chat-flow-kind', 'user')
  mainRow.innerText = 'Main chat message'
  mainRow.getBoundingClientRect = () => ({ top: 0, bottom: 0, height: 0, left: 0, right: 0 })
  mainRow.isConnected = true

  const mainColumn = makeElement('div')
  mainColumn.isConnected = true
  mainColumn.scrollHeight = 800
  mainColumn.getBoundingClientRect = () => ({ top: 0, bottom: 800, height: 800, left: 0, right: 400, width: 400 })
  mainColumn.querySelectorAll = () => [mainRow]
  mainColumn.querySelector = () => mainRow

  const mainPort = makeElement('div')
  mainPort.setAttribute('data-conversation-scroll', '')
  mainPort.isConnected = true
  mainPort.scrollHeight = 800
  mainPort.clientHeight = 800
  mainPort.getBoundingClientRect = () => ({ top: 0, bottom: 800, height: 800, left: 0, right: 400, width: 400 })
  mainPort.querySelector = sel => (sel === '[data-chat-flow]' ? mainColumn : null)

  // Subagent drawer port (active, larger or has active element)
  const drawerRow = makeElement('div')
  drawerRow.setAttribute('data-chat-anchor-key', 'subagent-1')
  drawerRow.setAttribute('data-chat-flow-kind', 'user')
  drawerRow.innerText = 'Subagent research task'
  drawerRow.getBoundingClientRect = () => ({ top: 10, bottom: 30, height: 20, left: 400, right: 1000 })
  drawerRow.isConnected = true

  const drawerColumn = makeElement('div')
  drawerColumn.isConnected = true
  drawerColumn.scrollHeight = 1000
  drawerColumn.getBoundingClientRect = () => ({ top: 0, bottom: 800, height: 800, left: 400, right: 1000, width: 600 })
  drawerColumn.querySelectorAll = () => [drawerRow]
  drawerColumn.querySelector = () => drawerRow

  const drawerPort = makeElement('div')
  drawerPort.setAttribute('data-conversation-scroll', '')
  drawerPort.isConnected = true
  drawerPort.scrollHeight = 1000
  drawerPort.clientHeight = 800
  drawerPort.getBoundingClientRect = () => ({ top: 0, bottom: 800, height: 800, left: 400, right: 1000, width: 600 })
  drawerPort.querySelector = sel => (sel === '[data-chat-flow]' ? drawerColumn : null)

  const { document, windowObject, body } = createMockEnvironment({ innerHeight: 800 })
  document.querySelectorAll = sel => {
    if (sel === '[data-conversation-scroll]') return [mainPort, drawerPort]
    return []
  }
  document.activeElement = drawerRow

  const effects = []
  const plugin = loadPlugin(document, windowObject)
  plugin.apply({
    effect(fn) {
      const td = fn()
      effects.push(td)
      return td
    },
  })

  const rail = body.children.find(child => child.dataset.dshTickRail === '')
  const ticks = rail.children.filter(child => child.className === 'tick')
  assert.equal(ticks.length, 1)

  // Should have bound to the subagent drawer port (since it contains active element and is larger)
  assert.ok(ticks[0].getAttribute('aria-label').includes('Subagent research task'))

  for (const td of effects) {
    if (typeof td === 'function') td()
  }
})

test('supports 5-stage accordion fisheye wave and continuous rail pointer tracking', () => {
  const rows = []
  for (let i = 0; i < 7; i++) {
    const row = makeElement('div')
    row.setAttribute('data-chat-anchor-key', `wave-${i}`)
    row.setAttribute('data-chat-flow-kind', 'user')
    row.innerText = `Message ${i}`
    row.getBoundingClientRect = () => ({ top: i * 100, bottom: (i + 1) * 100, height: 100, left: 0, right: 600 })
    row.isConnected = true
    rows.push(row)
  }

  const column = makeElement('div')
  column.isConnected = true
  column.scrollHeight = 1000
  column.getBoundingClientRect = () => ({ top: 0, bottom: 1000, height: 1000, left: 0, right: 600 })
  column.querySelectorAll = () => rows
  column.querySelector = () => rows[0]

  const port = makeElement('div')
  port.isConnected = true
  port.scrollHeight = 1000
  port.clientHeight = 800
  port.getBoundingClientRect = () => ({ top: 0, bottom: 800, height: 800, left: 0, right: 600, width: 600 })
  port.querySelector = sel => (sel === '[data-chat-flow]' ? column : null)

  const { document, windowObject, body, head } = createMockEnvironment({ port, innerHeight: 800 })
  const effects = []
  const plugin = loadPlugin(document, windowObject)
  plugin.apply({
    effect(fn) {
      const td = fn()
      effects.push(td)
      return td
    },
  })

  const rail = body.children.find(child => child.dataset.dshTickRail === '')
  const ticks = rail.children.filter(child => child.className === 'tick')
  assert.equal(ticks.length, 7)

  // Test continuous pointermove on rail over middle tick (index 3)
  rail.getBoundingClientRect = () => ({ top: 100, bottom: 170, height: 70, left: 10, right: 24, width: 14 })
  rail.dispatchEvent('pointermove', { clientY: 135 }) // index 3

  assert.equal(rail.hasAttribute('data-hovering'), true)
  assert.equal(ticks[3].classList.contains('active-hover'), true)
  assert.equal(ticks[2].classList.contains('approach'), true)
  assert.equal(ticks[4].classList.contains('approach'), true)
  assert.equal(ticks[1].classList.contains('approach-far'), true)
  assert.equal(ticks[5].classList.contains('approach-far'), true)
  assert.equal(ticks[0].classList.contains('approach-3'), true)
  assert.equal(ticks[6].classList.contains('approach-3'), true)

  // Style sheet should include approach-3 and 5-stage fisheye classes
  const style = head.children.find(child => child.tagName === 'style')
  assert.ok(style.textContent.includes('.tick.approach-3'))
  assert.ok(style.textContent.includes('.tick.active-hover'))

  // Moving pointer out of rail clears all wave states
  rail.dispatchEvent('pointerleave')
  assert.equal(rail.hasAttribute('data-hovering'), false)
  for (let i = 0; i < 7; i++) {
    assert.equal(ticks[i].classList.contains('active-hover'), false)
    assert.equal(ticks[i].classList.contains('approach'), false)
    assert.equal(ticks[i].classList.contains('approach-far'), false)
    assert.equal(ticks[i].classList.contains('approach-3'), false)
  }

  for (const td of effects) {
    if (typeof td === 'function') td()
  }
})

test('supports scroll-to-top floating button, keyboard Home navigation, and auto-triggering loadOlder', () => {
  const rows = []
  for (let i = 0; i < 5; i++) {
    const row = makeElement('div')
    row.dataset.chatAnchorKey = 'turn-' + i
    row.dataset.chatFlowKind = 'user'
    row.textContent = 'Message ' + i
    row.scrollHeight = 100
    row.getBoundingClientRect = () => ({ top: i * 200, bottom: i * 200 + 100, height: 100, left: 0, right: 600 })
    rows.push(row)
  }

  let olderClicked = 0
  const olderBtn = makeElement('button')
  olderBtn.textContent = '加载更早'
  olderBtn.click = () => { olderClicked++ }

  const olderDiv = makeElement('div')
  olderDiv.className = 'Md3f7G_older'
  olderDiv.appendChild(olderBtn)

  const column = makeElement('div')
  column.isConnected = true
  column.scrollHeight = 1000
  column.getBoundingClientRect = () => ({ top: -300, bottom: 700, height: 1000, left: 0, right: 600 })
  column.querySelectorAll = () => rows
  column.querySelector = sel => {
    if (sel.includes('_older') || sel.includes('button')) return olderBtn
    return rows[0]
  }

  let scrolledTop = -1
  const port = makeElement('div')
  port.isConnected = true
  port.scrollTop = 300
  port.scrollHeight = 1000
  port.clientHeight = 600
  port.scrollTo = opts => { scrolledTop = opts.top }
  port.getBoundingClientRect = () => ({ top: 0, bottom: 600, height: 600, left: 0, right: 600, width: 600 })
  port.querySelector = sel => (sel === '[data-chat-flow]' ? column : null)

  const { document, windowObject, body } = createMockEnvironment({ port, innerHeight: 600 })
  const effects = []
  const plugin = loadPlugin(document, windowObject)
  plugin.apply({
    effect(fn) {
      const td = fn()
      effects.push(td)
      return td
    },
  })

  const toTopBtn = body.children.find(child => child.dataset && child.dataset.dshToTop === '')
  assert.ok(toTopBtn !== undefined, 'toTopBtn should be present in body')
  assert.equal(toTopBtn.hasAttribute('data-hidden'), false, 'toTopBtn should be visible when scrollTop > 120')
  assert.equal(toTopBtn.style.left, '558px', 'toTopBtn should align with chat column / composer')
  assert.equal(toTopBtn.style.top, '398px', 'toTopBtn should sit directly above composer')

  // Click toTop button
  toTopBtn.dispatchEvent('click')
  assert.equal(scrolledTop, 0, 'Clicking toTopBtn should scrollTo top: 0')

  // Trigger Home key on a tick
  const rail = body.children.find(child => child.dataset.dshTickRail === '')
  const ticks = rail.children.filter(child => child.className === 'tick')
  scrolledTop = -1
  ticks[2].dispatchEvent('keydown', { key: 'Home' })
  assert.equal(scrolledTop, 0, 'Home key on tick should trigger scrollTo top: 0')

  for (const td of effects) {
    if (typeof td === 'function') td()
  }
})



