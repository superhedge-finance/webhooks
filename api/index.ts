import { PlatformExpress } from "@tsed/platform-express";
import { Server } from "../src/Server";

let cachedHandler: any;

export default async function handler(req: any, res: any) {
  if (!cachedHandler) {
    const platform = await PlatformExpress.bootstrap(Server);
    cachedHandler = platform.callback();
  }
  return cachedHandler(req, res);
}
