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

  // ---------------------------------------------------------
  // COMPRESSÃO DE VÍDEO NO BROWSER
  // ---------------------------------------------------------

  async function compressVideo(file: File): Promise<Blob> {
    console.log("A comprimir vídeo…");

    const video = document.createElement("video");
    video.src = URL.createObjectURL(file);

    await new Promise(resolve => {
      video.onloadedmetadata = resolve;
    });

    const stream = (video as any).captureStream();

    const recorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp9",
      videoBitsPerSecond: 500_000 // 0.5 Mbps = compressão forte
    });

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = e => chunks.push(e.data);

    recorder.start();

    // Gravar apenas o tempo exacto do vídeo original
    await new Promise(resolve => setTimeout(resolve, video.duration * 1000));

    recorder.stop();

    await new Promise(resolve => (recorder.onstop = resolve));

    const blob = new Blob(chunks, { type: "video/webm" });

    console.log("Original:", (file.size / 1024 / 1024).toFixed(2), "MB");
    console.log("Comprimido:", (blob.size / 1024 / 1024).toFixed(2), "MB");

    return blob;
  }

  // ---------------------------------------------------------
  // UPLOAD FINAL
  // ---------------------------------------------------------

  async function upload(id: string, file: File) {
    try {
      let path = '';

      // Caso 1 — imagens
      if (file.type.startsWith('image/')) {
        const ext = file.name.split('.').pop();
        path = `${groupId}/${id}-${Date.now()}.${ext}`;

        const { error } = await supabase.storage
          .from('uploads')
          .upload(path, file);

        if (error) throw error;
      }

      // Caso 2 — vídeos com compressão no browser
      else if (file.type.startsWith('video/')) {
        const compressed = await compressVideo(file);

        path = `${groupId}/${id}-${Date.now()}.webm`;

        const { error } = await supabase.storage
          .from('uploads')
          .upload(path, compressed);

        if (error) throw error;
      }

      // Tipo inválido
      else {
        alert("Tipo de ficheiro não suportado.");
        return;
      }

      // Actualizar progresso
      await supabase
        .from('progress')
        .update({ file_path: path, completed: true })
        .eq('id', id);

      await refresh();

    } catch (err) {
      console.error(err);
      alert("Erro ao enviar ficheiro.");
    }
  }

  // ---------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------

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
