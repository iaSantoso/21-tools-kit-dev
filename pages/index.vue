<script setup lang="ts">
const sampleJson = `{
  "project": "JSON Glow",
  "features": ["beautify", "validate", "minify", "copy", "download"],
  "theme": {
    "mode": "modern",
    "accent": "aurora"
  },
  "ready": true
}`

const compareSampleJson = `{
  "project": "JSON Glow",
  "version": 2,
  "features": ["beautify", "validate", "minify", "compare", "download"],
  "theme": {
    "mode": "modern",
    "accent": "mint"
  },
  "ready": true
}`

type WorkspaceMode = 'format' | 'compare'
type CopyTarget = 'input' | 'output' | 'compare-original' | 'compare-changed'
type ThemeMode = 'dark' | 'light'
type EditorId = 'format-input' | 'format-output' | 'compare-original' | 'compare-changed'
type EditorViewRow = {
  text: string
  sourceLine: number
  foldEnd?: number
  isCollapsed: boolean
}

const input = ref(sampleJson)
const output = ref('')
const error = ref('')
const jsonIssue = ref<{ line: number, column: number, suggestion: string } | null>(null)
const indent = ref(2)
const sortKeys = ref(false)
const themeMode = ref<ThemeMode>('light')
useHead(() => ({
  htmlAttrs: {
    'data-theme': themeMode.value
  }
}))
const showScrollTop = ref(false)
const route = useRoute()
const workspaceMode = ref<WorkspaceMode>(route.query.mode === 'compare' ? 'compare' : 'format')
const compareOriginal = ref(sampleJson)
const compareChanged = ref(compareSampleJson)
const activeChangeIndex = ref(0)
const copiedPanel = ref<CopyTarget | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const inputEditor = ref<HTMLTextAreaElement | null>(null)
const inputMirror = ref<HTMLElement | null>(null)
const compareOriginalEditor = ref<HTMLTextAreaElement | null>(null)
const compareOriginalMirror = ref<HTMLElement | null>(null)
const compareChangedEditor = ref<HTMLTextAreaElement | null>(null)
const compareChangedMirror = ref<HTMLElement | null>(null)
const collapsedBlocks = reactive<Record<EditorId, Set<number>>>({
  'format-input': new Set<number>(),
  'format-output': new Set<number>(),
  'compare-original': new Set<number>(),
  'compare-changed': new Set<number>()
})
let copyResetTimer: number | undefined

const inputView = computed(() => createEditorView(input.value, collapsedBlocks['format-input']))
const outputView = computed(() => createEditorView(output.value, collapsedBlocks['format-output']))
const compareOriginalView = computed(() => createEditorView(compareOriginal.value, collapsedBlocks['compare-original']))
const compareChangedView = computed(() => createEditorView(compareChanged.value, collapsedBlocks['compare-changed']))
const highlightedInput = computed(() => highlightEditorView(inputView.value, jsonIssue.value?.line))
const highlightedOutput = computed(() => highlightEditorView(outputView.value))
const compareDiff = computed(() => createLineDiff(compareOriginal.value, compareChanged.value))
const activeChangeGroup = computed(() => compareDiff.value.changeGroups[activeChangeIndex.value] || null)
const activeOriginalLines = computed(() => new Set(activeChangeGroup.value?.originalLines || []))
const activeChangedLines = computed(() => new Set(activeChangeGroup.value?.changedLines || []))
const highlightedCompareOriginal = computed(() => highlightDiffJson(
  compareOriginalView.value,
  compareDiff.value.removedLines,
  'diff-line-removed',
  compareDiff.value.originalTokenChanges,
  'diff-text-removed',
  activeOriginalLines.value
))
const highlightedCompareChanged = computed(() => highlightDiffJson(
  compareChangedView.value,
  compareDiff.value.addedLines,
  'diff-line-added',
  compareDiff.value.changedTokenChanges,
  'diff-text-added',
  activeChangedLines.value
))
const inputLineNumbers = computed(() => inputView.value.rows)
const outputLineNumbers = computed(() => outputView.value.rows)
const compareOriginalLineNumbers = computed(() => compareOriginalView.value.rows)
const compareChangedLineNumbers = computed(() => compareChangedView.value.rows)
const originalOverviewMarkers = computed(() => createDiffOverviewMarkers(
  compareDiff.value.changeGroups,
  splitLines(compareOriginal.value).length,
  'original'
))
const changedOverviewMarkers = computed(() => createDiffOverviewMarkers(
  compareDiff.value.changeGroups,
  splitLines(compareChanged.value).length,
  'changed'
))

const stats = computed(() => {
  const source = output.value || input.value
  return {
    chars: source.length.toLocaleString('en-US'),
    lines: source ? source.split('\n').length.toLocaleString('en-US') : '0',
    size: formatBytes(new Blob([source]).size)
  }
})

const statusLabel = computed(() => {
  if (workspaceMode.value === 'compare') {
    return compareDiff.value.hasChanges ? 'Changes found' : 'Files match'
  }

  return error.value ? 'Invalid JSON' : output.value ? 'Valid JSON' : 'Ready'
})
const statusClass = computed(() => {
  if (workspaceMode.value === 'compare') {
    return compareDiff.value.hasChanges ? 'is-change' : 'is-valid'
  }

  return error.value ? 'is-error' : output.value ? 'is-valid' : 'is-idle'
})

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const sizeIndex = Math.floor(Math.log(bytes) / Math.log(1024))
  const size = bytes / Math.pow(1024, sizeIndex)
  return `${size.toFixed(size >= 10 || sizeIndex === 0 ? 0 : 1)} ${units[sizeIndex]}`
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function highlightJson(value: string) {
  const tokenPattern = /"(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b/g
  let highlighted = ''
  let lastIndex = 0

  value.replace(tokenPattern, (match, offset: number) => {
    const nextChunk = value.slice(offset + match.length)
    let tokenType = 'json-number'

    if (match.startsWith('"')) {
      tokenType = /^\s*:/.test(nextChunk) ? 'json-key' : 'json-string'
    } else if (match === 'true' || match === 'false') {
      tokenType = 'json-boolean'
    } else if (match === 'null') {
      tokenType = 'json-null'
    }

    highlighted += escapeHtml(value.slice(lastIndex, offset))
    highlighted += `<span class="${tokenType}">${escapeHtml(match)}</span>`
    lastIndex = offset + match.length
    return match
  })

  highlighted += escapeHtml(value.slice(lastIndex))
  return highlighted
}

function splitLines(value: string) {
  return value ? value.replace(/\r\n/g, '\n').split('\n') : []
}

function findFoldRanges(value: string) {
  const lines = splitLines(value)
  const stack: Array<{ bracket: string, line: number }> = []
  const ranges = new Map<number, number>()
  let inString = false
  let escaped = false

  lines.forEach((line, lineIndex) => {
    for (const character of line) {
      if (inString) {
        if (escaped) {
          escaped = false
        } else if (character === '\\') {
          escaped = true
        } else if (character === '"') {
          inString = false
        }
        continue
      }

      if (character === '"') {
        inString = true
      } else if (character === '{' || character === '[') {
        stack.push({ bracket: character, line: lineIndex })
      } else if (character === '}' || character === ']') {
        const expectedOpening = character === '}' ? '{' : '['
        const opening = stack.at(-1)
        if (opening?.bracket !== expectedOpening) continue
        stack.pop()
        if (lineIndex > opening.line) {
          ranges.set(opening.line, Math.max(ranges.get(opening.line) || 0, lineIndex))
        }
      }
    }
  })

  return ranges
}

function createEditorView(value: string, collapsed: Set<number>) {
  const lines = splitLines(value)
  const foldRanges = findFoldRanges(value)
  const rows: EditorViewRow[] = []

  for (let sourceLine = 0; sourceLine < lines.length;) {
    const foldEnd = foldRanges.get(sourceLine)
    const isCollapsed = foldEnd !== undefined && collapsed.has(sourceLine)
    rows.push({
      text: isCollapsed ? `${lines[sourceLine]}  … ${foldEnd - sourceLine} lines` : lines[sourceLine],
      sourceLine,
      foldEnd,
      isCollapsed
    })
    sourceLine = isCollapsed ? foldEnd + 1 : sourceLine + 1
  }

  return {
    rows,
    text: rows.map(row => row.text).join('\n')
  }
}

function highlightEditorView(view: { rows: EditorViewRow[] }, errorLine?: number) {
  return view.rows.map((row) => {
    const errorClass = row.sourceLine === errorLine ? ' is-error-line' : ''
    const collapsedClass = row.isCollapsed ? ' is-collapsed-line' : ''
    return `<span class="code-line${errorClass}${collapsedClass}" data-line-index="${row.sourceLine}">${highlightJson(row.text) || '&nbsp;'}</span>`
  }).join('')
}

function toggleFold(editorId: EditorId, sourceLine: number) {
  const collapsed = collapsedBlocks[editorId]
  if (collapsed.has(sourceLine)) {
    collapsed.delete(sourceLine)
  } else {
    collapsed.add(sourceLine)
  }
}

function expandFoldContainingLine(editorId: EditorId, value: string, lineIndex: number) {
  const ranges = findFoldRanges(value)
  for (const startLine of [...collapsedBlocks[editorId]]) {
    const endLine = ranges.get(startLine)
    if (endLine !== undefined && startLine <= lineIndex && lineIndex <= endLine) {
      collapsedBlocks[editorId].delete(startLine)
    }
  }
}

function updateEditorValue(editorId: 'format-input' | 'compare-original' | 'compare-changed', event: Event) {
  if (collapsedBlocks[editorId].size) return
  const value = (event.target as HTMLTextAreaElement).value
  if (editorId === 'format-input') input.value = value
  if (editorId === 'compare-original') compareOriginal.value = value
  if (editorId === 'compare-changed') compareChanged.value = value
}

function createDiffOverviewMarkers(
  changeGroups: Array<{ originalLines: number[], changedLines: number[] }>,
  totalLines: number,
  side: 'original' | 'changed'
) {
  const safeTotal = Math.max(totalLines, 1)

  return changeGroups.flatMap((group, changeIndex) => {
    const lines = side === 'original' ? group.originalLines : group.changedLines
    if (!lines.length) return []

    const markerHeight = Math.max((lines.length / safeTotal) * 100, 1.4)
    const markerTop = Math.min((lines[0] / safeTotal) * 100, 100 - markerHeight)
    return [{
      changeIndex,
      lineNumber: lines[0] + 1,
      top: markerTop,
      height: markerHeight
    }]
  })
}

function tokenizeDiffLine(line: string) {
  const tokenPattern = /"(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b|\s+|./g
  return line.match(tokenPattern) || []
}

function createTokenDiff(originalLine: string, changedLine: string) {
  const originalTokens = tokenizeDiffLine(originalLine)
  const changedTokens = tokenizeDiffLine(changedLine)
  const originalItems = originalTokens
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => value.trim())
  const changedItems = changedTokens
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => value.trim())
  const originalChanges = new Set(originalItems.map(({ index }) => index))
  const changedChanges = new Set(changedItems.map(({ index }) => index))

  if (originalItems.length * changedItems.length > 40_000) {
    return { originalChanges, changedChanges }
  }

  const matrix = Array.from(
    { length: originalItems.length + 1 },
    () => new Uint16Array(changedItems.length + 1)
  )

  for (let leftIndex = 1; leftIndex <= originalItems.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= changedItems.length; rightIndex += 1) {
      matrix[leftIndex][rightIndex] = originalItems[leftIndex - 1].value === changedItems[rightIndex - 1].value
        ? matrix[leftIndex - 1][rightIndex - 1] + 1
        : Math.max(matrix[leftIndex - 1][rightIndex], matrix[leftIndex][rightIndex - 1])
    }
  }

  let leftIndex = originalItems.length
  let rightIndex = changedItems.length
  while (leftIndex > 0 && rightIndex > 0) {
    if (originalItems[leftIndex - 1].value === changedItems[rightIndex - 1].value) {
      originalChanges.delete(originalItems[leftIndex - 1].index)
      changedChanges.delete(changedItems[rightIndex - 1].index)
      leftIndex -= 1
      rightIndex -= 1
    } else if (matrix[leftIndex - 1][rightIndex] >= matrix[leftIndex][rightIndex - 1]) {
      leftIndex -= 1
    } else {
      rightIndex -= 1
    }
  }

  return { originalChanges, changedChanges }
}

function lineSimilarity(originalLine: string, changedLine: string) {
  const originalTokens = tokenizeDiffLine(originalLine).filter(token => token.trim())
  const changedTokens = tokenizeDiffLine(changedLine).filter(token => token.trim())
  if (!originalTokens.length || !changedTokens.length) return 0

  let previous = new Uint16Array(changedTokens.length + 1)
  for (const originalToken of originalTokens) {
    const current = new Uint16Array(changedTokens.length + 1)
    for (let index = 1; index <= changedTokens.length; index += 1) {
      current[index] = originalToken === changedTokens[index - 1]
        ? previous[index - 1] + 1
        : Math.max(previous[index], current[index - 1])
    }
    previous = current
  }

  return (2 * previous[changedTokens.length]) / (originalTokens.length + changedTokens.length)
}

function pairChangedLines(
  originalLines: string[],
  changedLines: string[],
  removedIndexes: number[],
  addedIndexes: number[],
  originalTokenChanges: Map<number, Set<number>>,
  changedTokenChanges: Map<number, Set<number>>
) {
  const availableAdded = new Set(addedIndexes)

  for (const removedIndex of removedIndexes) {
    let bestAddedIndex: number | undefined
    let bestScore = -1

    for (const addedIndex of availableAdded) {
      const score = lineSimilarity(originalLines[removedIndex], changedLines[addedIndex])
      if (score > bestScore) {
        bestScore = score
        bestAddedIndex = addedIndex
      }
    }

    if (bestAddedIndex !== undefined && (bestScore >= 0.18 || (removedIndexes.length === 1 && addedIndexes.length === 1))) {
      const tokenDiff = createTokenDiff(originalLines[removedIndex], changedLines[bestAddedIndex])
      originalTokenChanges.set(removedIndex, tokenDiff.originalChanges)
      changedTokenChanges.set(bestAddedIndex, tokenDiff.changedChanges)
      availableAdded.delete(bestAddedIndex)
    } else {
      originalTokenChanges.set(
        removedIndex,
        new Set(tokenizeDiffLine(originalLines[removedIndex]).map((_, index) => index))
      )
    }
  }

  for (const addedIndex of availableAdded) {
    changedTokenChanges.set(
      addedIndex,
      new Set(tokenizeDiffLine(changedLines[addedIndex]).map((_, index) => index))
    )
  }
}

function createLineDiff(original: string, changed: string) {
  const originalLines = splitLines(original)
  const changedLines = splitLines(changed)
  const removedLines = new Set<number>()
  const addedLines = new Set<number>()
  const originalTokenChanges = new Map<number, Set<number>>()
  const changedTokenChanges = new Map<number, Set<number>>()
  const changeGroups: Array<{ originalLines: number[], changedLines: number[] }> = []
  let unchanged = 0

  if (originalLines.length * changedLines.length > 1_000_000) {
    const longest = Math.max(originalLines.length, changedLines.length)
    let removedHunk: number[] = []
    let addedHunk: number[] = []
    const flushLargeHunk = () => {
      if (!removedHunk.length && !addedHunk.length) return
      changeGroups.push({ originalLines: [...removedHunk], changedLines: [...addedHunk] })
      pairChangedLines(
        originalLines,
        changedLines,
        removedHunk,
        addedHunk,
        originalTokenChanges,
        changedTokenChanges
      )
      removedHunk = []
      addedHunk = []
    }

    for (let index = 0; index < longest; index += 1) {
      if (originalLines[index] === changedLines[index]) {
        flushLargeHunk()
        if (index < originalLines.length) unchanged += 1
        continue
      }
      if (index < originalLines.length) {
        removedLines.add(index)
        removedHunk.push(index)
      }
      if (index < changedLines.length) {
        addedLines.add(index)
        addedHunk.push(index)
      }
    }
    flushLargeHunk()
  } else {
    const matrix = Array.from(
      { length: originalLines.length + 1 },
      () => new Uint32Array(changedLines.length + 1)
    )

    for (let leftIndex = 1; leftIndex <= originalLines.length; leftIndex += 1) {
      for (let rightIndex = 1; rightIndex <= changedLines.length; rightIndex += 1) {
        matrix[leftIndex][rightIndex] = originalLines[leftIndex - 1] === changedLines[rightIndex - 1]
          ? matrix[leftIndex - 1][rightIndex - 1] + 1
          : Math.max(matrix[leftIndex - 1][rightIndex], matrix[leftIndex][rightIndex - 1])
      }
    }

    const operations: Array<{ type: 'same' | 'removed' | 'added', index: number }> = []
    let leftIndex = originalLines.length
    let rightIndex = changedLines.length

    while (leftIndex > 0 && rightIndex > 0) {
      if (originalLines[leftIndex - 1] === changedLines[rightIndex - 1]) {
        operations.push({ type: 'same', index: leftIndex - 1 })
        leftIndex -= 1
        rightIndex -= 1
      } else if (matrix[leftIndex - 1][rightIndex] >= matrix[leftIndex][rightIndex - 1]) {
        operations.push({ type: 'removed', index: leftIndex - 1 })
        leftIndex -= 1
      } else {
        operations.push({ type: 'added', index: rightIndex - 1 })
        rightIndex -= 1
      }
    }

    while (leftIndex > 0) {
      operations.push({ type: 'removed', index: leftIndex - 1 })
      leftIndex -= 1
    }

    while (rightIndex > 0) {
      operations.push({ type: 'added', index: rightIndex - 1 })
      rightIndex -= 1
    }

    operations.reverse()
    let removedHunk: number[] = []
    let addedHunk: number[] = []
    const flushHunk = () => {
      if (!removedHunk.length && !addedHunk.length) return
      changeGroups.push({ originalLines: [...removedHunk], changedLines: [...addedHunk] })
      pairChangedLines(
        originalLines,
        changedLines,
        removedHunk,
        addedHunk,
        originalTokenChanges,
        changedTokenChanges
      )
      removedHunk = []
      addedHunk = []
    }

    for (const operation of operations) {
      if (operation.type === 'same') {
        flushHunk()
        unchanged += 1
      } else if (operation.type === 'removed') {
        removedLines.add(operation.index)
        removedHunk.push(operation.index)
      } else {
        addedLines.add(operation.index)
        addedHunk.push(operation.index)
      }
    }
    flushHunk()
  }

  return {
    removedLines,
    addedLines,
    changeGroups,
    originalTokenChanges,
    changedTokenChanges,
    removals: removedLines.size,
    additions: addedLines.size,
    unchanged,
    hasChanges: removedLines.size > 0 || addedLines.size > 0
  }
}

function renderDiffToken(tokens: string[], index: number) {
  const token = tokens[index]
  let tokenType = ''

  if (token.startsWith('"')) {
    const nextToken = tokens.slice(index + 1).find(next => next.trim())
    tokenType = nextToken === ':' ? 'json-key' : 'json-string'
  } else if (token === 'true' || token === 'false') {
    tokenType = 'json-boolean'
  } else if (token === 'null') {
    tokenType = 'json-null'
  } else if (/^-?\d/.test(token)) {
    tokenType = 'json-number'
  }

  const escapedToken = escapeHtml(token)
  return tokenType ? `<span class="${tokenType}">${escapedToken}</span>` : escapedToken
}

function highlightDiffJson(
  view: { rows: EditorViewRow[] },
  changedLines: Set<number>,
  lineClassName: string,
  tokenChanges: Map<number, Set<number>>,
  textClassName: string,
  activeLines: Set<number>
) {
  return view.rows
    .map((row) => {
      const line = row.text
      const lineIndex = row.sourceLine
      const changedTokens = tokenChanges.get(lineIndex)
      const highlightedLine = changedTokens
        ? tokenizeDiffLine(line).map((token, tokenIndex, tokens) => {
          const highlightedToken = renderDiffToken(tokens, tokenIndex)
          return changedTokens.has(tokenIndex) && token.trim()
            ? `<mark class="diff-text ${textClassName}">${highlightedToken}</mark>`
            : highlightedToken
        }).join('')
        : highlightJson(line)
      const diffClass = changedLines.has(lineIndex) ? ` ${lineClassName}` : ''
      const activeClass = activeLines.has(lineIndex) ? ' is-active-diff' : ''
      const collapsedClass = row.isCollapsed ? ' is-collapsed-line' : ''
      return `<span class="diff-line${diffClass}${activeClass}${collapsedClass}" data-line-index="${lineIndex}">${highlightedLine || '&nbsp;'}</span>`
    })
    .join('')
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys)
  }

  if (value && typeof value === 'object' && value.constructor === Object) {
    return Object.keys(value as Record<string, unknown>)
      .sort((a, b) => a.localeCompare(b))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortObjectKeys((value as Record<string, unknown>)[key])
        return acc
      }, {})
  }

  return value
}

function getJsonSuggestion(message: string, value: string) {
  const normalized = message.toLowerCase()
  if (/,[\s\r\n]*[}\]]/.test(value)) {
    return 'Remove the trailing comma before the closing bracket.'
  }
  if (normalized.includes('unexpected end') || normalized.includes('end of json')) {
    return 'Complete the value and add the missing closing } or ].'
  }
  if (normalized.includes('property name') || normalized.includes('double-quoted')) {
    return 'Wrap every property name in double quotes.'
  }
  if (normalized.includes("unexpected token '\''") || normalized.includes('single quote')) {
    return 'JSON strings must use double quotes instead of single quotes.'
  }
  if (normalized.includes("expected ','") || normalized.includes("expected ',' or '}'")) {
    return 'Add a comma between properties, or close the current object.'
  }
  return 'Check commas, quotes, and matching brackets around the highlighted line.'
}

function parseJsonIssue(message: string, value: string) {
  const explicitLocation = message.match(/line\s+(\d+)\s+column\s+(\d+)/i)
  const positionMatch = message.match(/position\s+(\d+)/i)
  let line = explicitLocation ? Number(explicitLocation[1]) - 1 : 0
  let column = explicitLocation ? Number(explicitLocation[2]) : 1

  if (positionMatch) {
    const position = Math.min(Number(positionMatch[1]), value.length)
    const preceding = value.slice(0, position)
    const lines = preceding.split('\n')
    line = lines.length - 1
    column = (lines.at(-1)?.length || 0) + 1
  } else if (!explicitLocation && value) {
    const lines = value.split('\n')
    line = lines.length - 1
    column = (lines.at(-1)?.length || 0) + 1
  }

  return { line, column, suggestion: getJsonSuggestion(message, value) }
}

function setJsonError(caught: unknown) {
  const message = caught instanceof Error ? caught.message : 'Unable to parse JSON.'
  error.value = message
  jsonIssue.value = parseJsonIssue(message, input.value)
  output.value = ''
}

function parseInput() {
  try {
    const parsed = JSON.parse(input.value)
    const normalized = sortKeys.value ? sortObjectKeys(parsed) : parsed
    error.value = ''
    jsonIssue.value = null
    return normalized
  } catch (caught) {
    setJsonError(caught)
    return null
  }
}

function beautifyJson() {
  const parsed = parseInput()
  if (parsed === null) return
  output.value = JSON.stringify(parsed, null, indent.value)
}

function minifyJson() {
  const parsed = parseInput()
  if (parsed === null) return
  output.value = JSON.stringify(parsed)
}

function clearJson() {
  input.value = ''
  output.value = ''
  error.value = ''
  jsonIssue.value = null
}

function loadSample() {
  input.value = sampleJson
  beautifyJson()
}

async function copyCode(panel: CopyTarget) {
  const sources: Record<CopyTarget, string> = {
    input: input.value,
    output: output.value,
    'compare-original': compareOriginal.value,
    'compare-changed': compareChanged.value
  }
  const text = sources[panel]
  if (!text) return

  await navigator.clipboard.writeText(text)
  copiedPanel.value = panel
  window.clearTimeout(copyResetTimer)
  copyResetTimer = window.setTimeout(() => {
    copiedPanel.value = null
  }, 1600)
}

function downloadJson() {
  const text = output.value || input.value
  if (!text) return

  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'beautified.json'
  link.click()
  URL.revokeObjectURL(url)
}

function openFilePicker() {
  fileInput.value?.click()
}

function handleFileUpload(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = () => {
    input.value = String(reader.result || '')
    beautifyJson()
    target.value = ''
  }
  reader.readAsText(file)
}

function syncInputHighlightScroll() {
  if (!inputEditor.value || !inputMirror.value) return

  inputMirror.value.scrollTop = inputEditor.value.scrollTop
  inputMirror.value.scrollLeft = inputEditor.value.scrollLeft
}

function syncCompareHighlightScroll(side: 'original' | 'changed') {
  const editor = side === 'original' ? compareOriginalEditor.value : compareChangedEditor.value
  const mirror = side === 'original' ? compareOriginalMirror.value : compareChangedMirror.value
  if (!editor || !mirror) return

  mirror.scrollTop = editor.scrollTop
  mirror.scrollLeft = editor.scrollLeft
}

function scrollCompareEditorToLine(
  editor: HTMLTextAreaElement | null,
  mirror: HTMLElement | null,
  lineIndex: number | undefined
) {
  if (!editor || !mirror || lineIndex === undefined) return

  const lineElement = mirror.querySelector<HTMLElement>(`[data-line-index="${lineIndex}"]`)
  const lineHeight = Number.parseFloat(window.getComputedStyle(editor).lineHeight) || 25
  const mirrorRect = mirror.getBoundingClientRect()
  const lineRect = lineElement?.getBoundingClientRect()
  const lineTop = lineRect
    ? lineRect.top - mirrorRect.top + mirror.scrollTop
    : lineIndex * lineHeight
  const lineHeightRendered = lineRect?.height || lineHeight
  const maxScrollTop = Math.max(0, editor.scrollHeight - editor.clientHeight)
  const targetTop = Math.min(
    maxScrollTop,
    Math.max(0, lineTop - ((editor.clientHeight - lineHeightRendered) / 2))
  )

  editor.scrollTop = targetTop
  mirror.scrollTop = targetTop
}

function scrollComparePageToLine(
  editor: HTMLTextAreaElement | null,
  mirror: HTMLElement | null,
  lineIndex: number
) {
  if (!editor || !mirror || editor.scrollHeight > editor.clientHeight + 1) return

  const lineElement = mirror.querySelector<HTMLElement>(`[data-line-index="${lineIndex}"]`)
  if (!lineElement) return

  const stickyToolbar = document.querySelector<HTMLElement>('.compare-control-strip')
  const toolbarBottom = stickyToolbar?.getBoundingClientRect().bottom || 0
  const targetViewportTop = Math.max(toolbarBottom + 24, 96)
  const targetPageTop = window.scrollY + lineElement.getBoundingClientRect().top - targetViewportTop
  window.scrollTo({ top: Math.max(0, targetPageTop), behavior: 'auto' })
}

function mapChangeLineToSide(
  lineIndex: number,
  sourceValue: string,
  targetValue: string
) {
  const sourceLength = Math.max(splitLines(sourceValue).length - 1, 1)
  const targetLength = Math.max(splitLines(targetValue).length - 1, 0)
  return Math.round((lineIndex / sourceLength) * targetLength)
}

async function goToChange(index: number) {
  const totalChanges = compareDiff.value.changeGroups.length
  if (!totalChanges) return

  activeChangeIndex.value = (index + totalChanges) % totalChanges
  const change = compareDiff.value.changeGroups[activeChangeIndex.value]
  const originalLine = change.originalLines[0] ?? mapChangeLineToSide(
    change.changedLines[0] || 0,
    compareChanged.value,
    compareOriginal.value
  )
  const changedLine = change.changedLines[0] ?? mapChangeLineToSide(
    change.originalLines[0] || 0,
    compareOriginal.value,
    compareChanged.value
  )
  expandFoldContainingLine('compare-original', compareOriginal.value, originalLine)
  expandFoldContainingLine('compare-changed', compareChanged.value, changedLine)
  await nextTick()
  await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))

  const scrollToActiveBlock = () => {
    scrollCompareEditorToLine(compareOriginalEditor.value, compareOriginalMirror.value, originalLine)
    scrollCompareEditorToLine(compareChangedEditor.value, compareChangedMirror.value, changedLine)

    if (change.changedLines.length) {
      scrollComparePageToLine(compareChangedEditor.value, compareChangedMirror.value, changedLine)
    } else {
      scrollComparePageToLine(compareOriginalEditor.value, compareOriginalMirror.value, originalLine)
    }
  }
  scrollToActiveBlock()
  window.requestAnimationFrame(scrollToActiveBlock)
}

function showPreviousChange() {
  void goToChange(activeChangeIndex.value - 1)
}

function showNextChange() {
  void goToChange(activeChangeIndex.value + 1)
}

function swapComparison() {
  const original = compareOriginal.value
  compareOriginal.value = compareChanged.value
  compareChanged.value = original
}

function loadCompareSample() {
  compareOriginal.value = sampleJson
  compareChanged.value = compareSampleJson
}

function clearComparison() {
  compareOriginal.value = ''
  compareChanged.value = ''
}

function applyTheme(mode: ThemeMode) {
  themeMode.value = mode
  document.documentElement.dataset.theme = mode
  window.localStorage.setItem('json-glow-theme', mode)
}

function toggleTheme() {
  applyTheme(themeMode.value === 'dark' ? 'light' : 'dark')
}

function updateScrollTopVisibility() {
  showScrollTop.value = window.scrollY > 320
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

watch(input, (value) => {
  if (!value.trim()) {
    error.value = ''
    jsonIssue.value = null
    output.value = ''
    return
  }

  try {
    JSON.parse(value)
    error.value = ''
    jsonIssue.value = null
  } catch (caught) {
    setJsonError(caught)
  }
})

watch([indent, sortKeys], () => {
  if (output.value && !error.value) {
    beautifyJson()
  }
})

watch(() => compareDiff.value.changeGroups.length, (totalChanges) => {
  activeChangeIndex.value = totalChanges
    ? Math.min(activeChangeIndex.value, totalChanges - 1)
    : 0
})

onMounted(() => {
  const savedTheme = window.localStorage.getItem('json-glow-theme')
  const preferredTheme: ThemeMode = savedTheme === 'light' || savedTheme === 'dark'
    ? savedTheme
    : 'light'
  applyTheme(preferredTheme)
  window.addEventListener('scroll', updateScrollTopVisibility, { passive: true })
  updateScrollTopVisibility()
  beautifyJson()
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateScrollTopVisibility)
})
</script>

<template>
  <main class="app-shell">
    <section class="workspace">
      <div class="sticky-workspace-header">
        <header class="topbar">
        <div class="brand-lockup">
          <img class="brand-logo" src="/favicon-jb.png" alt="JSON Glow logo">
          <div>
            <p class="eyebrow">Format · Validate · Compare</p>
            <h1 class="brand-name"><span>21-Tools Kit Developer</span></h1>
          </div>
        </div>
        <nav class="mode-switch" aria-label="Workspace mode">
          <button type="button" :class="{ 'is-active': workspaceMode === 'format' }"
            :aria-pressed="workspaceMode === 'format'" @click="workspaceMode = 'format'">
            Format
          </button>
          <button type="button" :class="{ 'is-active': workspaceMode === 'compare' }"
            :aria-pressed="workspaceMode === 'compare'" @click="workspaceMode = 'compare'">
            Compare
          </button>
        </nav>
        <div class="header-flow" aria-hidden="true">
          <span />
        </div>
        <button class="theme-toggle" type="button"
          :aria-label="themeMode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
          :title="themeMode === 'dark' ? 'Light theme' : 'Dark theme'" @click="toggleTheme">
          <svg v-if="themeMode === 'dark'" aria-hidden="true" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
          </svg>
          <svg v-else aria-hidden="true" viewBox="0 0 24 24">
            <path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z" />
          </svg>
        </button>
        <div class="status-pill" :class="statusClass" role="status" aria-live="polite" :title="statusLabel">
          <span />
          {{ statusLabel }}
        </div>
        </header>

        <section v-if="workspaceMode === 'format'" class="control-strip" aria-label="JSON controls">
        <div class="toolbar-group format-actions" role="group" aria-label="Format JSON">
          <button class="primary-action" type="button" @click="beautifyJson">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4M4 8h2M4 12h2M4 16h2M18 8h2M18 12h2M18 16h2" />
            </svg>
            Beautify
          </button>
          <button class="toolbar-action" type="button" @click="minifyJson">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M8 3v18M16 3v18M3 8h18M3 16h18" />
            </svg>
            Minify
          </button>
        </div>

        <div class="toolbar-group utility-actions" role="group" aria-label="File actions">
          <button class="toolbar-action" type="button" @click="openFilePicker">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M12 16V4M7.5 8.5 12 4l4.5 4.5M5 15v4h14v-4" />
            </svg>
            Upload
          </button>
          <button class="toolbar-action" type="button" @click="downloadJson">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M12 4v12M7.5 11.5 12 16l4.5-4.5M5 20h14" />
            </svg>
            Download
          </button>
          <button class="toolbar-action" type="button" @click="loadSample">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M8 4H5v16h14V4h-3M9 3h6v4H9zM8 12h8M8 16h5" />
            </svg>
            Sample
          </button>
          <button class="toolbar-action danger-action" type="button" @click="clearJson">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M4 7h16M9 3h6l1 4H8l1-4ZM7 7l1 14h8l1-14M10 11v6M14 11v6" />
            </svg>
            Clear
          </button>
        </div>

        <div class="toolbar-group preference-actions" aria-label="Formatting preferences">
          <label class="indent-control">
            <span>Indent</span>
            <select v-model.number="indent" aria-label="Indent size">
              <option :value="2">2 spaces</option>
              <option :value="4">4 spaces</option>
              <option :value="8">8 spaces</option>
            </select>
          </label>

          <label class="toggle-control">
            <input v-model="sortKeys" type="checkbox">
            <span class="toggle-track" aria-hidden="true"><span /></span>
            <span>Sort keys</span>
          </label>
        </div>

        <input ref="fileInput" class="file-input" type="file" accept=".json,application/json,text/plain"
          @change="handleFileUpload">
        </section>

        <section v-else class="control-strip compare-control-strip" aria-label="Compare controls">
        <div class="diff-live-indicator">
          <span />
          Live line comparison
        </div>

        <div class="toolbar-group compare-actions" role="group" aria-label="Comparison actions">
          <button class="toolbar-action" type="button" @click="swapComparison">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M7 7h12M15 3l4 4-4 4M17 17H5M9 13l-4 4 4 4" />
            </svg>
            Swap
          </button>
          <button class="toolbar-action" type="button" @click="loadCompareSample">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M8 4H5v16h14V4h-3M9 3h6v4H9zM8 12h8M8 16h5" />
            </svg>
            Example
          </button>
          <button class="toolbar-action danger-action" type="button" @click="clearComparison">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M4 7h16M9 3h6l1 4H8l1-4ZM7 7l1 14h8l1-14M10 11v6M14 11v6" />
            </svg>
            Clear
          </button>
          <div class="diff-navigation" role="group" aria-label="Navigate changes">
            <button class="diff-nav-button" type="button" :disabled="!compareDiff.changeGroups.length"
              aria-label="Previous change" title="Previous change" @click="showPreviousChange">
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <span class="diff-position" aria-live="polite">
              {{ compareDiff.changeGroups.length ? activeChangeIndex + 1 : 0 }} / {{ compareDiff.changeGroups.length }}
            </span>
            <button class="diff-nav-button" type="button" :disabled="!compareDiff.changeGroups.length"
              aria-label="Next change" title="Next change" @click="showNextChange">
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>

        <div class="diff-legend" aria-label="Diff legend">
          <span><i class="legend-dot is-removed" /> Removed</span>
          <span><i class="legend-dot is-added" /> Added</span>
        </div>
        </section>
      </div>

      <div v-if="workspaceMode === 'format' && error" class="error-banner" role="alert">
        <div>
          <strong v-if="jsonIssue">Line {{ jsonIssue.line + 1 }}, column {{ jsonIssue.column }}</strong>
          <span>{{ error }}</span>
        </div>
        <p v-if="jsonIssue"><strong>Suggested fix:</strong> {{ jsonIssue.suggestion }}</p>
      </div>

      <section v-if="workspaceMode === 'format'" class="editor-grid">
        <article class="editor-panel input-panel">
          <div class="panel-heading">
            <div class="panel-title">
              <span class="panel-dot" />
              <div>
                <h2>Input</h2>
                <span>Paste or upload JSON</span>
              </div>
            </div>
            <button class="copy-code-button" :class="{ 'is-copied': copiedPanel === 'input' }" type="button"
              :disabled="!input" :aria-label="copiedPanel === 'input' ? 'Input JSON copied' : 'Copy input JSON'"
              :title="copiedPanel === 'input' ? 'Copied' : 'Copy input code'" @click="copyCode('input')">
              <svg v-if="copiedPanel === 'input'" aria-hidden="true" viewBox="0 0 24 24">
                <path d="m6 12 4 4 8-8" />
              </svg>
              <svg v-else aria-hidden="true" viewBox="0 0 24 24">
                <rect x="8" y="8" width="11" height="11" rx="2" />
                <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
              </svg>
              <span class="sr-only">{{ copiedPanel === 'input' ? 'Copied' : 'Copy input code' }}</span>
            </button>
          </div>
          <div class="code-surface">
            <div class="line-rail">
              <div v-for="row in inputLineNumbers" :key="row.sourceLine" class="line-number-row"
                :class="{ 'is-error': row.sourceLine === jsonIssue?.line }">
                <button v-if="row.foldEnd !== undefined" type="button" class="fold-toggle"
                  :aria-label="row.isCollapsed ? `Expand block at line ${row.sourceLine + 1}` : `Collapse block at line ${row.sourceLine + 1}`"
                  @click="toggleFold('format-input', row.sourceLine)">
                  {{ row.isCollapsed ? '▸' : '▾' }}
                </button>
                <span v-else class="fold-placeholder" />
                <span aria-hidden="true">{{ String(row.sourceLine + 1).padStart(2, '0') }}</span>
              </div>
            </div>
            <div class="input-editor-stack">
              <pre ref="inputMirror" class="json-highlight input-highlight" aria-hidden="true"
                v-html="highlightedInput" />
              <textarea ref="inputEditor" :value="inputView.text" class="json-input" spellcheck="false"
                :readonly="collapsedBlocks['format-input'].size > 0"
                placeholder="{ &quot;hello&quot;: &quot;world&quot; }" @scroll="syncInputHighlightScroll"
                @input="updateEditorValue('format-input', $event)" @keydown.meta.enter.prevent="beautifyJson"
                @keydown.ctrl.enter.prevent="beautifyJson" />
            </div>
          </div>
        </article>

        <article class="editor-panel output-panel">
          <div class="panel-heading">
            <div class="panel-title">
              <span class="panel-dot" />
              <div>
                <h2>Output</h2>
                <span>Formatted result</span>
              </div>
            </div>
            <button class="copy-code-button" :class="{ 'is-copied': copiedPanel === 'output' }" type="button"
              :disabled="!output" :aria-label="copiedPanel === 'output' ? 'Output JSON copied' : 'Copy output JSON'"
              :title="copiedPanel === 'output' ? 'Copied' : 'Copy output code'" @click="copyCode('output')">
              <svg v-if="copiedPanel === 'output'" aria-hidden="true" viewBox="0 0 24 24">
                <path d="m6 12 4 4 8-8" />
              </svg>
              <svg v-else aria-hidden="true" viewBox="0 0 24 24">
                <rect x="8" y="8" width="11" height="11" rx="2" />
                <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
              </svg>
              <span class="sr-only">{{ copiedPanel === 'output' ? 'Copied' : 'Copy output code' }}</span>
            </button>
          </div>
          <div class="code-surface">
            <div class="line-rail">
              <div v-for="row in outputLineNumbers" :key="row.sourceLine" class="line-number-row">
                <button v-if="row.foldEnd !== undefined" type="button" class="fold-toggle"
                  :aria-label="row.isCollapsed ? `Expand block at line ${row.sourceLine + 1}` : `Collapse block at line ${row.sourceLine + 1}`"
                  @click="toggleFold('format-output', row.sourceLine)">
                  {{ row.isCollapsed ? '▸' : '▾' }}
                </button>
                <span v-else class="fold-placeholder" />
                <span aria-hidden="true">{{ String(row.sourceLine + 1).padStart(2, '0') }}</span>
              </div>
            </div>
            <pre v-if="output" class="json-highlight" v-html="highlightedOutput" />
            <div v-else class="empty-output">
              <span>{ }</span>
              <strong>Formatted JSON will appear here</strong>
            </div>
          </div>
        </article>
      </section>

      <section v-else class="editor-grid compare-grid">
        <article class="editor-panel input-panel compare-panel">
          <div class="panel-heading">
            <div class="panel-title">
              <span class="panel-dot" />
              <div>
                <h2>Original</h2>
                <span>Base version</span>
              </div>
            </div>
            <button class="copy-code-button" :class="{ 'is-copied': copiedPanel === 'compare-original' }"
              type="button" :disabled="!compareOriginal"
              :aria-label="copiedPanel === 'compare-original' ? 'Original copied' : 'Copy original'"
              :title="copiedPanel === 'compare-original' ? 'Copied' : 'Copy original'"
              @click="copyCode('compare-original')">
              <svg v-if="copiedPanel === 'compare-original'" aria-hidden="true" viewBox="0 0 24 24">
                <path d="m6 12 4 4 8-8" />
              </svg>
              <svg v-else aria-hidden="true" viewBox="0 0 24 24">
                <rect x="8" y="8" width="11" height="11" rx="2" />
                <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
              </svg>
              <span class="sr-only">Copy original</span>
            </button>
          </div>
          <div class="code-surface">
            <div class="line-rail compare-line-rail">
              <div v-for="row in compareOriginalLineNumbers" :key="row.sourceLine" class="line-number-row">
                <button v-if="row.foldEnd !== undefined" type="button" class="fold-toggle"
                  :aria-label="row.isCollapsed ? `Expand original block at line ${row.sourceLine + 1}` : `Collapse original block at line ${row.sourceLine + 1}`"
                  :title="row.isCollapsed ? 'Expand block' : 'Collapse block'"
                  @click="toggleFold('compare-original', row.sourceLine)">
                  {{ row.isCollapsed ? '▸' : '▾' }}
                </button>
                <span v-else class="fold-placeholder" />
                <span aria-hidden="true">{{ String(row.sourceLine + 1).padStart(2, '0') }}</span>
              </div>
            </div>
            <div class="input-editor-stack">
              <pre ref="compareOriginalMirror" class="json-highlight input-highlight diff-highlight" aria-hidden="true"
                v-html="highlightedCompareOriginal" />
              <textarea ref="compareOriginalEditor" :value="compareOriginalView.text" class="json-input"
                spellcheck="false" :readonly="collapsedBlocks['compare-original'].size > 0"
                aria-label="Original content" placeholder="Paste the original version"
                @input="updateEditorValue('compare-original', $event)"
                @scroll="syncCompareHighlightScroll('original')" />
              <div class="diff-overview-ruler is-removed" aria-label="Removed changes overview">
                <button v-for="marker in originalOverviewMarkers" :key="marker.changeIndex" type="button"
                  class="diff-overview-marker" :class="{ 'is-active': activeChangeIndex === marker.changeIndex }"
                  :style="{ top: `${marker.top}%`, height: `${marker.height}%` }"
                  :aria-label="`Go to removed change ${marker.changeIndex + 1}, line ${marker.lineNumber}`"
                  :title="`Removed change at line ${marker.lineNumber}`" @click="goToChange(marker.changeIndex)" />
              </div>
            </div>
          </div>
        </article>

        <article class="editor-panel output-panel compare-panel">
          <div class="panel-heading">
            <div class="panel-title">
              <span class="panel-dot" />
              <div>
                <h2>Changed</h2>
                <span>New version</span>
              </div>
            </div>
            <button class="copy-code-button" :class="{ 'is-copied': copiedPanel === 'compare-changed' }"
              type="button" :disabled="!compareChanged"
              :aria-label="copiedPanel === 'compare-changed' ? 'Changed version copied' : 'Copy changed version'"
              :title="copiedPanel === 'compare-changed' ? 'Copied' : 'Copy changed version'"
              @click="copyCode('compare-changed')">
              <svg v-if="copiedPanel === 'compare-changed'" aria-hidden="true" viewBox="0 0 24 24">
                <path d="m6 12 4 4 8-8" />
              </svg>
              <svg v-else aria-hidden="true" viewBox="0 0 24 24">
                <rect x="8" y="8" width="11" height="11" rx="2" />
                <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
              </svg>
              <span class="sr-only">Copy changed version</span>
            </button>
          </div>
          <div class="code-surface">
            <div class="line-rail compare-line-rail">
              <div v-for="row in compareChangedLineNumbers" :key="row.sourceLine" class="line-number-row">
                <button v-if="row.foldEnd !== undefined" type="button" class="fold-toggle"
                  :aria-label="row.isCollapsed ? `Expand changed block at line ${row.sourceLine + 1}` : `Collapse changed block at line ${row.sourceLine + 1}`"
                  :title="row.isCollapsed ? 'Expand block' : 'Collapse block'"
                  @click="toggleFold('compare-changed', row.sourceLine)">
                  {{ row.isCollapsed ? '▸' : '▾' }}
                </button>
                <span v-else class="fold-placeholder" />
                <span aria-hidden="true">{{ String(row.sourceLine + 1).padStart(2, '0') }}</span>
              </div>
            </div>
            <div class="input-editor-stack">
              <pre ref="compareChangedMirror" class="json-highlight input-highlight diff-highlight" aria-hidden="true"
                v-html="highlightedCompareChanged" />
              <textarea ref="compareChangedEditor" :value="compareChangedView.text" class="json-input"
                spellcheck="false" :readonly="collapsedBlocks['compare-changed'].size > 0"
                aria-label="Changed content" placeholder="Paste the changed version"
                @input="updateEditorValue('compare-changed', $event)"
                @scroll="syncCompareHighlightScroll('changed')" />
              <div class="diff-overview-ruler is-added" aria-label="Added changes overview">
                <button v-for="marker in changedOverviewMarkers" :key="marker.changeIndex" type="button"
                  class="diff-overview-marker" :class="{ 'is-active': activeChangeIndex === marker.changeIndex }"
                  :style="{ top: `${marker.top}%`, height: `${marker.height}%` }"
                  :aria-label="`Go to added change ${marker.changeIndex + 1}, line ${marker.lineNumber}`"
                  :title="`Added change at line ${marker.lineNumber}`" @click="goToChange(marker.changeIndex)" />
              </div>
            </div>
          </div>
        </article>
      </section>

      <footer v-if="workspaceMode === 'format'" class="stats-row" aria-label="JSON statistics">
        <div>
          <span>Characters</span>
          <strong>{{ stats.chars }}</strong>
        </div>
        <div>
          <span>Lines</span>
          <strong>{{ stats.lines }}</strong>
        </div>
        <div>
          <span>Size</span>
          <strong>{{ stats.size }}</strong>
        </div>
      </footer>

      <footer v-else class="stats-row diff-stats" aria-label="Comparison statistics">
        <div class="diff-stat is-added">
          <span>Added lines</span>
          <strong>+{{ compareDiff.additions }}</strong>
        </div>
        <div class="diff-stat is-removed">
          <span>Removed lines</span>
          <strong>−{{ compareDiff.removals }}</strong>
        </div>
        <div class="diff-stat is-unchanged">
          <span>Unchanged</span>
          <strong>{{ compareDiff.unchanged }}</strong>
        </div>
      </footer>
    </section>

    <button v-show="showScrollTop" class="scroll-top-button" type="button" aria-label="Scroll to top"
      title="Scroll to top" @click="scrollToTop">
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="m6 15 6-6 6 6M6 5h12" />
      </svg>
    </button>
  </main>
</template>
