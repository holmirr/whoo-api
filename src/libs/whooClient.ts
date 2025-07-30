import MyFetch from "@holmirr/myfetch";
import { UpdateLocationData, LocationData, LoginResponse, MyInfoResponse, Route } from "./types.js";
import { WebSocket } from "ws";
import { saveWhooUser, updateIsNoExec, getWhooUsers, deleteLatLng } from "./database.js";

const { fetch } = MyFetch.create({
  defaultHeaders: {
    "Content-Type": "application/x-www-form-urlencoded",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Accept": "application/json",
    "User-Agent": "app.whoo/0.33.3 iOS/18.3.2",
    "Accept-Language": "en-JP",
  },
});

export async function login(email: string, password: string) {
  const response = await fetch("https://www.wh00.ooo/api/email/login", {
    method: "POST",
    body: new URLSearchParams({ email, password }),
  });

  const data = await response.json() as LoginResponse;
  if (data.errors) {
    console.log(data.errors);
    throw new Error(data.errors);
  }
  return data.access_token;
}

// speed: km/h, batteryLevel: 0-1,
export async function updateLocation({ token, latitude, longitude, speed, batteryLevel, stayedAt, isCharging = false, isActive = false, }:
  {
    token: string,
    latitude: number,
    longitude: number,
    speed: number,
    batteryLevel: number,
    stayedAt?: Date | null,
    isCharging?: boolean,
    isActive?: boolean
  }) {
  const data: UpdateLocationData = {
    "user_location[latitude]": latitude.toString(),
    "user_location[longitude]": longitude.toString(),
    "user_location[speed]": (speed / 3.6).toString(), // km/h to m/s
    "user_location[getting_location_type]": "5",
    "user_location[horizontal_accuracy]": "1",
    "app_state[active]": isActive ? "true" : "false",
    "user_battery[level]": batteryLevel.toString(),
    "user_battery[state]": isCharging ? "0" : "1",
    "user_device[os_info]": "ios",
    "user_device[os_version]": "0.0"
  };

  if (stayedAt) {
    data["user_location[stayed_at]"] = stayedAt.toLocaleString(
      "ja-JP",
      {
        timeZone: "UTC",
      })
      .replace(/\//g, "-") + " +0000";
  }
  const response = await fetch("https://www.wh00.ooo/api/user/location", {
    method: "PATCH",
    body: new URLSearchParams(data),
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });
  return response.json() as Promise<UpdateLocationData>;
}

export async function getFriendsInfo(token: string) {
  const res = await fetch("https://www.wh00.ooo/api/locations", {
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });
  const { locations } = await res.json() as LocationData;
  if (!locations) throw new Error("locations not found");
  return locations;
}

export async function getMyInfo(token: string) {
  const res = await fetch("https://www.wh00.ooo/api/my", {
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });
  const data = await res.json() as MyInfoResponse;
  if (data.errors) {
    console.log(data.errors);
    throw new Error(data.errors);
  }
  return data.user;
}

// interval: seconds, speed: km/h, batteryLevel: 0-1
// 歩行時の位置情報をwhooに反映し、websocketでクライアントに位置情報を送信する。
export async function execRoutes({ token, routes, interval, speed, batteryLevel, clientsMap, isWalkingSet, expires }: {
  token: string,
  routes: Route[],
  interval: number,
  speed: number,
  batteryLevel: number,
  clientsMap: Map<string, WebSocket>,
  isWalkingSet: Set<string>,
  expires: Date | null
}) {
  // 以降よく使うので、WebSocket経由でメッセージを送信する関数を定義。
  // もしWebSocket接続がない、もしくは接続が閉じていたら、.send()を実行しない。
  // 仮にエラーが起きても、素通りさせる。
  const sendMessage = (message: string) => {
    try {
      const ws = clientsMap.get(token);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    } catch (e) {
      console.error(e);
    }
  }

  
  // 歩行中のフラグをtokenに紐づけて立てる
  isWalkingSet.add(token);

  // 以降は非同期処理でPromiseチェーンとして実行される。
  // エラーや結果はwebsocketのメッセージとして送信する。（WebSocket接続がなければ、送らない）

  // まずは通常の位置情報更新と被らないようにno_execをtrueにする。
  // これはエラーが起きたらクライアントにws.send()でエラーメッセージを送信し、処理を終了。
  try {
    await updateIsNoExec(token, true);
    console.log("no_exec is set to true.\nstart to exec routes");
  } catch (e) {
    console.error(e);
    sendMessage(JSON.stringify({
      type: "error",
      finish: true,
      data: (e as Error).message,
      detail: "error in no_exec update"
    }));
    return;
  }

  let lastIndex = 0;
  let errroCount = 0;

  for (const route of routes) {
    // forループの中ではエラーが起こっても、エラーカウントを増やし次のループに進む（３回エラーが起きたらforループを強制終了）
    try {
      // もしstopボタンが押されていたら、WebSocket経由でstopメッセージを受信し、isWalkingSetからtokenが削除されている。
      // stopされたらforループを強制終了し、最後の位置情報を更新する。
      if (!isWalkingSet.has(token)) {
        sendMessage(JSON.stringify({
          type: "stopped",
          finish: false,
          data: lastIndex - 1,
          detail: "stop button is pushed and for-loop is finished"
        }));
        break;
      }

      // whooの位置情報を更新する
      await updateLocation({
        token,
        latitude: route.lat,
        longitude: route.lng,
        speed, // km/h
        batteryLevel
      })

      // 位置情報を更新したら、目印であるlastIndexを増やす。
      lastIndex++;

      // 位置情報を更新したら、WebSocket経由でlocationメッセージを送信する。→クライアントの地図上でも位置情報を更新する。
      sendMessage(JSON.stringify({
        type: "location",
        finish: false,
        data: {
          lat: route.lat,
          lng: route.lng,
          id: 0
        },
        detail: `location is updated. ${lastIndex}/${routes.length} routes are executed`
      }));

      // 位置情報を更新したら、interval秒待つ。
      await new Promise(resolve => setTimeout(resolve, interval * 1000));

    } catch (e) {
      console.error(e);
      // エラーが起きたら、エラーカウントを増やし、次のループに進む。
      errroCount++;
      lastIndex++;

      // WebSocket経由でerrorメッセージを送信する
      sendMessage(JSON.stringify({
        type: "error",
        finish: false,
        data: (e as Error).message,
        detail: `error in for-loop. error count: ${errroCount}`
      }));

      // エラーが３回以上起きたら、forループを強制終了し、最後の位置情報を更新する。
      // クライアントには最終インデックスを送信する。
      if (errroCount > 3) {
        sendMessage(JSON.stringify({
          type: "error",
          finish: false,
          data: lastIndex,
          detail: "Too many errors. stop for-loop"
        }));
        break;
      }
    }
    console.log(`${lastIndex - 1} routes are executed`);
  }

  try {
    // whooの最後の位置情報を更新する（スピードを0にして、最終位置情報で止まった状態にする）
    await updateLocation({
      token,
      latitude: routes[lastIndex - 1].lat,
      longitude: routes[lastIndex - 1].lng,
      speed: 0,
      batteryLevel,
      stayedAt: new Date(),
    });
    console.log("final location is updated");

    // 最後の位置情報をdbに保存する（statyed_atは現在時刻）
    // no_execはfalseにして、定例の位置情報更新を再開する。
    // expiresはapiルートからの情報をそのまま使う。
    await saveWhooUser({
      token,
      lat: routes[routes.length - 1].lat,
      lng: routes[routes.length - 1].lng,
      stayedAt: new Date(),
      batteryLevel,
      noExec: false,
      expires: expires
    });
    console.log("final location is stroed in db and no_exec is set to false");

    // 最後の位置情報を更新したら、WebSocket経由でsuccessメッセージを送信する。
    sendMessage(JSON.stringify({
      type: "success",
      finish: true,
      data: "success",
      detail: "final location is stroed in db and no_exec is set to false"
    }));
  } catch (e) {
    console.error(e);
    // 最後の位置情報更新に失敗したら、WebSocket経由でerrorメッセージを送信する。
    sendMessage(JSON.stringify({
      type: "error",
      finish: true,
      data: (e as Error).message,
      detail: "error in final location update or db update."
    }));
    // 
    await updateIsNoExec(token, false);
  } 
  // 成功しても失敗しても、歩行中フラグを削除する。
  finally {
    isWalkingSet.delete(token);
  }
}

// 定期的に実行される、dbに保存されている位置情報をwhooに反映する関数。
export async function ReflectLocations() {
  // dbからwhooユーザー一覧を取得する(戻り値はrowオブジェクトのリスト)
  // WHERE no_exec = false で、歩行中でないユーザーを取得している。
  const rows = await getWhooUsers();
  
  // 取得したrowオブジェクトのリストをmapで処理し、Promiseのリストにする。
  // もしlatitudeやlongitudeがnullなら、既にexpiresされているのでスキップする。
  // PromiseのリストをPromise.allSettled()で実行し、結果のリストを取得する。
  // 結果は({status: "fulfilled", value: undefined}|{status: "rejected", reason: Error})[] の配列になる。
  const results = await Promise.allSettled(rows.map(async (row) => {
    // Promise.allSettled()の引数のリストの要素valueはPromise型以外でも良い。
    // .all()や.allSettled()は内部で各要素に対してPromise.resolve(value)を実行するので、Promise型なら変わらず、定値なら即座にfullfilledされるPromiseになる。
    if (!row.latitude || !row.longitude) return;

    // もしexpiresが無期限でなく、現在時刻より過去なら、dbから位置情報やその他情報を削除し、undefinedを返す。  
    if (row.expires && row.expires < new Date()) {
      await deleteLatLng(row.token);
      return;
    }

    // 位置情報を更新する。
    await updateLocation({
      token: row.token,
      latitude: row.latitude,
      longitude: row.longitude,
      speed: 0,
      stayedAt: row.stayed_at,
      batteryLevel: row.battery_level ?? 100,
      isActive: false,
    });
    // もし更新したら1を返し、スキップで返すundefinedと区別する。
    return 1;
  }));

  // エラーが起きたPromiseのリストを取得する。
  const errorResults = results.filter((result) => result.status === "rejected");
  if (errorResults.length > 0) {
    console.error(errorResults);
    throw new Error(errorResults.map(result => result.reason).join(", "));
  }

  // 成功したPromiseの数を取得する。
  // lat,lngがnullの場合とexpiresが過去の場合はundefinedを返し、スキップされているので、成功したPromiseの数には含めない。成功したPromiseは1を返している。
  const successResultsLength = results.filter((result) => result.status === "fulfilled" && result.value !== undefined).length;
  console.log(`location update is done. ${successResultsLength} users are updated.`);
}