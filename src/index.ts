import "reflect-metadata";
import express from "express";
import swaggerUi from "swagger-ui-express";
import multer from "multer";
import { ILike, In, Repository } from "typeorm";
import { AppDataSource } from "./data-source";
import { Car } from "./entity/Car";
import { swaggerSpec } from "./swagger";
import { getS3Client, getPublicUrl, s3KeyFromUrl } from "./s3";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import rateLimit from "express-rate-limit";
import { HttpError, asyncHandler, errorHandler } from "./errors";
import { newCarListSchema, idListSchema, photoUrlSchema } from "./validation";
import { assertPublicUrl } from "./ssrf";

const app = express();
app.use(express.json());
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

const photoLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 512 * 1024 }, // 512 KB max
});

const MAX_PHOTO_BYTES = 512 * 1024;

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
 * /health:
 *   get:
 *     summary: Health check
 *     responses:
 *       200:
 *         description: Service is healthy
 */
app.get("/health", (_req, res) => res.json({ status: "ok" }));

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
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Max number of cars to return (default/max 100)
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *         description: Number of cars to skip
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
app.get(
  "/cars",
  asyncHandler(async (req, res) => {
    const { name, limit, offset } = req.query;
    const repo = AppDataSource.getRepository(Car);
    const take =
      limit !== undefined ? Math.min(Number(limit), 100) : undefined;
    const skip = offset !== undefined ? Math.max(Number(offset), 0) : 0;

    const cars = await repo.find({
      where: name ? { name: ILike(`%${name}%`) } : {},
      order: { id: "ASC" },
      take,
      skip,
    });
    res.json(cars);
  })
);

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
app.post(
  "/cars",
  asyncHandler(async (req, res) => {
    const parsed = newCarListSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0].message);
    }
    const repo = AppDataSource.getRepository(Car);
    const newCars = parsed.data.map((c) => repo.create({ name: c.name, type: c.type }));
    const saved = await repo.save(newCars);
    res.status(201).json(saved);
  })
);

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
 *         description: At least one valid car ID is required
 */
app.delete(
  "/cars",
  asyncHandler(async (req, res) => {
    const parsed = idListSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "At least one valid car ID is required");
    }
    const ids = parsed.data;
    const repo = AppDataSource.getRepository(Car);
    const bucketName = process.env.S3_BUCKET;

    if (bucketName) {
      const cars = await repo.find({ where: { id: In(ids) } });
      await deleteCarPhotos(cars, bucketName);
    }

    const result = await repo.delete(ids);
    res.json({ deleted: result.affected ?? 0 });
  })
);

/**
 * @openapi
 * /cars/{id}/photo:
 *   post:
 *     summary: Upload a photo for a car (stored in S3, URL saved on the car)
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
 *       429:
 *         description: Too many requests
 */
app.post(
  "/cars/:id/photo",
  photoLimiter,
  (req, res, next) => upload.single("photo")(req, res, next),
  asyncHandler(handlePhotoUpload)
);

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
 *       429:
 *         description: Too many requests
 */
app.post(
  "/cars/:id/photo-url",
  photoLimiter,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const bucketName = process.env.S3_BUCKET;
    if (!bucketName) {
      throw new HttpError(500, "S3_BUCKET environment variable is not set");
    }

    const parsed = photoUrlSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "url is required and must be a valid URL");
    }
    await assertPublicUrl(parsed.data.url);

    const repo = AppDataSource.getRepository(Car);
    const car = await repo.findOne({ where: { id } });
    if (!car) {
      throw new HttpError(404, "Car not found");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let resp: globalThis.Response;
    try {
      resp = await fetch(parsed.data.url, {
        signal: controller.signal,
        redirect: "follow",
      });
    } catch {
      throw new HttpError(400, "Failed to fetch image from URL");
    } finally {
      clearTimeout(timeout);
    }

    if (!resp.ok) {
      throw new HttpError(400, `Failed to fetch image: ${resp.status}`);
    }
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      throw new HttpError(400, "URL does not point to an image");
    }
    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.length > MAX_PHOTO_BYTES) {
      throw new HttpError(400, "Image exceeds 512 KB");
    }

    await saveCarPhoto(car, buffer, contentType, bucketName, repo);
    res.json(car);
  })
);

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
app.delete(
  "/cars/:id/photo",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const bucketName = process.env.S3_BUCKET;
    if (!bucketName) {
      throw new HttpError(500, "S3_BUCKET environment variable is not set");
    }

    const repo = AppDataSource.getRepository(Car);
    const car = await repo.findOne({ where: { id } });
    if (!car) {
      throw new HttpError(404, "Car not found");
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
  })
);

app.use(errorHandler);

async function handlePhotoUpload(req: express.Request, res: express.Response) {
  const id = Number(req.params.id);
  const bucketName = process.env.S3_BUCKET;
  const file = req.file;

  if (!bucketName) {
    throw new HttpError(500, "S3_BUCKET environment variable is not set");
  }
  if (!file) {
    throw new HttpError(400, "photo file is required");
  }

  const repo = AppDataSource.getRepository(Car);
  const car = await repo.findOne({ where: { id } });
  if (!car) {
    throw new HttpError(404, "Car not found");
  }

  await saveCarPhoto(car, file.buffer, file.mimetype, bucketName, repo);
  res.json(car);
}

async function deleteCarPhotos(cars: Car[], bucketName: string) {
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

const port = Number(process.env.PORT) || 3000;

AppDataSource.initialize()
  .then(() => {
    app.listen(port, () => console.log(`Server running on port ${port}`));
  })
  .catch((err) => {
    console.error("Error during Data Source initialization", err);
    process.exit(1);
  });
