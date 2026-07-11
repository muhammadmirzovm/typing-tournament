import { useEffect, useRef, useState } from "react";
import { socket } from "./socket";
import { playerId } from "./identity";
import { t, useLang } from "./i18n";

// Room-wide chat, shown in the lobby and on the standings screen. Collapsible
// so it never gets in the way mid-tournament; while collapsed an unread badge
// counts the messages that arrived.
export default function ChatBox({ messages, defaultCollapsed = false }) {
  useLang();
  const [text, setText] = useState("");
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const seenCount = useRef(messages.length);
  const listRef = useRef(null);

  useEffect(() => {
    if (!collapsed) {
      seenCount.current = messages.length;
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages, collapsed]);

  const unread = collapsed ? Math.max(0, messages.length - seenCount.current) : 0;

  function toggle() {
    setCollapsed((c) => {
      if (c) seenCount.current = messages.length;
      return !c;
    });
  }

  function send() {
    const clean = text.trim();
    if (!clean) return;
    socket.emit("chat:send", { text: clean });
    setText("");
  }

  return (
    <div className="chat">
      <button className="chat-toggle" onClick={toggle}>
        <span>
          💬 Chat
          {unread > 0 && <span className="chat-unread">{unread}</span>}
        </span>
        <span className="chat-arrow">{collapsed ? "▸" : "▾"}</span>
      </button>

      {!collapsed && (
        <>
          <div className="chat-list" ref={listRef}>
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.fromId === playerId ? "mine" : ""}`}>
                <span className="chat-from">{m.from}:</span> {m.text}
              </div>
            ))}
          </div>
          <div className="chat-row">
            <input
              className="chat-input"
              value={text}
              maxLength={200}
              placeholder={t("chatPh")}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <button className="btn small" onClick={send}>
              {t("send")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
