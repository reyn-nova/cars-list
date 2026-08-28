import "reflect-metadata";
import express from "express";
import swaggerUi from "swagger-ui-express";
import { AppDataSource } from "./data-source";
import { Car } from "./entity/Car";
import { ILike } from "typeorm";
import { swaggerSpec } from "./swagger";

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
    const result = await repo.delete(ids);
    res.json({ deleted: result.affected ?? 0 });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const port = Number(process.env.PORT) || 3000;

AppDataSource.initialize()
  .then(() => {
    app.listen(port, () => console.log(`Server running on port ${port}`));
  })
  .catch((err) => {
    console.error("Error during Data Source initialization", err);
  });
