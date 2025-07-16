import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";

const TOKEN_KEY = "ae5b4972d8647ab4938a0698fbcc0712";
const key = Buffer.from(TOKEN_KEY, "utf8");

if (key.length !== 32) {
  throw new Error("Invalid token key");
}

export function encrypt(text: string) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf-8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

export function decrypt(text: string): string {
  try {
    // "iv:テキスト"の形式から、IVと暗号化テキストを分離します。
    const [ivHex, encryptedText] = text.split(':');
    if (!ivHex || !encryptedText) {
      throw new Error('暗号化されたテキストの形式が正しくありません。');
    }

    // IVをプログラムが扱える形式に戻します。
    const iv = Buffer.from(ivHex, 'hex');

    // 復号器を作成します（アルゴリズム、鍵、IVを指定）
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    
    // テキストを復号します
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    // 復号に失敗した場合（鍵が違う、データが壊れているなど）
    console.error("復号に失敗しました:", error);
    return ''; // エラー時は空文字列を返します
  }
}


