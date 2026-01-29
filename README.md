# SmallSteps ✨

**Reduce overwhelm. One small step at a time.**

SmallSteps is a minimalist goal tracker designed to bridge the gap between big ambitions and daily action. It uses AI to decompose vague goals into tiny, concrete steps, helping you maintain a consistent daily rhythm without the stress.

---

### 🌊 The Flow
1. **Dream Big**: Input any goal, no matter how vague.
2. **AI Action**: SmallSteps breaks it down into actionable daily tasks.
3. **Daily Rhythm**: Log your "Small Moment" in a calm monthly grid.
4. **Milestones**: Reflect on your journey and celebrate the small wins.

---

### 🌟 Key Features
- 🤖 **Smart Decomposition**: Powered by Claude AI to create specific, actionable plans.
- 🔁 **Habits Matrix**: A beautiful, minimalist grid for tracking recurring daily actions.
- 🧘 **Calm Mode**: Minimalist UI designed to keep you focused on the *next* thing only.
- 📊 **Journey View**: Automated reflection on your progress and completed milestones.

---

### 📸 App Walkthrough

| **Focus & Tasks** | **Habits** |
| :---: | :---: |
| ![Goal Management](public/screenshots/home_page.png) | ![Habit Matrix](public/screenshots/habits_page.png) |
| *Manage goals and get AI steps* | *Track recurring daily actions* |

---

### 🚀 Getting Started

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment**:
   Create a `.env.local` file with:
   ```env
   CLAUDE_API_KEY=your_key_here
   DATABASE_URL="file:./dev.db"
   ```

3. **Initialize Database**:
   ```bash
   npx prisma migrate dev
   ```

4. **Run**:
   ```bash
   npm run dev
   ```

---

### 🛠️ Tech Stack
- **Framework**: Next.js 15 (App Router)
- **AI**: Anthropic Claude 3.5 Sonnet
- **Database**: Prisma + SQLite
- **Styling**: Tailwind CSS

---

Built with ❤️ for a calmer, more productive life.
