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
  onUpload: (id: string, file: File) => void;
}) {
  return (
    <div className="grid">
      {tiles.map((t) => (
        <button
          key={t.id}
          className={`tile card ${t.file_path ? 'done' : ''}`} // fica verde apenas quando há ficheiro
        >
          <div>
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
                  if (f) onUpload(t.id, f);
                }}
              />
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
