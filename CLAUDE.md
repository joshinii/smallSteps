# CLAUDE.md / Agent Guidelines

*This file defines the behavior, philosophy, and technical constraints for the SmallSteps agent.*

# 1. Core Philosophy & Identity

### The Gentle Architect
- We prioritize cognitive offloading.  
- The agent acts as a supportive partner, not a drill sergeant.  
- Features that require the user to "manage" the tool (e.g., organizing tags, manually rescheduling overdue items) are rejected.  
- The app should help users who feel **overwhelmed or anxious** by following **scientifically aligned methods**:  
  - **Cognitive Load Theory:** Fewer visible choices.  
  - **Behavioral Activation:** Small, doable actions.  
  - **Self-Determination Theory:** Autonomy over control.  
  - **Avoidance Reduction:** No punishment signals.  

### Pressure-Free Language
- Use calming, supportive terminology.  
- Avoid urgency words like **"Deadline," "Overdue," "Failed," "Urgent."**  
- Use alternatives like **"Target Date," "Not today," "Gentle reminder."**  

### Anti-Gamification
- Strictly no streaks, points, levels, or leaderboards.  
- Success is visualized through quiet completion and the **"Daily Moment,"** not high scores.  

---

# 2. Technical Architecture

## Data Layer
- **Local-First Strategy:** All user data (goals, tasks, logs) stays in the user's browser via IndexedDB (see `lib/db.ts`).  
- **No External Database:** Do not use server-side databases (PostgreSQL/MySQL) for user data.  
- **Strict Types:** All data interactions strictly follow interfaces in `lib/schema.ts` (e.g., `Goal`, `Task`, `DailyAllocation`).  
- **ID Generation:** Use the `generateId()` utility from `lib/utils.ts` for all new entities.  

## AI Integration (`lib/ai/`)
- **Provider Agnostic:** Use the `AIProvider` interface; never import specific SDKs (like `@anthropic-ai/sdk`) directly into UI components.  
- **Adapter Pattern:** Retrieve AI instances using `getProvider(providerName)` from `lib/ai/index.ts`.  
- **In-Memory Secrets:** API keys must never be persisted to localStorage or IndexedDB plain text; store in-memory or obfuscated only.  
- **Manual Fallback:** Every AI-powered feature must have a manual alternative for users without API keys.  

---

# 3. The "SmallSteps" Task Model

## Effort & Capacity (The "Physics" of the App)

### Effort Mapping
- **Light (1 Unit):** 5–15 mins (Avg: 7m). Quick wins.  
- **Medium (2 Units):** 20–45 mins (Avg: 25m). Standard "step."  
- **Heavy (4 Units):** 60–90 mins (Avg: 75m). Deep work.  

### Capacity Rules
- **Standard Capacity:** 2–5 Units per day.  
- **The Heavy Limit:** Max 1 Heavy task per day. AI must never schedule two Heavy tasks on the same date.  
- **Completion Logic:** Task is considered complete at 95% of estimated time (`COMPLETION_THRESHOLD`).  

## Planning Engine
- **Implicit Priority:** Never show "High/Medium/Low" tags. Priority is calculated internally (`calculateTaskWeight`).  
- **Soft Deadlines:** `targetDate` is a reference point, not a cliff.  
- **Skip Handling:** Skipping a task (`handleSkip`) is neutral; increments `skipCount` but does not penalize.  

---

# 4. Coding Constraints

- **JSON-First AI:** When prompting for structured data, explicitly request valid JSON matching the Task schema.  
- **No "useEffect" Chains:** Use Promise-based DB wrappers (`goalsDB.getAll()`, etc.) for data fetching.  
- **Visual Calm:**  
  - **Forbidden Color:** Avoid `#ff0000` (Pure Red); use Muted Orange or Slate for alerts.  
  - **Display:** Always show the `effortLabel` (Light/Medium/Heavy), never `estimatedTotalMinutes`.  

---

# 5. User-Centric, Science-Aligned Approach

The app should be developed to **support overwhelmed or anxious users**:  
- **Cognitive Load Theory:** Limit visible choices.  
- **Behavioral Activation:** Encourage small, actionable tasks.  
- **Self-Determination Theory:** Autonomy over control.  
- **Avoidance Reduction:** Eliminate punishment signals.

---

# 6. Design Rules

### The "Calm" Design System Rules

**Color Palette (Dark Mode First):**
- **Backgrounds:** Never use pure black (#000000). Use deep, rich charcoal or slate (e.g., `#0F172A` or `#121212`).
- **Accents:** Use soft, nature-inspired tones (Muted Lavender/Sage Green). NO aggressive bright blues.
- **Danger/Skip:** NEVER use bright Red (#FF0000). Use muted "Salmon" or "Clay".
- **Text:** High readability without harsh contrast. Slate-200 for primary, Slate-400 for secondary.

**Glassmorphism & Depth:**
- **Cards:** No solid borders. Use Glass effect: `backdrop-filter: blur(12px); background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.05);`.
- **Shadows:** Soft, diffuse shadows only.

**Animation (Framer Motion):**
- **Speed:** "Slow and Smooth" (duration: 0.4s, ease: "easeInOut").
- **Entry:** Fade in + Slide up.
- **Hover:** Subtle lift (scale 1.01).

**Component Specifics:**
- **Task List:** Show effortLabel pills. Do NOT show minutes.
- **Habit Matrix:** Dot/Soft visually for completion. No bright green checks.
- **Strictly Forbidden:** "Overdue" text, Streaks/Points, Countdown timers, "Lazy" empty states.

---

# 7. Implementation Reference

## Development Commands
```bash
npm run dev          # Start dev server
npm run build        # Build for production
```

## Core Domain Logic (Deep Dive)

**Goal Lifecycle:**
1. **One-time goals**: Active → Completed (moves to Journey page)
2. **Lifelong goals** (`lifelong: true`): Daily recurring tasks that reset each day
   - Completes when `totalRecurringDaysTarget` reached, otherwise perpetual

**Task Progress Updates:**
- **One-Time:** Update `completedMinutes` → Update `TaskProgress` store → Check goal completion.
- **Recurring:** Update `completedMinutes` → Update `recurringTaskHistory` → Goal stats update.

**Daily Reset System:**
- Checked on Today page load against `localStorage['lastResetDate']`.
- Resets recurring tasks, logs yesterday's history, updates streaks (internally only).

**Planning Engine (`lib/planning-engine.ts`):**
- Estimates daily capacity (14-day history).
- Selects tasks via weighted priority.
- **Preset Modes:** Gentle (0.6x), Focused (1.0x), Energetic (1.2x), Recovery (0.4x).

## Page Structure
- `/` - **Home**: Goal management (collapsed cards).
- `/today` - **Today**: Focus view (Top 3 tasks).
  - **Focus Zone**: Goal tasks (Cards).
  - **Habits Zone**: Ambient checklist (No cards).
- `/journey` - **Journey**: Completed goals.
- `/habits` - **Habits**: Monthly grid (History).

## Key Stores (IndexedDB)
- `goals`, `tasks`
- `dailyAllocations` (Plan cache)
- `taskProgress` (Time logs)
- `recurringTaskHistory` (Habit logs)
- `dailyMoments` (Journal)

## Testing Recommendations
When modifying core functionality, verify:
1. **Goal completion flow**: Create one-time goal → complete all tasks → verify moves to Journey.
2. **Daily goal reset**: Create lifelong goal → verify resets tomorrow.
3. **Skip functionality**: Skip task → verify neutral rotation.
4. **AI Validation**: Ensure fallback to Manual mode works if key is missing/invalid.

Claude Rules:
1. First think through the problem, read the codebase for relevant files, and write a plan to tasks/todo.md.
2. The plan should have a list of todo items that you can check off as you complete them
3. Before you begin working, check in with me and I will verify the plan.
4. Then, begin working on the todo items, marking them as complete as you go.
5. Please every step of the way just give me a high level explanation of what changes you made
6. Make every task and code change you do as simple as possible. We want to avoid making any massive or complex changes. Every change should impact as little code as possible. Everything is about simplicity.
7. Finally, add a review section to the todo.md file with a summary of the changes you made and any other relevant information.
8. DO NOT BE LAZY. NEVER BE LAZY. IF THERE IS A BUG FIND THE ROOT CAUSE AND FIX IT. NO TEMPORARY FIXES. YOU ARE A SENIOR DEVELOPER. NEVER BE LAZY
9. MAKE ALL FIXES AND CODE CHANGES AS SIMPLE AS HUMANLY POSSIBLE. THEY SHOULD ONLY IMPACT NECESSARY CODE RELEVANT TO THE TASK AND NOTHING ELSE. IT SHOULD IMPACT AS LITTLE CODE AS POSSIBLE. YOUR GOAL IS TO NOT INTRODUCE ANY BUGS. IT'S ALL ABOUT SIMPLICITY