# Codex Device

Track a local Codex run, signal its completion on a scent dock, and open the matching result. The console starts in simulation. Its manual result button works with or without a recorder.

## Run the simulator

Use Node 20.19 or newer. To track real jobs, install and sign in to the [Codex CLI](https://learn.chatgpt.com/docs/non-interactive-mode).

```sh
npm ci
npm run build
npm run device
```

Open `http://127.0.0.1:8787`. Choose **Arm next cue**, then **Simulate completion**. Open the result with the button or **Simulate EEG selection**, save feedback, and export the trial log. Simulated events are labeled in the console and in the log.

From another terminal, track a real job with the bridge running.

```sh
npm run device:track -- "Review the working tree and summarize the changes."
```

The wrapper preserves the Codex CLI’s normal workspace permissions. It listens for `turn.completed` and waits for a successful process exit. The result is printed to the terminal and added to the local console. Arming applies to the next successful completion, once. To use a different port, pass `--port NUMBER` to both commands before the prompt separator.

From another Git repository, run `npm --prefix /path/to/olfactory-web run device:track -- "your task"`. The tracked command runs in the directory you invoked npm from.

## USB dock reference

The [Arduino Uno sketch](dock/dock.ino) provides a timed pump and valve sequence. Flash it with `arduino-cli compile --fqbn arduino:avr:uno device/dock` and the corresponding upload command for the attached Uno. Start the bridge with its serial port.

```sh
npm run device -- --dock /dev/ttyACM0
```

| Uno pin | Bench interface |
|---|---|
| D5 | Active-high pump driver |
| D6 | Active-high scent valve driver |
| D7 | Active-high clean-air valve driver |
| D8 | Normally open mute interlock with internal pull-up. Ground enables the bench outputs. |

Use externally powered drivers with default-off inputs and normally closed valves. Use a physical mute switch that cuts actuator power and opens the D8 interlock. Verify transitions with LEDs before attaching pump and valve drivers. The firmware boots with all outputs off and stops an active cycle on mute or heartbeat loss. `ACK` and `PURGED` are controller events. Use the external sensor fields to enter measured odor onset and clearance at the passive headset outlet. The pulse and purge constants are initial bench timings. Verify actual startup, mute, disconnect, carryover, and plume timing before a wear trial.

Keep the pump, switching, and cartridge on the desk. Route the scent and clean-air branches to the same open-air outlet. A removable clip holds the passive outlet near the headset with no face contact. Choose its position on the bench by measuring the plume with head movement and room airflow. Compare the scent and blank paths for airflow and sound before using them in a blinded session.

The dock uses 115200-baud newline-delimited ASCII. The bridge sends `PING` and accepts `DOCK1 READY`, `DOCK1 MUTED`, or `DOCK1 BUSY`. A `PULSE <uuid> SCENT` or `PULSE <uuid> BLANK` receives `ACK <uuid>` and `PURGED <uuid>`, or a terminal `REJECTED <uuid>` or `STOPPED <uuid>`. `MUTE` stops an active cycle. After disconnect or loss of acknowledgement, the bridge labels the cue unconfirmed. The journal prevents another pulse for that run.

## Record EEG

Use a battery-powered OpenBCI Cyton and its separate USB dongle, following the [manufacturer’s recording setup](https://docs.openbci.com/GettingStarted/Boards/CytonGS/). For the reference montage, connect O1, Oz, and O2 to the selected input channels. Install the optional Python dependencies in a virtual environment.

```sh
python3 -m venv .venv
.venv/bin/pip install -r device/requirements.txt
npm run device -- --dock /dev/ttyACM0 --eeg /dev/ttyUSB0 --python .venv/bin/python --channels 1,2,3
```

Complete one **ignore** block and one **look** block. After calibration, enable the EEG target for the next armed cue. The target appears after the controller reports its purge. The local decoder scores 1.2-second windows using canonical correlation with the target frequency and its harmonic, compared with neighboring reference frequencies. It opens only the pending local result after two consecutive qualifying estimates. The screen target is opt-in, brief, and disabled with the reduced-motion setting. Physical luminance timing and decoding performance need separate checks on the actual monitor and recorder.

The calibration is saved for the same recorder port, channel configuration, and decoder revision. Use a fresh calibration after changes to the recording setup. Keep the settings fixed for held-out trials. The user-facing blinded mode hides scent versus blank until feedback is saved. The exported log includes the trial assignment for analysis.

## Evidence and limitations

The bridge serves the UI on loopback and stores the journal in the user’s local state directory under `olfactory-device`. The export omits the Codex result text. Raw EEG stays in the acquisition process. The UI records target display acknowledgement and device protocol timestamps. The physical onset and clearance fields store operator-entered sensor measurements.

Run `npm test` for the bridge, journal, and CLI parser checks. The software simulator validates the workflow. Actual odor delivery, display timing, and usability metrics require an instrumented hardware trial.
