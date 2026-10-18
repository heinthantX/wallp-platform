# Layers editor

Shared visual editor for theme layers and scene wallpaper layers. Supersedes the earlier JSON-only layer editing.

## Architecture
- Used by the theme editor (tokens allowed) and the scene wallpaper editor (hex only).
- Drag-and-drop ordering with dnd-kit. Per-layer forms for each layer type. Polygon point editor for polygon shapes.
- Cost meter uses the generator's scene cost rule: sum(particles) + 20 per glow shape + 5 per layer, against the budget.
- Backend validation returns `scene_limits` and `scene_tokens` codes; the editor shows them inline.

## Core Flows
- Add, reorder (drag or keyboard) and delete layers. Each layer's fields edit in its own form.
- Polygon shapes edit through the point editor on the canvas.
- Cost meter updates as layers change and shows the budget.
- Keyboard: Delete removes the selected layer, Cmd+D duplicates, Alt+Up and Alt+Down move it. Cmd+Z and Shift+Cmd+Z undo and redo.
- A LIVE badge marks the live preview state.

## Edge Cases
- Tokens (`@name`) in a scene wallpaper are rejected: scene wallpapers accept hex only.
- Tokens are accepted in themes.
- Over-budget scene shows a cost warning before save; the backend check still blocks publish if it persists.
- Invalid polygon points show a field error on the point, not a whole-form failure.

## Autonomous UX Polish
- Live cost meter with colour change near the budget.
- Layer reorder animates; reduced-motion users get instant moves.
- Undo and redo cover layer edits, not just text fields.
- Keyboard shortcuts listed in the help tooltip.
