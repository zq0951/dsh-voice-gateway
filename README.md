---
description: "Voice Gateway client surface plugin for the DSH web client: mic status indicator, six-state machine, voiceprint enrollment, and auto-speak controls."
kind: "package-reference"
---

# @xp1024/dsh-voice-gateway

DeepSeek Harness (DSH) 物理语音交互网关客户端插件 (Client Surface Plugin)。

为 DSH Web 客户端提供物理麦克风状态指示器、声纹识别与注册管理、对话自动语音朗读（Auto-speak）等全双工语音交互控制能力。

> **Note**: 本项目为第三方独立开源插件，非 DeepSeek 官方附属产品。
> 需配合物理语音网关守护进程 [Local Voice Gateway](https://github.com/zq0951/local-voice-gateway) 一起使用。

---

## 快速上手 (Quick Start)

### 1. 前置条件：启动语音网关守护进程
本插件作为客户端 UI 表面，需与运行中的语音网关（默认端口 `8765`）通过 WebSocket / REST API 通信：

```bash
# 克隆并启动本地语音网关
git clone git@github.com:zq0951/local-voice-gateway.git
cd local-voice-gateway
./start.sh
# 网关默认监听 http://127.0.0.1:8765 与 ws://127.0.0.1:8765/v1/events
```

### 2. 在 DSH 中安装本插件
在已配置好的 DSH Profile（如 `web`）中安装并激活本插件：

```bash
dsh plugin --profile web add @xp1024/dsh-voice-gateway
```

或者在本地开发测试时，直接指向本地路径安装：
```bash
dsh plugin --profile web add /path/to/dsh-voice-gateway
```

### 3. 启动 DSH Web 界面
```bash
dsh web --port 3080
```
启动后在浏览器打开 DSH，对话输入栏右侧将渲染麦克风控制按钮。

---

## 功能特性 (Features)

- **六态实时状态指示器 (Six-State Machine Indicator)**：
  - `disconnected`：未连接到语音网关守护进程。
  - `connecting`：正在建立 WebSocket 连接。
  - `idle`：网关就绪，麦克风处于待命状态。
  - `recording`：检测到有效人声输入并正在采音录制。
  - `processing`：ASR 语音转文字与声纹匹配计算中。
  - `generating`：大模型生成回复中，语音网关处于合成与播报准备态。
- **声纹过滤与多发言人管理 (Voiceprint Enrollment & Filtering)**：
  - 内置向导式声纹录制弹窗，引导用户录制固定发音语料并注册声纹特征。
  - 支持多用户声纹列表管理，主动过滤未授权发言人语音，杜绝环境杂音或旁人误唤醒。
- **双向语音交互 (Bi-directional Voice Turn-Taking)**：
  - 语音识别结果格式化为带有发言人标记的提示词 `[<speaker>] <text>`，无缝注入当前活动会话。
  - 支持 `auto_speak` 自动播报开关，监听到智能体回复时自动调用网关硬件扬声器进行 TTS 朗读。
- **动态网关地址配置 (Custom Gateway Endpoint)**：
  - 支持在 UI 设置面板中灵活修改语音网关地址（默认为 `http://${window.location.hostname}:8765`）。

---

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Compatible Gateway Specification](#compatible-gateway-specification)
- [License](#license)

-----

<a id="use-this-package"></a>
## Use this package

The voice control button is mounted into the conversation input bar:
- **Six-state indicator**: Reflects `disconnected`, `connecting`, `idle`, `recording`, `processing`, and `generating` gateway states.
- **Trigger mode toggle**: Switch between passive voiceprint recognition, wake word only, and hybrid mode.
- **Auto-speak toggle**: Enable or disable automatic text-to-speech for assistant responses.
- **Voiceprint enrollment**: Open the guided wizard to record speaker samples and manage saved profiles.
- **Gateway address configuration**: Customize and update the local voice gateway endpoint dynamically.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Reactive Hooks Compartment

The browser half registers the `VoiceControl` component into `conversation.input.right`. Following DSH client discipline rules, the component contains no external subscription machinery; reactive state is passed through the reserved `hooks` compartment and bound to `useVoice` by the renderer.

### Session Event Observation

The `VoiceManager` service observes active session updates via `ctx.sessions`. Assistant completions are detected through authoritative `assistant/message` events on the session `eventSource` rather than scraping presentation views.

</details>

-----

<a id="compatible-gateway-specification"></a>
## Compatible Gateway Specification

The client plugin communicates with the voice gateway daemon ([Local Voice Gateway](https://github.com/zq0951/local-voice-gateway)) over standard HTTP REST and WebSocket protocols:

1. **Endpoint Discovery & Addressing**:
   - Default: Automatically binds to `http://${window.location.hostname}:8765` and `ws://${window.location.hostname}:8765/v1/events`.
   - Custom: Configurable via the settings popover UI or `localStorage.setItem('dsh.voice.gateway_url', 'http://<host>:<port>')`.

2. **Single Source of Truth (SSOT)**:
   - The gateway daemon owns the authoritative state of `trigger_mode`, `auto_speak`, `audio_duplex_mode`, and `registered_speakers`.
   - The plugin initializes state via `GET /v1/system/status` on connect and subscribes to `/v1/events` for real-time synchronization, preventing local state drift.

3. **Required Backend Interface Contract**:
   - `GET /v1/system/status` — Returns gateway health, mode, and speaker roster.
   - `POST /v1/system/mode` — Switches active trigger mode (`wake_word`, `voiceprint_passive`, `hybrid`).
   - `POST /v1/system/autospeak` — Toggles automatic voice response narration.
   - `POST /v1/audio/speak` & `POST /v1/audio/stop` — Hardware speech output and instant interruption.
   - `GET /v1/voiceprint/profiles` & `DELETE /v1/voiceprint/:name` — Speaker profile management.
   - `POST /v1/voiceprint/enroll/*` — Step-by-step guided voiceprint sample collection.
   - `WS /v1/events` — Real-time event broadcast (`speech_recognized`, `wake_word_detected`, `playback_started`, `playback_stopped`, `tts_generating`, `mode_changed`, etc.).

-----

<a id="license"></a>
## License

[MIT License](LICENSE) © 2026 xp1024 (zq0951)
