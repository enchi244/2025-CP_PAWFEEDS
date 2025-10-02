/*
  PawfeedsCam_Master.ino - Cloud-enabled Master (ESP32-CAM, AI Thinker)

  - AP (provisioning) at 192.168.4.1 with endpoints: /status, /scan, /provision, /factory_reset, /stream, /flash
  - STA: connects using creds stored in NVS, starts HTTP, and registers in cloud via Cloud Function
  - /provision: saves creds, forwards to standard board, replies JSON with deviceId/feederId/cameraIp, then reboots
*/

#include <WiFi.h>
#include <Preferences.h>
#include <DNSServer.h>
#include <HardwareSerial.h>
#include <HTTPClient.h>

#include "esp_camera.h"
#include "esp_http_server.h"
#include "img_converters.h"

// ----- Camera pins (AI Thinker) -----
#define CAMERA_MODEL_AI_THINKER
#if defined(CAMERA_MODEL_AI_THINKER)
  #define PWDN_GPIO_NUM     32
  #define RESET_GPIO_NUM    -1
  #define XCLK_GPIO_NUM      0
  #define SIOD_GPIO_NUM     26
  #define SIOC_GPIO_NUM     27
  #define Y9_GPIO_NUM       35
  #define Y8_GPIO_NUM       34
  #define Y7_GPIO_NUM       39
  #define Y6_GPIO_NUM       36
  #define Y5_GPIO_NUM       21
  #define Y4_GPIO_NUM       19
  #define Y3_GPIO_NUM       18
  #define Y2_GPIO_NUM        5
  #define VSYNC_GPIO_NUM    25
  #define HREF_GPIO_NUM     23
  #define PCLK_GPIO_NUM     22
  #define LED_GPIO_NUM       4
#endif

// ----- Globals -----
HardwareSerial SerialSlave(2); // RX=13, TX=12 (begin below)
Preferences prefs;
DNSServer dnsServer;
httpd_handle_t httpdHandle = NULL;

static const char* NVS_NS = "pawfeeds";
static const uint8_t MAX_CONNECT_SECONDS = 30;

enum Mode { MODE_STA, MODE_AP };
Mode currentMode = MODE_STA;

// Paste your Cloud Function URL here (optional registration step)
const char* cloudFunctionUrl = "https://registerdevice-cy5wm3auoq-df.a.run.app";

// ----- Utils -----
String macLast4() {
  uint8_t m[6];
  WiFi.macAddress(m);
  char buf[5];
  snprintf(buf, sizeof(buf), "%02X%02X", m[4], m[5]);
  return String(buf);
}
String ipToStr(IPAddress ip) { return String(ip[0]) + "." + ip[1] + "." + ip[2] + "." + ip[3]; }
void logKV(const char* k, const String& v) { Serial.print(k); Serial.print(": "); Serial.println(v); }

// ----- Camera -----
bool initCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0       = Y2_GPIO_NUM;
  config.pin_d1       = Y3_GPIO_NUM;
  config.pin_d2       = Y4_GPIO_NUM;
  config.pin_d3       = Y5_GPIO_NUM;
  config.pin_d4       = Y6_GPIO_NUM;
  config.pin_d5       = Y7_GPIO_NUM;
  config.pin_d6       = Y8_GPIO_NUM;
  config.pin_d7       = Y9_GPIO_NUM;
  config.pin_xclk     = XCLK_GPIO_NUM;
  config.pin_pclk     = PCLK_GPIO_NUM;
  config.pin_vsync    = VSYNC_GPIO_NUM;
  config.pin_href     = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn     = PWDN_GPIO_NUM;
  config.pin_reset    = RESET_GPIO_NUM;
  config.xclk_freq_hz = 10000000;
  config.pixel_format = PIXFORMAT_JPEG;
  if (psramFound()) {
    config.frame_size   = FRAMESIZE_VGA;
    config.jpeg_quality = 12;
    config.fb_count     = 1;
  } else {
    config.frame_size   = FRAMESIZE_QVGA;
    config.jpeg_quality = 15;
    config.fb_count     = 1;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed: 0x%X\n", err);
    return false;
  }
  pinMode(LED_GPIO_NUM, OUTPUT);
  digitalWrite(LED_GPIO_NUM, LOW);
  Serial.println("Camera OK");
  return true;
}

// ----- HTTP helpers -----
static esp_err_t send_json(httpd_req_t* req, const String& body) {
  httpd_resp_set_type(req, "application/json");
  return httpd_resp_send(req, body.c_str(), HTTPD_RESP_USE_STRLEN);
}

// Status for app
static esp_err_t status_handler(httpd_req_t* req) {
  String ip = (WiFi.isConnected()) ? ipToStr(WiFi.localIP()) : (currentMode == MODE_AP ? "192.168.4.1" : "");
  String modeStr = (currentMode == MODE_AP) ? "ap" : "camera-sta";
  String hostname = WiFi.getHostname() ? String(WiFi.getHostname()) : "";
  String body = String("{\"mode\":\"") + modeStr + "\",\"connected\":" + (WiFi.isConnected()?"true":"false") + ",\"ip\":\"" + ip + "\",\"hostname\":\"" + hostname + "\"}";
  return send_json(req, body);
}

static esp_err_t flash_handler(httpd_req_t* req) {
  char buf[32]; bool on=false;
  int len = httpd_req_get_url_query_len(req) + 1;
  if (len > 1 && len < 32) {
    httpd_req_get_url_query_str(req, buf, len);
    char val[8];
    if (httpd_query_key_value(buf, "on", val, sizeof(val)) == ESP_OK) {
      String v = String(val);
      on = (v=="1" || v=="true" || v=="on");
    }
  }
  digitalWrite(LED_GPIO_NUM, on?HIGH:LOW);
  return send_json(req, String("{\"flash\":") + (on?"true":"false") + "}");
}

static esp_err_t stream_handler(httpd_req_t* req) {
  camera_fb_t* fb = NULL;
  esp_err_t res = httpd_resp_set_type(req, "multipart/x-mixed-replace;boundary=frame");
  if(res != ESP_OK) return res;
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  while(true){
    fb = esp_camera_fb_get();
    if (!fb) { res = ESP_FAIL; }
    else {
      res = httpd_resp_send_chunk(req, "--frame\r\n", 9);
      if(res == ESP_OK){
        char part[64];
        size_t hlen = snprintf(part, sizeof(part), "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n", fb->len);
        res = httpd_resp_send_chunk(req, part, hlen);
      }
      if(res == ESP_OK) res = httpd_resp_send_chunk(req, (const char *)fb->buf, fb->len);
      esp_camera_fb_return(fb);
    }
    if(res != ESP_OK) break;
    vTaskDelay(pdMS_TO_TICKS(10));
  }
  httpd_resp_send_chunk(req, NULL, 0);
  return res;
}

static esp_err_t scan_handler(httpd_req_t* req) {
  int n = WiFi.scanNetworks(false, true);
  String out = "{\"aps\":[";
  for (int i=0;i<n;i++) {
    if (i) out += ",";
    out += "{\"ssid\":\"" + WiFi.SSID(i) + "\",\"rssi\":" + String(WiFi.RSSI(i)) + "}";
  }
  out += "]}";
  return send_json(req, out);
}

// ----- NVS helpers -----
void saveCreds(const String& ssid, const String& pass, const String& host, const String& uid) {
  prefs.begin(NVS_NS, false);
  prefs.putString("wifi_ssid", ssid);
  prefs.putString("wifi_pass", pass);
  prefs.putString("hostname", host);
  prefs.putString("uid", uid);
  prefs.putBool("registered", false);
  prefs.end();
  Serial.println("[NVS] Saved credentials, UID, and set registered=false.");
}
void eraseCreds() {
  prefs.begin(NVS_NS, false);
  prefs.remove("wifi_ssid");
  prefs.remove("wifi_pass");
  prefs.remove("hostname");
  prefs.remove("uid");
  prefs.remove("registered");
  prefs.end();
  Serial.println("[NVS] Cleared credentials.");
}

// ----- JSON body parsing -----
bool read_json_body(httpd_req_t* req, String& ssid, String& pass, String& host, String& uid, int& feederId) {
  int total = req->content_len;
  if (total <= 0 || total > 1024) return false;
  std::unique_ptr<char[]> buf(new char[total+1]);
  int read = httpd_req_recv(req, buf.get(), total);
  if (read <= 0) return false;
  buf[read] = 0;
  String s = String(buf.get());

  auto getStr=[&](const char* key)->String{
    int k = s.indexOf(String("\"")+key+"\""); if (k<0) return "";
    int c = s.indexOf(':', k); if (c<0) return "";
    while (c+1 < (int)s.length() && s[c+1] == ' ') c++;
    int q1= s.indexOf('"', c+1); if (q1<0) return "";
    int q2= s.indexOf('"', q1+1); if (q2<0) return "";
    return s.substring(q1+1, q2);
  };
  auto getInt=[&](const char* key)->int{
    int k = s.indexOf(String("\"")+key+"\""); if (k<0) return 0;
    int c = s.indexOf(':', k); if (c<0) return 0;
    int i = c+1;
    while (i < (int)s.length() && (s[i]==' ')) i++;
    int j = i;
    while (j < (int)s.length() && isdigit((unsigned char)s[j])) j++;
    if (j>i) return s.substring(i,j).toInt();
    return 0;
  };

  ssid = getStr("ssid");
  pass = getStr("password");
  host = getStr("hostname");
  uid  = getStr("uid");
  feederId = getInt("feederId");
  return ssid.length() > 0 && uid.length() > 0;
}

// ----- /provision (responds with deviceId/feederId/cameraIp) -----
static esp_err_t provision_handler(httpd_req_t* req) {
  String ssid, pass, host, uid; int feederId = 0;
  if (!read_json_body(req, ssid, pass, host, uid, feederId)) {
    Serial.println("[/provision] Bad or missing JSON");
    return send_json(req, "{\"success\":false,\"message\":\"Invalid request body\"}");
  }

  // Save creds and mark not yet registered
  saveCreds(ssid, pass, host, uid);

  // For the standard board, strip prefix to pass a friendlier name
  String customName = host;
  String prefix = "pawfeeds-cam-";
  if (host.startsWith(prefix)) customName = host.substring(prefix.length());

  // Forward to standard/servo via Serial2 (RX=13, TX=12)
  Serial.println("[Serial] Sending info to standard feeder...");
  SerialSlave.printf("%s\n%s\n%s\n%s\n", ssid.c_str(), pass.c_str(), customName.c_str(), uid.c_str());
  Serial.println("[Serial] Info sent.");

  // Compose response for the mobile app
  String deviceId = WiFi.macAddress(); deviceId.replace(":", "");
  String camIp = (currentMode == MODE_AP) ? "192.168.4.1"
                                          : (WiFi.isConnected() ? WiFi.localIP().toString() : "");
  String body = String("{\"success\":true,\"message\":\"Provisioned OK\",\"deviceId\":\"") + deviceId +
                "\",\"feederId\":" + String(feederId) +
                ",\"cameraIp\":\"" + camIp + "\"}";

  // Reply first, then reboot
  send_json(req, body);
  Serial.println("[/provision] Reply sent. Rebooting Master...");
  delay(1000);
  ESP.restart();
  return ESP_OK;
}

// ----- /factory_reset -----
static esp_err_t factory_reset_handler(httpd_req_t* req) {
  eraseCreds();
  send_json(req, "{\"ok\":true,\"reset\":true}");
  Serial.println("[/factory_reset] Rebooting...");
  delay(250);
  ESP.restart();
  return ESP_OK;
}

// ----- HTTP server wiring -----
void register_handlers(httpd_handle_t srv) {
  httpd_uri_t uri_status = { .uri="/status", .method=HTTP_GET,  .handler=status_handler,       .user_ctx=NULL };
  httpd_uri_t uri_scan   = { .uri="/scan",   .method=HTTP_GET,  .handler=scan_handler,         .user_ctx=NULL };
  httpd_uri_t uri_stream = { .uri="/stream", .method=HTTP_GET,  .handler=stream_handler,       .user_ctx=NULL };
  httpd_uri_t uri_flash  = { .uri="/flash",  .method=HTTP_GET,  .handler=flash_handler,        .user_ctx=NULL };
  httpd_uri_t uri_prov   = { .uri="/provision",     .method=HTTP_POST, .handler=provision_handler,   .user_ctx=NULL };
  httpd_uri_t uri_freset = { .uri="/factory_reset", .method=HTTP_POST, .handler=factory_reset_handler,.user_ctx=NULL };

  httpd_register_uri_handler(srv, &uri_status);
  httpd_register_uri_handler(srv, &uri_scan);
  httpd_register_uri_handler(srv, &uri_stream);
  httpd_register_uri_handler(srv, &uri_flash);
  httpd_register_uri_handler(srv, &uri_prov);
  httpd_register_uri_handler(srv, &uri_freset);
}

bool start_http() {
  httpd_config_t cfg = HTTPD_DEFAULT_CONFIG();
  cfg.server_port = 80;
  cfg.uri_match_fn = httpd_uri_match_wildcard;
  cfg.max_open_sockets = 7;
  cfg.stack_size = 10 * 1024;
  cfg.lru_purge_enable = true;
  if (httpd_start(&httpdHandle, &cfg) == ESP_OK) {
    register_handlers(httpdHandle);
    Serial.println("[HTTP] Server started with robust configuration");
    return true;
  }
  Serial.println("[HTTP] Server start failed!");
  return false;
}

// ----- AP / STA boot paths -----
void start_softap_with_dns() {
  String ssid = "PAWFEEDS-" + macLast4();
  WiFi.mode(WIFI_AP);
  WiFi.softAP(ssid.c_str(), NULL, 1, false, 4);
  delay(200);
  IPAddress apIP = WiFi.softAPIP();
  dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
  dnsServer.start(53, "*", apIP);
  Serial.printf("[AP] SSID: %s  IP: %s\n", ssid.c_str(), apIP.toString().c_str());
}

void registerDeviceInCloud() {
  prefs.begin(NVS_NS, true);
  bool isRegistered = prefs.getBool("registered", false);
  String uid = prefs.getString("uid", "");
  String hostname = prefs.getString("hostname", "");
  prefs.end();

  if (isRegistered || uid.length() == 0 || hostname.length() == 0) return;

  Serial.println("[Cloud] Attempting registration...");
  HTTPClient http;
  http.begin(cloudFunctionUrl);
  http.addHeader("Content-Type", "application/json");
  String deviceId = WiFi.macAddress(); deviceId.replace(":", "");
  String payload = "{\"data\":{\"uid\":\"" + uid + "\",\"deviceId\":\"" + deviceId + "\",\"name\":\"" + hostname + "\"}}";
  int httpCode = http.POST(payload);
  if (httpCode == 200) {
    prefs.begin(NVS_NS, false);
    prefs.putBool("registered", true);
    prefs.end();
    Serial.println("[Cloud] Registration successful.");
  } else {
    Serial.printf("[Cloud] Registration failed: %d\n", httpCode);
  }
  http.end();
}

bool try_connect_sta_from_nvs() {
  prefs.begin(NVS_NS, true);
  String ssid = prefs.getString("wifi_ssid", "");
  String pass = prefs.getString("wifi_pass", "");
  String host = prefs.getString("hostname", "");
  prefs.end();

  if (ssid.length() == 0) { Serial.println("[STA] No SSID in NVS"); return false; }

  WiFi.mode(WIFI_STA);
  if (host.length()) WiFi.setHostname(host.c_str());
  WiFi.begin(ssid.c_str(), pass.c_str());

  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - t0) < (MAX_CONNECT_SECONDS * 1000UL)) {
    delay(300); Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[STA] Connected. IP: %s  Hostname: %s\n",
                  WiFi.localIP().toString().c_str(),
                  WiFi.getHostname() ? WiFi.getHostname() : "(none)");
    registerDeviceInCloud();
    return true;
  }
  Serial.printf("[STA] Failed. Status=%d\n", WiFi.status());
  return false;
}

// ----- Arduino entry points -----
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n=== PawfeedsCam MASTER Boot ===");

  // Serial2 for feeder link (RX=13, TX=12)
  SerialSlave.begin(9600, SERIAL_8N1, 13, 12);

  if (try_connect_sta_from_nvs()) {
    currentMode = MODE_STA;
    initCamera();
    start_http();
  } else {
    currentMode = MODE_AP;
    start_softap_with_dns();
    initCamera();
    start_http();
  }
}

void loop() {
  if (currentMode == MODE_AP) dnsServer.processNextRequest();
  delay(10);
}
