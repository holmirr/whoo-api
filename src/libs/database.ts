import postgres from "postgres";
import { whooUesr } from "./types.js";
const sql = postgres(process.env.POSTGRES_URL!, { ssl: "require" });
console.log(process.env.POSTGRES_URL);

export async function updateIsNoExec(token: string, no_exec: boolean) {
  await sql`UPDATE whoo_users SET no_exec = ${no_exec} WHERE token = ${token}`;
}

export async function saveWhooUser({ token, lat, lng, stayedAt, batteryLevel, noExec, expires }:
  {
    token: string,
    lat?: number,
    lng?: number,
    stayedAt?: Date,
    batteryLevel?: number,
    noExec?: boolean,
    expires?: Date | null
  }) {
  await sql`
      INSERT INTO whoo_users (token, latitude, longitude, stayed_at, battery_level, no_exec, expires)
      VALUES (${token}, ${lat ?? null}, ${lng ?? null}, ${stayedAt ?? null}, ${batteryLevel ?? null}, ${noExec ?? null}, ${expires ?? null})
      ON CONFLICT (token)
      DO UPDATE SET
        latitude = COALESCE(EXCLUDED.latitude, whoo_users.latitude),
        longitude = COALESCE(EXCLUDED.longitude, whoo_users.longitude), 
        stayed_at = COALESCE(EXCLUDED.stayed_at, whoo_users.stayed_at),
        battery_level = COALESCE(EXCLUDED.battery_level, whoo_users.battery_level),
        no_exec = COALESCE(EXCLUDED.no_exec, whoo_users.no_exec),
        expires = EXCLUDED.expires
    `;

}

export async function getWhooUsers() {
  const users = await sql<whooUesr[]>`SELECT * FROM whoo_users WHERE no_exec = false`;
  return users;
}
