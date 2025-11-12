import { writeFileSync, unlinkSync, readFileSync } from "fs";
import { v4 as uuid } from "uuid";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { createClient } from "@supabase/supabase-js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "500mb"
    }
  }
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const { video, groupId, tileId } = req.body;
    if (!video) return res.status(400).json({ error: "Faltam dados" });

    const buffer = Buffer.from(video, "base64");

    const inputPath = `/tmp/${uuid()}-input.mp4`;
    const outputPath = `/tmp/${uuid()}-output.mp4`;

    writeFileSync(inputPath, buffer);

    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .setFfmpegPath(ffmpegPath)
        .outputOptions([
          "-vf scale=-2:720",
          "-c:v libx264",
          "-crf 28",
          "-preset veryfast",
          "-c:a aac",
          "-b:a 128k"
        ])
        .save(outputPath)
        .on("end", resolve)
        .on("error", reject);
    });

    const compressed = readFileSync(outputPath);

    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.VITE_SUPABASE_ANON_KEY
    );

    const filePath = `${groupId}/${tileId}-${Date.now()}.mp4`;

    const { error: uploadError } = await supabase.storage
      .from("uploads")
      .upload(filePath, compressed, {
        contentType: "video/mp4"
      });

    if (uploadError) throw uploadError;

    try { unlinkSync(inputPath); } catch {}
    try { unlinkSync(outputPath); } catch {}

    res.status(200).json({ filePath });
  } catch (err) {
    console.error("Erro FFmpeg:", err);
    res.status(500).json({ error: "Falha ao comprimir" });
  }
}
