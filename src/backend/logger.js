function timestamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}.${ms}`;
}

function write(level, message, details) {
  const prefix = `[${timestamp()}] [${level}]`;
  if (details !== undefined) {
    // eslint-disable-next-line no-console
    console.log(`${prefix} ${message}`, details);
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`${prefix} ${message}`);
}

export const logger = {
  info(message, details) {
    write('INFO', message, details);
  },
  warn(message, details) {
    write('WARN', message, details);
  },
  error(message, details) {
    write('ERROR', message, details);
  }
};
