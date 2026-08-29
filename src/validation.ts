import { z } from "zod";

export const newCarSchema = z.object({
  name: z.string().min(1, "name is required"),
  type: z.string().min(1, "type is required"),
});

export const newCarListSchema = z.array(newCarSchema).min(1);

export const idListSchema = z.array(z.coerce.number().int().positive()).min(1);

export const photoUrlSchema = z.object({
  url: z.string().url(),
});
