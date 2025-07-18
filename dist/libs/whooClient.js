var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import MyFetch from "@holmirr/myfetch";
import { saveWhooUser, updateIsNoExec } from "./database.js";
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
export function login(email, password) {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield fetch("https://www.wh00.ooo/api/email/login", {
            method: "POST",
            body: new URLSearchParams({ email, password }),
        });
        const data = yield response.json();
        if (data.errors) {
            console.log(data.errors);
            throw new Error(data.errors);
        }
        return data.access_token;
    });
}
// speed: km/h, batteryLevel: 0-1,
export function updateLocation(_a) {
    return __awaiter(this, arguments, void 0, function* ({ token, latitude, longitude, speed, batteryLevel, stayedAt, isCharging = false, isActive = false, }) {
        const data = {
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
            data["user_location[stayed_at]"] = stayedAt.toLocaleString("ja-JP", {
                timeZone: "UTC",
            })
                .replace(/\//g, "-") + " +0000";
        }
        const response = yield fetch("https://www.wh00.ooo/api/user/location", {
            method: "PATCH",
            body: new URLSearchParams(data),
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        return response.json();
    });
}
export function getFriendsInfo(token) {
    return __awaiter(this, void 0, void 0, function* () {
        const res = yield fetch("https://www.wh00.ooo/api/locations", {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        const { locations } = yield res.json();
        if (!locations)
            throw new Error("locations not found");
        return locations;
    });
}
export function getMyInfo(token) {
    return __awaiter(this, void 0, void 0, function* () {
        const res = yield fetch("https://www.wh00.ooo/api/my", {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        const data = yield res.json();
        if (data.errors) {
            console.log(data.errors);
            throw new Error(data.errors);
        }
        return data.user;
    });
}
// interval: seconds, speed: km/h, batteryLevel: 0-1
export function execRoutes(_a) {
    return __awaiter(this, arguments, void 0, function* ({ token, routes, interval, speed, batteryLevel, clients }) {
        var _b;
        yield updateIsNoExec(token, true);
        console.log("no_exec is set to true.\nstart to exec routes");
        for (const route of routes) {
            try {
                yield updateLocation({
                    token,
                    latitude: route.lat,
                    longitude: route.lng,
                    speed, // km/h
                    batteryLevel
                });
                (_b = clients.get(token)) === null || _b === void 0 ? void 0 : _b.send(JSON.stringify({
                    type: "location",
                    data: route,
                    id: 0
                }));
                yield new Promise(resolve => setTimeout(resolve, interval * 1000));
            }
            catch (e) {
                console.error(e);
            }
        }
        console.log("routes are executed");
        yield updateLocation({
            token,
            latitude: routes[routes.length - 1].lat,
            longitude: routes[routes.length - 1].lng,
            speed: 0,
            batteryLevel,
            stayedAt: new Date(),
        });
        console.log("final location is updated");
        yield saveWhooUser({
            token,
            lat: routes[routes.length - 1].lat,
            lng: routes[routes.length - 1].lng,
            stayedAt: new Date(),
            batteryLevel,
            noExec: false,
        });
        console.log("routes are stored in db.\nno_exec is set to false");
    });
}
