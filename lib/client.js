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
  '[data-dsh-tick-rail]{position:fixed;width:' + RAIL_WIDTH + 'px;z-index:50;pointer-events:auto;user-select:none;-webkit-user-select:none;touch-action:none;}',
  '[data-dsh-tick-rail][data-hidden]{display:none;}',
  '[data-dsh-tick-rail] .track{display:none;}',
  '[data-dsh-tick-rail] .marker{position:absolute;left:50%;width:2px;margin-left:-1px;border:0;border-radius:1px;background:var(--dsw-alias-scrollbar-bg-l1,rgba(128,128,128,.14));pointer-events:none;will-change:transform,height;}',
  '[data-dsh-tick-rail] .marker[data-hidden]{display:none;}',
  '[data-dsh-tick-rail] .tick{position:absolute;left:0;width:12px;height:1.5px;margin:-0.75px 0 0 0;padding:0;border:0;border-radius:0.75px;background:var(--dsw-alias-label-dimmed,#d0d0d0);box-shadow:none;pointer-events:auto;cursor:pointer;will-change:transform,width;transform-origin:left center;transition:width .16s cubic-bezier(0.2,0.9,0.4,1),height .16s ease,margin .16s ease,background-color .15s ease,box-shadow .15s ease;}',
  '[data-dsh-tick-rail] .tick::before{content:"";position:absolute;left:-8px;right:-8px;top:-5px;bottom:-5px;}',
  '[data-dsh-tick-rail] .tick.compacted-before::after{content:"";position:absolute;top:-3px;left:0;width:12px;height:1px;border-top:1px dashed var(--dsw-alias-label-dimmed,rgba(128,128,128,.4));pointer-events:none;}',
  '[data-dsh-tick-rail] .tick.near{width:12px;height:2px;margin:-1px 0 0 0;border-radius:1px;background:var(--dsw-alias-label-primary,#242424);}',
  '[data-dsh-tick-rail][data-hovering] .tick.near:not(.active-hover):not(.approach):not(.approach-far):not(.approach-3):not(:hover):not(:focus-visible){width:12px;height:1.5px;margin:-0.75px 0 0 0;background:var(--dsw-alias-label-dimmed,#d0d0d0);}',
  '[data-dsh-tick-rail] .tick.approach-3{width:12px;height:1.5px;margin:-0.75px 0 0 0;background:var(--dsw-alias-label-caption,#bcbcbc);}',
  '[data-dsh-tick-rail] .tick.approach-far{width:15px;height:1.5px;margin:-0.75px 0 0 0;background:var(--dsw-alias-label-tertiary,#949494);}',
  '[data-dsh-tick-rail] .tick.approach{width:19px;height:1.5px;margin:-0.75px 0 0 0;background:var(--dsw-alias-label-secondary,#555555);}',
  '[data-dsh-tick-rail] .tick.active-hover,[data-dsh-tick-rail] .tick:hover,[data-dsh-tick-rail] .tick:focus-visible{width:24px;height:2px;margin:-1px 0 0 0;border-radius:1px;background:var(--dsw-alias-brand-primary,#1e1e1e);outline:none;box-shadow:0 1px 3px rgba(0,0,0,0.12);z-index:2;}',
  '[data-dsh-tick-rail] .tick:active{background:var(--dsw-alias-label-primary,#000000);}',
  '[data-dsh-tick-rail] .tick.error{background:var(--dsw-alias-status-danger,#ef4444);}',
  '[data-dsh-tick-rail] .tick.error.active-hover,[data-dsh-tick-rail] .tick.error:hover,[data-dsh-tick-rail] .tick.error:focus-visible{background:var(--dsw-alias-status-danger,#dc2626);box-shadow:0 0 4px rgba(239,68,68,0.4);}',
  '@keyframes dsh-tick-pulse{0%,100%{opacity:.6;}50%{opacity:1;background:var(--dsw-alias-brand-primary,#3b82f6);box-shadow:0 0 4px rgba(59,130,246,0.5);}}',
  '[data-dsh-tick-rail] .tick.streaming{animation:dsh-tick-pulse 1.4s infinite ease-in-out;}',
  '[data-dsh-tick-rail-tooltip]{position:fixed;width:max-content;max-width:320px;height:auto;padding:6px 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-2,#ffffff);color:var(--dsw-alias-label-primary,#333333);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08));box-shadow:0 4px 16px rgba(0,0,0,0.12);font:12px/1.4 system-ui,-apple-system,sans-serif;display:block;white-space:normal;overflow:hidden;pointer-events:none;z-index:51;transition:opacity .12s ease-out, transform .12s ease-out;animation:dsh-chat-tick-rail-tooltip-in .15s ease-out both;}',
  '[data-dsh-tick-rail-tooltip] .header{display:flex;align-items:center;gap:6px;font-weight:600;margin-bottom:3px;font-size:11px;}',
  '[data-dsh-tick-rail-tooltip] .badge{padding:1px 5px;border-radius:4px;background:var(--dsw-alias-fill-layer-2,rgba(0,0,0,.06));color:var(--dsw-alias-label-secondary,#666);font-size:10px;}',
  '[data-dsh-tick-rail-tooltip] .tag{padding:1px 5px;border-radius:4px;font-size:10px;font-weight:500;}',
  '[data-dsh-tick-rail-tooltip] .tag-tools{background:rgba(59,130,246,.12);color:var(--dsw-alias-brand-primary,#2563eb);}',
  '[data-dsh-tick-rail-tooltip] .tag-err{background:rgba(239,68,68,.12);color:var(--dsw-alias-status-danger,#dc2626);}',
  '[data-dsh-tick-rail-tooltip] .body-text{line-height:1.4;word-break:break-word;}',
  '[data-dsh-tick-rail-tooltip] .thought-box{margin-top:4px;padding:3px 6px;border-radius:4px;background:var(--dsw-alias-fill-layer-1,rgba(0,0,0,.03));font-size:11px;color:var(--dsw-alias-label-secondary,#666);line-height:1.3;}',
  '[data-dsh-tick-rail-tooltip] .error-box{margin-top:4px;padding:3px 6px;border-radius:4px;background:rgba(239,68,68,.08);font-size:11px;color:var(--dsw-alias-status-danger,#dc2626);line-height:1.3;}',
  '@keyframes dsh-chat-tick-rail-tooltip-in{from{opacity:0;transform:translateY(3px);}to{opacity:1;transform:translateY(0);}}',
  '[data-dsh-tick-rail-tooltip][data-hidden]{display:none;}',
  '[data-dsh-to-top]{position:fixed;width:34px;height:34px;border-radius:100px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.1));background:var(--dsw-alias-button-floating-fill,#ffffff);color:var(--dsw-alias-label-primary,#242424);box-shadow:var(--dsw-shadow-lv2,0 2px 8px rgba(0,0,0,.12));cursor:pointer;pointer-events:auto;justify-content:center;align-items:center;padding:0;display:flex;z-index:49;transition:opacity .15s ease, transform .15s ease, background-color .15s ease;}',
  '[data-dsh-to-top][data-hidden]{display:none;}',
  '[data-dsh-to-top]:hover{background:var(--dsw-alias-button-floating-hover,var(--dsw-alias-interactive-bg-hover,#f5f5f5));transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.16);}',
  '[data-dsh-to-top]:active{transform:translateY(0);}',
  '@media (max-width: 600px){[data-dsh-tick-rail],[data-dsh-to-top]{display:none !important;}}',
  '@media (prefers-reduced-motion: reduce){[data-dsh-tick-rail] .tick,[data-dsh-tick-rail] .tick.streaming,[data-dsh-tick-rail-tooltip],[data-dsh-to-top]{animation:none !important;transition:none !important;}}',
  'body[data-ds-dark-theme] [data-dsh-to-top]{background:var(--dsw-alias-button-floating-fill,#2c2c2e);border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.12));color:var(--dsw-alias-label-primary,#f9fafb);box-shadow:0 2px 8px rgba(0,0,0,.35);}',
  'body[data-ds-dark-theme] [data-dsh-to-top]:hover{background:var(--dsw-alias-button-floating-hover,#3a3a3c);box-shadow:0 4px 12px rgba(0,0,0,.5);}',
  'body[data-ds-dark-theme] [data-dsh-tick-rail] .marker{background:var(--dsw-alias-scrollbar-bg-l1,rgba(255,255,255,.14));}',
  'body[data-ds-dark-theme] [data-dsh-tick-rail] .tick{background:var(--dsw-alias-label-dimmed,#43454a);}',
  'body[data-ds-dark-theme] [data-dsh-tick-rail] .tick.near{background:var(--dsw-alias-label-primary,#f9fafb);}',
  'body[data-ds-dark-theme] [data-dsh-tick-rail][data-hovering] .tick.near:not(.active-hover):not(.approach):not(.approach-far):not(.approach-3):not(:hover):not(:focus-visible){background:var(--dsw-alias-label-dimmed,#43454a);}',
  'body[data-ds-dark-theme] [data-dsh-tick-rail] .tick.approach-3{background:var(--dsw-alias-label-caption,#666a73);}',
  'body[data-ds-dark-theme] [data-dsh-tick-rail] .tick.approach-far{background:var(--dsw-alias-label-tertiary,#8c919a);}',
  'body[data-ds-dark-theme] [data-dsh-tick-rail] .tick.approach{background:var(--dsw-alias-label-secondary,#c0c4cc);}',
  'body[data-ds-dark-theme] [data-dsh-tick-rail] .tick.active-hover,body[data-ds-dark-theme] [data-dsh-tick-rail] .tick:hover,body[data-ds-dark-theme] [data-dsh-tick-rail] .tick:focus-visible{background:var(--dsw-alias-brand-primary,#ffffff);box-shadow:0 0 5px rgba(255,255,255,.35);}',
  'body[data-ds-dark-theme] [data-dsh-tick-rail] .tick:active{background:var(--dsw-alias-label-primary,#ffffff);}',
  'body[data-ds-dark-theme] [data-dsh-tick-rail] .tick.error{background:var(--dsw-alias-status-danger,#f87171);}',
  'body[data-ds-dark-theme] [data-dsh-tick-rail] .tick.error.active-hover,body[data-ds-dark-theme] [data-dsh-tick-rail] .tick.error:hover,body[data-ds-dark-theme] [data-dsh-tick-rail] .tick.error:focus-visible{background:var(--dsw-alias-status-danger,#ef4444);box-shadow:0 0 5px rgba(248,113,113,.4);}',
  'body[data-ds-dark-theme] [data-dsh-tick-rail] .tick.streaming{animation:dsh-tick-pulse 1.4s infinite ease-in-out;background:var(--dsw-alias-brand-primary,#60a5fa);box-shadow:0 0 4px rgba(96,165,250,.5);}',
  'body[data-ds-dark-theme] [data-dsh-tick-rail-tooltip]{background:var(--dsw-alias-bg-layer-2,#2c2c2e);color:var(--dsw-alias-label-primary,#f9fafb);border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.12));box-shadow:0 4px 16px rgba(0,0,0,.45);}',
  'body[data-ds-dark-theme] [data-dsh-tick-rail-tooltip] .badge{background:var(--dsw-alias-fill-layer-2,rgba(255,255,255,.1));color:var(--dsw-alias-label-secondary,#aaa);}',
  'body[data-ds-dark-theme] [data-dsh-tick-rail-tooltip] .tag-tools{background:rgba(59,130,246,.2);color:#93c5fd;}',
  'body[data-ds-dark-theme] [data-dsh-tick-rail-tooltip] .tag-err{background:rgba(239,68,68,.2);color:#fca5a5;}',
  'body[data-ds-dark-theme] [data-dsh-tick-rail-tooltip] .thought-box{background:var(--dsw-alias-fill-layer-1,rgba(255,255,255,.05));color:var(--dsw-alias-label-secondary,#aaa);}',
  'body[data-ds-dark-theme] [data-dsh-tick-rail-tooltip] .error-box{background:rgba(239,68,68,.15);color:#fca5a5;}',
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
  var candidates = []
  for (var i = 0; i < hosts.length; i++) {
    if (hosts[i].querySelector('[data-chat-flow]') !== null) candidates.push(hosts[i])
  }
  if (candidates.length === 1) return candidates[0]
  if (candidates.length > 1) {
    var active = document.activeElement
    if (active !== null) {
      for (var c = 0; c < candidates.length; c++) {
        if (candidates[c].contains(active)) return candidates[c]
      }
    }
    var best = candidates[0]
    var bestArea = 0
    for (var k = 0; k < candidates.length; k++) {
      var rect = candidates[k].getBoundingClientRect()
      var area = Math.max(0, rect.width) * Math.max(0, rect.height)
      if (area > bestArea) {
        bestArea = area
        best = candidates[k]
      }
    }
    return best
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
  var toTopBtn = document.createElement('button')
  toTopBtn.type = 'button'
  toTopBtn.dataset.dshToTop = ''
  toTopBtn.setAttribute('aria-label', '到顶部')
  toTopBtn.title = '到顶部 (加载更早历史)'
  toTopBtn.dataset.hidden = ''
  toTopBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 10.5L8 6L12.5 10.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  document.body.appendChild(rail)
  document.body.appendChild(tooltip)
  document.body.appendChild(toTopBtn)

  var port = null
  var column = null
  var keys = []
  var tickEls = []
  var selectedKey = null
  var isScrubbing = false
  var raf = 0
  var scrollListener = null
  var resizeListener = null
  var docPointerListener = null
  var docKeydownListener = null
  var columnMo = null
  var bodyMo = null
  var ro = null

  function rowByKey(key) {
    if (column === null || key === null || key === undefined) return null
    return column.querySelector('[data-chat-anchor-key="' + cssEscape(key) + '"]')
  }

  function triggerLoadOlderIfAvailable() {
    if (column === null) return
    var olderBtn = column.querySelector('div[class*="_older"] button, [data-chat-flow] > div:first-child button')
    if (olderBtn && !olderBtn.disabled && typeof olderBtn.click === 'function') {
      var text = (olderBtn.textContent || '').trim()
      if (text.indexOf('加载更早') !== -1 || text.indexOf('Load earlier') !== -1 || text.indexOf('older') !== -1 || text.indexOf('加载') !== -1) {
        olderBtn.click()
      }
    }
  }

  function scrollToTop() {
    if (port === null) return
    var behavior = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    if (typeof port.scrollTo === 'function') {
      port.scrollTo({ top: 0, behavior: behavior })
    } else {
      port.scrollTop = 0
    }
    setTimeout(function () {
      triggerLoadOlderIfAvailable()
    }, 320)
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

  function isUserMessageKind(kind) {
    return kind === 'user' || kind === 'steering' || kind === 'command-input' || kind === 'command'
  }

  function isAssistantMessageKind(kind) {
    return kind === 'assistant' || kind === 'assistant-step'
  }

  function inspectTurnDetails(row) {
    var thought = ''
    var error = ''
    var toolCount = 0
    var toolNames = []
    var hasCompaction = false

    for (var prev = row.previousElementSibling; prev; prev = prev.previousElementSibling) {
      var prevKind = typeof prev.getAttribute === 'function' ? prev.getAttribute('data-chat-flow-kind') : null
      if (isUserMessageKind(prevKind)) break
      if (prevKind === 'compaction') {
        hasCompaction = true
        break
      }
    }

    for (var sibling = row.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
      var kind = typeof sibling.getAttribute === 'function' ? sibling.getAttribute('data-chat-flow-kind') : null
      if (isUserMessageKind(kind)) break
      if (isAssistantMessageKind(kind) && thought === '') {
        var text = compactText(sibling.innerText)
        if (text !== '') {
          var sentence = text.match(/^.*?(?:[。！？!?]|(?:\.(?=\s|$)))/)
          thought = compactText(sentence === null ? text : sentence[0])
        }
      } else if (kind === 'turn-error') {
        var errText = compactText(sibling.innerText)
        error = errText !== '' ? errText : '执行出错'
      } else if (kind === 'tool' || kind === 'tool-call') {
        toolCount++
        var name = typeof sibling.getAttribute === 'function' ? (sibling.getAttribute('data-tool-name') || '') : ''
        if (name && toolNames.indexOf(name) === -1 && toolNames.length < 3) {
          toolNames.push(name)
        }
      }
    }
    return {
      thought: thought,
      error: error,
      toolCount: toolCount,
      toolNames: toolNames,
      hasCompaction: hasCompaction,
    }
  }

  function extractUserText(row) {
    var userText = compactText(row.innerText)
    if (userText !== '') return userText
    if (row.querySelector('img') !== null) return '[图片]'
    if (row.querySelector('pre, code') !== null) return '[代码]'
    if (row.querySelector('[data-attachment], [data-file]') !== null) return '[附件]'
    return '（无文本）'
  }

  function previewOf(row, index, total) {
    var userText = extractUserText(row)
    var userSummary = userText.length > 120 ? userText.slice(0, 120) + '…' : userText
    var details = inspectTurnDetails(row)
    var bodyText = userSummary

    if (details.error !== '') {
      var errSummary = truncateText(details.error, 60)
      bodyText = (userSummary !== '' && userSummary !== '（无文本）' ? userSummary + ' · ' : '') + '⚠️ ' + errSummary
    } else if (details.thought !== '') {
      var thought = truncateText(details.thought, 72)
      if (userSummary === '' || userSummary === '（无文本）') {
        bodyText = thought
      } else {
        var combined = userSummary + ' · ' + thought
        if (combined.length > 160) {
          var userLimit = 160 - 3 - thought.length
          combined = truncateText(userText, userLimit) + ' · ' + thought
        }
        bodyText = truncateText(combined, 160)
      }
    }

    if (details.toolCount > 0) {
      bodyText += ' [🔧 ' + details.toolCount + (details.toolNames.length > 0 ? ' ' + details.toolNames.join(',') : '') + ']'
    }

    if (index !== undefined && total !== undefined && total > 0) {
      return '#' + (index + 1) + '/' + total + ' ' + bodyText
    }
    return bodyText
  }

  function renderTooltip(key) {
    if (key === null || key === undefined) return false
    var row = rowByKey(key)
    if (row === null) return false
    var index = keys.indexOf(key)
    if (index === -1 || tickEls[index] === undefined) return false

    var text = previewOf(row, index, keys.length)
    tooltip.textContent = text === '' ? '（无文本）' : text
    tooltip.removeAttribute('data-hidden')

    var tickRect = tickEls[index].getBoundingClientRect()
    var railRect = rail.getBoundingClientRect()
    var boxWidth = tooltip.offsetWidth || 240
    var boxHeight = tooltip.offsetHeight || 32
    var top = Math.min(Math.max(tickRect.top + tickRect.height / 2 - boxHeight / 2, 8), window.innerHeight - boxHeight - 8)
    var left = railRect.right + 8
    if (left + boxWidth > (window.innerWidth || 1024) - 8) {
      left = Math.max(8, railRect.left - boxWidth - 8)
    }

    tooltip.style.top = Math.round(top) + 'px'
    tooltip.style.left = Math.round(left) + 'px'
    return true
  }

  function showTooltip(key, pin) {
    if (pin) selectedKey = key
    if (renderTooltip(key)) return
    if (selectedKey !== null && renderTooltip(selectedKey)) return
    selectedKey = null
    tooltip.setAttribute('data-hidden', '')
  }

  function hideTooltip() {
    if (selectedKey !== null && renderTooltip(selectedKey)) return
    selectedKey = null
    tooltip.setAttribute('data-hidden', '')
  }

  function clearApproach() {
    for (var i = 0; i < tickEls.length; i++) {
      tickEls[i].classList.remove('active-hover')
      tickEls[i].classList.remove('approach')
      tickEls[i].classList.remove('approach-far')
      tickEls[i].classList.remove('approach-3')
    }
  }

  function updateApproach(index) {
    clearApproach()
    if (index >= 0 && index < tickEls.length) {
      tickEls[index].classList.add('active-hover')
      if (index > 0) tickEls[index - 1].classList.add('approach')
      if (index + 1 < tickEls.length) tickEls[index + 1].classList.add('approach')
      if (index > 1) tickEls[index - 2].classList.add('approach-far')
      if (index + 2 < tickEls.length) tickEls[index + 2].classList.add('approach-far')
      if (index > 2) tickEls[index - 3].classList.add('approach-3')
      if (index + 3 < tickEls.length) tickEls[index + 3].classList.add('approach-3')
    }
  }

  function clearTicks() {
    for (var i = 0; i < tickEls.length; i++) tickEls[i].remove()
    tickEls = []
    keys = []
  }

  function makeTick(index) {
    var button = document.createElement('button')
    button.type = 'button'
    button.className = 'tick'
    button.setAttribute('role', 'button')
    button.addEventListener('click', function () {
      jumpTo(keys[index])
      showTooltip(keys[index], true)
    })
    button.addEventListener('pointerenter', function () {
      if (isScrubbing) return
      rail.setAttribute('data-hovering', '')
      updateApproach(index)
      showTooltip(keys[index], false)
    })
    button.addEventListener('pointerleave', function (e) {
      if (isScrubbing) return
      var related = e && e.relatedTarget
      if (related && rail.contains(related)) return
      clearApproach()
      rail.removeAttribute('data-hovering')
      hideTooltip()
    })
    button.addEventListener('focus', function () {
      rail.setAttribute('data-hovering', '')
      updateApproach(index)
      showTooltip(keys[index], false)
    })
    button.addEventListener('blur', function () {
      clearApproach()
      rail.removeAttribute('data-hovering')
      hideTooltip()
    })
    button.addEventListener('keydown', function (e) {
      var handled = false
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        if (index > 0 && tickEls[index - 1] !== undefined) {
          if (typeof tickEls[index - 1].focus === 'function') tickEls[index - 1].focus()
          handled = true
        }
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        if (index + 1 < tickEls.length && tickEls[index + 1] !== undefined) {
          if (typeof tickEls[index + 1].focus === 'function') tickEls[index + 1].focus()
          handled = true
        }
      } else if (e.key === 'Home') {
        scrollToTop()
        if (tickEls.length > 0 && tickEls[0] !== undefined) {
          if (typeof tickEls[0].focus === 'function') tickEls[0].focus()
          updateApproach(0)
        }
        handled = true
      } else if (e.key === 'End') {
        if (tickEls.length > 0 && tickEls[tickEls.length - 1] !== undefined) {
          var last = tickEls.length - 1
          jumpTo(keys[last])
          if (typeof tickEls[last].focus === 'function') tickEls[last].focus()
          updateApproach(last)
          handled = true
        }
      } else if (e.key === 'Escape') {
        if (selectedKey !== null) {
          selectedKey = null
          tooltip.setAttribute('data-hidden', '')
        }
        if (typeof button.blur === 'function') button.blur()
        handled = true
      }
      if (handled) {
        if (typeof e.preventDefault === 'function') e.preventDefault()
        if (typeof e.stopPropagation === 'function') e.stopPropagation()
      }
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
      tick.setAttribute('aria-label', '跳转到第 ' + (k + 1) + ' 轮：' + previewOf(userRows[k], k, keys.length))
      tickEls.push(tick)
    }
    if (selectedKey !== null) {
      if (keys.indexOf(selectedKey) === -1) {
        selectedKey = null
        tooltip.setAttribute('data-hidden', '')
      } else {
        renderTooltip(selectedKey)
      }
    }
  }

  function nearestIndex() {
    if (port === null || column === null || keys.length === 0) return -1
    var portRect = port.getBoundingClientRect()
    var viewTop = portRect.top + 4
    var best = Infinity
    var nearest = -1
    for (var j = 0; j < keys.length; j++) {
      var row = rowByKey(keys[j])
      if (row === null) continue
      var r = row.getBoundingClientRect()
      var d = Math.abs(r.top + r.height / 2 - viewTop)
      if (d < best) { best = d; nearest = j }
    }
    return nearest
  }

  function isLastTurnStreaming() {
    if (column === null) return false
    var streamingEl = column.querySelector('.streaming, [data-is-streaming], [data-chat-flow-streaming], .is-streaming')
    if (streamingEl !== null) return true
    var lastStep = column.querySelector(':scope > [data-chat-flow-kind="assistant-step"]:last-child, :scope > [data-chat-flow-kind="assistant"]:last-child')
    if (lastStep !== null && (lastStep.classList.contains('streaming') || lastStep.hasAttribute('data-streaming'))) {
      return true
    }
    return false
  }

  function handleScrub(clientY) {
    if (port === null || column === null || keys.length === 0) return
    var railRect = rail.getBoundingClientRect()
    var offsetY = clientY - railRect.top
    var fraction = Math.max(0, Math.min(1, offsetY / Math.max(railRect.height, 1)))
    var maxScroll = Math.max(0, column.scrollHeight - port.clientHeight)
    port.scrollTop = fraction * maxScroll
    var targetIndex = Math.max(0, Math.min(keys.length - 1, Math.floor(fraction * keys.length)))
    updateApproach(targetIndex)
    showTooltip(keys[targetIndex], true)
  }

  function measure() {
    raf = 0
    if (port === null || column === null || !port.isConnected || !column.isConnected) {
      rail.setAttribute('data-hidden', '')
      return
    }
    var portRect = port.getBoundingClientRect()
    var userRows = column.querySelectorAll(':scope > [data-chat-flow-kind="user"], :scope > [data-chat-flow-kind="steering"], :scope > [data-chat-flow-kind="command-input"]')
    if (portRect.height < 40 || portRect.width < 360 || (window.innerWidth && window.innerWidth < 500) || userRows.length === 0) {
      rail.setAttribute('data-hidden', '')
      return
    }
    rail.removeAttribute('data-hidden')
    var count = userRows.length
    var maxRailHeight = Math.max(60, portRect.height * 0.7)
    var nominalHeight = count * TICK_GAP
    var gap = TICK_GAP
    if (nominalHeight > maxRailHeight && count > 1) {
      gap = Math.max(3, maxRailHeight / count)
    }
    var railHeight = count * gap
    rail.style.left = Math.round(portRect.left + 3) + 'px'
    rail.style.top = Math.round(portRect.top + (portRect.height - railHeight) / 2) + 'px'
    rail.style.height = railHeight + 'px'
    rebuildTicks(userRows)

    // Layout ticks with GPU translate and fallback top
    for (var i = 0; i < count; i++) {
      var topPx = (i + 0.5) * gap
      tickEls[i].style.top = topPx + 'px'
      tickEls[i].style.transform = 'translate3d(0,0,0)'
      var details = inspectTurnDetails(userRows[i])
      tickEls[i].classList.toggle('error', details.error !== '')
      tickEls[i].classList.toggle('compacted-before', details.hasCompaction)
    }

    var columnRect = column.getBoundingClientRect()
    var total = Math.max(column.scrollHeight, 1)
    var visibleStart = Math.max(0, Math.min(total, portRect.top - columnRect.top))
    var visibleEnd = Math.max(0, Math.min(total, portRect.bottom - columnRect.top))
    if (visibleEnd < visibleStart) visibleEnd = visibleStart
    marker.removeAttribute('data-hidden')
    var markerTop = Math.round(visibleStart / total * railHeight)
    marker.style.top = markerTop + 'px'
    marker.style.transform = 'translate3d(0,0,0)'
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
    var streaming = isLastTurnStreaming()
    for (var k = 0; k < tickEls.length; k++) {
      var isNearest = (k === nearest)
      tickEls[k].classList.toggle('near', isNearest)
      if (isNearest) {
        tickEls[k].setAttribute('aria-current', 'step')
      } else {
        tickEls[k].removeAttribute('aria-current')
      }
      var isLast = (k === tickEls.length - 1)
      tickEls[k].classList.toggle('streaming', isLast && streaming)
    }

    // Position floating toTop button when scrolled down
    if (port.scrollTop > 120) {
      toTopBtn.removeAttribute('data-hidden')
      var officialToBottom = port.querySelector('button[class*="_toBottom"]')
      if (officialToBottom !== null && officialToBottom.offsetParent !== null) {
        var bottomRect = officialToBottom.getBoundingClientRect()
        toTopBtn.style.left = bottomRect.left + 'px'
        toTopBtn.style.top = (bottomRect.top - 42) + 'px'
        toTopBtn.style.right = 'auto'
        toTopBtn.style.bottom = 'auto'
      } else {
        // When reaching the bottom, official toBottom is unmounted.
        // Align toTopBtn with the right edge of the chat column directly above the composer.
        var composerHeight = 152
        if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
          try {
            var compVal = parseFloat(window.getComputedStyle(port).getPropertyValue('--dsh-composer-height'))
            if (!isNaN(compVal) && compVal > 0) composerHeight = compVal
          } catch (_) {}
        }
        var targetLeft = Math.min(columnRect.right - 34, portRect.right - 42)
        var targetTop = portRect.bottom - composerHeight - 50
        toTopBtn.style.left = Math.round(targetLeft) + 'px'
        toTopBtn.style.top = Math.round(targetTop) + 'px'
        toTopBtn.style.right = 'auto'
        toTopBtn.style.bottom = 'auto'
      }
    } else {
      toTopBtn.setAttribute('data-hidden', '')
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
    selectedKey = null
    isScrubbing = false
    clearTicks()
    hideTooltip()
    toTopBtn.setAttribute('data-hidden', '')
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
      rail.setAttribute('data-hidden', '')
      toTopBtn.setAttribute('data-hidden', '')
      return
    }
    bind(found)
  }

  function setup() {
    resizeListener = function () { schedule() }
    window.addEventListener('resize', resizeListener)

    toTopBtn.addEventListener('click', function () {
      scrollToTop()
    })

    rail.addEventListener('pointerenter', function (e) {
      if (isScrubbing || keys.length === 0) return
      rail.setAttribute('data-hovering', '')
      var railRect = rail.getBoundingClientRect()
      var offsetY = e.clientY - railRect.top
      var fraction = Math.max(0, Math.min(1, offsetY / Math.max(railRect.height, 1)))
      var targetIndex = Math.max(0, Math.min(keys.length - 1, Math.floor(fraction * keys.length)))
      updateApproach(targetIndex)
      showTooltip(keys[targetIndex], false)
    })

    rail.addEventListener('pointermove', function (e) {
      if (isScrubbing) {
        handleScrub(e.clientY)
        e.preventDefault()
        return
      }
      if (keys.length === 0) return
      rail.setAttribute('data-hovering', '')
      var railRect = rail.getBoundingClientRect()
      var offsetY = e.clientY - railRect.top
      var fraction = Math.max(0, Math.min(1, offsetY / Math.max(railRect.height, 1)))
      var targetIndex = Math.max(0, Math.min(keys.length - 1, Math.floor(fraction * keys.length)))
      updateApproach(targetIndex)
      showTooltip(keys[targetIndex], false)
    })

    rail.addEventListener('pointerleave', function () {
      if (isScrubbing) return
      clearApproach()
      rail.removeAttribute('data-hovering')
      hideTooltip()
    })

    rail.addEventListener('pointerdown', function (e) {
      if (e.target && e.target.classList && e.target.classList.contains('tick')) return
      isScrubbing = true
      if (typeof rail.setPointerCapture === 'function' && e.pointerId) {
        try { rail.setPointerCapture(e.pointerId) } catch (_) {}
      }
      handleScrub(e.clientY)
      e.preventDefault()
    })

    var endScrub = function () {
      if (isScrubbing) {
        isScrubbing = false
        clearApproach()
        rail.removeAttribute('data-hovering')
      }
    }
    rail.addEventListener('pointerup', endScrub)
    rail.addEventListener('pointercancel', endScrub)

    docPointerListener = function (event) {
      if (selectedKey === null) return
      var target = event && event.target
      if (target && (rail.contains(target) || tooltip.contains(target))) return
      selectedKey = null
      tooltip.setAttribute('data-hidden', '')
    }
    document.addEventListener('pointerdown', docPointerListener, true)

    docKeydownListener = function (e) {
      if (e.key === 'Escape') {
        if (selectedKey !== null) {
          selectedKey = null
          tooltip.setAttribute('data-hidden', '')
        }
        return
      }
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        if (keys.length === 0) return
        var cur = nearestIndex()
        if (cur === -1) cur = 0
        var target = e.key === 'ArrowUp' ? Math.max(0, cur - 1) : Math.min(keys.length - 1, cur + 1)
        jumpTo(keys[target])
        showTooltip(keys[target], true)
        if (tickEls[target] !== undefined) {
          tickEls[target].focus()
          updateApproach(target)
        }
        if (typeof e.preventDefault === 'function') e.preventDefault()
      } else if ((e.altKey || e.ctrlKey) && e.key === 'Home') {
        scrollToTop()
        if (typeof e.preventDefault === 'function') e.preventDefault()
      }
    }
    document.addEventListener('keydown', docKeydownListener)

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
  }

  function teardown() {
    if (raf !== 0) cancelAnimationFrame(raf)
    if (bodyMo !== null) bodyMo.disconnect()
    bodyMo = null
    if (resizeListener !== null) window.removeEventListener('resize', resizeListener)
    resizeListener = null
    if (docPointerListener !== null) document.removeEventListener('pointerdown', docPointerListener, true)
    docPointerListener = null
    if (docKeydownListener !== null) document.removeEventListener('keydown', docKeydownListener)
    docKeydownListener = null
    unbind()
    rail.remove()
    tooltip.remove()
    toTopBtn.remove()
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
