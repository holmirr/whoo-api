import "dotenv/config";

import express, { Request, Response, NextFunction } from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { decrypt } from "./libs/decrypt.js";
import { RouteInfo } from "./libs/types.js";
import { execRoutes, ReflectLocations } from "./libs/whooClient.js";
import { IncomingMessage } from "http";

declare module "http" {
  interface IncomingMessage {
    decryptedToken?: string;
  }
}

declare module "ws" {
  interface WebSocket {
    isActive?: boolean;
  }
}

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
const REFLECT_INTERVAL = 30 * 1000;

const app = express();
// appをhttp.serverに渡すことで"connection"イベントが自動的にappに渡る。
const server = createServer(app);
// もしコンストラクタ引数にserverを渡すと、upgradeイベントが自動的にwssに渡るだけでなく、自動的に接続を完了してしまう。
const wss = new WebSocketServer({ noServer: true });

setInterval(() => {
  wss.clients.forEach(client => client.ping());
}, 10000);

const clientsMap = new Map<string, WebSocket>();
const isWalkingSet = new Set<string>();

// wsクライアント一覧を回し、isActiveがfalseなクライアントをterminate()する。
// isActiveをfalseにした後、ping()を実行することで、pongが帰ってきたらすぐにisActiveがtrueになる。
// pongが帰ってこなかったらisActiveはfalseのまま。
const checkConnection = () => {
  wss.clients.forEach((ws) => {
    if (!ws.isActive) {
      ws.terminate();
      // terminate()後、ws.readyStateはCLOSEDになり、oncloseが呼ばれる(onerrorは呼ばれない, クライアントではonerror→onclose)
      // return;しないとws.ping()が実行され、エラーになる
      return;
    }
    ws.send("ping");
    ws.isActive = false;
  })
}

// 定期的に(1)dbから位置情報を取得しwhooに反映、(2)クライアントの接続状況を確認する（死んでいる接続のクライアントを破棄する）
const interval = setInterval(() => {
  // イベントループを用い、(1)と(2)を並行して実行する。
  ReflectLocations().catch((error) => {
    console.error(error);
  });
  try {
    checkConnection();
  } catch (error) {
    console.error(error);
  }
}, REFLECT_INTERVAL);

// パスを指定しないuse()なのですべてのhttpリクエストに対して実行されるミドルウェア
// クライアントからのリクエストのsearchParamsから暗号化されたtokenを取得し、復号し、request.decryptedTokenに格納し、次のミドルウェアに渡す
app.use((req: Request, res: Response, next: NextFunction) => {
  const token = req.query.token;
  try {
    // searchParamsに?token=が含まれていない場合は、エラーを投げる
    if (!token) {
      throw new Error("No token");
    }
    // 復号に失敗した場合は、catchブロックに飛ぶ
    req.decryptedToken = decrypt(token as string);
    next();
  } catch (error) {
    console.error(error);
    res.status(400).send("Bad Request");
  }
});

// requestボディをjsオブジェクトやstringに変換してくれる
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// testパス
// ルートにアクセスすると復号化されたtokenを表示
app.get("/", (req: Request, res: Response) => {
  const token = req.query.token;
  const decryptedToken = decrypt(token as string);
  res.send(`token is ${decryptedToken}`);
});

// 歩く際に実行されるAPI
app.post("/api/execRoutes", (req: Request, res: Response) => {
  // decryptedTokenは最初のミドルウェアでプロパティに追加されていることが確実なのでas stringで教えてあげる
  const token = req.decryptedToken as string;

  // jsonミドルウェアによってrequest.bodyにjsonをjsオブジェクトに変換して格納されている。
  const { routes, interval, batteryLevel, speed, expiresDate } = req.body as RouteInfo;
  console.log("execRoutes api is called");

  // execRoutes()は最初のawaitに遭遇するまでは同期的に、await以降は戻り値としてPromiseを返し、非同期的にPromiseチェーンで実行される。
  // まず同期的処理でclients.has(token)をチェックし、なければエラーを投げる→catchで補足され、res.send()でエラーメッセージを返信する。
  // その後、非同期処理部分を実行するが、結果とエラーはPromiseチェーンで補足され、apiのレスポンスとしてではなくwebsocketのメッセージとして送信する。
  try {
    // まず、websocketの接続状況をチェックする。もし接続していなければ、エラーを投げる。
    // ※execRoute()内において最初のawait前の処理自体は同期的だが、同部位のエラーに関しては非同期的に補足される。（つまり、呼び出し元で捉える場合、await+try-catchで囲むか、.catch()で補足するかの２択）
    // 歩行中全時間においてWebSocket接続は必須ではないが、最初くらいは接続していてほしい。
    if (!clientsMap.has(token)) {
      throw new Error("WebScoket connection is not established");
    }
  } catch (e) {
    console.error(e);
    res.status(500).send((e as Error).message);
    return;
  }
  execRoutes({ token, routes, interval, speed, batteryLevel, clientsMap, isWalkingSet, expires: expiresDate ? new Date(expiresDate) : null });
  res.send("success");
});

// "upgrade"イベントはexpress.jsのappはハンドリングできない。（express.jsのappは"connection"イベントのみハンドリングできる）
server.on("upgrade", (request, socket, head) => {
  try {
    // なぜかrequest.urlがundefinedになることがあるらしいので、typescriptのためのチェック
    if (!request.url) {
      throw new Error("No URL");
    }
    // クライアントからのリクエストにtokenが含まれているかチェック(tokenは共通鍵で暗号化されている)
    const searchParams = new URL(request.url, `http://${request.headers.host}`).searchParams;
    const token = searchParams.get("token");

    // 復号し、request.decryptedTokenに格納する
    // 復号に失敗した場合は、catchブロックに飛び、socket.destroy()で接続を切る
    const decryptedToken = decrypt(token as string);
    request.decryptedToken = decryptedToken;

    // クライアントがすでに接続している場合は、すでに接続しているクライアントをclose()する
    // closeハンドラーでclientsMapからwsオブジェクトは削除してくれる。
    clientsMap.get(decryptedToken)?.close();

    // request, socket, headをhttp.serverのコールバックからwss.handleUpgrade()に渡す。
    // wssに処理を移譲し、wss.handleUpgrade()がupgradeリクエストを処理し、接続を確立する。
    wss.handleUpgrade(request, socket, head, (ws) => {
      // 接続を確立したら、クライアント一覧に追加する
      clientsMap.set(decryptedToken, ws);
      // emit()はonConnectionのコールバックを呼ぶ。(haneleUpgradeはコネクションを確立してもコールバックまでは呼ばない）
      wss.emit("connection", ws, request);
    });
  } catch (error) {
    console.error(error);
    // エラーが起きたら、socketを破棄する
    socket.destroy();
    return;
  }

});

wss.on("connection", (ws, request: IncomingMessage) => {
  ws.isActive = true;
  console.log(`${(request.decryptedToken as string).slice(0, 10)}... connection is established`);

  // ユーザが移動中かどうかを接続のたびにクライアントに通知する。
  try {
    if (isWalkingSet.has(request.decryptedToken as string)) {
      ws.send(JSON.stringify({
        type: "walking",
        data: true,
      }));
    } else {
      ws.send(JSON.stringify({
        type: "walking",
        data: false,
      }));
    }
  } catch (error) {
    console.error(error);
  }


  // クライアントからのメッセージを受信する
  ws.on("message", (data: Buffer) => {
    ws.isActive = true;
    // もしメッセージがpongならisActiveを更新しただけで役目は終わり。.parse()するとエラーになってしまう。
    if (data.toString() === "pong") return;

    try {
      const message = JSON.parse(data.toString());
      switch (message.type) {
        // stopメッセージを受信したら、歩行中のユーザーから削除する。→execRoutes()のループ内で感知され、ループが停止する。
        case "stop":
          isWalkingSet.delete(request.decryptedToken as string);
          setTimeout(() => ws.send(JSON.stringify({
            type: "stop",
          })), 5000);
          break;
      }
    } catch (e) {
      console.error(e);
    }
  });

  // 正常終了でも異常終了でもどちらでもoncloseが呼ばれる（サーバーからの終了でもクライアントからの終了でも）
  // 裏側ではws.readyStateはCLOSEDになる(wsの参照がどこかで維持されていたら、wsオブジェクト自体は消えない→手動で消す必要あり)
  // ws.readyStateがCLOSEの状態でws.send()やws.ping()を実行するとエラーになる
  ws.on("close", () => {
    const targetToken = request.decryptedToken as string;
    console.log(`${targetToken.slice(0, 10)}... connection is closed`);
    if (targetToken) {
      clientsMap.delete(targetToken);
    }
  });

  // クライアントからのTCP接続強制切断(socket.destroy()など)
  // WebScoketプロトコルを無視した不正なデータの受信
  // 上記の場合にonerrorが呼ばれて、次にoncloseが呼ばれる。
  // ただし、destroy()すらしない場合（電源抜くorWifi切断など）はonerrorもoncloseも呼ばれない。
  // →一定時間応答がなければ、onerror→oncloseが呼ばれるが、環境によってその時間が異なる→明示的にping, pongで時間を設定し、接続を確認する必要あり
  ws.on("error", (error) => {
    console.error(error);
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});