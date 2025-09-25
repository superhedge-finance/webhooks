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
