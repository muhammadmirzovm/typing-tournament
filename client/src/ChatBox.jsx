import { useEffect, useRef, useState } from "react";
import { socket } from "./socket";
import { playerId } from "./identity";
import { t, useLang } from "./i18n";

// Room-wide chat, shown in the lobby and on the standings screen.
export default function ChatBox({ messages }) {
  useLang();
  const [text, setText] = useState("");
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function send() {
    const clean = text.trim();
    if (!clean) return;
    socket.emit("chat:send", { text: clean });
    setText("");
  }

  return (
    <div className="chat">
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
    </div>
  );
}
