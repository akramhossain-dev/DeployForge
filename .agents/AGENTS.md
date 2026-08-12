# DeployForge — Critical Design Constraints & System Rules

## Visual Reference & Design Direction
Inspired by the functional restraint of Vercel Dashboard, GitHub, Linear, and Railway.
Every UI element must have a direct, functional purpose.

## Explicit Avoidance Rules (STRICT PROHIBITION)
- NO gradient backgrounds
- NO glowing borders or colored rings
- NO glassmorphism or translucent backdrop blurs
- NO SaaS hero sections inside authenticated pages
- NO large statistic cards
- NO decorative charts or fake analytics
- NO fake activity feeds
- NO large empty spaces or mobile layouts on desktop viewports
- NO floating cards
- NO excessive border radius (use small radius `rounded` / `rounded-md`, 4px-6px)
- NO oversized headings
- NO centered 1100px constrained containers (optimize for large/ultrawide displays)
- NO huge paddings
- NO colorful badges
- NO decorative illustrations
- NO marketing-style copy

## Functional & Architectural Principles
- **Dense Information Layout**: Maximize information density cleanly.
- **Content-First Design**: Tables over cards where appropriate; high readability.
- **Pure Dark System Tokens**:
  - Background: `#000000`
  - Primary Surface: `#0A0A0A`
  - Secondary Surface: `#111111`
  - Border: `#1F1F1F`
  - Text Primary: `#FFFFFF`
  - Text Secondary: `#A1A1A1`
  - Text Muted: `#666666`
- **Minimal Colors**: Monochrome palette with muted semantic status tags.
- **Small Radius**: `rounded-md` or `rounded` (4px to 6px).
- **Real Data Only**: No mock counters or fake analytics.
- **Large-Monitor Optimization**: Intelligently utilize horizontal space with multi-column grids and high-density tables.
- **Technical Interface**: Monospace inputs, labels, status badges, and log terminals.
