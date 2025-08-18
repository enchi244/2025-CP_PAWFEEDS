/*********************************************************************************
 * PAWFEEDS: An Automated IoT Dog Food Dispenser
 * * FULLY INTEGRATED FIRMWARE (v3.9 - Invalid Time Error Only)
 * * Senior Embedded Developer: Gemini
 * * Project: PAWFEEDS
 * * Date: 2025-08-02
 *********************************************************************************/

// SECTION: Servo Configuration
const int SERVO_OPEN_POS = 90;
const int SERVO_CLOSED_POS = 0;
const int servoSweepInterval = 400;

// SECTION: Blynk and Network Configuration
#define BLYNK_PRINT Serial
#define BLYNK_TEMPLATE_ID "TMPL6KOp7_kx1"
#define BLYNK_TEMPLATE_NAME "Pawfeed"
#define BLYNK_AUTH_TOKEN "c0Fhyx-3OF7jwFALcORPpGhp5QIuRaE_"

const char* ssid = "PLDTHOMEFIBR27TQu";
const char* password = "mik@ixy2025";

// SECTION: Libraries
#include <WiFi.h>
#include <BlynkSimpleEsp32.h>
#include <ESP32Servo.h>
#include <WidgetRTC.h>
#include "esp_camera.h"
#include "esp_http_server.h"
#include "esp_timer.h"
#include "img_converters.h"
#include "Arduino.h"

// SECTION: Pin Definitions
const int SERVO_PIN = 13;
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

// SECTION: Blynk Virtual Pin Definitions
#define V_BREAKFAST_SCHEDULE V1
#define V_LUNCH_SCHEDULE     V2
#define V_DINNER_SCHEDULE    V3
#define V_FEED_NOW_BUTTON    V4
#define V_INPUT_AGE          V5
#define V_INPUT_WEIGHT       V6
#define V_INPUT_KCAL         V7
#define V_DISPLAY_PORTION    V8
#define V_EDITABLE_PORTION   V9
#define V_STATUS_TEXT        V10 // Virtual pin for the error message widget

// SECTION: Global Objects and Variables
Servo foodServo;
WidgetRTC rtc;
BlynkTimer timer;
httpd_handle_t stream_httpd = NULL;

long breakfast_time = -1, lunch_time = -1, dinner_time = -1;
float dog_age_months = 0, dog_weight_kg = 0, food_kcal_per_100g = 0;
int final_portion_grams = 0;
bool isDispensingProcessActive = false;
unsigned long dispenseStartTime = 0;
unsigned long dispenseDuration = 0;
unsigned long lastServoSweepTime = 0;
bool servoIsAtOpenPosition = false;

// Variables for clearing the error message
bool statusMessageIsActive = false;
unsigned long statusMessageClearTime = 0;

// =================================================================
// PRIMARY FUNCTIONS
// =================================================================

// Function to automatically clear the status message after a few seconds
void handleStatusMessage() {
  if (statusMessageIsActive && millis() > statusMessageClearTime) {
    Blynk.virtualWrite(V_STATUS_TEXT, " "); // Clear the text
    statusMessageIsActive = false;
  }
}

// Helper function to validate and set a meal schedule
void validateAndSetSchedule(long new_time_secs, long& current_meal_time, const char* meal_name, int min_hour, int max_hour, int v_pin) {
  int hour_of_day = new_time_secs / 3600;

  if (hour_of_day >= min_hour && hour_of_day <= max_hour) {
    // Time is valid, do nothing to the status widget
    current_meal_time = new_time_secs;
  } else {
    // Time is invalid, display an error on the status widget
    String error_msg = String("Invalid time for ") + meal_name;
    Blynk.virtualWrite(V_STATUS_TEXT, error_msg);
    statusMessageIsActive = true;
    statusMessageClearTime = millis() + 5000; // Clear after 5 seconds
    
    // Revert the widget in the app to the last known valid time
    if (current_meal_time != -1) {
      Blynk.virtualWrite(v_pin, current_meal_time);
    }
  }
}

void dispenseFood() {
  if (isDispensingProcessActive) { return; }
  if (final_portion_grams <= 0) { return; }
  
  const int duration_ms_per_gram = 100;
  dispenseDuration = final_portion_grams * duration_ms_per_gram;
  
  isDispensingProcessActive = true;
  dispenseStartTime = millis();
  lastServoSweepTime = dispenseStartTime;
  
  foodServo.write(SERVO_OPEN_POS);
  servoIsAtOpenPosition = true;
}

void handleDispensing() {
  if (!isDispensingProcessActive) { return; }
  if (millis() - dispenseStartTime >= dispenseDuration) {
    foodServo.write(SERVO_CLOSED_POS);
    isDispensingProcessActive = false;
    Blynk.logEvent("feed_event", "Food has been dispensed!");
    return;
  }
  if (millis() - lastServoSweepTime >= servoSweepInterval) {
    servoIsAtOpenPosition = !servoIsAtOpenPosition;
    foodServo.write(servoIsAtOpenPosition ? SERVO_OPEN_POS : SERVO_CLOSED_POS);
    lastServoSweepTime = millis();
  }
}

void checkSchedules() {
  if (year() == 1970) return;
  long now = (hour() * 3600) + (minute() * 60) + second();
  if ((now == breakfast_time || now == lunch_time || now == dinner_time) && !isDispensingProcessActive) {
    dispenseFood();
  }
}

// =================================================================
// BLYNK HANDLERS
// =================================================================

BLYNK_CONNECTED() {
  rtc.begin();
  Blynk.syncAll();
}

BLYNK_WRITE(V_BREAKFAST_SCHEDULE) {
  if (String(param.asStr()) != "") {
    validateAndSetSchedule(param.asLong(), breakfast_time, "Breakfast", 5, 10, V_BREAKFAST_SCHEDULE);
  } else { breakfast_time = -1; }
}

BLYNK_WRITE(V_LUNCH_SCHEDULE) {
  if (String(param.asStr()) != "") {
    validateAndSetSchedule(param.asLong(), lunch_time, "Lunch", 11, 12, V_LUNCH_SCHEDULE);
  } else { lunch_time = -1; }
}

BLYNK_WRITE(V_DINNER_SCHEDULE) {
  if (String(param.asStr()) != "") {
    validateAndSetSchedule(param.asLong(), dinner_time, "Dinner", 17, 21, V_DINNER_SCHEDULE);
  } else { dinner_time = -1; }
}

BLYNK_WRITE(V_FEED_NOW_BUTTON) {
  if (param.asInt() == 1) {
    dispenseFood();
  }
}

BLYNK_WRITE(V_INPUT_AGE) {
  dog_age_months = param.asFloat();
  calculateAndSetPortion();
}

BLYNK_WRITE(V_INPUT_WEIGHT) {
  dog_weight_kg = param.asFloat();
  calculateAndSetPortion();
}

BLYNK_WRITE(V_INPUT_KCAL) {
  food_kcal_per_100g = param.asFloat();
  calculateAndSetPortion();
}

BLYNK_WRITE(V_EDITABLE_PORTION) {
  final_portion_grams = param.asInt();
}

void calculateAndSetPortion() {
  if (dog_weight_kg <= 0 || food_kcal_per_100g <= 0) return;
  float rer = 70.0 * pow(dog_weight_kg, 0.75);
  float life_stage_factor = 1.6;
  if (dog_age_months <= 4) life_stage_factor = 3.0;
  else if (dog_age_months <= 12) life_stage_factor = 2.0;
  float der = rer * life_stage_factor;
  float food_kcal_per_gram = food_kcal_per_100g / 100.0;
  float daily_grams = der / food_kcal_per_gram;
  int grams_per_meal = round(daily_grams / 3.0);
  Blynk.virtualWrite(V_DISPLAY_PORTION, grams_per_meal);
  Blynk.virtualWrite(V_EDITABLE_PORTION, grams_per_meal);
  final_portion_grams = grams_per_meal;
}

// =================================================================
// CAMERA SERVER
// =================================================================
esp_err_t stream_handler(httpd_req_t *req){
  camera_fb_t * fb = NULL; esp_err_t res = ESP_OK; size_t _jpg_buf_len = 0; uint8_t * _jpg_buf = NULL; char * part_buf[64];
  res = httpd_resp_set_type(req, "multipart/x-mixed-replace;boundary=--FRAME");
  if(res != ESP_OK){ return res; }
  while(true){
    fb = esp_camera_fb_get();
    if (!fb) { res = ESP_FAIL; } else {
      if(fb->format != PIXFORMAT_JPEG){
        bool jpeg_converted = frame2jpg(fb, 80, &_jpg_buf, &_jpg_buf_len); esp_camera_fb_return(fb); fb = NULL;
        if(!jpeg_converted){ res = ESP_FAIL; }
      } else { _jpg_buf_len = fb->len; _jpg_buf = fb->buf; }
    }
    if(res == ESP_OK){
      size_t hlen = snprintf((char *)part_buf, 64, "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n", _jpg_buf_len);
      res = httpd_resp_send_chunk(req, (const char *)part_buf, hlen);
    }
    if(res == ESP_OK){ res = httpd_resp_send_chunk(req, (const char *)_jpg_buf, _jpg_buf_len); }
    if(res == ESP_OK){ res = httpd_resp_send_chunk(req, "\r\n--FRAME\r\n", 11); }
    if(fb){ esp_camera_fb_return(fb); fb = NULL; _jpg_buf = NULL; } else if(_jpg_buf){ free(_jpg_buf); _jpg_buf = NULL; }
    if(res != ESP_OK){ break; }
  } return res;
}

void startCameraServer(){
  httpd_config_t config = HTTPD_DEFAULT_CONFIG(); config.server_port = 80;
  httpd_uri_t stream_uri = { .uri = "/stream", .method = HTTP_GET, .handler = stream_handler, .user_ctx = NULL };
  if (httpd_start(&stream_httpd, &config) == ESP_OK) { httpd_register_uri_handler(stream_httpd, &stream_uri); }
}

// =================================================================
// MAIN SETUP AND LOOP
// =================================================================
void setup() {
  Serial.begin(115200);
  Serial.println("PAWFEEDS Integrated Firmware Booting (v3.9)...");
  foodServo.attach(SERVO_PIN);
  foodServo.write(SERVO_CLOSED_POS);
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0; config.ledc_timer = LEDC_TIMER_0; config.pin_d0 = Y2_GPIO_NUM; config.pin_d1 = Y3_GPIO_NUM; config.pin_d2 = Y4_GPIO_NUM; config.pin_d3 = Y5_GPIO_NUM; config.pin_d4 = Y6_GPIO_NUM; config.pin_d5 = Y7_GPIO_NUM; config.pin_d6 = Y8_GPIO_NUM; config.pin_d7 = Y9_GPIO_NUM; config.pin_xclk = XCLK_GPIO_NUM; config.pin_pclk = PCLK_GPIO_NUM; config.pin_vsync = VSYNC_GPIO_NUM; config.pin_href = HREF_GPIO_NUM; config.pin_sscb_sda = SIOD_GPIO_NUM; config.pin_sscb_scl = SIOC_GPIO_NUM; config.pin_pwdn = PWDN_GPIO_NUM; config.pin_reset = RESET_GPIO_NUM; config.xclk_freq_hz = 20000000; config.pixel_format = PIXFORMAT_JPEG; config.frame_size = FRAMESIZE_SVGA; config.jpeg_quality = 25; config.fb_count = 1;
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) { Serial.printf("Camera init failed with error 0x%x", err); return; }
  Serial.println("Camera initialized.");
  Blynk.begin(BLYNK_AUTH_TOKEN, ssid, password);
  Serial.println("Connecting to Wi-Fi and Blynk...");
  timer.setInterval(1000L, checkSchedules);
  startCameraServer();
  Serial.println("Blynk timer and Camera server started.");
  Serial.print("Local Camera Stream URL: http://");
  Serial.print(WiFi.localIP());
  Serial.println("/stream");
}

void loop() {
  Blynk.run();
  timer.run();
  handleDispensing();
  handleStatusMessage();
}