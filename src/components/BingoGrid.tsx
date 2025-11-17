import { useState } from 'react';

type Tile = {
  id: string;
  text: string;
  completed: boolean;
  file_path?: string | null;
};

export default function BingoGrid({
  tiles,
  onUpload
}: {
  tiles: Tile[];
  onUpload: (id: string, file: File) => Promise<void>;
}) {

  // loading por tile
  const [loading, setLoading] = useState<{ [id: string]: boolean }>({});

  async function handleUpload(id: string, file: File) {
    setLoading((l) => ({ ...l, [id]: true }));
    try {
      await onUpload(id, file);
    } finally {
      setLoading((l) => ({ ...l, [id]: false }));
    }
  }

  return (
    <div className="grid">
      {tiles.map((t) => (
        <button
          key={t.id}
          className={`tile card ${t.file_path ? 'done' : ''}`}
          disabled={loading[t.id]} // impede cliques enquanto envia
        >
          {/* Overlay de loading */}
          {loading[t.id] && (
            <div className="loading-overlay">
              <div className="spinner" />
              <span>A enviar…</span>
            </div>
          )}

          <div style={{ opacity: loading[t.id] ? 0.3 : 1 }}>
            <div>{t.text}</div>
            <small className="status">
              {t.file_path ? 'Feito ✅' : 'Por fazer'}
            </small>

            <div style={{ marginTop: 8 }}>
              <input
                type="file"
                accept="image/*,video/*"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(t.id, f);
                }}
              />
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
