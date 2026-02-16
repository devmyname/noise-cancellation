<p align="center">
  <img src="build/icon.png" alt="Denoise AI" width="128" height="128">
</p>

<h1 align="center">Denoise AI</h1>

<p align="center">
  Real-time AI-powered noise cancellation for your microphone
  <br>
  <a href="#-türkçe">Türkçe</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-28-47848F?logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/WebAssembly-SIMD-654FF0?logo=webassembly&logoColor=white" alt="WASM">
  <img src="https://img.shields.io/badge/Platform-Windows-0078D4?logo=windows&logoColor=white" alt="Windows">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
</p>

---

## 🎬 Demo

<img src="video/{CF0D7EF2-F9D7-4C6F-A3C4-72BB01DF3607}.png" alt="Denoise AI" width="377" height="640">


---

## 📖 English

### About

**Denoise AI** is a desktop application that removes background noise from your microphone in real time using AI models. Built with Electron and Web Audio API, it processes audio entirely on your device — no cloud, no latency, no data leaves your computer.

### Features

- **3 AI Noise Cancellation Models**
  - **Shiguredo RNNoise** — Balanced quality and performance (default)
  - **RNNoise Sapphi** — Ultra-low latency (~10ms)
  - **DeepFilterNet3** — Highest quality deep noise suppression with adjustable level
- **Real-time Processing** — ~23ms end-to-end latency via AudioWorklet + WebAssembly (SIMD)
- **Virtual Cable Routing** — Route cleaned audio to any app (Discord, Zoom, OBS, etc.) via VB-Audio Virtual Cable
- **Live Audio Meters** — Input, output, and noise reduction meters with waveform visualization
- **Voice Activity Detection (VAD)** — Real-time speech/silence indicator
- **Bilingual UI** — English & Turkish with auto system language detection
- **Single Instance** — Only one instance of the app can run at a time
- **System Tray** — Minimize to tray, quick toggle noise cancellation
- **Bundled VB-Cable Installer** — The setup wizard offers to install VB-Audio Virtual Cable automatically

### Installation

#### Download Installer (Recommended)

1. Go to [Releases](../../releases) and download **Denoise AI Setup 1.0.0.exe**
2. Run the installer — it will optionally install VB-Audio Virtual Cable
3. Launch **Denoise AI** from the desktop or start menu

#### Build from Source

```bash
# Clone the repository
git clone https://github.com/devmyname/noise-cancellation.git
cd denoise-ai

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build Windows installer
npm run dist
```

### Usage

1. **Select AI Model** — Choose from the three noise cancellation engines
2. **Select Input** — Pick your physical microphone
3. **Select Output** — Choose "CABLE Input (VB-Audio Virtual Cable)" to route audio
4. **Start** — Click the start button to begin real-time noise cancellation
5. **In other apps** — Set your microphone to "CABLE Output (VB-Audio Virtual Cable)"

### Tech Stack

| Technology | Purpose |
|---|---|
| Electron 28 | Desktop application framework |
| Web Audio API | Audio capture and routing |
| AudioWorklet | Real-time audio processing on dedicated thread |
| WebAssembly (SIMD) | High-performance AI model inference |
| ONNX Runtime | DeepFilterNet3 model execution |
| VB-Audio Virtual Cable | Virtual audio device routing |

### Acknowledgments / AI Models Used

| Model | Repository | Paper |
|---|---|---|
| **Shiguredo RNNoise** | [shiguredo/rnnoise-wasm](https://github.com/shiguredo/rnnoise-wasm) | Based on Mozilla RNNoise |
| **RNNoise Sapphi** | [sapphi-red/web-noise-suppressor](https://github.com/nicedoc/rnnoise) | RNN-based noise suppression |
| **DeepFilterNet3** | [Rikorose/DeepFilterNet](https://github.com/Rikorose/DeepFilterNet) | INTERSPEECH 2023 |

### System Requirements

- **OS:** Windows 10/11 (x64)
- **RAM:** 4 GB minimum
- **CPU:** Modern x64 processor (SIMD support recommended)

---

## 🇹🇷 Türkçe

### Hakkında

**Denoise AI**, yapay zeka modelleri kullanarak mikrofonunuzdaki arka plan gürültüsünü gerçek zamanlı olarak temizleyen bir masaüstü uygulamasıdır. Electron ve Web Audio API ile geliştirilmiştir. Tüm ses işleme cihazınızda yapılır — bulut bağlantısı yok, gecikme yok, verileriniz bilgisayarınızdan çıkmaz.

### Özellikler

- **3 Yapay Zeka Gürültü Engelleme Modeli**
  - **Shiguredo RNNoise** — Dengeli kalite ve performans (varsayılan)
  - **RNNoise Sapphi** — Ultra düşük gecikme (~10ms)
  - **DeepFilterNet3** — En yüksek kalitede derin gürültü bastırma, ayarlanabilir seviye
- **Gerçek Zamanlı İşleme** — AudioWorklet + WebAssembly (SIMD) ile ~23ms uçtan uca gecikme
- **Sanal Kablo Yönlendirme** — Temizlenmiş sesi VB-Audio Virtual Cable ile herhangi bir uygulamaya yönlendirin (Discord, Zoom, OBS vb.)
- **Canlı Ses Göstergeleri** — Giriş, çıkış ve gürültü azaltma göstergeleri, dalga formu görselleştirmesi
- **Ses Aktivite Algılama (VAD)** — Gerçek zamanlı konuşma/sessizlik göstergesi
- **İki Dilli Arayüz** — Türkçe ve İngilizce, otomatik sistem dili algılama
- **Tek Örnek** — Aynı anda yalnızca bir uygulama penceresi çalışır
- **Sistem Tepsisi** — Tepsiye küçültme, hızlı gürültü engelleme açma/kapama
- **VB-Cable Kurulumu Dahil** — Kurulum sihirbazı VB-Audio Virtual Cable'ı otomatik olarak kurmayı teklif eder

### Kurulum

#### Yükleyiciyi İndir (Önerilen)

1. [Releases](../../releases) sayfasına gidin ve **Denoise AI Setup 1.0.0.exe** dosyasını indirin
2. Yükleyiciyi çalıştırın — isteğe bağlı olarak VB-Audio Virtual Cable kurulumu yapılır
3. **Denoise AI**'yi masaüstünden veya başlat menüsünden çalıştırın

#### Kaynak Koddan Derleme

```bash
# Repoyu klonlayın
git clone https://github.com/devmyname/noise-cancellation.git
cd denoise-ai

# Bağımlılıkları yükleyin
npm install

# Geliştirme modunda çalıştırın
npm run dev

# Windows yükleyicisi oluşturun
npm run dist
```

### Kullanım

1. **Yapay Zeka Modeli Seçin** — Üç gürültü engelleme motorundan birini seçin
2. **Giriş Seçin** — Fiziksel mikrofonunuzu seçin
3. **Çıkış Seçin** — Sesi yönlendirmek için "CABLE Input (VB-Audio Virtual Cable)" seçin
4. **Başlat** — Gerçek zamanlı gürültü engellemeyi başlatmak için başlat düğmesine tıklayın
5. **Diğer uygulamalarda** — Mikrofon olarak "CABLE Output (VB-Audio Virtual Cable)" seçin

### Kullanılan AI Modelleri

| Model | Repo | Açıklama |
|---|---|---|
| **Shiguredo RNNoise** | [shiguredo/rnnoise-wasm](https://github.com/shiguredo/rnnoise-wasm) | Mozilla RNNoise tabanlı |
| **RNNoise Sapphi** | [sapphi-red/web-noise-suppressor](https://github.com/nicedoc/rnnoise) | RNN tabanlı gürültü bastırma |
| **DeepFilterNet3** | [Rikorose/DeepFilterNet](https://github.com/Rikorose/DeepFilterNet) | INTERSPEECH 2023 |

### Sistem Gereksinimleri

- **İşletim Sistemi:** Windows 10/11 (x64)
- **RAM:** Minimum 4 GB
- **İşlemci:** Modern x64 işlemci (SIMD desteği önerilir)



## � Donate / Bağış

If you find this project useful, consider supporting the developer:

Bu projeyi faydalı buluyorsanız, geliştiriciye destek olmayı düşünün:

**USDT (TRC20 — Tron Network)**
```
TLApWJzFVDTDHLtSL18atRuzhEgjzirtAZ
```

---

## �📄 License / Lisans

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

Bu proje MIT Lisansı ile lisanslanmıştır. Detaylar için [LICENSE](LICENSE) dosyasına bakın.







