'use client'
import { useRef, useState, useEffect, useCallback } from 'react'

type DrawTool = 'circle' | 'arrow' | 'text'
type ToolMode = 'select' | DrawTool

interface Shape {
  id: number
  type: DrawTool
  x1: number
  y1: number
  x2: number
  y2: number
  text?: string
  color: string
  lineWidth: number
  fontSize: number
}

interface Props {
  imageFile: File
  onSave: (blob: Blob) => void
  onCancel: () => void
}

const RED       = '#e53e3e'
const ARROW_HEAD = 16

export default function ImageAnnotator({ imageFile, onSave, onCancel }: Props) {
  const canvasRef      = useRef<HTMLCanvasElement>(null)
  const imgRef         = useRef<HTMLImageElement | null>(null)
  const shapeIdRef     = useRef(0)

  const [shapes,          setShapes]          = useState<Shape[]>([])
  const [history,         setHistory]         = useState<Shape[][]>([])
  const [tool,            setTool]            = useState<ToolMode>('circle')
  const [fontSize,        setFontSize]        = useState(24)

  // 描画中
  const [isDrawing,  setIsDrawing]  = useState(false)
  const [drawStart,  setDrawStart]  = useState({ x: 0, y: 0 })
  const [drawEnd,    setDrawEnd]    = useState({ x: 0, y: 0 })

  // 選択・移動
  const [selectedId,         setSelectedId]         = useState<number | null>(null)
  const [isDragging,         setIsDragging]         = useState(false)
  const [dragStart,          setDragStart]          = useState({ x: 0, y: 0 })
  const [shapeAtDragStart,   setShapeAtDragStart]   = useState<Shape | null>(null)

  // テキスト入力
  const [textMode,      setTextMode]      = useState(false)
  const [textClickPos,  setTextClickPos]  = useState({ x: 0, y: 0 })
  const [textValue,     setTextValue]     = useState('')

  const [ready, setReady] = useState(false)

  // ── 画像読み込み ──
  useEffect(() => {
    const img = new Image()
    const url = URL.createObjectURL(imageFile)
    img.src = url
    img.onload = () => {
      imgRef.current = img
      const canvas = canvasRef.current
      if (!canvas) return
      const maxW = 1200, maxH = 900
      const scale = Math.min(1, maxW / img.width, maxH / img.height)
      canvas.width  = Math.round(img.width  * scale)
      canvas.height = Math.round(img.height * scale)
      setReady(true)
      URL.revokeObjectURL(url)
    }
  }, [imageFile])

  const selectedShape = shapes.find(s => s.id === selectedId) ?? null

  // ── キャンバス描画 ──
  const render = useCallback(() => {
    const canvas = canvasRef.current
    const img    = imgRef.current
    if (!canvas || !img || !ready) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    shapes.forEach(s => {
      drawShape(ctx, s)
      if (s.id === selectedId) drawSelectionBox(ctx, s)
    })

    if (isDrawing && tool !== 'text' && tool !== 'select') {
      drawShape(ctx, {
        id: -1, type: tool as DrawTool,
        x1: drawStart.x, y1: drawStart.y,
        x2: drawEnd.x,   y2: drawEnd.y,
        color: RED, lineWidth: 3, fontSize,
      })
    }
  }, [shapes, isDrawing, drawStart, drawEnd, tool, ready, selectedId, fontSize])

  useEffect(() => { render() }, [render])

  function drawShape(ctx: CanvasRenderingContext2D, s: Shape) {
    ctx.strokeStyle = s.color
    ctx.fillStyle   = s.color
    ctx.lineWidth   = s.lineWidth

    if (s.type === 'circle') {
      const cx = (s.x1 + s.x2) / 2, cy = (s.y1 + s.y2) / 2
      const rx = Math.abs(s.x2 - s.x1) / 2, ry = Math.abs(s.y2 - s.y1) / 2
      if (rx < 4 || ry < 4) return
      ctx.beginPath()
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      ctx.stroke()

    } else if (s.type === 'arrow') {
      const dx = s.x2 - s.x1, dy = s.y2 - s.y1
      if (Math.hypot(dx, dy) < 6) return
      const angle = Math.atan2(dy, dx)
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(s.x2, s.y2)
      ctx.lineTo(s.x2 - ARROW_HEAD * Math.cos(angle - Math.PI / 6), s.y2 - ARROW_HEAD * Math.sin(angle - Math.PI / 6))
      ctx.lineTo(s.x2 - ARROW_HEAD * Math.cos(angle + Math.PI / 6), s.y2 - ARROW_HEAD * Math.sin(angle + Math.PI / 6))
      ctx.closePath(); ctx.fill()

    } else if (s.type === 'text' && s.text) {
      ctx.font = `bold ${s.fontSize}px "MS PGothic", sans-serif`
      const strokeW = Math.max(3, s.fontSize / 7)
      ctx.lineWidth   = strokeW
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.strokeText(s.text, s.x1, s.y1)
      ctx.fillStyle = s.color
      ctx.fillText(s.text, s.x1, s.y1)
    }
  }

  function drawSelectionBox(ctx: CanvasRenderingContext2D, s: Shape) {
    ctx.save()
    ctx.strokeStyle = '#3182ce'
    ctx.lineWidth   = 2
    ctx.setLineDash([5, 3])

    if (s.type === 'circle') {
      const p = 8
      ctx.strokeRect(Math.min(s.x1, s.x2) - p, Math.min(s.y1, s.y2) - p,
        Math.abs(s.x2 - s.x1) + p * 2, Math.abs(s.y2 - s.y1) + p * 2)
    } else if (s.type === 'arrow') {
      ctx.strokeRect(Math.min(s.x1, s.x2) - 10, Math.min(s.y1, s.y2) - 10,
        Math.abs(s.x2 - s.x1) + 20, Math.abs(s.y2 - s.y1) + 20)
    } else if (s.type === 'text' && s.text) {
      ctx.font = `bold ${s.fontSize}px "MS PGothic", sans-serif`
      const w = ctx.measureText(s.text).width
      ctx.strokeRect(s.x1 - 4, s.y1 - s.fontSize - 4, w + 8, s.fontSize + 10)
    }
    ctx.restore()
  }

  // ── ヒットテスト ──
  function hitTest(s: Shape, x: number, y: number): boolean {
    const tol = 18
    if (s.type === 'circle') {
      const cx = (s.x1 + s.x2) / 2, cy = (s.y1 + s.y2) / 2
      const rx = Math.abs(s.x2 - s.x1) / 2 + tol, ry = Math.abs(s.y2 - s.y1) / 2 + tol
      return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
    }
    if (s.type === 'arrow') {
      return distToSeg(x, y, s.x1, s.y1, s.x2, s.y2) < tol
    }
    if (s.type === 'text' && s.text) {
      const h = s.fontSize
      const w = s.text.length * s.fontSize * 0.65
      return x >= s.x1 - tol && x <= s.x1 + w + tol && y >= s.y1 - h - tol && y <= s.y1 + tol
    }
    return false
  }

  function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
    const dx = x2 - x1, dy = y2 - y1
    const len2 = dx * dx + dy * dy
    if (len2 === 0) return Math.hypot(px - x1, py - y1)
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2))
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
  }

  // ── 座標変換 ──
  function getPos(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    let cx: number, cy: number
    if ('touches' in e) {
      const t = e.touches[0] ?? e.changedTouches[0]
      cx = t.clientX; cy = t.clientY
    } else { cx = e.clientX; cy = e.clientY }
    return {
      x: (cx - rect.left) * (canvas.width  / rect.width),
      y: (cy - rect.top)  * (canvas.height / rect.height),
    }
  }

  // ── ヒストリー ──
  function pushHistory(snap: Shape[]) {
    setHistory(prev => [...prev.slice(-30), snap])
  }
  function undo() {
    if (history.length === 0) return
    setShapes(history[history.length - 1])
    setHistory(prev => prev.slice(0, -1))
    setSelectedId(null)
  }

  // ── ポインターイベント ──
  function onDown(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    const pos = getPos(e)

    if (tool === 'select') {
      const hit = [...shapes].reverse().find(s => hitTest(s, pos.x, pos.y))
      if (hit) {
        setSelectedId(hit.id)
        setIsDragging(true)
        setDragStart(pos)
        setShapeAtDragStart(hit)
      } else {
        setSelectedId(null)
      }
      return
    }

    if (tool === 'text') {
      setTextClickPos(pos)
      setTextMode(true)
      setTextValue('')
      return
    }

    setIsDrawing(true)
    setDrawStart(pos)
    setDrawEnd(pos)
  }

  function onMove(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    const pos = getPos(e)

    if (isDragging && shapeAtDragStart) {
      const dx = pos.x - dragStart.x, dy = pos.y - dragStart.y
      setShapes(prev => prev.map(s =>
        s.id === shapeAtDragStart.id
          ? { ...shapeAtDragStart, x1: shapeAtDragStart.x1 + dx, y1: shapeAtDragStart.y1 + dy,
              x2: shapeAtDragStart.x2 + dx, y2: shapeAtDragStart.y2 + dy }
          : s
      ))
      return
    }

    if (isDrawing) setDrawEnd(pos)
  }

  function onUp(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    const pos = getPos(e)

    if (isDragging) {
      const dx = pos.x - dragStart.x, dy = pos.y - dragStart.y
      if (Math.hypot(dx, dy) > 2 && shapeAtDragStart) {
        // 移動前のスナップをヒストリーへ
        pushHistory(shapes.map(s => s.id === shapeAtDragStart.id ? shapeAtDragStart : s))
      }
      setIsDragging(false)
      setShapeAtDragStart(null)
      return
    }

    if (isDrawing) {
      pushHistory(shapes)
      setShapes(prev => [...prev, {
        id: ++shapeIdRef.current,
        type: tool as DrawTool,
        x1: drawStart.x, y1: drawStart.y,
        x2: pos.x, y2: pos.y,
        color: RED, lineWidth: 3, fontSize,
      }])
      setIsDrawing(false)
    }
  }

  function confirmText() {
    if (!textValue.trim()) { setTextMode(false); return }
    pushHistory(shapes)
    setShapes(prev => [...prev, {
      id: ++shapeIdRef.current, type: 'text',
      x1: textClickPos.x, y1: textClickPos.y,
      x2: textClickPos.x, y2: textClickPos.y,
      text: textValue, color: RED, lineWidth: 3, fontSize,
    }])
    setTextMode(false)
    setTextValue('')
  }

  function applyFontSize(newSize: number) {
    setFontSize(newSize)
    // 選択中のテキストにも即適用
    if (selectedShape?.type === 'text') {
      pushHistory(shapes)
      setShapes(prev => prev.map(s => s.id === selectedId ? { ...s, fontSize: newSize } : s))
    }
  }

  function deleteSelected() {
    if (selectedId === null) return
    pushHistory(shapes)
    setShapes(prev => prev.filter(s => s.id !== selectedId))
    setSelectedId(null)
  }

  function handleSave() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob(blob => { if (blob) onSave(blob) }, 'image/png', 0.95)
  }

  const showFontSize = tool === 'text' || (tool === 'select' && selectedShape?.type === 'text')

  const ToolBtn = ({ t, icon, label }: { t: ToolMode; icon: string; label: string }) => (
    <button type="button" onClick={() => { setTool(t); setTextMode(false) }}
      className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-bold transition-colors select-none ${
        tool === t ? 'bg-white text-blue-700 shadow' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
      }`}>
      <span className="text-sm">{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  )

  const SizeBtn = ({ size, label }: { size: number; label: string }) => (
    <button type="button" onClick={() => applyFontSize(size)}
      className={`w-8 h-7 rounded text-xs font-bold ${
        fontSize === size ? 'bg-white text-blue-700' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
      }`}>
      {label}
    </button>
  )

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900">

      {/* ── ツールバー ── */}
      <div className="bg-gray-800 px-2 py-2 flex flex-wrap items-center gap-1.5 border-b border-gray-700 flex-shrink-0">

        {/* ツール群 */}
        <div className="flex gap-1">
          <ToolBtn t="select" icon="↖" label="選択/移動" />
          <ToolBtn t="circle" icon="◯" label="丸囲み" />
          <ToolBtn t="arrow"  icon="→" label="矢印" />
          <ToolBtn t="text"   icon="Ａ" label="文字" />
        </div>

        {/* 文字サイズ（文字ツール選択時 or テキスト選択中） */}
        {showFontSize && (
          <div className="flex items-center gap-1 bg-gray-900 rounded px-2 py-1">
            <span className="text-gray-400 text-xs whitespace-nowrap">文字サイズ</span>
            <SizeBtn size={16} label="S" />
            <SizeBtn size={24} label="M" />
            <SizeBtn size={36} label="L" />
            <SizeBtn size={52} label="XL" />
          </div>
        )}

        {/* 選択中シェイプを削除 */}
        {tool === 'select' && selectedId !== null && (
          <button type="button" onClick={deleteSelected}
            className="px-2.5 py-1.5 bg-red-700 text-white rounded text-xs font-bold hover:bg-red-600 whitespace-nowrap">
            🗑 削除
          </button>
        )}

        {/* 元に戻す */}
        <button type="button" onClick={undo} disabled={history.length === 0}
          className="px-2.5 py-1.5 bg-gray-600 text-gray-200 rounded text-xs hover:bg-gray-500 disabled:opacity-30 whitespace-nowrap">
          ↩ 元に戻す
        </button>

        {/* 保存・キャンセル */}
        <div className="ml-auto flex gap-1.5">
          <button type="button" onClick={onCancel}
            className="px-3 py-1.5 bg-gray-600 text-gray-200 rounded text-xs hover:bg-gray-500">
            キャンセル
          </button>
          <button type="button" onClick={handleSave}
            className="px-4 py-1.5 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-500">
            ✓ 保存
          </button>
        </div>
      </div>

      {/* ヒント表示 */}
      <div className="bg-gray-700 px-3 py-1 text-xs text-gray-300 flex-shrink-0">
        {tool === 'select' && !selectedId && 'シェイプをクリックして選択 → ドラッグで移動'}
        {tool === 'select' &&  selectedId && '選択中 ─ ドラッグして移動 / 文字は右のサイズボタンで変更 / 🗑で削除'}
        {tool === 'circle' && 'ドラッグして丸囲みを描きます'}
        {tool === 'arrow'  && 'ドラッグして矢印を描きます（始点 → 終点）'}
        {tool === 'text'   && 'クリックした位置にテキストを追加します'}
      </div>

      {/* ── キャンバス ── */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-2 bg-gray-900 relative">
        <canvas ref={canvasRef}
          style={{
            maxWidth: '100%',
            maxHeight: 'calc(100vh - 110px)',
            cursor: tool === 'select' ? (isDragging ? 'grabbing' : 'default') : 'crosshair',
            touchAction: 'none',
            display: 'block',
            boxShadow: '0 0 20px rgba(0,0,0,0.6)',
          }}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
          onMouseLeave={() => { setIsDrawing(false); if (!isDragging) return; setIsDragging(false) }}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
        />

        {/* テキスト入力ダイアログ */}
        {textMode && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-40">
            <div className="bg-white rounded-xl shadow-2xl p-5 w-80 mx-4">
              <p className="text-sm font-bold text-gray-800 mb-1">テキストを入力</p>
              <p className="text-xs text-gray-500 mb-3">クリックした位置に配置されます</p>
              <input type="text" value={textValue} onChange={e => setTextValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmText() }}
                autoFocus
                className="w-full border border-gray-300 rounded-lg p-2 text-sm mb-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="例: ひび割れ、腐食など" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setTextMode(false)}
                  className="flex-1 border border-gray-300 py-2 rounded-lg text-sm hover:bg-gray-50">
                  キャンセル
                </button>
                <button type="button" onClick={confirmText}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-blue-700">
                  追加
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
