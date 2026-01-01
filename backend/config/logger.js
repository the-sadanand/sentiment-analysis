// ...existing code...
const fs = require('fs');
const path = require('path');

let winston;
try {
    winston = require('winston');
} catch (e) {
    // Fallback to console logger if winston isn't installed
    const fallback = {
        info: (...args) => console.log(...args),
        warn: (...args) => console.warn(...args),
        error: (...args) => console.error(...args),
        debug: (...args) => console.debug(...args),
        stream: { write: (msg) => console.log(msg.trim()) }
    };
    module.exports = fallback;
}

if (winston) {
    const { createLogger, format, transports } = winston;
    const { combine, timestamp, printf, errors, splat, colorize } = format;

    const logDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

    const fileFormat = combine(timestamp(), errors({ stack: true }), splat(), format.json());
    const consoleFormat = combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        printf(({ timestamp, level, message, stack, ...meta }) => {
            const msg = stack || message;
            const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
            return `${timestamp} ${level}: ${msg}${metaStr}`;
        })
    );

    const logger = createLogger({
        level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
        format: fileFormat,
        transports: [
            new transports.File({
                filename: path.join(logDir, 'error.log'),
                level: 'error',
                maxsize: 5 * 1024 * 1024,
                maxFiles: 5,
                tailable: true
            }),
            new transports.File({
                filename: path.join(logDir, 'combined.log'),
                maxsize: 10 * 1024 * 1024,
                maxFiles: 10,
                tailable: true
            })
        ],
        exceptionHandlers: [
            new transports.File({ filename: path.join(logDir, 'exceptions.log') })
        ],
        rejectionHandlers: [
            new transports.File({ filename: path.join(logDir, 'rejections.log') })
        ],
        exitOnError: false
    });

    if (process.env.NODE_ENV !== 'production') {
        logger.add(new transports.Console({ format: consoleFormat }));
    }

    // Stream compatible with morgan: app.use(morgan('combined', { stream: logger.stream }));
    logger.stream = {
        write: (message) => {
            logger.info(message.trim());
        }
    };

    module.exports = logger;
}