import swaggerJsdoc from "swagger-jsdoc";

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Cars List API",
      version: "1.0.0",
      description: "Minimal API to manage a list of cars",
    },
    components: {
      securitySchemes: {
        apiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "Authorization",
          description: "Shared API key, sent as 'Authorization: Bearer <API_KEY>'",
        },
      },
    },
  },
  apis: ["./src/index.ts"],
});
