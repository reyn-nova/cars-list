import "reflect-metadata";
import express from "express";
import swaggerUi from "swagger-ui-express";
import multer from "multer";
import { AppDataSource } from "./data-source";
import { Car } from "./entity/Car";
import { ILike, Repository } from "typeorm";
import { swaggerSpec } from "./swagger";
import { getS3Client, getPublicUrl } from "./s3";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const app = express();
app.use(express.json());
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @openapi
 * components:
 *   schemas:
 *     Car:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         name:
 *           type: string
 *         type:
 *           type: string
 *         photoUrl:
 *           type: string
 *           nullable: true
 *     NewCar:
 *       type: object
 *       required:
 *         - name
 *         - type
 *       properties:
 *         name:
 *           type: string
 *         type:
 *           type: string
 *     NewCarList:
 *       type: array
 *       minItems: 1
 *       items:
 *         $ref: '#/components/schemas/NewCar'
 */

/**
 * @openapi
 * /cars:
 *   get:
 *     summary: Get all cars
 *     parameters:
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: Case-insensitive search by car name
 *     responses:
 *       200:
 *         description: List of cars
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Car'
 */
app.get("/cars", async (req, res) => {
  const { name } = req.query;
  try {
    const repo = AppDataSource.getRepository(Car);
    if (name) {
      const cars = await repo.find({
        where: { name: ILike(`%${name}%`) },
        order: { id: "ASC" },
      });
      return res.json(cars);
    }
    const cars = await repo.find({ order: { id: "ASC" } });
    res.json(cars);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * @openapi
 * /cars:
 *   post:
 *     summary: Add one or more cars
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NewCarList'
 *     responses:
 *       201:
 *         description: The created cars
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Car'
 *       400:
 *         description: At least one car required; name and type are required for each car
 */
app.post("/cars", async (req, res) => {
  const cars = req.body;
  if (!Array.isArray(cars) || cars.length === 0) {
    return res.status(400).json({ error: "At least one car is required" });
  }
  for (const car of cars) {
    if (!car || !car.name || !car.type) {
      return res.status(400).json({ error: "name and type are required for each car" });
    }
  }
  try {
    const repo = AppDataSource.getRepository(Car);
    const newCars = cars.map((c: { name: string; type: string }) =>
      repo.create({ name: c.name, type: c.type })
    );
    const saved = await repo.save(newCars);
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * @openapi
 * /cars:
 *   delete:
 *     summary: Delete one or more cars
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             minItems: 1
 *             items:
 *               type: integer
 *             description: List of car IDs to delete
 *     responses:
 *       200:
 *         description: Number of deleted cars
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deleted:
 *                   type: integer
 *       400:
 *         description: At least one car ID is required
 */
app.delete("/cars", async (req, res) => {
  const ids = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "At least one car ID is required" });
  }
  try {
    const repo = AppDataSource.getRepository(Car);
    const bucketName = process.env.S3_BUCKET;

    // Delete each car's photo from S3 first (if configured)
    if (bucketName) {
      const cars = await repo.find({ where: ids.map((id: number) => ({ id })) });
      const s3 = getS3Client();
      for (const car of cars) {
        const key = s3KeyFromUrl(car.photoUrl ?? "");
        if (!key) continue;
        try {
          await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
        } catch (e) {
          console.error(`Failed to delete S3 object for car ${car.id}:`, e);
        }
      }
    }

    const result = await repo.delete(ids);
    res.json({ deleted: result.affected ?? 0 });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 512 * 1024 }, // 512 KB max
});

/**
 * @openapi
 * /cars/{id}/photo:
 *   post:
 *     summary: Upload a photo for a car (stored in GCS, URL saved on the car)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Car with updated photoUrl
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Car'
 *       400:
 *         description: photo file is required
 *       404:
 *         description: Car not found
 *       500:
 *         description: S3 not configured or upload failed
 */
app.post("/cars/:id/photo", (req, res) => {
  upload.single("photo")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    handlePhotoUpload(req, res);
  });
});

/**
 * @openapi
 * /cars/{id}/photo-url:
 *   post:
 *     summary: Store a photo from a URL (server fetches, then uploads to S3)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url]
 *             properties:
 *               url:
 *                 type: string
 *                 description: Publicly reachable image URL
 *     responses:
 *       200:
 *         description: Car with updated photoUrl
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Car'
 *       400:
 *         description: url required, not an image, or exceeds 512 KB
 *       404:
 *         description: Car not found
 */
app.post("/cars/:id/photo-url", async (req, res) => {
  const id = Number(req.params.id);
  const bucketName = process.env.S3_BUCKET;
  const url = req.body?.url;

  if (!bucketName) {
    return res.status(500).json({ error: "S3_BUCKET environment variable is not set" });
  }
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "url is required" });
  }

  try {
    const repo = AppDataSource.getRepository(Car);
    const car = await repo.findOne({ where: { id } });
    if (!car) {
      return res.status(404).json({ error: "Car not found" });
    }

    const resp = await fetch(url);
    if (!resp.ok) {
      return res.status(400).json({ error: `Failed to fetch image: ${resp.status}` });
    }
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return res.status(400).json({ error: "URL does not point to an image" });
    }
    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.length > 512 * 1024) {
      return res.status(400).json({ error: "Image exceeds 512 KB" });
    }

    await saveCarPhoto(car, buffer, contentType, bucketName, repo);
    res.json(car);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * @openapi
 * /cars/{id}/photo:
 *   delete:
 *     summary: Delete a car's photo (removes the S3 object and clears photoUrl)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Car with photoUrl cleared
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Car'
 *       404:
 *         description: Car not found
 */
app.delete("/cars/:id/photo", async (req, res) => {
  const id = Number(req.params.id);
  const bucketName = process.env.S3_BUCKET;

  if (!bucketName) {
    return res.status(500).json({ error: "S3_BUCKET environment variable is not set" });
  }

  try {
    const repo = AppDataSource.getRepository(Car);
    const car = await repo.findOne({ where: { id } });
    if (!car) {
      return res.status(404).json({ error: "Car not found" });
    }

    const oldKey = s3KeyFromUrl(car.photoUrl ?? "");
    if (oldKey) {
      await getS3Client().send(
        new DeleteObjectCommand({ Bucket: bucketName, Key: oldKey })
      );
      car.photoUrl = undefined;
      await repo.save(car);
    }

    res.json(car);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

function s3KeyFromUrl(photoUrl: string): string {
  try {
    return new URL(photoUrl).pathname.replace(/^\/+/, "");
  } catch {
    return "";
  }
}

async function saveCarPhoto(
  car: Car,
  buffer: Buffer,
  contentType: string,
  bucketName: string,
  repo: Repository<Car>
) {
  const s3 = getS3Client();
  const ext = contentType.split("/")[1] || "jpg";
  const filename = `cars/${car.id}-${Date.now()}.${ext}`;

  // Remove the previous photo from S3 so re-uploads don't leave orphans
  const oldKey = s3KeyFromUrl(car.photoUrl ?? "");
  if (oldKey) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: oldKey }));
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: filename,
      Body: buffer,
      ContentType: contentType,
    })
  );

  car.photoUrl = getPublicUrl(bucketName, filename);
  await repo.save(car);
}

async function handlePhotoUpload(req: express.Request, res: express.Response) {
  const id = Number(req.params.id);
  const bucketName = process.env.S3_BUCKET;
  const file = req.file;

  if (!bucketName) {
    return res.status(500).json({ error: "S3_BUCKET environment variable is not set" });
  }
  if (!file) {
    return res.status(400).json({ error: "photo file is required" });
  }

  try {
    const repo = AppDataSource.getRepository(Car);
    const car = await repo.findOne({ where: { id } });
    if (!car) {
      return res.status(404).json({ error: "Car not found" });
    }

    await saveCarPhoto(car, file.buffer, file.mimetype, bucketName, repo);
    res.json(car);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

const port = Number(process.env.PORT) || 3000;

AppDataSource.initialize()
  .then(() => {
    app.listen(port, () => console.log(`Server running on port ${port}`));
  })
  .catch((err) => {
    console.error("Error during Data Source initialization", err);
  });
