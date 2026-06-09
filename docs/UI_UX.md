# 🎨 UI_UX.md

## 1. Design Philosophy: "The Aurora DevOps Experience"

DeployForge's UI is designed to feel like a premium SaaS tool (Vercel/Railway level). It prioritizes speed, clarity, and "alive" aesthetics.

- **Theme**: Dark-First (Primary) with an optional High-Contrast mode.
- **Aesthetic**: Aurora UI (subtle mesh gradients) + Minimalism.
- **Micro-interactions**: Every action (deploying, saving, connecting) has a feedback animation.

---

## 2. Design System Tokens

### 2.1 Colors
- **Background**: `#020617` (Slate 950)
- **Surface**: `#0f172a` (Slate 900)
- **Border**: `#1e293b` (Slate 800)
- **Primary (Accent)**: `#38bdf8` (Sky 400) - Used for "Liquid Glass" effects (10-15% opacity).
- **Success**: `#10b981` (Emerald 500)
- **Danger**: `#f43f5e` (Rose 500)
- **Warning**: `#f59e0b` (Amber 500)

### 2.2 Typography
- **Headings**: `Outfit` or `Geist` (Modern Sans)
- **Body**: `Inter` (Legibility)
- **Code/Terminal**: `JetBrains Mono`

### 2.3 Visual Effects
- **Liquid Glass**: 10-15% transparent accent backgrounds with `backdrop-filter: blur(12px)`.
- **Aurora Gradients**: Fixed blurred backgrounds in the corners of the dashboard to provide depth.
- **Shadows**: Soft, multi-layered shadows for cards.

---

## 3. Component Library (shadcn/ui based)

- **Button**: High-gloss gradient for primary actions, subtle ghost for secondary.
- **Terminal Window**: TUI-style (Text User Interface) with CRT scanline effect and blinking cursor.
- **Deployment Card**: Displays branch, commit, duration, and a real-time status pulse.
- **Monitoring Charts**: Flat Design 2.0 (No grid lines, smooth Bezier curves, area gradients).

---

## 4. Pages & Wireframe Layouts

### 4.1 Landing Page
- **Header**: Sticky glassmorphism navbar.
- **Hero**: Animated code block "Deploying..." with aurora background.
- **Scrollytelling**: Features fade-in as the user scrolls.

### 4.2 Dashboard
- **Sidebar**: Collapsible, icons-only on mobile.
- **Main Area**: Grid of "Deployed Projects" and "Connected Servers".

### 4.3 Logs & Terminal
- Split screen: Top 70% Terminal (Real-time build logs), Bottom 30% Process stats.

### 4.4 VPS Management
- Table view with status indicators.
- One-click "SSH into Server" opening a modal with the browser terminal.

---

## 5. Mobile Experience
- Responsive layout using Tailwind's flex/grid.
- Bottom navigation bar for core actions (Dashboard, Alerts, Settings).
