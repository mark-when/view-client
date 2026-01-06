import type {
  DateFormat,
  DateRangeIso,
  DateTimeGranularity,
  Event,
  EventGroup,
  Eventy,
  Path,
  ParseResult,
} from "@markwhen/parser";
import type { EventPath } from "./paths";

declare const acquireVsCodeApi:
  | (() => { postMessage: (message: any) => void })
  | undefined;

export type DisplayScale =
  | "second"
  | "quarterminute"
  | "minute"
  | "quarterhour"
  | "hour"
  | "day"
  | "month"
  | "year"
  | "decade";

export type Source = string;
export type Sourced<T extends Eventy> = T extends Event
  ? T & { source?: Source; originalPath?: Path }
  : T & { source?: Source; originalPath?: Path; children: Array<Sourced<Eventy>> };

export interface AppState {
  key?: string;
  isDark?: boolean;
  hoveringPath?: EventPath;
  detailPath?: EventPath;
  path?: string;
  colorMap: Record<string, Record<string, string>>;
}
export interface MarkwhenState {
  rawText?: string;
  parsed: ParseResult;
  transformed?: Sourced<EventGroup>;
}

export type KeystrokeAction = "proxy" | "skip";

export interface KeystrokeOverride {
  combo: string;
  action: KeystrokeAction;
}

export interface KeystrokePayload {
  combo: string;
  key: string;
  code: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  location: number;
  type: "keydown" | "keyup";
}

export interface UseLpcOptions {
  proxyKeystrokes?: boolean;
  keystrokeOverrides?: KeystrokeOverride[];
  preventDefaultOnProxy?: boolean;
  initialAppStateFromMarkwhen?: (state: MarkwhenState) => Partial<AppState>;
}

type BaseMessageTypes = {
  appState: AppState;
  markwhenState: MarkwhenState;
  setHoveringPath: EventPath;
  setDetailPath: EventPath;
  setText: {
    text: string;
    at?: {
      from: number;
      to: number;
    };
  };
  showInEditor: EventPath;
  newEvent: {
    dateRangeIso: DateRangeIso;
    granularity?: DateTimeGranularity;
    immediate: boolean;
  };
  editEventDateRange: {
    path: EventPath;
    range: DateRangeIso;
    scale: DisplayScale;
    preferredInterpolationFormat: DateFormat | undefined;
  };
  jumpToPath: {
    path: EventPath;
  };
  jumpToRange: {
    dateRangeIso: DateRangeIso;
  };
  keystroke: KeystrokePayload;
};

type MessageType = keyof BaseMessageTypes;
type MessageParam<T extends keyof BaseMessageTypes> = BaseMessageTypes[T];

export interface Message<T extends MessageType> {
  type: T;
  request?: boolean;
  response?: boolean;
  id: string;
  params?: MessageParam<T>;
}
export const getNonce = () => {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

type MessageListeners = {
  [Property in keyof BaseMessageTypes]?: (
    event: BaseMessageTypes[Property]
  ) => any;
};

const normalizeCombo = (combo: string) =>
  combo
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .join("+");

const comboFromEvent = (event: KeyboardEvent) => {
  const segments: string[] = [];
  if (event.metaKey) {
    segments.push("meta");
  }
  if (event.ctrlKey) {
    segments.push("ctrl");
  }
  if (event.altKey) {
    segments.push("alt");
  }
  if (event.shiftKey) {
    segments.push("shift");
  }
  segments.push(event.key.toLowerCase());
  return segments.join("+");
};

const hasParentWindow = () =>
  typeof window !== "undefined" &&
  typeof window.parent !== "undefined" &&
  window.parent !== window.self;

export const useLpc = (
  listeners?: MessageListeners,
  options?: UseLpcOptions
) => {
  const calls: Map<
    string,
    {
      resolve: (a: any) => void;
      reject: (a: any) => void;
    }
  > = new Map();

  const proxyKeystrokes = options?.proxyKeystrokes ?? true;
  const preventDefaultOnProxy = options?.preventDefaultOnProxy ?? true;
  const keystrokeOverrides = new Map<string, KeystrokeAction>();
  options?.keystrokeOverrides?.forEach(({ combo, action }) => {
    keystrokeOverrides.set(normalizeCombo(combo), action);
  });

  const wssUrl =
    typeof window !== "undefined" &&
    // @ts-ignore
    (window.__markwhen_wss_url as string | undefined);
  let socket: WebSocket | undefined;
  let hasConnected = false;
  if (wssUrl) {
    socket = new WebSocket(wssUrl);
    socket.onopen = () => {
      hasConnected = true;
      postRequest("appState");
      postRequest("markwhenState");
    };
  }

  let vscApi: { postMessage: (message: any) => void } | undefined = undefined;
  const vscode = () => {
    if (vscApi) {
      return vscApi;
    }
    vscApi = acquireVsCodeApi!();
    return vscApi;
  };

  const post = <T extends MessageType>(message: Message<T>) => {
    if (socket && hasConnected) {
      socket.send(JSON.stringify(message));
    } else if (typeof acquireVsCodeApi !== "undefined") {
      vscode()?.postMessage(message);
    } else if (
      typeof window !== "undefined" &&
      typeof window.parent !== "undefined"
    ) {
      window.parent.postMessage(message, "*");
    } else {
      console.error("Nothing to post to");
    }
  };

  const postRequest = <T extends MessageType>(
    type: T,
    params?: MessageParam<T>
  ) => {
    const id = `markwhen_${getNonce()}`;
    return new Promise((resolve, reject) => {
      calls.set(id, { resolve, reject });
      post({
        type,
        request: true,
        id,
        params,
      });
    });
  };

  const postResponse = <T extends MessageType>(
    id: string,
    type: T,
    params?: MessageParam<T>
  ) => post<T>({ type, response: true, id, params });

  const messageListener = <T extends MessageType>(
    e: MessageEvent<Message<T>>
  ) => {
    if (
      !e.data.id ||
      !e.data.id.startsWith("markwhen") ||
      e.source === window
    ) {
      return;
    }
    const data = e.data;
    if (data.response) {
      calls.get(data.id)?.resolve(data);
      calls.delete(data.id);
    } else if (data.request) {
      const result = listeners?.[data.type]?.(data.params!);
      Promise.resolve(result).then((resp) => {
        postResponse(data.id, data.type, resp);
      });
    } else {
      console.error("Not a request or response", data);
    }
  };

  if (socket) {
    socket.onmessage = (event) => {
      const messageClone = new MessageEvent("message", {
        data: JSON.parse(event.data),
      });
      messageListener(messageClone);
    };
  } else if (typeof window !== "undefined") {
    window?.addEventListener("message", messageListener);
  }

  const shouldProxyKeystroke = (event: KeyboardEvent) => {
    if (!proxyKeystrokes) {
      return false;
    }
    const combo = comboFromEvent(event);
    const override = keystrokeOverrides.get(combo);
    if (override === "proxy") {
      return true;
    }
    if (override === "skip") {
      return false;
    }
    return true;
  };

  const keystrokeListener = (event: KeyboardEvent) => {
    if (!shouldProxyKeystroke(event)) {
      return;
    }

    if (preventDefaultOnProxy && event.cancelable) {
      event.preventDefault();
    }

    if (socket && !hasConnected) {
      return;
    }

    const canPostToParent =
      (socket && hasConnected) ||
      typeof acquireVsCodeApi !== "undefined" ||
      hasParentWindow();

    if (!canPostToParent) {
      return;
    }

    const combo = comboFromEvent(event);
    const payload: KeystrokePayload = {
      combo,
      key: event.key,
      code: event.code,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      repeat: event.repeat,
      location: event.location,
      type: event.type as "keydown" | "keyup",
    };

    post({
      type: "keystroke",
      request: true,
      id: `markwhen_${getNonce()}`,
      params: payload,
    });
  };

  if (typeof window !== "undefined" && proxyKeystrokes) {
    window.addEventListener("keydown", keystrokeListener);
  }

  const initialState =
    typeof window !== "undefined" &&
    // @ts-ignore
    (window.__markwhen_initial_state as State | undefined);
  if (initialState && listeners && listeners.markwhenState) {
    const state = initialState as MarkwhenState;
    listeners.markwhenState(state);
    const appStateFromInitial =
      options?.initialAppStateFromMarkwhen?.(state);
    if (appStateFromInitial && listeners.appState) {
      listeners.appState(appStateFromInitial as AppState);
    }
  }

  /// Removes all listeners (if applicable) and closes socket connections (if applicable)
  const close = () => {
    if (socket) {
      socket.close();
    }
    if (window) {
      window.removeEventListener("message", messageListener);
      if (proxyKeystrokes) {
        window.removeEventListener("keydown", keystrokeListener);
      }
    }
  };

  return { postRequest, close };
};
