/*
 * =================================================================
 * PAWFEEDS HLS PUSH SERVER (TIMING FIXED)
 * =================================================================
 * Fixes:
 * - "Sped Up" video: Uses Wallclock timestamps + Enforced Output FPS.
 * - Stability: Retains reconnect logic to prevent "End of File" loops.
 * =================================================================
 */
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

// --- CONFIGURATION ---

const PUBLIC_SERVER_IP = '134.209.100.91';
const RTMP_BASE_URL = `rtmp://${PUBLIC_SERVER_IP}:1935/live`;

const CAMERA_SOURCES = {
  'stream1': 'http://pawfeeds-cam-1.local/stream', 
  'stream2': 'http://pawfeeds-cam-2.local/stream', 
};

// FFmpeg Output Options (Encoding & Timing)
const FFMPEG_OUTPUT_OPTIONS = [
  '-fflags +discardcorrupt', 
  '-c:v libx264',            
  '-preset ultrafast',       
  '-tune zerolatency',       
  '-g 20',                   // Keyframe every 2 seconds (at 10fps)
  '-profile:v baseline',     
  '-pix_fmt yuv420p',
  '-r 10',                   // <--- CRITICAL: Force output to 10 FPS to prevent speed-up
  '-an',                     
  '-f flv'                   
];

// FFmpeg Input Options (Connection Handling & Time Generation)
const FFMPEG_INPUT_OPTIONS = [
  '-use_wallclock_as_timestamps 1', // <--- CRITICAL: Base timing on packet arrival, not camera metadata
  '-reconnect 1',                   
  '-reconnect_at_eof 1',            
  '-reconnect_streamed 1',          
  '-reconnect_delay_max 5',         
  '-timeout 10000000'               
];

ffmpeg.setFfmpegPath(ffmpegStatic);
console.log('[RelayPusher] PawFeeds Relay Pusher starting (Real-Time Mode)...');

/**
 * Creates and starts a persistent ffmpeg process for a camera.
 */
function startStreamProcess(streamKey, cameraUrl) {
  const outputUrl = `${RTMP_BASE_URL}/${streamKey}`;
  console.log(`\n======================================================`);
  console.log(`[DEBUG ${streamKey}] STARTING REAL-TIME STREAM`);
  console.log(`[DEBUG ${streamKey}] Source: ${cameraUrl}`);
  console.log(`======================================================\n`);

  const ffmpegProcess = ffmpeg(cameraUrl)
    .inputFormat('mjpeg') 
    // .inputFPS(10)  <-- REMOVED: Caused conflicts with wallclock timing
    
    // Apply Robustness & Timing flags
    .addInputOptions(FFMPEG_INPUT_OPTIONS)
    
    // Video Filter: Reset timestamps to 0 to prevent sync issues
    .videoFilters('setpts=PTS-STARTPTS')

    // Reduce analysis buffer to start stream faster (0.5s)
    .addInputOption('-analyzeduration 500000') 
    .addInputOption('-probesize 500000')       

    .addOptions(FFMPEG_OUTPUT_OPTIONS)
    .output(outputUrl)
    
    .on('start', (commandLine) => {
      console.log(`[FFmpeg ${streamKey}] Active.`);
    })
    .on('error', (err, stdout, stderr) => {
      if (err.message.includes('SIGKILL')) return;

      console.error(`[FFmpeg ${streamKey}] ERROR: ${err.message}`);
      if (stderr) {
          // Log only the last line of stderr to keep logs clean
          const tail = stderr.split('\n').filter(line => line.trim()).slice(-1)[0]; 
          console.error(`[FFmpeg ${streamKey}] DETAILS: ${tail}`);
      }
      
      console.log(`[FFmpeg ${streamKey}] Reconnecting in 5 seconds...`);
      setTimeout(() => startStreamProcess(streamKey, cameraUrl), 5000);
    })
    .on('end', () => {
      console.log(`[FFmpeg ${streamKey}] Stream ended. Restarting...`);
      setTimeout(() => startStreamProcess(streamKey, cameraUrl), 1000);
    });

  ffmpegProcess.run();
}

// --- MAIN ---
try {
  for (const [key, url] of Object.entries(CAMERA_SOURCES)) {
    startStreamProcess(key, url);
  }
} catch (error) {
  console.error('[RelayPusher] INITIALIZATION ERROR:', error);
}