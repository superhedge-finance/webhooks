import { Inject, Injectable } from "@tsed/di";
import { Not, UpdateResult } from "typeorm";
import { BigNumber, ethers, FixedNumber, Contract, Wallet } from "ethers";
import { History, Product, ProductRepository, WithdrawRequest, WithdrawRequestRepository, UserRepository } from "../../../dal";
import { HistoryRepository } from "../../../dal/repository/HistoryRepository";
import { HISTORY_TYPE, WITHDRAW_TYPE } from "../../../shared/enum";
import { ProductService } from "../../product/services/ProductService";
import { ContractService } from "../../../services/ContractService";
@Injectable()
export class WebhookService {

  private readonly provider: { [chainId: number]: ethers.providers.JsonRpcProvider } = {};

  @Inject(ProductRepository)
  private readonly productRepository: ProductRepository;

  @Inject()
  private readonly productService: ProductService;

  @Inject(HistoryRepository)
  private readonly historyRepository: HistoryRepository;

  @Inject(WithdrawRequestRepository)
  private readonly withdrawRequestRepository: WithdrawRequestRepository;

  @Inject(UserRepository)
  private readonly userRepository: UserRepository;

  @Inject()
  private readonly contractService: ContractService;

  // Define the functions corresponding to each method ID
  async fundAccept(chainId: number, productAddress: string) {
    console.log("Executing FundAccept")
    this.productService.updateProductStatus(chainId,productAddress,1)
  }

  async Lock(chainId: number, productAddress: string) {
    console.log("Executing FundLock")
    this.productService.updateProductStatus(chainId,productAddress,2)
  }

  async Issuance(chainId: number, productAddress: string) {
    console.log("Executing Issuance");
    this.productService.updateProductStatus(chainId,productAddress,3)
  }

  async Mature(chainId: number, productAddress: string) {
    console.log("Executing Mature");
    this.productService.updateProductStatus(chainId,productAddress,4)
  }

  async getTokenInformation(information: any) : Promise<{tokenSymbol: string, decimals: number}> {
    const tokenSymbol = information.tokenSymbol;
    const decimals = Number(information.tokenDecimals);
    return { tokenSymbol, decimals };
  }

  async Deposit(body: any,chainId: number ,productAddress: string) {
    console.log("Executing Deposit");
    const txHash = body.logs[0].transactionHash;
    const userAddress = body.erc20Transfers[0].from;
    const amountToken = body.erc20Transfers[0].value;
    const timestamp = body.block.timestamp
    const {sumAddress} = await this.checkSumAddress(userAddress);
    const { productId } = await this.getProductId(productAddress, chainId);
    const {tokenSymbol, decimals} = await this.getTokenInformation(body.erc20Transfers[0]);
    await this.saveTransactionHistory(chainId, sumAddress, txHash, '[User] Principal Deposit', productId, amountToken, timestamp, tokenSymbol, decimals);
    await this.productService.updateCurrentCapacity(chainId, productAddress);
    await this.saveProductIdUser(productId, sumAddress);
  }

  //withdrawPrincipal - [User] Withdraw Principal
  async WithdrawPrincipal(body: any,chainId: number ,productAddress: string) {
    console.log("Executing Withdraw");
    const txHash = body.logs[0].transactionHash;
    const userAddress =  body.txs[0].fromAddress;
    const amountToken =  body.erc20Transfers[1].value;
    const timestamp = body.block.timestamp
    const {sumAddress} = await this.checkSumAddress(userAddress);
    const { productId } = await this.getProductId(productAddress, chainId);
    const {tokenSymbol, decimals} = await this.getTokenInformation(body.erc20Transfers[1]);
    await this.saveTransactionHistory(chainId, sumAddress, txHash, '[User] Principal Withdraw', productId, amountToken, timestamp, tokenSymbol, decimals);
    await this.productService.updateCurrentCapacity(chainId, productAddress);
    await this.removeroductIdUser(productId, sumAddress);
  }

  //userOptionPositionPaid - [SuperHedge] Early Withdraw - Option Payout (Airdrop)
  async optionWithdrawalPaid(body: any,chainId: number ,productAddress: string){
    console.log("Executing optionWithdrawalPaid");
    await this.productService.updateOptionPaidStatus(productAddress)
    const txHash = body.logs[0].transactionHash;
    const amountToken = '0';
    const timestamp = body.block.timestamp
    const {sumAddress} = await this.checkSumAddress(productAddress);
    const { productId } = await this.getProductId(productAddress, chainId);
    await this.saveTransactionHistory(chainId, "Admin", txHash, '[SuperHedge] Early Withdraw - Option Payout (Airdrop)', productId, amountToken, timestamp,'',0);
  }

  //coupon - [SuperHedge] Coupon Credited
  async couponCredited(body: any,chainId: number ,productAddress: string){
    console.log("Executing couponCredited");
    const txHash = body.logs[0].transactionHash;
    const amountToken = '0';
    const timestamp = body.block.timestamp
    const { productId } = await this.getProductId(productAddress, chainId);
    await this.saveTransactionHistory(chainId, "Admin", txHash, '[SuperHedge] Option Coupon Credit', productId, amountToken, timestamp,'',0);
  }

  //withdrawCoupon - [User] Coupon Withdraw
  async withdrawCoupon(body: any,chainId: number ,productAddress: string){
    console.log("Executing withdrawCoupon");
    const txHash = body.logs[0].transactionHash;
    const timestamp = body.block.timestamp
    // const timestamp = new Date(body.block.timestamp * 1000).toISOString().replace('T', ' ');
    const userAddress =  body.txs[0].fromAddress;
    const amountToken = body.erc20Transfers[0].value;
    const {sumAddress} = await this.checkSumAddress(userAddress);
    const { productId } = await this.getProductId(productAddress, chainId);
    const {tokenSymbol, decimals} = await this.getTokenInformation(body.erc20Transfers[0]);
    await this.saveTransactionHistory(chainId, sumAddress, txHash, '[User] Coupon Withdraw', productId, amountToken, timestamp, tokenSymbol, decimals);
  }

  //redeemOptionPayout() - [SuperHedge] Option Profit Credit
  async redeemOptionPayout(body: any,chainId: number ,productAddress: string){
    console.log("Executing redeemOptionPayout");
    const txHash = body.logs[0].transactionHash;
    const amountToken = '0';
    const timestamp = body.block.timestamp
    const { productId } = await this.getProductId(productAddress, chainId);
    await this.saveTransactionHistory(chainId, "Admin", txHash, '[SuperHedge] Option Payout Credit', productId, amountToken, timestamp,'',0);
  }

  //withdrawOption - [User] Option Payout Withdraw
  async withdrawOption(body: any,chainId: number ,productAddress: string){
    console.log("Executing withdrawOption");
    const txHash = body.logs[0].transactionHash;
    const userAddress =  body.txs[0].fromAddress;
    const amountToken = body.erc20Transfers[0].value;
    const timestamp = body.block.timestamp
    const {sumAddress} = await this.checkSumAddress(userAddress);
    const { productId } = await this.getProductId(productAddress, chainId);
    const {tokenSymbol, decimals} = await this.getTokenInformation(body.erc20Transfers[0]);
    await this.saveTransactionHistory(chainId, sumAddress, txHash, '[User] Option Payout Withdraw', productId, amountToken, timestamp, tokenSymbol, decimals);
  }


  //earlyWithdraw - [User] Early Withdraw 
  async earlyWithdraw(body: any,chainId: number ,productAddress: string){
    console.log("Executing earlyWithdraw");
    const txHash = body.logs[0].transactionHash;
    const userAddress =  body.txs[0].fromAddress;
    const amountToken = body.erc20Transfers[0].value;
    const timestamp = body.block.timestamp
    const {sumAddress} = await this.checkSumAddress(userAddress);
    const { productId } = await this.getProductId(productAddress, chainId);
    const {tokenSymbol, decimals} = await this.getTokenInformation(body.erc20Transfers[0]);
    await this.saveTransactionHistory(chainId, sumAddress, txHash, '[User] Early Withdraw - Confirm', productId, amountToken, timestamp, tokenSymbol, decimals);
    await this.saveTransactionHistory(chainId, sumAddress, txHash, '[User] Early Withdraw - Principal (Market Price)', productId, amountToken, timestamp, tokenSymbol, decimals);
    console.log(body.block.timestamp)
  }

  //redeemYield - [SuperHedge] Principal Credit
  async redeemYield(body: any,chainId: number ,productAddress: string){
    console.log("Executing redeemYield");
    const txHash = body.logs[0].transactionHash;
    console.log(body)
    const amountToken = '0';
    const timestamp = body.block.timestamp
    console.log(productAddress)
    const { productId } = await this.getProductId(productAddress, chainId);
    console.log(productId)
    await this.saveTransactionHistory(chainId, "Admin", txHash, '[SuperHedge] Principal Credit', productId, amountToken, timestamp,'',0);
  }

  // Create a mapping between method IDs and functions
  methodMap: { [key: string]: (body: any, chainId: number, productAddress: string) => Promise<void> } = {
    '0xb3ea322d': (_, chainId, productAddress) => this.fundAccept(chainId, productAddress),
    '0x7389250b': (_, chainId, productAddress) => this.Lock(chainId, productAddress),
    '0x863623bb': (_, chainId, productAddress) => this.Issuance(chainId, productAddress),
    '0x87b65207': (_, chainId, productAddress) => this.Mature(chainId, productAddress),

    '0xb6b55f25': (body, chainId, productAddress) => this.Deposit(body, chainId, productAddress),
    '0xe1f06f54': (body, chainId, productAddress) => this.WithdrawPrincipal(body, chainId, productAddress),
    '0xf399efe8': (body, chainId, productAddress) => this.couponCredited(body, chainId, productAddress),
    '0x6d2b8111': (body, chainId, productAddress) => this.withdrawCoupon(body, chainId, productAddress),
    '0xf0d427c4': (body, chainId, productAddress) => this.redeemOptionPayout(body, chainId, productAddress),
    '0xf78705c3': (body, chainId, productAddress) => this.withdrawOption(body, chainId, productAddress),
    '0xc7999408': (body, chainId, productAddress) => this.redeemYield(body, chainId, productAddress),


    '0x6b5b9696': (body, chainId, productAddress) => this.earlyWithdraw(body, chainId, productAddress),
    '0x8fe0a864': (body, chainId, productAddress) => this.optionWithdrawalPaid(body, chainId, productAddress),

    '0xe2fc4d4d': (_, chainId, productAddress) => this.updateProductInformation(chainId, productAddress),
    '0x42966c68': (_, chainId, productAddress) => this.updateProductInformation(chainId, productAddress),
  };

  async handleWebhook(body: any) {
    const chainId = parseInt(body.chainId, 16);
    console.log(body.logs[0])

    const productAddress = body.txs[0].toAddress;
    console.log("Chain ID:", chainId);

    const { sumAddress } = await this.checkSumAddress(productAddress);
    console.log("Product Address:", sumAddress);

    const methodId = body.txs[0].input.slice(0, 10);
    await this.executeMethod(body, chainId, methodId, sumAddress);
  }

  async updateProductInformation(chainId: number, productAddress: string) {
    console.log("Executing updateProductInformation");
    await this.productService.updateProductInformation(chainId, productAddress);
  }


  async checkSumAddress(address: string): Promise<{sumAddress:string}> {
    const sumAddress = ethers.utils.getAddress(address);
    return { sumAddress };
  }

  async saveProductIdUser(productId: number,userAddress: string) {
    try {
      await this.userRepository.saveProductId(userAddress, productId);
      console.log("Product ID saved to user entity");
    } catch (e) {
      console.log(e);
    }
  }

  async removeroductIdUser(productId: number,userAddress: string) {
    try {
      await this.userRepository.removeProductId(userAddress, productId);
      console.log("Product ID removed from user entity");
    } catch (e) {
      console.log(e);
    }
  }

  async getProductId(productSumAddress: string, chainId: number): Promise<{productId: number}> {
    const product = await this.productRepository.findOne({
      where: {
        address: productSumAddress,
        chainId: chainId,
        isPaused: false,
      },
    });
    const productId = Number(product?.id);
    return { productId };
  }

  async saveTransactionHistory(chainId: number, userAddress: string, txHash: string, eventName: string, productId: number, amountToken: string, timestamp: any, tokenSymbol: string, decimals: number) {
    try {
      let withdrawType: WITHDRAW_TYPE = WITHDRAW_TYPE.NONE;
      let type: HISTORY_TYPE; 
      console.log(eventName);

      switch (eventName) {
        case "[User] Principal Withdraw":
          withdrawType = WITHDRAW_TYPE.PRINCIPAL;
          type = HISTORY_TYPE.WITHDRAW;
          break;
        case '[SuperHedge] Option Coupon Credit':
          type = HISTORY_TYPE.COUPON_CREDIT;
          break;
        case '[SuperHedge] Principal Credit':
          type = HISTORY_TYPE.PRINCIPAL_CREDIT;
          break;
        case '[User] Coupon Withdraw':
          type = HISTORY_TYPE.WITHDRAW;
          withdrawType = WITHDRAW_TYPE.COUPON;
          break;
        case '[User] Option Payout Withdraw':
          type = HISTORY_TYPE.WITHDRAW;
          withdrawType = WITHDRAW_TYPE.OPTION;
          break;
        case '[SuperHedge] Option Profit Credit':
          type = HISTORY_TYPE.OPTION_PROFIT_CREDIT;
          break;
        case '[User] Early Withdraw - Confirm':
          type = HISTORY_TYPE.EARLY_WITHDRAW;
          break;
        default:
          type = HISTORY_TYPE.DEPOSIT;
      }

      // Ensure amountToken is a valid string representation of a number
      if (!amountToken || isNaN(Number(amountToken))) {
        throw new Error(`Invalid amountToken value: ${amountToken}`);
      }

      // Convert amountToken to BigNumber safely
      const amountBigNumber = ethers.BigNumber.from(amountToken.toString());

      await this.historyRepository.createHistory(
        chainId,
        userAddress,
        amountBigNumber, // Use the BigNumber here
        txHash,
        0,
        type,
        withdrawType,
        productId,
        ethers.BigNumber.from('0'),
        ethers.BigNumber.from('0'),
        undefined,
        eventName,
        new Date(timestamp * 1000).toISOString(),
        tokenSymbol,
        decimals
      );
      
      console.log("History saved");
    } catch (error) {
      console.error('Error saving transaction history:', error);
      throw error;
    }
  }

  // Function to execute the corresponding method based on input
  async executeMethod(body: any, chainId: number, methodId: string, productAddress: string): Promise<void> {
    const methodFunction = this.methodMap[methodId];
    
    if (methodFunction) {
      await methodFunction(body, chainId, productAddress);
    } else {
      console.error("Method ID not recognized:", methodId);
    }
  }

}