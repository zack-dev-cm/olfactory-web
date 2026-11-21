#include <Arduino.h>

constexpr uint8_t Pump = 5;
constexpr uint8_t ScentValve = 6;
constexpr uint8_t CleanValve = 7;
constexpr uint8_t MuteInput = 8;

constexpr unsigned long PulseMs = 600;
constexpr unsigned long PurgeMs = 1400;
constexpr unsigned long HostTimeoutMs = 1200;

enum Phase { Idle, Pulse, Purge };
Phase phase = Idle;
unsigned long phaseStarted = 0;
unsigned long lastPing = 0;
bool seenPing = false;
char activeId[37] = {};
char previousId[37] = {};
char command[80] = {};
size_t commandLength = 0;
bool overflow = false;

bool isMuted() {
  return digitalRead(MuteInput) == HIGH;
}

void reply(const char* status, const char* id) {
  Serial.print(status);
  Serial.print(' ');
  Serial.println(id);
}

void outputs(bool pump, bool scent, bool clean) {
  digitalWrite(Pump, LOW);
  digitalWrite(ScentValve, scent ? HIGH : LOW);
  digitalWrite(CleanValve, clean ? HIGH : LOW);
  if (pump) digitalWrite(Pump, HIGH);
}

void finish(const char* status) {
  outputs(false, false, false);
  phase = Idle;
  reply(status, activeId);
  memcpy(previousId, activeId, sizeof(previousId));
  activeId[0] = '\0';
}

bool isRunId(const char* id) {
  if (!id || strlen(id) != 36) return false;
  for (uint8_t i = 0; i < 36; i++) {
    const char c = id[i];
    const bool dash = i == 8 || i == 13 || i == 18 || i == 23;
    if (dash ? c != '-' : !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))) return false;
  }
  return true;
}

void receive() {
  if (strcmp(command, "PING") == 0) {
    seenPing = true;
    lastPing = millis();
    reply("DOCK1", isMuted() ? "MUTED" : phase == Idle ? "READY" : "BUSY");
    return;
  }
  if (strcmp(command, "MUTE") == 0) {
    if (phase != Idle) finish("STOPPED");
    return;
  }
  if (strncmp(command, "PULSE ", 6) != 0) return;
  char* id = command + 6;
  char* condition = strchr(id, ' ');
  if (!condition) return;
  *condition++ = '\0';
  if (!isRunId(id)) return;
  if (strcmp(id, activeId) == 0 || strcmp(id, previousId) == 0) return;
  const bool scented = strcmp(condition, "SCENT") == 0;
  if ((!scented && strcmp(condition, "BLANK") != 0) || phase != Idle || isMuted() ||
      !seenPing || millis() - lastPing > HostTimeoutMs) {
    reply("REJECTED", id);
    return;
  }
  memcpy(activeId, id, sizeof(activeId));
  phase = Pulse;
  phaseStarted = millis();
  outputs(true, scented, !scented);
  reply("ACK", id);
}

void setup() {
  pinMode(Pump, OUTPUT);
  pinMode(ScentValve, OUTPUT);
  pinMode(CleanValve, OUTPUT);
  outputs(false, false, false);
  pinMode(MuteInput, INPUT_PULLUP);
  Serial.begin(115200);
}

void loop() {
  if (phase != Idle) {
    const unsigned long now = millis();
    if (isMuted() || now - lastPing > HostTimeoutMs) {
      finish("STOPPED");
    } else if (phase == Pulse && now - phaseStarted >= PulseMs) {
      outputs(true, false, true);
      phase = Purge;
      phaseStarted = now;
    } else if (phase == Purge && now - phaseStarted >= PurgeMs) {
      finish("PURGED");
    }
  }

  // Put an upper bound on serial work between interlock checks.
  for (size_t count = 0; count < sizeof(command) && Serial.available(); count++) {
    const char input = Serial.read();
    if (input == '\n') {
      if (!overflow) {
        command[commandLength] = '\0';
        receive();
      }
      commandLength = 0;
      overflow = false;
    } else if (input != '\r' && !overflow) {
      if (commandLength < sizeof(command) - 1) command[commandLength++] = input;
      else overflow = true;
    }
  }
}
