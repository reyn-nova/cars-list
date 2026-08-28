import swaggerJsdoc from "swagger-jsdoc";

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Cars List API",
      version: "1.0.0",
      description: "Minimal API to manage a list of cars",
    },
  },
  apis: ["./src/index.ts"],
});
