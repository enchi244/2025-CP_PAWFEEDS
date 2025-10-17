const http = require('http');
const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const os = require('os');

// --- CONFIGURATION ---
const PORT = 8080;
const CAMERA_IPS = {
  1: 'http://192.168.1.183', // IP for Bowl 1 Camera
  2: 'http://192.168.1.187', // IP for Bowl 2 Camera
};
const HLS_OUTPUT_DIR = path.join(__dirname, 'hls');

const app = express();
const server = http.createServer(app);
const activeStreams = new Map();

ffmpeg.setFfmpegPath(ffmpegStatic);
fs.emptyDirSync(HLS_OUTPUT_DIR);
console.log(`[Relay] Cleaned HLS output directory: ${HLS_OUTPUT_DIR}`);

// --- MIDDLEWARE ---
app.use((req, res, next) => {
  console.log(`[Relay] Request Received: ${req.method} ${req.url} from ${req.socket.remoteAddress}`);
  next();
});
app.use(express.static(HLS_OUTPUT_DIR)); // Serve the HLS files

// --- ROUTES ---
app.get('/', (req, res) => {
  res.status(200).send('PawFeeds Relay Server is running and accessible.');
});

app.get('/stream/:bowlNumber', (req, res) => {
  const { bowlNumber } = req.params;
  const cameraIp = CAMERA_IPS[bowlNumber];
  const outputDir = path.join(HLS_OUTPUT_DIR, bowlNumber);
  const manifestPath = path.join(outputDir, 'index.m3u8');

  if (!cameraIp) {
    console.error(`[Relay] ERROR: Request for invalid bowl number: ${bowlNumber}`);
    return res.status(404).send(`Camera for bowl ${bowlNumber} not found.`);
  }

  if (activeStreams.has(bowlNumber)) {
    console.log(`[Relay] Stream for bowl ${bowlNumber} is already active.`);
    return res.status(200).send(`Stream for bowl ${bowlNumber} is already active.`);
  }

  console.log(`[Relay] Starting HLS stream for bowl ${bowlNumber} from camera at ${cameraIp}/stream`);
  fs.ensureDirSync(outputDir);

  const ffmpegProcess = ffmpeg(`${cameraIp}/stream`, { timeout: 43200 })
    .addOptions([
      '-c:v mjpeg',
      '-hls_time 2',
      '-hls_list_size 5',
      '-hls_flags delete_segments',
      '-g 10',
      '-c:v libx264',
      '-preset ultrafast',
      '-tune zerolatency',
      '-pix_fmt yuv420p',
      '-an',
    ])
    .output(manifestPath)
    .on('start', (commandLine) => {
      console.log(`[FFmpeg Bowl ${bowlNumber}] Successfully spawned.`);
      if (!res.headersSent) {
        res.status(200).send(`Stream initiation for bowl ${bowlNumber} successful.`);
      }
    })
    .on('error', (err, stdout, stderr) => {
      console.error(`[FFmpeg Bowl ${bowlNumber}] FATAL ERROR: ${err.message}`);
      console.error(`[FFmpeg Bowl ${bowlNumber}] STDERR:\n${stderr}`);
      activeStreams.delete(bowlNumber);
      if (!res.headersSent) {
        res.status(500).send('Failed to start FFmpeg process.');
      }
    })
    .on('end', () => {
      console.log(`[FFmpeg Bowl ${bowlNumber}] Stream processing finished.`);
      activeStreams.delete(bowlNumber);
    });

  ffmpegProcess.run();
  activeStreams.set(bowlNumber, ffmpegProcess);
});

// --- SERVER START ---
function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '0.0.0.0';
}

server.listen(PORT, () => {
  const ipAddress = getLocalIpAddress();
  console.log(`[PawFeeds Relay] HLS Relay Server listening on port ${PORT}`);
  console.log(`[PawFeeds Relay] Network access at: http://${ipAddress}:${PORT}`);
});