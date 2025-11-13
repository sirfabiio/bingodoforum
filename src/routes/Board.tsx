import { useEffect, useMemo, useState } from 'react';
import BingoGrid from '../components/BingoGrid';
import { supabase } from '../supabaseClient';
import { getBoard } from '../lib/bingo';
import { checkLines } from '../lib/layout';

type Tile = {
  id: string;
  challenge_id: string;
  text: string;
  completed: boolean;
  row: number;
  col: number;
  file_path?: string | null;
};

export default function Board() {
  const groupId = localStorage.getItem('group_id')!;
  const groupName = localStorage.getItem('group_name')!;
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [kpi, setKpi] = useState({ line: false, bingo: false });
  const [firsts, setFirsts] = useState({ line: false, bingo: false });

  // ---------------------------------------------------------
  // REFRESH
  // ---------------------------------------------------------
  async function refresh() {
    const data = await getBoard(groupId);
    setTiles(data as Tile[]);
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (tiles.length === 16) {
      const m = Array.from({ length: 4 }, (_, r) =>
        Array.from({ length: 4 }, (_, c) => {
          const found = tiles.find((t) => t.row === r && t.col === c);
          return !!found?.file_path;
        })
      );
      const { hasLine, hasBingo } = checkLines(m);
      setKpi({ line: hasLine, bingo: hasBingo });

      if (hasLine || hasBingo) checkAchievements(hasLine, hasBingo);
    }
  }, [tiles]);

  // ---------------------------------------------------------
  // ACHIEVEMENTS
  // ---------------------------------------------------------
  async function checkAchievements(hasLine: boolean, hasBingo: boolean) {
    const { data: existing } = await supabase
      .from('achievements')
      .select('type, group_id')
      .order('created_at', { ascending: true });

    const alreadyLine = existing?.some((a) => a.type === 'line');
    const alreadyBingo = existing?.some((a) => a.type === 'bingo');

    if (hasLine) {
      const exists = existing?.find(
        (a) => a.group_id === groupId && a.type === 'line'
      );
      if (!exists) {
        await supabase.from('achievements').insert({
          group_id: groupId,
          type: 'line',
        });
      }
      if (!alreadyLine) setFirsts((f) => ({ ...f, line: true }));
    }

    if (hasBingo) {
      const exists = existing?.find(
        (a) => a.group_id === groupId && a.type === 'bingo'
      );
      if (!exists) {
        await supabase.from('achievements').insert({
          group_id: groupId,
          type: 'bingo',
        });
      }
      if (!alreadyBingo) setFirsts((f) => ({ ...f, bingo: true }));
    }
  }

  // ---------------------------------------------------------
  // UPLOAD FINAL (VPS)
  // ---------------------------------------------------------
  async function upload(id: string, file: File) {
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) {
        alert('API_URL não configurada.');
        return;
      }

      const form = new FormData();
      form.append('file', file);
      form.append('group_id', groupId);
      form.append('progress_id', id);

      const res = await fetch(`${apiUrl}/upload`, {
        method: 'POST',
        body: form,
      });

      if (!res.ok) {
        console.error(await res.text());
        alert('Erro ao enviar o ficheiro.');
        return;
      }

      const data = await res.json();
      if (!data.path) {
        alert('Resposta inválida do servidor.');
        return;
      }

      // Construir URL final
      const base = apiUrl.replace(/\/api\/?$/, '');
      const finalUrl = `${base}${data.path}`;

      // Actualizar progresso na BD
      await supabase
        .from('progress')
        .update({ file_path: finalUrl, completed: true })
        .eq('id', id);

      await refresh();
    } catch (error) {
      console.error(error);
      alert('Erro inesperado ao enviar ficheiro.');
    }
  }

  // ---------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------
  const doneCount = useMemo(
    () => tiles.filter((t) => t.file_path).length,
    [tiles]
  );

  return (
    <>
      <div className="kpi">
        <span className="pill">{groupName}</span>
        <span className="pill">{doneCount}/16</span>
        {kpi.line && (
          <span className="pill">
            LINHA ✅ {firsts.line && <strong>🥇 (Primeira do Jogo!)</strong>}
          </span>
        )}
        {kpi.bingo && (
          <span className="pill">
            BINGO 🎉 {firsts.bingo && <strong>🏆 (Primeiro do Jogo!)</strong>}
          </span>
        )}
      </div>

      <BingoGrid
        tiles={tiles.map((t) => ({
          id: t.id,
          text: t.text,
          completed: t.completed,
          file_path: t.file_path,
        }))}
        onUpload={upload}
      />
    </>
  );
}
