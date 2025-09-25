import "reflect-metadata";
import "cors";
import "cookie-parser";
import "compression";
import "method-override";
import "body-parser";
import "@tsed/engines";
import "@tsed/platform-views";
import { WebhookController } from "../src/apis/event/WebhookController";
import { WebhookService } from "../src/apis/event/services/WebhookService";
import { ProductService } from "../src/apis/product/services/ProductService";
import { ContractService } from "../src/services/ContractService";
import {
  Product,
  ProductRepository,
  SuperHedgeDataSource,
  User,
  WithdrawRequest,
  UserRepository,
  WithdrawRequestRepository,
  HistoryRepository,
  History,
  RefCodeRepository,
  RefCode,
  CouponListRepository,
  CouponList,
  CouponAddressListRepository,
  CouponAddressList,
} from "../src/dal";

let cachedHandler: any;
let initialized = false;

async function initializeServices() {
  if (initialized) return;

  // Initialize database
  if (!SuperHedgeDataSource.isInitialized) {
    await SuperHedgeDataSource.initialize();
    console.log("Connected with typeorm to database: PostgreSQL");
  }

  initialized = true;
}

export default async function handler(req: any, res: any) {
  try {
    if (!cachedHandler) {
      await initializeServices();
      
      // Create a simple Express app for webhook handling
      const express = require('express');
      const app = express();
      
      // Middleware
      app.use(express.json());
      app.use(express.urlencoded({ extended: true }));
      
      // Initialize repositories
      const productRepository = new ProductRepository(Product, SuperHedgeDataSource.createEntityManager());
      const historyRepository = new HistoryRepository(History, SuperHedgeDataSource.createEntityManager());
      const withdrawRequestRepository = new WithdrawRequestRepository(WithdrawRequest, SuperHedgeDataSource.createEntityManager());
      const userRepository = new UserRepository(User, SuperHedgeDataSource.createEntityManager());
      
      // Initialize services
      const productService = new ProductService();
      const contractService = new ContractService();
      const webhookService = new WebhookService();
      
      // Manually inject dependencies
      (productService as any).productRepository = productRepository;
      (productService as any).historyRepository = historyRepository;
      (productService as any).withdrawRequestRepository = withdrawRequestRepository;
      (productService as any).userRepository = userRepository;
      
      (webhookService as any).productRepository = productRepository;
      (webhookService as any).historyRepository = historyRepository;
      (webhookService as any).withdrawRequestRepository = withdrawRequestRepository;
      (webhookService as any).userRepository = userRepository;
      (webhookService as any).productService = productService;
      (webhookService as any).contractService = contractService;
      
      // Webhook route
      app.post('/webhook', async (req: any, res: any) => {
        try {
          const providedSignature = req.headers["x-signature"];
          const generatedSignature = require('web3').utils.sha3(JSON.stringify(req.body) + process.env.MORALIS_STREAM_API_KEY);
          
          console.log(generatedSignature);
          console.log(providedSignature);
          
          if (req.body.abi.length != 0) {
            if (req.body.confirmed && generatedSignature === providedSignature) {
              await webhookService.handleWebhook(req.body);
            }
          } else {
            if (generatedSignature === providedSignature) {
              return res.status(200).json({ message: "Webhook received successfully" });
            }
          }
        } catch (e) {
          console.error(e);
          return res.status(400).json({ error: "Failed to process webhook" });
        }
      });
      
      // Health check
      app.get('/health', (req: any, res: any) => {
        res.json({ status: 'ok' });
      });
      
      // Swagger UI route
      app.get('/doc', (req: any, res: any) => {
        const swaggerHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>SuperHedge Webhooks API</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/swagger.json',
      dom_id: '#swagger-ui',
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIBundle.presets.standalone
      ]
    });
  </script>
</body>
</html>`;
        res.send(swaggerHtml);
      });
      
      // Swagger JSON
      app.get('/swagger.json', (req: any, res: any) => {
        const swaggerSpec = {
          openapi: "3.0.0",
          info: {
            title: "SuperHedge Webhooks API",
            version: "1.0.0",
            description: "API for handling blockchain webhooks"
          },
          servers: [
            {
              url: "https://webhooks-9rd8hqotj-superhedge.vercel.app",
              description: "Production server"
            }
          ],
          paths: {
            "/webhook": {
              post: {
                summary: "Handle webhook",
                description: "Process incoming webhook from Moralis",
                requestBody: {
                  required: true,
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          chainId: { type: "string" },
                          confirmed: { type: "boolean" },
                          abi: { type: "array" },
                          logs: { type: "array" },
                          txs: { type: "array" },
                          erc20Transfers: { type: "array" },
                          block: { type: "object" }
                        }
                      }
                    }
                  }
                },
                responses: {
                  "200": {
                    description: "Webhook processed successfully",
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: {
                            message: { type: "string" }
                          }
                        }
                      }
                    }
                  },
                  "400": {
                    description: "Bad request",
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: {
                            error: { type: "string" }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            "/health": {
              get: {
                summary: "Health check",
                description: "Check if the service is running",
                responses: {
                  "200": {
                    description: "Service is healthy",
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: {
                            status: { type: "string" }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        };
        res.json(swaggerSpec);
      });
      
      cachedHandler = app;
    }
    return cachedHandler(req, res);
  } catch (err: any) {
    console.error("Bootstrap/handler error:", err?.stack || err);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "internal_error", message: err?.message || String(err) }));
  }
}
