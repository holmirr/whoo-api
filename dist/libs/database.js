var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import postgres from "postgres";
const sql = postgres(process.env.POSTGRES_URL, { ssl: "require" });
console.log(process.env.POSTGRES_URL);
export function updateIsNoExec(token, no_exec) {
    return __awaiter(this, void 0, void 0, function* () {
        yield sql `UPDATE whoo_users SET no_exec = ${no_exec} WHERE token = ${token}`;
    });
}
export function saveWhooUser(_a) {
    return __awaiter(this, arguments, void 0, function* ({ token, lat, lng, stayedAt, batteryLevel, noExec }) {
        yield sql `
      INSERT INTO whoo_users (token, latitude, longitude, stayed_at, battery_level, no_exec)
      VALUES (${token}, ${lat !== null && lat !== void 0 ? lat : null}, ${lng !== null && lng !== void 0 ? lng : null}, ${stayedAt !== null && stayedAt !== void 0 ? stayedAt : null}, ${batteryLevel !== null && batteryLevel !== void 0 ? batteryLevel : null}, ${noExec !== null && noExec !== void 0 ? noExec : null})
      ON CONFLICT (token)
      DO UPDATE SET
        latitude = COALESCE(EXCLUDED.latitude, whoo_users.latitude),
        longitude = COALESCE(EXCLUDED.longitude, whoo_users.longitude), 
        stayed_at = COALESCE(EXCLUDED.stayed_at, whoo_users.stayed_at),
        battery_level = COALESCE(EXCLUDED.battery_level, whoo_users.battery_level),
        no_exec = COALESCE(EXCLUDED.no_exec, whoo_users.no_exec)
    `;
    });
}
export function getWhooUsers() {
    return __awaiter(this, void 0, void 0, function* () {
        const users = yield sql `SELECT * FROM whoo_users WHERE no_exec = false`;
        return users;
    });
}
