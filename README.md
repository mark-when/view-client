# Markwhen view client

## Usage

```js
import { useLpc } from "@markwhen/view-client"

const { postRequest } = useLpc({
  markwhenState(ms) {
    // When there is some state change from the editor
    console.log(ms)
  }
  appState(newState) {
    // When the app state changes (dark mode, hovering event, selected event, etc)
    console.log(newState)
  }
})
```

## Changelog

## 1.4.4

- Error if nothing to post to

### 1.4.0
- Separate state into appState and markwhenState instead of sending both at the same time

### 1.3.0
- Bump parser (0.9.1)
- Support for imports

### 1.2.1
- Bump parser (0.8.1)
- Add colorMap to appState

### 1.1.1
- Use initially set state even if we have a socket connection

### 1.1.0
- Add websocket support