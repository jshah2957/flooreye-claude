# Session B: Annotation Studio Resize + Undo/Redo

## Files to Read First
```
web/src/pages/learning/AnnotationStudioPage.tsx  — full file, understand canvas drawing code
```

## Task B1-B3: Resize Handles

**Current state:** AnnotationStudioPage has:
- Canvas with frame image rendering
- Click-to-select boxes
- Draw mode (B key) with click-drag to create
- Delete selected (Del/Backspace)
- Class change dropdown
- Zoom (mouse wheel, 0.5x-3x)

**Add resize handles:**
1. When a box is selected (selectedBox !== null), draw 8 small squares:
   - 4 corners: (x, y), (x+w, y), (x, y+h), (x+w, y+h)
   - 4 edge midpoints: (x+w/2, y), (x, y+h/2), (x+w, y+h/2), (x+w/2, y+h)
   - Each handle: 8x8 pixel squares, white fill, 1px dark border

2. On mouse move over canvas:
   - Check if mouse is over any handle (within 6px)
   - If so, change cursor to appropriate resize cursor
   - Store which handle is being hovered (0-7 index)

3. On mouse down on a handle:
   - Enter resize mode (resizing=true, resizeHandle=index)
   - On mouse move: update the annotation bbox based on which handle is dragged
   - Corner handles: move that corner, opposite corner stays fixed
   - Edge handles: move that edge, opposite edge stays fixed
   - On mouse up: exit resize mode, save updated annotations to backend

**Cursor mapping:**
- Handle 0 (top-left): nwse-resize
- Handle 1 (top-right): nesw-resize
- Handle 2 (bottom-left): nesw-resize
- Handle 3 (bottom-right): nwse-resize
- Handle 4 (top-mid): ns-resize
- Handle 5 (left-mid): ew-resize
- Handle 6 (right-mid): ew-resize
- Handle 7 (bottom-mid): ns-resize

## Task B4-B6: Undo/Redo

**Implementation:**
1. Add state: `undoStack: Annotation[][]`, `redoStack: Annotation[][]`
2. Helper `pushUndoState()`: pushes deep copy of current annotations to undoStack, clears redoStack
3. Call pushUndoState() BEFORE every mutation (draw, delete, resize, class change)
4. Undo: pop from undoStack, push current to redoStack, set annotations to popped value, save to backend
5. Redo: pop from redoStack, push current to undoStack, set annotations to popped value, save to backend
6. Keyboard: useEffect with keydown listener for Ctrl+Z and Ctrl+Shift+Z
7. Toolbar buttons: Undo (disabled if undoStack empty), Redo (disabled if redoStack empty)
   - Show count: "Undo (3)" / "Redo (1)"

**Important:** Do NOT break existing draw, delete, zoom, class change, or navigation features.

## Verification
- Draw box, resize corner, resize edge — all work
- Draw box, undo, redo — state matches
- Delete box, undo — box reappears
- Change class, undo — class reverts
- Ctrl+Z / Ctrl+Shift+Z keyboard shortcuts work
- Existing features (draw, delete, zoom, navigate) unaffected
