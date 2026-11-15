let _port: ReturnType<typeof browser.runtime.connect> | null = null;
let _nextMsgId = 0;
const _pending = new Map<number, { resolve: (r: unknown) => void; reject: (e: Error) => void }>();

export function portRequest<T>(data: object, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const msgId = _nextMsgId++;
    const timer = setTimeout(() => {
      if (_pending.delete(msgId)) reject(new Error("timeout"));
    }, timeoutMs);
    _pending.set(msgId, {
      resolve: (r) => {
        clearTimeout(timer);
        resolve(r as T);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    getPort().postMessage({ ...data, msgId });
  });
}

export function portPost(data: object): void {
  getPort().postMessage(data);
}

function getPort(): ReturnType<typeof browser.runtime.connect> {
  if (!_port) {
    _port = browser.runtime.connect({ name: "content" });
    _port.onMessage.addListener((msg: { msgId?: number; [k: string]: unknown }) => {
      if (msg.msgId !== undefined) {
        const p = _pending.get(msg.msgId);
        if (p) {
          _pending.delete(msg.msgId);
          p.resolve(msg);
        }
      }
    });
    _port.onDisconnect.addListener(() => {
      void browser.runtime.lastError; // suppress bfcache disconnect warning
      _port = null;
      _pending.forEach((p) => p.reject(new Error("disconnected")));
      _pending.clear();
    });
  }
  return _port;
}
