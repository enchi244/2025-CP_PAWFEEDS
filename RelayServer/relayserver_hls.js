/*
 * =================================================================
 * PAWFEEDS HLS PUSH SERVER
 * =================================================================
 * This server's only job is to connect to the local ESP32 cameras
 * and "push" their streams to a public RTMP server.
 * It is no longer an "on-demand" HLS server.
 * =================================================================
 */
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

// --- CONFIGURATION ---

// (REQUIRED) SET YOUR PUBLIC SERVER'S IP OR DOMAIN
// Make sure your public server is configured to accept RTMP on port 1935.
const PUBLIC_SERVER_IP = '134.209.100.91';

const RTMP_BASE_URL = `rtmp://${PUBLIC_SERVER_IP}:1935/live`; // 'live' is a common app name in nginx-rtmp

const CAMERA_SOURCES = {
  // Key: The "stream key" to push to. e.g., rtmp://.../live/stream1
  // Value: The local IP of the camera.
  'stream1': 'http://192.168.1.183/stream', // Bowl 1 Camera
};

// FFmpeg settings for a stable MJPEG -> RTMP push
const FFMPEG_OPTIONS = [
  '-fflags +discardcorrupt', // Skip bad frames
  '-g 10',                   // Keyframe every 10 frames (1 per sec)
  '-c:v libx264',            // Use libx264 codec
  '-preset ultrafast',       // Prioritize low-CPU
  '-tune zerolatency',       // Optimize for live streaming
  '-profile:v baseline',     // <-- ADDED FOR MAX COMPATIBILITY
  '-pix_fmt yuv420p',        // Standard pixel format for compatibility
  '-an',                     // No audio
  '-f flv'                   // Force format to FLV (standard for RTMP)
];

ffmpeg.setFfmpegPath(ffmpegStatic);
console.log('[RelayPusher] PawFeeds Relay Pusher starting...');

/**
 * Creates and starts a persistent ffmpeg process for a camera.
 * If the process ends or errors, it will log and restart after a delay.
 * @param {string} streamKey - The RTMP stream key (e.g., "stream1")
 * @param {string} cameraUrl - The local URL of the MJPEG stream
 */
function startStreamProcess(streamKey, cameraUrl) {
  const outputUrl = `${RTMP_BASE_URL}/${streamKey}`;
  console.log(`\n======================================================`);
  console.log(`[DEBUG ${streamKey}] ATTEMPTING TO START STREAM PROCESS`);
  console.log(`[DEBUG ${streamKey}] Source: ${cameraUrl}`);
  console.log(`[DEBUG ${streamKey}] Destination: ${outputUrl}`);
  console.log(`======================================================\n`);

  const ffmpegProcess = ffmpeg(cameraUrl, { timeout: 43200 })
    // --- STABILITY FIXES for MJPEG Input ---
    .inputFormat('mjpeg') // Tell ffmpeg the input is MJPEG
    .inputFPS(10)         // Match camera's 10fps
    .inputOption('-re')   // Read at native frame rate
    // --- Output Options ---
    .addOptions(FFMPEG_OPTIONS)
    .output(outputUrl)
    .on('start', (commandLine) => {
      console.log(`[FFmpeg ${streamKey}] Spawned. Command: ${commandLine}`);
    })
    .on('error', (err, stdout, stderr) => {
      console.error(`[FFmpeg ${streamKey}] FATAL ERROR: ${err.message}`);
      console.error(`[FFmpeg ${streamKey}] STDERR:\n${stderr}`);
      console.log(`[FFmpeg ${streamKey}] Restarting in 10 seconds...`);
      setTimeout(() => startStreamProcess(streamKey, cameraUrl), 10000);
    })
    .on('end', (stdout, stderr) => {
      console.log(`[FFmpeg ${streamKey}] Stream finished (this shouldn't happen).`);
      console.log(`[FFmpeg ${streamKey}] Restarting in 10 seconds...`);
      setTimeout(() => startStreamProcess(streamKey, cameraUrl), 10000);
    });

  // Run the process
  ffmpegProcess.run();
}

// --- MAIN ---
// Start a persistent ffmpeg process for each camera defined in the config
try {
  for (const [key, url] of Object.entries(CAMERA_SOURCES)) {
    startStreamProcess(key, url);
  }
} catch (error) {
  console.error('[RelayPusher] CRITICAL: Failed to initialize streams.', error);
  // In a production environment, you might want to exit and let a process manager (like PM2) restart.
  // process.exit(1);
}