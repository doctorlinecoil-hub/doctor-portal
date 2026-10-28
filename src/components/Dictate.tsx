'use client';
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

type Rec = {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
};

/** Voice dictation in Hebrew (Chrome, Edge, Safari). Final phrases are appended through onText. */
export default function Dictate({ onText, label = 'הכתבה' }: { onText: (text: string) => void; label?: string }) {
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(false);
  const [live, setLive] = useState('');
  const rec = useRef<Rec | null>(null);
  const cb = useRef(onText);
  cb.current = onText;

  useEffect(() => {
    const W = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    setSupported(!!(W.SpeechRecognition || W.webkitSpeechRecognition));
    return () => rec.current?.stop();
  }, []);

  function toggle() {
    if (on) { rec.current?.stop(); return; }
    const W = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const C = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!C) return;
    const r = new C();
    r.lang = 'he-IL';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) cb.current(spoken(res[0].transcript));
        else interim += res[0].transcript;
      }
      setLive(interim);
    };
    r.onend = () => { setOn(false); setLive(''); };
    r.onerror = () => { setOn(false); setLive(''); };
    rec.current = r;
    r.start();
    setOn(true);
  }

  if (!supported) return null;
  return (
    <span className="dictate">
      <button type="button" className={`btn btn-sm${on ? ' rec' : ''}`} onClick={toggle} aria-pressed={on} title="הכתבה קולית בעברית">
        <Icon name="mic" />{on ? 'עצירה' : label}
      </button>
      {on && <span className="hint live" aria-live="polite">{live || 'מקשיב…'}</span>}
    </span>
  );
}

/** Spoken punctuation: "נקודה", "פסיק", "שורה חדשה", "נקודתיים". */
function spoken(t: string) {
  return t
    .replace(/\s*שורה חדשה\s*/g, '\n')
    .replace(/\s*נקודתיים/g, ':')
    .replace(/\s*נקודה/g, '.')
    .replace(/\s*פסיק/g, ',')
    .trim();
}
