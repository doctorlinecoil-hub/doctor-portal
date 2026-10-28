'use client';
import { useState } from 'react';
import { ACCEPT } from '@/lib/constants';
import { checkFile } from '@/lib/upload';
import Icon from './Icon';

export default function FilePicker({ files, onChange, label = 'גררו לכאן מסמכים רפואיים סרוקים' }: { files: File[]; onChange: (f: File[]) => void; label?: string }) {
  const [over, setOver] = useState(false);
  const [err, setErr] = useState('');
  function add(list: FileList | null) {
    if (!list) return;
    const ok: File[] = [];
    const errs: string[] = [];
    for (const f of Array.from(list)) {
      const e = checkFile(f);
      if (e) errs.push(e);
      else ok.push(f);
    }
    setErr(errs.join(' · '));
    onChange([...files, ...ok]);
  }
  return (
    <div className="stack-sm">
      <label
        className={`drop${over ? ' over' : ''}`}
        style={{ position: 'relative', cursor: 'pointer' }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
      >
        <Icon name="upload" />
        <b>{label}</b>
        <span>או לחצו לבחירת קבצים · PDF או תמונות · עד 25MB לקובץ</span>
        <input type="file" multiple accept={ACCEPT} onChange={(e) => { add(e.target.files); e.target.value = ''; }} aria-label="בחירת קבצים" style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />
      </label>
      {err && <p className="err">{err}</p>}
      {files.length > 0 && (
        <div className="files">
          {files.map((f, i) => (
            <div className="file" key={i + f.name}>
              <span className={`file-ic${f.type.startsWith('image/') ? ' img' : ''}`}>{f.type.startsWith('image/') ? 'IMG' : 'PDF'}</span>
              <span><b>{f.name}</b><span>{(f.size / 1024 / 1024).toFixed(1)}MB</span></span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(files.filter((_, j) => j !== i))} aria-label={`הסרת ${f.name}`}><Icon name="x" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
