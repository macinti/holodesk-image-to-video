const express = require("express");
const multer = require("multer");
const { fal } = require("@fal-ai/client");

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      return cb(new Error("Поддерживаются JPG, PNG и WEBP."));
    }
    cb(null, true);
  }
});

if (!process.env.FAL_KEY) {
  console.warn("FAL_KEY is not set. Add it in your hosting service environment variables.");
} else {
  fal.config({ credentials: process.env.FAL_KEY });
}

app.use(express.static("public"));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/generate", upload.single("image"), async (req, res) => {
  try {
    if (!process.env.FAL_KEY) {
      return res.status(503).json({ error: "Сервис ещё не настроен: не добавлен ключ генерации." });
    }
    if (!req.file) return res.status(400).json({ error: "Сначала выберите фотографию." });

    const prompt = String(req.body.prompt || "").trim();
    if (!prompt) return res.status(400).json({ error: "Опишите, что должно происходить в видео." });
    if (prompt.length > 1500) return res.status(400).json({ error: "Описание слишком длинное (максимум 1500 символов)." });

    const image = new File([req.file.buffer], req.file.originalname || "photo.jpg", {
      type: req.file.mimetype
    });
    const imageUrl = await fal.storage.upload(image);

    const result = await fal.subscribe("fal-ai/vidu/image-to-video", {
      input: {
        image_url: imageUrl,
        prompt,
        movement_amplitude: ["auto", "small", "medium", "large"].includes(req.body.movement)
          ? req.body.movement
          : "medium"
      },
      logs: false
    });

    const data = result && result.data ? result.data : result;
    const videoUrl = data && data.video && data.video.url
      ? data.video.url
      : data && data.video_url
        ? data.video_url
        : null;

    if (!videoUrl) {
      console.error("Unexpected generation response:", JSON.stringify(data));
      return res.status(502).json({ error: "Модель не вернула ссылку на видео. Попробуйте ещё раз." });
    }
    res.json({ videoUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Не удалось создать видео." });
  }
});

app.use((error, _req, res, _next) => {
  res.status(400).json({ error: error.message || "Ошибка загрузки файла." });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("HoloDesk is running on port " + port));
