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
      if (!alreadyLine) {
        setFirsts((f) => ({ ...f, line: true }));
      }
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
      if (!alreadyBingo) {
        setFirsts((f) => ({ ...f, bingo: true }));
      }
    }
  }

  // -----------------------------------------
  // FUNÇÃO `upload()` CORRIGIDA COMPLETAMENTE
  // -----------------------------------------

  async function upload(id: string, file: File) {
    try {
      let path = '';

      // ------------------------------
      // 1. Upload directo de IMAGENS
      // ------------------------------
      if (file.type.startsWith('image/')) {
        const ext = file.name.split('.').pop();
        path = `${groupId}/${id}-${Date.now()}.${ext}`;

        const { error } = await supabase.storage.from('uploads')
          .upload(path, file);

        if (error) throw error;
      }

      // ------------------------------
      // 2. Upload de VÍDEO com compressão pela API /api/compress
      // ------------------------------
      else if (file.type.startsWith('video/')) {

        // Converter vídeo → Base64
        const base64 = await fileToBase64(file);

        // Enviar para o servidor Vercel para compressão
        const response = await fetch('/api/compress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            video: base64.replace(/^data:.*;base64,/, ''),
            groupId,
            tileId: id
          })
        });

        const result = await response.json();

        if (!response.ok || !result.filePath) {
          console.error(result);
          alert('Erro ao comprimir vídeo.');
          return;
        }

        // Caminho devolvido pela API
        path = result.filePath;
      }

      // ------------------------------
      // 3. Tipo inválido
      // ------------------------------
      else {
        alert('Tipo de ficheiro não suportado.');
        return;
      }

      // ------------------------------
      // 4. Actualizar progresso
      // ------------------------------
      await supabase
        .from('progress')
        .update({ file_path: path, completed: true })
        .eq('id', id);

      await refresh();
    } catch (err) {
      console.error(err);
      alert('Erro ao enviar ficheiro.');
    }
  }

  // Função utilitária para converter vídeo → Base64
  function fileToBase64(file: File): Promise<string> {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  }

  // -----------------------------------------
  // RENDER
  // -----------------------------------------

  const doneCount = useMemo(() => tiles.filter((t) => t.file_path).length, [tiles]);

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
