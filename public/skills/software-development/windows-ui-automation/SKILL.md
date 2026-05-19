---
name: windows-ui-automation
description: Framework-agnostic Windows UI automation architecture — multi-layer locator strategy (OCR → image → context → UIA → coordinate) for recording and replaying desktop interactions across any app framework (Win32, WPF, Electron, Qt, Java).
category: software-development
trigger: User wants to build or extend a Windows UI automation/recording/replay tool that works across different app frameworks without depending on framework-specific APIs.
---

# Framework-Agnostic Windows UI Automation Architecture

A multi-layer locator strategy for recording and replaying desktop GUI interactions that works regardless of the underlying UI framework (Win32, WPF, Electron/CEF, Qt, Java, UWP).

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                   Recording Phase                        │
│  Mouse Click → Capture ALL layers in parallel:           │
│   1. OCR text near click point (framework-agnostic)     │
│   2. SmartClick 120×120 image patch                      │
│   3. Context 400×400 surrounding image                    │
│   4. UIA element info (if available)                      │
│   5. Raw screen coordinates                               │
│   6. Foreground window title + class                      │
│   7. DPI scaling ratio                                    │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                   Playback Phase                         │
│  Per-click locator priority:                             │
│   1. OCR text search (full screen → click text center)   │
│   2. Multi-scale image matching (0.6×–1.5× pyramid)     │
│   3. Context image matching (large-area disambiguation)   │
│   4. UIA AutomationId / Name (framework-dependent)       │
│   5. Raw coordinates (last resort)                       │
└──────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. OCR-First Strategy

OCR is the most framework-agnostic approach because:

- **Win32/WPF**: Text is rendered as GDI glyphs → OCR reads it
- **Electron/CEF**: Text is rendered by Chromium → OCR reads it
- **Qt**: Text is rendered by Qt's paint engine → OCR reads it
- **Java Swing**: Text is rendered via AWT → OCR reads it

OCR doesn't care how the text got on screen. It just reads pixels.

**Implementation notes:**
- Use `easyocr` for self-contained pip install (no separate binary needed)
- Language: `ch_tra+en` for Traditional Chinese + English support
- During recording: OCR only the small crop around the click (fast, <100ms)
- During playback: OCR the full screen (slower, 1-3s per step, acceptable)

### 2. Multi-Scale Image Matching

Single-scale OpenCV template matching breaks when:
- Recording on 1080p → playback on 4K (2× scale difference)
- Recording on 125% DPI → playback on 100% DPI
- Different monitor sizes

**Solution:** Pyramid matching across a scale range:
```python
scales = np.linspace(0.6, 1.5, 6)  # 60%–150%, 6 steps
for scale in scales:
    scaled = cv2.resize(template, (new_w, new_h))
    result = cv2.matchTemplate(screenshot, scaled, cv2.TM_CCOEFF_NORMED)
```

### 3. Window Focus Management

Before executing click/hotkey operations, attempt to bring the target window to foreground:

```python
# Win32 API via ctypes
user32.ShowWindow(hwnd, 9)  # SW_RESTORE
user32.SetWindowPos(hwnd, -1, 0, 0, 0, 0, TOPMOST flags)
user32.SetWindowPos(hwnd, -2, 0, 0, 0, 0, NOTOPMOST flags)
user32.BringWindowToTop(hwnd)
user32.SetForegroundWindow(hwnd)
```

Store window title + class during recording for exact matching during playback.

### 4. Tool Self-Awareness: Auto-Hide UI During Screenshots

If the recording tool has its own UI overlay (floating control panel, recording indicator, HUD), that overlay MUST be hidden before every screenshot, otherwise:

- OCR reads the tool's own text labels (REC, Step 01, etc.)
- Image matching matches the tool's chrome instead of the target app
- Recordings are permanently polluted with self-references

**Architecture:** Use a callback pair on the screenshot function:

```python
# In recorder_engine.py:
class RecorderEngine:
    def __init__(self):
        self.on_before_capture = None  # Callable, called before each screenshot
        self.on_after_capture = None   # Callable, called after each screenshot

    def _capture_screenshot(self, bbox=None):
        if self.on_before_capture:
            self.on_before_capture()
        img = ImageGrab.grab(bbox=bbox)
        if self.on_after_capture:
            self.on_after_capture()
        return img
```

**Critical detail — cross-thread sync (PyQt example):** Screenshot capture runs in a daemon thread (from pynput callback), but PyQt UI updates MUST happen on the main thread. Use `QMetaObject.invokeMethod` with `BlockingQueuedConnection` to synchronously hide/show the window from the UI thread while the background thread waits:

```python
# In floating_window.py:
self.recorder.on_before_capture = lambda: QMetaObject.invokeMethod(
    self, "_do_hide", Qt.BlockingQueuedConnection)
self.recorder.on_after_capture = lambda: QMetaObject.invokeMethod(
    self, "_do_show", Qt.BlockingQueuedConnection)

@pyqtSlot()
def _do_hide(self):
    self.hide()
    QApplication.processEvents()  # Ensure UI actually updates

@pyqtSlot()
def _do_show(self):
    self.show()
    self.raise_()
    QApplication.processEvents()
```

This guarantees the floating window is invisible in the captured screenshot, regardless of timing.

**⚠ Deadly race condition with processEvents() inside _do_hide:**

`QApplication.processEvents()` inside `_do_hide()` forces the Qt event loop to process any pending events — including **user mouse clicks** that were queued during the brief moment the window is hidden. If the user clicks the "Stop Recording" button during a screenshot, the sequence is:

1. Daemon thread calls `invokeMethod("_do_hide", BlockingQueuedConnection)`
2. Qt event loop processes → `_do_hide()` → `self.hide()` → `processEvents()`
3. `processEvents()` processes the pending button-click event — but the window is **already hidden**
4. The click **passes through** to whatever window is behind the floating panel
5. pynput detects this click on the background app → `_on_click` fires → **a new step is recorded**
6. The user sees "it recorded another step" instead of "recording stopped"
7. This creates a cascade: user clicks more → more steps → window keeps hiding → user can never hit stop

**Mitigation options (choose based on context):**

| Option | Trade-off |
|--------|-----------|
| **Don't auto-hide** — leave the small floating window visible during screenshots. If it's corner-positioned (320×520), it rarely overlaps with click-area screenshots. | Cleaner UI at the cost of occasional screenshot contamination near the panel edge. **Best for small corner panels.** |
| **Use a mask on the screenshot** — capture the full screen, then fill the floating window's region with adjacent pixels or a neutral color. | More complex; need to know the panel's exact geometry in the daemon thread. |
| **Skip screenshot capture when floating window overlaps with the bbox** — calculate overlap before calling `ImageGrab.grab()`. | Recording may skip OCR/image for clicks near the panel; falls back to raw coordinate. |

**If you do NOT auto-hide, remove the callback wiring entirely:**

```python
# Don't set on_before_capture / on_after_capture — leave them as None
# Screenshots will include the floating panel, but:
#   - OCR rarely reads tool UI text (it's tiny and in a corner)
#   - Image matching is robust to small background pollution
#   - The stop button is always clickable
```

### 5. Thread Safety

Three thread-safety concerns arise in recording tools:

**a) Step list mutations** — pynput callbacks run in daemon threads. Use a lock:

```python
self._lock = threading.Lock()
with self._lock:
    self.steps.append(step)
```

**b) OCR engine singleton initialization** — Multiple daemon threads may call `get_ocr_engine()` simultaneously on first mouse click. Use a double-check lock pattern:

```python
_ocr_lock = threading.Lock()

def get_ocr_engine():
    if _ocr_engine is None:
        with _ocr_lock:
            if _ocr_engine is None:  # Double-check
                _ocr_engine = easyocr.Reader(['ch_tra', 'en'])
    return _ocr_engine
```

Without the outer `if _ocr_engine is None` check, every call would serialize on the lock. Without the inner check, two threads past the outer check could both initialize the reader.

**c) Daemon thread exceptions are swallowed silently** — pynput callbacks (mouse click, key press) run in daemon threads. Any unhandled exception in the callback dies silently: the thread exits, the step is never recorded, and no error output appears anywhere. The recording appears to "do nothing." Always wrap daemon thread targets in try/except with logging:

```python
def _on_click(self, x, y, button, pressed):
    if not self.is_recording or not pressed:
        return
    threading.Thread(
        target=self._record_click_safe, args=(...), daemon=True
    ).start()

def _record_click_safe(self, x, y, button):
    try:
        # ... actual recording logic ...
    except Exception as e:
        logger.error("Record click failed: %s", e, exc_info=True)
```

Without this, any exception (OCR init failure, image grab timeout, permission error) in the daemon thread kills the step silently. Always log with `exc_info=True` so the stack trace appears in the log.

### 6. Modifier Key Combinations

Record Ctrl+C, Alt+Tab, Ctrl+Shift+S as typed `hotkey` steps:

```python
# Track modifier state
_MODIFIER_KEYS = {
    keyboard.Key.ctrl_l: "ctrl",
    keyboard.Key.shift_l: "shift",
    ...
}
# When a character key is pressed while modifiers are held:
#   → record as hotkey step, not text
# Playback:
pyautogui.hotkey(*keys, interval=0.05)
```

### 7. Configuration Chain

Load settings in priority order:
1. Testcase-local `playback_config.json`
2. Project-root `config.json`
3. Explicitly-provided dict (from UI or CLI)
4. Hardcoded defaults

### 8. DPI Awareness

Capture DPI scaling during recording via Win32 `GetDeviceCaps(LOGPIXELSX)`:
```python
dpi = gdi32.GetDeviceCaps(hdc, 88)  # LOGPIXELSX = 88
scale = dpi / 96.0  # 100% = 1.0, 125% = 1.25, 150% = 1.5
```

Store per-step and use as hint for playback scaling.

### 9. Keyboard Shortcut Registration

**PyQt keyPressEvent only works when the widget has focus.** A floating window's `keyPressEvent` won't fire if the user clicks on the target application and the floating window loses keyboard focus. This means documented hotkeys (F6=record, F9=playback) silently do nothing.

**Solutions (in order of preference):**
1. **Global hotkey registration** — Register OS-level hotkeys via pynput's keyboard listener (outside the RecorderEngine's own listener) or via a platform hotkey library. Most reliable.
2. **QShortcut** — Better than keyPressEvent because it fires regardless of widget focus, but still constrained to when the app's event loop is running:
   ```python
   QShortcut(QKeySequence("F6"), self, self._toggle_record)
   ```
3. **keyPressEvent on the floating window** — Only works when the window has focus. Document this limitation.

**Anti-pattern:** Implementing keyboard shortcuts only via keyPressEvent and documenting them in a README/QUICKSTART without actually wiring them up — this creates a documentation gap that sends users on a wild goose chase ("I pressed F6 but nothing happened"). If you document a shortcut, it must be implemented AND properly tested to work in the target scenario.

## Remote Execution (via MQTT/REST)

For distributed setups where the agent has no LLM on the test machine, the multi-layer locator strategy works over MQTT relay:

1. **Remote machine** captures screenshot, sends via MQTT
2. **Control machine** runs locator (OCR/image matching) against received image
3. **Control machine** determines next action, sends command via MQTT
4. **Remote machine** executes action (click/type/hotkey)

See `references/remote-visual-automation.md` for MQTT topic layout, SOP step format, and action types.

## Known Limitations

These are acknowledged gaps that affect the current architecture. Future sessions extending this tool should address them:

| Limitation | Impact | Notes |
|-----------|--------|-------|
| **Drag operations** | Sliders, drag-and-drop, column resize not captured | A `start_drag` + `end_drag` step type needed — record mouse-down, track moves (snapshot every N px), record mouse-up with target coordinate |
| **Wait-point recording** | Can't insert "wait for X to appear" during recording | Playback has `wait_image` step type, but no recording UI to inject it. Candidate: F2 hotkey during recording to save a "wait for this screen" step with current screenshot |
| **Scroll support** | Elements outside visible viewport unreachable | Scroll events (`WM_MOUSEWHEEL`) not captured. Would need `scroll` step type with delta and direction |
| **PyQt event throughput during screenshot** | BlockingQueuedConnection from daemon thread blocks until Qt processes the hide/show event | If Qt is busy with other events, the daemon thread stalls. Acceptable for automation use, but could cause ~50-100ms delay per click |

## Pitfalls

- **pynput key naming differs between platforms** — On Linux, `keyboard.Key.escape` exists. On Windows, the same key is `keyboard.Key.esc`. Similarly, `keyboard.Key.pause` and `keyboard.Key.menu` have varying platform availability. Always test key mappings on the target OS. If the app appears to "do nothing" when started on a different OS, check `Key` attribute names first.
- **easyocr first-run**: Downloads ~50MB model on first `pip install`. Inform users.
- **Full-screen OCR speed**: ~1-3 seconds per step with easyocr (CPU). Acceptable for automation, not real-time.
- **UAC prompts**: Windows UAC runs at higher integrity level. Automation tools cannot interact with UAC dialogs.
- **Window focus limitations**: `SetForegroundWindow` has restrictions (the calling process needs a foreground window itself). May not work from background processes.
- **Dark/Light mode**: OCR handles this fine (text is still text), but image matching will break if button appearance changes significantly.
- **Language switching**: OCR with `ch_tra+en` handles both. But a button labeled "OK" vs "確定" will need different recordings.
- **Multi-monitor**: pyautogui coordinates on secondary monitors can be negative or positive depending on OS configuration. Consider storing element position relative to the target window instead of absolute screen coordinates.
- **easyocr Reader inside a daemon thread**: Initializing `easyocr.Reader` for the first time takes ~2 seconds and ~2GB RSS. If this happens inside a daemon thread from a pynput callback, the thread will hang for 2 seconds before any step appears. The user sees no steps and thinks recording is broken. Mitigation: warm up OCR on app startup, not on first click.
- **Recorder stop() must unset is_recording before stopping listeners**: If `stop()` stops listeners first and then sets `is_recording=False`, a concurrent `_on_click` callback in flight can append a step after stop. Always set `self.is_recording = False` first, then stop listeners.

## References

- `references/recorder-client-architecture.md` — Complete implementation in the recorder_client project
- `references/remote-visual-automation.md` — Distributed/remote execution pattern via MQTT relay
