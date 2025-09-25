import "reflect-metadata";
import "cors";
import "cookie-parser";
import "compression";
import "method-override";
import "body-parser";
import "@tsed/engines";
import "@tsed/platform-views";
import { registerProvider } from "@tsed/di";
import { Logger } from "@tsed/logger";
import { PlatformExpress } from "@tsed/platform-express";
import { Server } from "../src/Server";
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
import { ProductService } from "../src/apis/product/services/ProductService";
import { ContractService } from "../src/services/ContractService";

let cachedHandler: any;
let providersRegistered = false;

function registerProvidersOnce() {
  if (providersRegistered) return;

  registerProvider({
    provide: SuperHedgeDataSource,
    type: "typeorm:datasource",
    deps: [Logger],
    async useAsyncFactory(logger: Logger) {
      if (!SuperHedgeDataSource.isInitialized) {
        await SuperHedgeDataSource.initialize();
        logger.info("Connected with typeorm to database: PostgreSQL");
      }
      return SuperHedgeDataSource;
    },
    hooks: {
      $onDestroy(dataSource) {
        return dataSource.isInitialized && dataSource.destroy();
      },
    },
  });

  registerProvider({
    provide: UserRepository,
    useValue: new UserRepository(User, SuperHedgeDataSource.createEntityManager()),
  });

  registerProvider({
    provide: ProductRepository,
    useValue: new ProductRepository(Product, SuperHedgeDataSource.createEntityManager()),
  });

  registerProvider({
    provide: WithdrawRequestRepository,
    useValue: new WithdrawRequestRepository(WithdrawRequest, SuperHedgeDataSource.createEntityManager()),
  });

  registerProvider({
    provide: HistoryRepository,
    useValue: new HistoryRepository(History, SuperHedgeDataSource.createEntityManager()),
  });

  registerProvider({
    provide: RefCodeRepository,
    useValue: new RefCodeRepository(RefCode, SuperHedgeDataSource.createEntityManager()),
  });

  registerProvider({
    provide: CouponListRepository,
    useValue: new CouponListRepository(CouponList, SuperHedgeDataSource.createEntityManager()),
  });

  registerProvider({
    provide: CouponAddressListRepository,
    useValue: new CouponAddressListRepository(CouponAddressList, SuperHedgeDataSource.createEntityManager()),
  });

  // Register services explicitly
  registerProvider({
    provide: ProductService,
    useClass: ProductService,
  });

  registerProvider({
    provide: ContractService,
    useClass: ContractService,
  });

  providersRegistered = true;
}

export default async function handler(req: any, res: any) {
  try {
    if (!cachedHandler) {
      registerProvidersOnce();
      const platform = await PlatformExpress.bootstrap(Server);
      cachedHandler = platform.callback();
    }
    return cachedHandler(req, res);
  } catch (err: any) {
    console.error("Bootstrap/handler error:", err?.stack || err);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "internal_error", message: err?.message || String(err) }));
  }
}
