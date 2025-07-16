import express from "express";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import { decrypt } from "./libs/decrypt.js";
const app = express();
const wss = new WebSocketServer({ noServer: true });
setInterval(() => {
    wss.clients.forEach(client => client.send("ping"));
}, 10000);
const port = 3001;
const clients = new Map();
app.use((req, res, next) => {
    const token = req.query.token;
    const decryptedToken = decrypt(token);
    if (!decryptedToken) {
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
        console.log("Client already connected");
        (_a = clients.get(decryptedToken)) === null || _a === void 0 ? void 0 : _a.close();
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
        console.log("handleUpgrade");
        clients.set(decryptedToken, ws);
        wss.emit("connection", ws, request);
    });
});
wss.on("connection", (ws) => {
    console.log("connection callback");
    ws.on("message", (message) => {
        console.log("Received message:", message.toString());
    });
    ws.on("close", () => {
        console.log("close callback");
        const targetToken = Array.from(clients.keys()).find((key) => clients.get(key) === ws);
        if (targetToken) {
            clients.delete(targetToken);
            console.log("ws of Map is deleted");
        }
    });
});
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
