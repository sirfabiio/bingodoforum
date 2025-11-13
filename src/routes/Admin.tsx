import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { checkLines } from '../lib/layout';

export default function Admin() {
  const [email, setEmail] = useState('');
  const [ok, setOk] = useState(false);
  const [groups, setGroups] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [board, setBoard] = useState<any[]>([]);
  const [achievements, setAchievements] = useState<any[]>([]);

  // API fixa na VPS
  const API_URL = "https://217.182.169.59";

  // --- LOGIN ADMIN ---
  async function login() {
    const { data, error } = await supabase
      .from('admins')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error || !data) {
      alert('Email não autorizado.');
      return;
    }

    setOk(true);
    await Promise.all([loadGroups(), loadAchievements()]);
  }

  // --- CARREGAR GRUPOS ---
  async function loadGroups() {
    const { data: groups } = await supabase
      .from('groups')
      .select('id, name, created_at');

    if (!groups) return;

    const withProgress = await Promise.all(
      groups.map(async (g) => {
        const { data: progress } = await supabase
          .from('progress')
          .select('completed')
          .eq('group_id', g.id);

        const done = progress?.filter((p) => p.completed).length ?? 0;
        return { ...g, done, total: progress?.length ?? 0 };
      })
    );

    setGroups(withProgress);
  }

  // --- CARREGAR CONQUISTAS ---
  async function loadAchievements() {
    const { data, error } = await supabase
      .from('achievements')
      .select(`
        id,
        type,
        group_id,
        created_at,
        group:group_id ( name )
      `)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Erro ao carregar achievements:', error);
      return;
    }

    setAchievements(data || []);
  }

  // --- ABRIR GRUPO ---
  async function openGroup(g: any) {
    setSelected(g);

    const { data: assignments } = await supabase
      .from('assignments')
      .select('row, col, challenge_id, challenge:challenge_id(text)')
      .eq('group_id', g.id)
      .order('row')
      .order('col');

    const { data: progress } = await supabase
      .from('progress')
      .select('challenge_id, completed, file_path')
      .eq('group_id', g.id);

    const combined =
      assignments?.map((a: any) => ({
        ...a,
        progress:
          progress?.find((p: any) => p.challenge_id === a.challenge_id) || {},
      })) ?? [];

    setBoard(combined);
  }

  // --- MATRIZ PARA O CHECK DE LINHA/BINGO ---
  function matrix() {
    const m = Array.from({ length: 4 }, () => Array(4).fill(false));
    board.forEach((a: any) => {
      if (a.progress?.completed) m[a.row][a.col] = true;
    });
    return m;
  }

  // --- ABRIR FICHEIRO (CORRIGIDO PARA A VPS) ---
  function openFile(path: string) {
    if (!path) {
      alert('Sem ficheiro associado.');
      return;
    }

    // Se já for URL absoluta
    if (path.startsWith('http://') || path.startsWith('https://')) {
      window.open(path, '_blank');
      return;
    }

    // Path relativo vindo do Supabase (ex: /media/<grupo>/<ficheiro>)
    const finalUrl = `${API_URL}${path}`;
    window.open(finalUrl, '_blank');
  }

  // --- REATIVIDADE EM TEMPO REAL ---
  useEffect(() => {
    if (!ok) return;

    const sub = supabase
      .channel('realtime_achievements')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'achievements' },
        () => {
          loadAchievements();
        }
      )
      .subscribe();

    const interval = setInterval(() => {
      loadGroups();
    }, 15000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(sub);
    };
  }, [ok]);

  // --- LOGIN SCREEN ---
  if (!ok)
    return (
      <div className="card" style={{ marginTop: 24 }}>
        <h3>Admin</h3>
        <p className="muted">Insere o teu e-mail autorizado.</p>
        <input
          className="input"
          placeholder="teu.email@exemplo.pt"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div style={{ height: 8 }} />
        <button className="button primary" onClick={login}>
          Entrar
        </button>
      </div>
    );

  // --- DASHBOARD ADMIN ---
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* 🏅 CONQUISTAS */}
      <div
        className="card"
        style={{
          background: '#ffffff',
          border: '2px solid gold',
          boxShadow: '0 0 10px gold',
        }}
      >
        <h3 style={{ marginTop: 0 }}>🏅 Conquistas em Tempo Real</h3>

        <p><strong>Linhas:</strong></p>
        <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
          {achievements
            .filter((a) => a.type === 'line')
            .map((a, i) => {
              const medal = ['🥇', '🥈', '🥉'][i] || '🏅';
              return (
                <li key={i} style={{ marginBottom: 6 }}>
                  <strong>{medal} {i + 1}º</strong> — {a.group?.name}
                  <br />
                  <small style={{ color: 'gray' }}>
                    {new Date(a.created_at).toLocaleString()}
                  </small>
                </li>
              );
            })}
        </ul>

        <p><strong>Bingos:</strong></p>
        <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
          {achievements
            .filter((a) => a.type === 'bingo')
            .map((a, i) => {
              const medal = ['🏆', '🥈', '🥉'][i] || '🎖️';
              return (
                <li key={i} style={{ marginBottom: 6 }}>
                  <strong>{medal} {i + 1}º</strong> — {a.group?.name}
                  <br />
                  <small style={{ color: 'gray' }}>
                    {new Date(a.created_at).toLocaleString()}
                  </small>
                </li>
              );
            })}
        </ul>
      </div>

      {/* 📋 LISTA DE GRUPOS */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Grupos</h3>
        <div className="admin-list">
          {groups.map((g) => (
            <div className="group-card card" key={g.id}>
              <div>
                <strong>{g.name}</strong>
                <br />
                <small style={{ color: 'var(--muted)' }}>
                  {new Date(g.created_at).toLocaleString()}
                </small>
                <br />
                <small>
                  {g.done}/{g.total} concluídos
                </small>
              </div>
              <button className="button" onClick={() => openGroup(g)}>
                Abrir
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 🧩 CARTELA DETALHADA */}
      {selected && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{selected.name}</h3>

          {/* KPI */}
          {(() => {
            const { hasLine, hasBingo } = checkLines(matrix());
            const feitos = board.filter((a: any) => a.progress?.completed).length;
            return (
              <div className="kpi" style={{ marginBottom: 8 }}>
                <span className="pill">{feitos}/16 feitos</span>
                <span className="pill">Linha: {hasLine ? '✅' : '—'}</span>
                <span className="pill">Bingo: {hasBingo ? '🎉' : '—'}</span>
              </div>
            );
          })()}

          {/* GRID DO GRUPO */}
          <div
            className="grid"
            style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}
          >
            {board.map((a: any, i: number) => (
              <div
                key={i}
                className={`tile card ${a.progress?.completed ? 'done' : ''}`}
                style={{ cursor: a.progress?.file_path ? 'pointer' : 'default' }}
                onClick={() =>
                  a.progress?.file_path && openFile(a.progress.file_path)
                }
              >
                <div>
                  <div style={{ marginBottom: 6 }}>{a.challenge.text}</div>
                  <small className="status">
                    {a.progress?.completed ? 'Feito ✅' : 'Por fazer'}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
