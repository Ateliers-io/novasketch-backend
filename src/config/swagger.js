// swagger.js: Swagger/OpenAPI configuration for NovaSketch backend.
//
// Uses swagger-jsdoc to scan route files for @swagger annotations
// and generate a complete OpenAPI 3.0 specification.

import swaggerJsdoc from 'swagger-jsdoc';

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'NovaSketch API',
            version: '1.0.0',
            description:
                'REST API for NovaSketch — a collaborative whiteboard application. ' +
                'Covers authentication, session management, and shape data retrieval.',
            contact: {
                name: 'NovaSketch Team',
            },
        },
        servers: [
            {
                url: 'http://localhost:3000',
                description: 'Local development',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'JWT token obtained from /api/auth/login or /api/auth/google',
                },
            },
        },
    },
    apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
