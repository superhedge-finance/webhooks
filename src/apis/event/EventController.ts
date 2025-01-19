import { Controller, Inject, OnInit } from "@tsed/di";
import { ProductService } from "../product/services/ProductService";
import { SUPPORT_CHAINS } from "../../shared/constants";
import * as cron from "node-cron";
import { SuperHedgeDataSource } from "../../dal/data-source";
import { WebhookService } from "./services/WebhookService";

@Controller("/events")
export class EventsController implements OnInit {

  @Inject()
  private readonly productService: ProductService;

  @Inject()
  private readonly webhookService: WebhookService;

  async $onInit() {
    // Wait for database connection to be established
    if (!SuperHedgeDataSource.isInitialized) {
      await SuperHedgeDataSource.initialize();
    }

    console.log("start cron job");
    cron.schedule("*/1 * * * *", async () => {
      try {
        for (const chainId of SUPPORT_CHAINS) {
          await this.productService.removeTransactionOvertime();
          const products = await this.productService.getProducts(chainId);
          const productList = products.map(products => products.address);
          
          for (const productAddress of productList) {
            const {addressesList, amountsList} = await this.productService.getWithdrawList(productAddress);
            if (addressesList && addressesList.length > 0) {
              const txResult = await this.productService.storeOptionPosition(chainId, productAddress, addressesList, amountsList);
              
              console.log(txResult);
            }
          }
        }
      } catch (error) {
        console.error("Cron job", error);
      }
    });
  }
}
