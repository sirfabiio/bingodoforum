import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ensureGroup } from '../lib/bingo';

export default function GroupEntry() {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function go() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await ensureGroup(name.trim());
      nav('/board');
    } catch (e: any) {
      alert(e?.message ?? 'Erro a criar grupo (nome pode já existir).');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <h2 style={{ marginTop: 0 }}>Entrar</h2>
      <p style={{ color: 'var(--muted)' }}>Escolhe o nome do teu grupo (único).</p>
      <input
        className="input"
        placeholder="ex.: Mesa do 3.º Ano"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div style={{ height: 12 }} />
      <button className="button primary" onClick={go} disabled={busy}>
        {busy ? 'A preparar…' : 'Entrar'}
      </button>
    </div>
  );
}
