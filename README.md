# Markwhen view client

## Usage

```js
import { useLpc } from "@markwhen/view-client"

const { postRequest } = useLpc({
  state(newState) {
    // When there is some state change from the editor
    console.log(newState)
  }
})
```

## Changelog

### 1.1.1
- Use initially set state even if we have a socket connection

### 1.1.0
- Add websocket support