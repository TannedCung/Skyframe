export const logger = {
  info: (msgOrObj: string | object, msg?: string) => log("INFO", msgOrObj, msg),
  warn: (msgOrObj: string | object, msg?: string) => log("WARN", msgOrObj, msg),
  error: (msgOrObj: string | object, msg?: string) => log("ERROR", msgOrObj, msg),
};

function log(level: string, msgOrObj: string | object, msg?: string) {
  const entry =
    typeof msgOrObj === "string"
      ? { level, time: new Date().toISOString(), msg: msgOrObj }
      : { level, time: new Date().toISOString(), ...msgOrObj, msg: msg ?? "" };
  console.log(JSON.stringify(entry));
}
