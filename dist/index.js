var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import "dotenv/config";
import express from "express";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import { decrypt } from "./libs/decrypt.js";
import { execRoutes, updateLocation } from "./libs/whooClient.js";
import { getWhooUsers } from "./libs/database.js";
setInterval(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const whooUsers = yield getWhooUsers();
        const results = yield Promise.allSettled(whooUsers.map((user) => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            if (!user.latitude || !user.longitude)
                return;
            yield updateLocation({
                token: user.token,
                latitude: user.latitude,
                longitude: user.longitude,
                speed: 0,
                stayedAt: user.stayed_at,
                batteryLevel: (_a = user.battery_level) !== null && _a !== void 0 ? _a : 100,
                isActive: false,
            });
        })));
        const errorResults = results.filter((result) => result.status === "rejected");
        if (errorResults.length > 0) {
            console.error(errorResults);
            throw new Error(errorResults.map(result => result.reason).join(", "));
        }
        console.log("location update is done.");
    }
    catch (error) {
        console.error(error);
    }
}), 30 * 1000);
const app = express();
const wss = new WebSocketServer({ noServer: true });
setInterval(() => {
    wss.clients.forEach(client => client.send("ping"));
}, 10000);
const port = 3001;
const clients = new Map();
app.use((req, res, next) => {
    console.log("request received");
    const token = req.query.token;
    req.decryptedToken = decrypt(token);
    if (!req.decryptedToken) {
        console.log("No token");
        res.status(400).send("No token");
        return;
    }
    next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get("/", (req, res) => {
    const token = req.query.token;
    const decryptedToken = decrypt(token);
    res.send(`token is ${decryptedToken}`);
});
app.post("/api/execRoutes", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const token = req.decryptedToken;
    const { routes, interval, batteryLevel, speed } = req.body;
    console.log("execRoutes api is called");
    try {
        execRoutes({ token, routes, interval, speed, batteryLevel, clients });
    }
    catch (e) {
        console.error(e);
        res.status(500).send("Internal Server Error");
        return;
    }
    res.send("success");
}));
const server = createServer(app);
server.on("upgrade", (request, socket, head) => {
    var _a;
    if (!request.url) {
        console.log("No URL");
        socket.destroy();
        return;
    }
    const searchParams = new URL(request.url, `http://${request.headers.host}`).searchParams;
    const token = searchParams.get("token");
    const decryptedToken = decrypt(token);
    if (!decryptedToken) {
        console.log("No token");
        socket.destroy();
        return;
    }
    else if (clients.has(decryptedToken)) {
        (_a = clients.get(decryptedToken)) === null || _a === void 0 ? void 0 : _a.close();
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
