import type {
  DateFormat,
  DateRangeIso,
  DateTimeGranularity,
  Event,
  EventGroup,
  Eventy,
  ParseResult,
  Timeline,
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
  ? T & { source?: Source }
  : T & { source?: Source; children: Array<Sourced<Eventy>> };

export interface AppState {
  isDark?: boolean;
  hoveringPath?: EventPath;
  detailPath?: EventPath;
  colorMap: Record<string, Record<string, string>>;
}
export interface MarkwhenState {
  rawText?: string;
  parsed: ParseResult;
  transformed?: Sourced<EventGroup>;
}

interface MessageTypes {
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
}

type PossibleMessages = MessageTypes;

type MessageType = keyof PossibleMessages;
type MessageParam<T extends keyof PossibleMessages> = PossibleMessages[T];

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
  [Property in keyof PossibleMessages]?: (
    event: PossibleMessages[Property]
  ) => any;
};

export const useLpc = (listeners?: MessageListeners) => {
  const calls: Map<
    string,
    {
      resolve: (a: any) => void;
      reject: (a: any) => void;
    }
  > = new Map();

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

  const messageListener = <T extends keyof MessageTypes>(
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

  const initialState =
    typeof window !== "undefined" &&
    // @ts-ignore
    (window.__markwhen_initial_state as State | undefined);
  if (initialState && listeners && listeners.markwhenState) {
    listeners.markwhenState(initialState);
  }

  /// Removes all listeners (if applicable) and closes socket connections (if applicable)
  const close = () => {
    if (socket) {
      socket.close();
    }
    if (window) {
      window.removeEventListener("message", messageListener);
    }
  };

  return { postRequest, close };
};
