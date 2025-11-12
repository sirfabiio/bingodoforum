import { useEffect, useMemo, useState } from 'react';
import BingoGrid from '../components/BingoGrid';
import { supabase } from '../supabaseClient';
import { getBoard } from '../lib/bingo';
import { checkLines } from '../lib/layout';
import { createFFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const ffmpeg = createFFmpeg({ log: false });

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
      // vê se o grupo já registou
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

  async function upload(id: string, file: File) {
    try {
      let path = '';

      if (file.type.startsWith('image/')) {
        const ext = file.name.split('.').pop();
        path = `${groupId}/${id}-${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from('uploads').upload(path, file);
        if (error) throw error;
      } else if (file.type.startsWith('video/')) {
        if (!ffmpeg.isLoaded()) await ffmpeg.load();

        const inputName = 'input.mp4';
        const outputName = 'output.mp4';

        ffmpeg.FS('writeFile', inputName, await fetchFile(file));
        await ffmpeg.run(
          '-i', inputName,
          '-vf', 'scale=-2:720',
          '-c:v', 'libx264',
          '-crf', '28',
          '-preset', 'ultrafast',
          '-c:a', 'aac',
          '-b:a', '128k',
          outputName
        );

        const data = ffmpeg.FS('readFile', outputName);
        const compressedBlob = new Blob([data.buffer], { type: 'video/mp4' });
        const compressedFile = new File([compressedBlob], `${Date.now()}.mp4`, { type: 'video/mp4' });

        path = `${groupId}/${id}-${Date.now()}.mp4`;
        const { error } = await supabase.storage.from('uploads').upload(path, compressedFile);
        if (error) throw error;
      } else {
        alert('Tipo de ficheiro não suportado.');
        return;
      }

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
