/**
 * Monaco 를 CDN 대신 앱에 함께 번들한다.
 * 학교 네트워크가 외부 CDN 을 막아도 에디터가 뜨도록 하기 위한 설정이다.
 *
 * 'monaco-editor' 를 통째로 가져오면 80여 개 언어가 전부 딸려와 번들이 4MB 를 넘는다.
 * 코어 API 와 Python 문법만 골라 넣는다.
 */
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/editor/editor.api'
import 'monaco-editor/languages/definitions/python/register'
import editorWorker from 'monaco-editor/editor/editor.worker?worker'

self.MonacoEnvironment = {
  // Python 은 별도 언어 서버 워커가 없다 — 기본 에디터 워커 하나면 충분하다.
  getWorker: () => new editorWorker(),
}

loader.config({ monaco })

export const EDITOR_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
  fontSize: 14,
  fontFamily: "'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace",
  lineHeight: 22,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 4,
  renderLineHighlight: 'line',
  padding: { top: 14, bottom: 14 },
  smoothScrolling: true,
  cursorBlinking: 'smooth',
  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
}
