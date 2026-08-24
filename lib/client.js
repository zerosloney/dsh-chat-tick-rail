window.__ModuleLoader__.load({ id: 'dsh-chat-tick-rail', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

/**
 * dsh-chat-tick-rail browser half: a fixed navigation rail over the active
 * conversation scrollport. One tick per user message, a marker tracking the
 * reader's viewport, click (or Enter) to scroll to that message, hover (or
 * focus) for a text preview. Vanilla DOM on purpose: the bundle requests
 * nothing from the module table. Hooks into stable ChatView DOM contract
 * only: [data-conversation-scroll] (scrollport), [data-chat-flow] (column),
 * [data-chat-flow-kind="user"] rows carrying [data-chat-anchor-key].
 */

var RAIL_WIDTH = 14
var TICK_GAP = 10

var CSS_TEXT = [
  '[data-dsh-tick-rail]{position:fixed;width:' + RAIL_WIDTH + 'px;z-index:50;pointer-events:none;}',
  '[data-dsh-tick-rail][data-hidden]{display:none;}',
  '[data-dsh-tick-rail] .track{display:none;}',
  '[data-dsh-tick-rail] .marker{position:absolute;left:50%;width:2px;margin-left:-1px;border:0;border-radius:0;background:rgba(128,128,128,.16);}',
  '[data-dsh-tick-rail] .marker[data-hidden]{display:none;}',
  '[data-dsh-tick-rail] .tick{position:absolute;left:0;width:6px;height:2px;margin:-1px 0 0 0;padding:0;border:0;border-radius:0;background:#d0d0d0;box-shadow:none;pointer-events:auto;cursor:pointer;transition:width .22s cubic-bezier(0.22,1,0.36,1), height .22s cubic-bezier(0.22,1,0.36,1), margin .22s cubic-bezier(0.22,1,0.36,1), background-color .22s cubic-bezier(0.22,1,0.36,1);}',
  '[data-dsh-tick-rail] .tick::before{content:"";position:absolute;left:-8px;right:-8px;top:-8px;bottom:-8px;}',
  '[data-dsh-tick-rail][data-hovering] .tick.near:not(.approach):not(.approach-far):not(:hover):not(:focus-visible){width:6px;height:2px;margin:-1px 0 0 0;background:#d0d0d0;}',
  '[data-dsh-tick-rail] .tick.near{width:6px;height:3px;margin:-1.5px 0 0 0;background:#242424;}',
  '[data-dsh-tick-rail] .tick.approach{width:11px;height:2px;margin:-1px 0 0 0;background:#aaaaaa;}',
  '[data-dsh-tick-rail] .tick.near.approach{width:6px;height:3px;margin:-1.5px 0 0 0;background:#242424;}',
  '[data-dsh-tick-rail][data-hovering] .tick.near.approach:not(:hover):not(:focus-visible){width:11px;height:2px;margin:-1px 0 0 0;background:#aaaaaa;}',
  '[data-dsh-tick-rail] .tick.approach-far{width:9px;height:2px;margin:-1px 0 0 0;background:#c0c0c0;}',
  '[data-dsh-tick-rail][data-hovering] .tick.near.approach-far:not(:hover):not(:focus-visible){width:9px;height:2px;margin:-1px 0 0 0;background:#c0c0c0;}',
  '[data-dsh-tick-rail] .tick:hover,[data-dsh-tick-rail] .tick:focus-visible{background:#1e1e1e;width:22px;height:3px;margin:-1.5px 0 0 0;outline:none;box-shadow:none;border-radius:0;}',
  '[data-dsh-tick-rail] .tick:active{background:#4a4a4a;}',
  '[data-dsh-tick-rail-tooltip]{position:fixed;width:max-content;max-width:320px;height:auto;padding:5px 8px;border-radius:12px;background:#ffffff;color:#333333;border:1px solid rgba(0,0,0,.08);box-shadow:0 2px 8px rgba(0,0,0,.08);font:var(--dsw-font-xxs-12,12px/normal system-ui,-apple-system,sans-serif);display:block;white-space:normal;overflow:hidden;pointer-events:none;z-index:51;animation:dsh-chat-tick-rail-tooltip-in .18s ease-out both;}',
  '@keyframes dsh-chat-tick-rail-tooltip-in{from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:translateY(0);}}',
  '[data-dsh-tick-rail-tooltip][data-hidden]{display:none;}',
].join('\n')

function injectStyles() {
  var tagId = 'dsh-chat-tick-rail/rail.css'
  if (document.querySelector('style[data-plugin-css="' + tagId + '"]') === null) {
    var tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-chat-tick-rail'
    tag.dataset.pluginCss = tagId
    tag.textContent = CSS_TEXT
    document.head.appendChild(tag)
  }
}

function cssEscape(value) {
  return window.CSS !== undefined && CSS.escape !== undefined ? CSS.escape(value) : value.replace(/(["\\])/g, '\\$1')
}

/** Nearest scrollable ancestor of `from`, for layouts without the data attribute. */
function scrollableParent(from) {
  for (var el = from.parentElement; el !== null; el = el.parentElement) {
    var oy = window.getComputedStyle(el).overflowY
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return el
  }
  return null
}

function findPort() {
  var hosts = document.querySelectorAll('[data-conversation-scroll]')
  for (var i = 0; i < hosts.length; i++) {
    if (hosts[i].querySelector('[data-chat-flow]') !== null) return hosts[i]
  }
  var flow = document.querySelector('[data-chat-flow]')
  return flow === null ? null : scrollableParent(flow)
}

function apply(ctx) {
  injectStyles()

  var rail = document.createElement('div')
  rail.dataset.dshTickRail = ''
  rail.setAttribute('role', 'navigation')
  rail.setAttribute('aria-label', '消息导航')
  rail.dataset.hidden = ''
  var track = document.createElement('div')
  track.className = 'track'
  var marker = document.createElement('div')
  marker.className = 'marker'
  marker.dataset.hidden = ''
  rail.appendChild(track)
  rail.appendChild(marker)
  var tooltip = document.createElement('div')
  tooltip.dataset.dshTickRailTooltip = ''
  tooltip.dataset.hidden = ''
  document.body.appendChild(rail)
  document.body.appendChild(tooltip)

  var port = null
  var column = null
  var keys = []
  var tickEls = []
  var selectedIndex = -1
  var raf = 0
  var scrollListener = null
  var resizeListener = null
  var columnMo = null
  var bodyMo = null
  var ro = null

  function rowByKey(key) {
    if (column === null) return null
    return column.querySelector('[data-chat-anchor-key="' + cssEscape(key) + '"]')
  }

  function jumpTo(key) {
    var row = rowByKey(key)
    if (row === null || port === null) return
    var portRect = port.getBoundingClientRect()
    var rowRect = row.getBoundingClientRect()
    var delta = rowRect.top - portRect.top - port.clientHeight * 0.15
    var behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    port.scrollBy({ top: delta, behavior: behavior })
  }

  function compactText(value) {
    return (value || '').replace(/\s+/g, ' ').trim()
  }

  function truncateText(text, limit) {
    if (text.length <= limit) return text
    return limit <= 1 ? text.slice(0, limit) : text.slice(0, limit - 1) + '…'
  }

  function firstAssistantThought(row) {
    for (var sibling = row.nextElementSibling; sibling !== null; sibling = sibling.nextElementSibling) {
      var kind = sibling.getAttribute('data-chat-flow-kind')
      if (kind === 'user') break
      if (kind !== 'assistant') continue
      var text = compactText(sibling.innerText)
      if (text === '') return ''
      var sentence = text.match(/^.*?(?:[。！？!?]|(?:\.(?=\s|$)))/)
      return compactText(sentence === null ? text : sentence[0])
    }
    return ''
  }

  function previewOf(row) {
    var userText = compactText(row.innerText)
    var userSummary = userText.length > 120 ? userText.slice(0, 120) + '…' : userText
    var thought = truncateText(firstAssistantThought(row), 72)
    if (thought === '') return userSummary
    if (userSummary === '') return thought
    var combined = userSummary + ' · ' + thought
    if (combined.length > 160) {
      var userLimit = 160 - 3 - thought.length
      combined = truncateText(userText, userLimit) + ' · ' + thought
    }
    return truncateText(combined, 160)
  }

  function renderTooltip(index) {
    var key = keys[index]
    var row = key === undefined ? null : rowByKey(key)
    if (row === null) return false
    var text = previewOf(row)
    tooltip.textContent = text === '' ? '（无文本）' : text
    tooltip.removeAttribute('data-hidden')
    var tickRect = tickEls[index].getBoundingClientRect()
    var boxHeight = tooltip.offsetHeight || 32
    var top = Math.min(Math.max(tickRect.top + tickRect.height / 2 - boxHeight / 2, 8), window.innerHeight - boxHeight - 8)
    tooltip.style.top = Math.round(top) + 'px'
    tooltip.style.left = Math.round(rail.getBoundingClientRect().right + 8) + 'px'
    return true
  }

  function showTooltip(index, pin) {
    if (pin) selectedIndex = index
    if (renderTooltip(index)) return
    if (selectedIndex !== -1 && renderTooltip(selectedIndex)) return
    selectedIndex = -1
    tooltip.dataset.hidden = ''
  }

  function hideTooltip() {
    if (selectedIndex !== -1 && renderTooltip(selectedIndex)) return
    selectedIndex = -1
    tooltip.dataset.hidden = ''
  }

  function clearApproach() {
    for (var i = 0; i < tickEls.length; i++) {
      tickEls[i].classList.remove('approach')
      tickEls[i].classList.remove('approach-far')
    }
  }

  function updateApproach(index) {
    clearApproach()
    if (index > 0) tickEls[index - 1].classList.add('approach')
    if (index + 1 < tickEls.length) tickEls[index + 1].classList.add('approach')
    if (index > 1) tickEls[index - 2].classList.add('approach-far')
    if (index + 2 < tickEls.length) tickEls[index + 2].classList.add('approach-far')
  }

  function clearTicks() {
    for (var i = 0; i < tickEls.length; i++) tickEls[i].remove()
    tickEls = []
    keys = []
    selectedIndex = -1
    tooltip.dataset.hidden = ''
  }

  function makeTick(index) {
    var button = document.createElement('button')
    button.type = 'button'
    button.className = 'tick'
    button.addEventListener('click', function () {
      jumpTo(keys[index])
      showTooltip(index, true)
    })
    button.addEventListener('pointerenter', function () {
      rail.setAttribute('data-hovering', '')
      updateApproach(index)
      showTooltip(index, false)
    })
    button.addEventListener('pointerleave', function () {
      clearApproach()
      rail.removeAttribute('data-hovering')
      hideTooltip()
    })
    button.addEventListener('focus', function () {
      updateApproach(index)
      showTooltip(index, false)
    })
    button.addEventListener('blur', function () {
      clearApproach()
      hideTooltip()
    })
    rail.appendChild(button)
    return button
  }

  function rebuildTicks(userRows) {
    var nextKeys = []
    var same = true
    for (var i = 0; i < userRows.length; i++) {
      var key = userRows[i].getAttribute('data-chat-anchor-key')
      nextKeys.push(key)
      if (same && (key !== keys[i])) same = false
    }
    if (same && nextKeys.length === keys.length) return
    clearTicks()
    keys = nextKeys
    for (var k = 0; k < keys.length; k++) {
      var tick = makeTick(k)
      tick.setAttribute('aria-label', '跳转到该消息：' + previewOf(userRows[k]))
      tickEls.push(tick)
    }
  }

  function measure() {
    raf = 0
    if (port === null || column === null || !port.isConnected || !column.isConnected) {
      rail.dataset.hidden = ''
      return
    }
    var portRect = port.getBoundingClientRect()
    var userRows = column.querySelectorAll(':scope > [data-chat-flow-kind="user"]')
    if (portRect.height < 40 || userRows.length === 0) {
      rail.dataset.hidden = ''
      return
    }
    rail.removeAttribute('data-hidden')
    var count = userRows.length
    var railHeight = count * TICK_GAP
    rail.style.left = Math.round(portRect.left + 3) + 'px'
    rail.style.top = Math.round(portRect.top + (portRect.height - railHeight) / 2) + 'px'
    rail.style.height = railHeight + 'px'
    rebuildTicks(userRows)
    // Keep the compact list independent of the messages' content positions.
    for (var i = 0; i < count; i++) {
      tickEls[i].style.top = ((i + 0.5) * TICK_GAP) + 'px'
    }
    var columnRect = column.getBoundingClientRect()
    var total = Math.max(column.scrollHeight, 1)
    var visibleStart = Math.max(0, Math.min(total, portRect.top - columnRect.top))
    var visibleEnd = Math.max(0, Math.min(total, portRect.bottom - columnRect.top))
    if (visibleEnd < visibleStart) visibleEnd = visibleStart
    marker.removeAttribute('data-hidden')
    marker.style.top = Math.round(visibleStart / total * railHeight) + 'px'
    marker.style.height = Math.max(2, Math.round((visibleEnd - visibleStart) / total * railHeight)) + 'px'
    // Highlight the user message nearest the top of the viewport.
    var viewTop = portRect.top + 4
    var nearest = -1
    var best = Infinity
    for (var j = 0; j < userRows.length; j++) {
      var r = userRows[j].getBoundingClientRect()
      var d = Math.abs(r.top + r.height / 2 - viewTop)
      if (d < best) { best = d; nearest = j }
    }
    for (var k = 0; k < tickEls.length; k++) {
      tickEls[k].classList.toggle('near', k === nearest)
    }
  }

  function schedule() {
    if (raf === 0) raf = requestAnimationFrame(measure)
  }

  function unbind() {
    if (columnMo !== null) { columnMo.disconnect(); columnMo = null }
    if (ro !== null) { ro.disconnect(); ro = null }
    if (scrollListener !== null && port !== null) port.removeEventListener('scroll', scrollListener)
    scrollListener = null
    port = null
    column = null
    clearTicks()
    hideTooltip()
  }

  function bind(found) {
    unbind()
    port = found
    column = port.querySelector('[data-chat-flow]')
    scrollListener = function () { schedule() }
    port.addEventListener('scroll', scrollListener, { passive: true })
    columnMo = new MutationObserver(function () { schedule() })
    columnMo.observe(column, { childList: true })
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(function () { schedule() })
      ro.observe(port)
      ro.observe(column)
    }
    schedule()
  }

  function discover() {
    if (port !== null && port.isConnected && column !== null && column.isConnected) return
    var found = findPort()
    if (found === null) {
      unbind()
      rail.dataset.hidden = ''
      return
    }
    bind(found)
  }

  function setup() {
    resizeListener = function () { schedule() }
    window.addEventListener('resize', resizeListener)
    // React remounts ConversationRoot across session switches; the cached
    // scrollport going stale is the rediscovery trigger, guarded to O(1) so
    // unrelated rerenders stay free.
    bodyMo = new MutationObserver(function () {
      if (port !== null && port.isConnected && column !== null && column.isConnected) return
      discover()
      schedule()
    })
    bodyMo.observe(document.body, { childList: true, subtree: true })
    discover()
    schedule()
  }

  function teardown() {
    if (raf !== 0) cancelAnimationFrame(raf)
    if (bodyMo !== null) bodyMo.disconnect()
    bodyMo = null
    if (resizeListener !== null) window.removeEventListener('resize', resizeListener)
    resizeListener = null
    unbind()
    rail.remove()
    tooltip.remove()
  }

  if (document.body === null) {
    document.addEventListener('DOMContentLoaded', function () {
      ctx.effect(function () { setup(); return teardown }, 'chat-tick-rail: rail overlay')
    }, { once: true })
  } else {
    ctx.effect(function () { setup(); return teardown }, 'chat-tick-rail: rail overlay')
  }
}

module.exports = { apply: apply }
return module.exports
} });
