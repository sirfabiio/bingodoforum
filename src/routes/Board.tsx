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
  // DETECÇÃO DE iOS E SUPORTE A captureStream
  // ---------------------------------------------------------
  const isIOS =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent);

  const canCaptureStream =
    typeof HTMLVideoElement !== 'undefined' &&
    'captureStream' in HTMLVideoElement.prototype;

  // ---------------------------------------------------------
  // DETECTAR ORIENTAÇÃO DO VÍDEO
  // ---------------------------------------------------------
  function isPortraitVideo(video: HTMLVideoElement): boolean {
    return video.videoHeight > video.videoWidth;
  }

  // ---------------------------------------------------------
  // COMPRESSÃO (ANDROID / DESKTOP)
  // ---------------------------------------------------------
  async function compressVideo(file: File): Promise<Blob> {
    const video = document.createElement("video");
    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;

    await new Promise<void>((resolve) => {
      video.onloadedmetadata = () => {
        video.play().catch(() => {});
        resolve();
      };
    });

    // Detectar orientação (apenas para debug — o MediaRecorder respeita)
    const portrait = isPortraitVideo(video);
    console.log("Vídeo em pé:", portrait);

    // @ts-expect-error — existe nos browsers que suportam
    const stream: MediaStream = video.captureStream();

    const recorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp9",
      videoBitsPerSecond: 900_000, // mantém boa qualidade
    });

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.start();

    await new Promise((resolve) =>
      setTimeout(resolve, video.duration * 1000)
    );

    recorder.stop();

    await new Promise((resolve) => (recorder.onstop = () => resolve(null)));

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

      // IMAGENS → upload directo
      if (file.type.startsWith('image/')) {
        const ext = file.name.split('.').pop();
        path = `${groupId}/${id}-${Date.now()}.${ext}`;

        const { error } = await supabase.storage
          .from('uploads')
          .upload(path, file);

        if (error) throw error;
      }

      // VÍDEOS
      else if (file.type.startsWith('video/')) {
        const sizeMb = file.size / 1024 / 1024;

        // iPhone → sem compressão, apenas <= 48 MB
        if (isIOS || !canCaptureStream) {
          if (sizeMb > 48) {
            alert(
              `O vídeo tem ${sizeMb.toFixed(
                1
              )} MB.\nNo iPhone só podes enviar vídeos até 48 MB.\nPor favor grava um vídeo mais curto.`
            );
            return;
          }

          const ext = file.name.split('.').pop() || "mp4";
          path = `${groupId}/${id}-${Date.now()}.${ext}`;

          const { error } = await supabase.storage
            .from('uploads')
            .upload(path, file);

          if (error) throw error;
        }

        // ANDROID / DESKTOP → compressão apenas se > 48 MB
        else {
          let toUpload: Blob = file;

          if (sizeMb > 48) {
            toUpload = await compressVideo(file);
          }

          path = `${groupId}/${id}-${Date.now()}.webm`;

          const { error } = await supabase.storage
            .from('uploads')
            .upload(path, toUpload);

          if (error) throw error;
        }
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
