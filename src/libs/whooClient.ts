import MyFetch from "@holmirr/myfetch";
import { UpdateLocationData, LocationData, LoginResponse, MyInfoResponse, Route } from "./types.js";
import { WebSocket } from "ws";
import { saveWhooUser, updateIsNoExec, getWhooUsers } from "./database.js";

const { fetch, client } = MyFetch.create({
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
export async function execRoutes({ token, routes, interval, speed, batteryLevel, clients, expires }: {
  token: string,
  routes: Route[],
  interval: number,
  speed: number,
  batteryLevel: number,
  clients: Map<string, WebSocket>,
  expires: Date | null
}) {
  await updateIsNoExec(token, true);
  console.log("no_exec is set to true.\nstart to exec routes");
  for (const route of routes) {
    try {
      await updateLocation({
        token,
        latitude: route.lat,
        longitude: route.lng,
        speed, // km/h
        batteryLevel
      })
      clients.get(token)?.send(JSON.stringify({
        type: "location",
        data: route,
        id: 0
      }));
      await new Promise(resolve => setTimeout(resolve, interval * 1000));
    } catch (e) {
      console.error(e);
    }
  }
  console.log("routes are executed");
  await updateLocation({
    token,
    latitude: routes[routes.length - 1].lat,
    longitude: routes[routes.length - 1].lng,
    speed: 0,
    batteryLevel,
    stayedAt: new Date(),
  });
  console.log("final location is updated");
  await saveWhooUser({
    token,
    lat: routes[routes.length - 1].lat,
    lng: routes[routes.length - 1].lng,
    stayedAt: new Date(),
    batteryLevel,
    noExec: false,
    expires: expires
  });
  console.log("routes are stored in db.\nno_exec is set to false");
}

export async function ReflectLocations() {
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
    const successResultsLength = results.filter((result) => result.status === "fulfilled").length;
    console.log(`location update is done. ${successResultsLength} users are updated.`);
}