import "dotenv/config";

import express, { Request, Response, NextFunction } from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { decrypt } from "./libs/decrypt.js";
import { RouteInfo } from "./libs/types.js";
import { execRoutes, updateLocation } from "./libs/whooClient.js";
import { getWhooUsers } from "./libs/database.js";

declare module "http" {
  interface IncomingMessage {
    decryptedToken: string;
  }
}

setInterval(async () => {
  try{
    const whooUsers = await getWhooUsers();
    const results = await Promise.allSettled(whooUsers.map(async (user) => {
      if (!user.latitude || !user.longitude) return;
      await updateLocation({
        token: user.token,
        latitude: user.latitude,
        longitude: user.longitude,
        speed: 0,
        stayedAt: user.stayed_at,
        batteryLevel: user.battery_level ?? 100,
        isActive: false,
      });
    }));
    const errorResults = results.filter((result) => result.status === "rejected");
    if (errorResults.length > 0) {
      console.error(errorResults);
      throw new Error(errorResults.map(result => result.reason).join(", "));
    }
    console.log("location update is done.");
  } catch (error) {
    console.error(error);
    }
}, 30 * 1000);

const app = express();
const wss = new WebSocketServer({noServer: true});
setInterval(() => {
  wss.clients.forEach(client => client.send("ping"));
}, 10000);

const port = 3001;

const clients = new Map<string, WebSocket>();

app.use((req: Request, res: Response, next: NextFunction) => {
  console.log("request received");
  const token = req.query.token;
  req.decryptedToken = decrypt(token as string);
  if (!req.decryptedToken) {
    console.log("No token");
    res.status(400).send("No token");
    return;
  }
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req: Request, res: Response) => {
  const token = req.query.token;
  const decryptedToken = decrypt(token as string);
  res.send(`token is ${decryptedToken}`);
});

app.post("/api/execRoutes", async (req: Request, res: Response) => {
  const token = req.decryptedToken;
  const { routes, interval, batteryLevel, speed, expires } = req.body as RouteInfo;
  console.log("execRoutes api is called");
  try {
    execRoutes({ token, routes, interval, speed, batteryLevel, clients, expires: expires ? new Date(expires) : null });
  } catch (e) {
    console.error(e);
    res.status(500).send("Internal Server Error");
    return;
  }
  res.send("success");
});

const server = createServer(app);

server.on("upgrade", (request, socket, head) => {
  if (!request.url) {
    console.log("No URL");
    socket.destroy();
    return;
  }
  const searchParams = new URL(request.url, `http://${request.headers.host}`).searchParams;
  const token = searchParams.get("token");
  const decryptedToken = decrypt(token as string);
  if (!decryptedToken) {
    console.log("No token");
    socket.destroy();
    return;
  } else if (clients.has(decryptedToken)) {
    clients.get(decryptedToken)?.close();
  }
  wss.handleUpgrade(request, socket, head, (ws) => {
    clients.set(decryptedToken, ws);
    wss.emit("connection", ws, request);
  });
});

wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    console.log("Received message:", message.toString());
  });
  ws.on("close", () => {
    const targetToken = Array.from(clients.keys()).find((key) => clients.get(key) === ws);
    if (targetToken) {
      clients.delete(targetToken);
    }
  });
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});