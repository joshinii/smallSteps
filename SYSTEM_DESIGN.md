# SmallSteps System Design

## Philosophy

SmallSteps is designed for **overwhelmed users**. The core principle is **cognitive offloading**: the system makes decisions about *what* and *when* so the user only has to *do*.

- **No deadlines, no punishment.** Target dates are internal pressure weights, not hard deadlines.
- **No gamification.** Progress is shown as effort drained, not streaks or points.
- **Calm defaults.** The system prefers gentle planning over ambitious overload.

---

## Core Concepts

### 1. Goals
A Goal is an aspiration (e.g., "Learn Guitar"). It has:
- `content`: User-provided text
- `targetDate`: Optional internal weight (used for prioritization, not enforced)
- `status`: `active` | `paused` | `drained`
- `lifelong`: If `true`, this is a habit-like goal (daily recurring)

### 2. Tasks (Effort Containers)
A Task is a **container of effort** that drains over time.
- `estimatedTotalMinutes`: Total effort required
- `completedMinutes`: Effort already spent
- `effortLabel`: `warm-up` | `settle` | `dive` (for queue categorization)

**Key Insight:** Tasks persist across days until their effort is exhausted.

### 3. Daily Allocations
A snapshot of which tasks are planned for a specific date.
- `taskIds`: Array of Task IDs selected for the day
- `estimatedLoad`: Total planned minutes
- `dayType`: `gentle` | `balanced` | `focused` | `energetic` | `recovery`

---

## Data Flow

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  GoalCreator    │──────▶  AI Decompose   │──────▶  Task Queue     │
│  (User Input)   │      │  (Gemini API)   │      │  (Prioritized)  │
└─────────────────┘      └─────────────────┘      └─────────────────┘
                                                          │
                                                          ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  Today Page     │◀─────  Daily Planner   │◀─────  Capacity Est.   │
│  (Execution)    │      │  (Selection)    │      │  (Minutes/Day)  │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

---

## Key Modules

### `lib/planning-engine.ts`
The brain of the system. Responsible for:
1. **Capacity Estimation** (`estimateDailyCapacity`)
   - Returns a `CapacityRange` (min, preferred, max) in minutes
   - Adapts based on history (skip rate, completion rate)

2. **Task Selection** (`selectTasksForDate`)
   - Pulls tasks from the queue based on capacity and day mode
   - Guarantees at least one task if work exists

3. **Daily Plan Generation** (`generateDailyPlan`)
   - Creates or retrieves the day's allocation
   - Respects mode-specific capacity multipliers

### `lib/task-queue.ts`
Priority queue system:
- Tasks are categorized by effort level (`light`, `medium`, `heavy`)
- Priority factors: goal target date, skip count, waiting days
- Mode weights control which effort levels are pulled

### `lib/ai/gemini-adapter.ts`
AI integration for goal decomposition:
- Sends goal text to Gemini API
- Parses structured JSON response
- Maps AI output to Task objects

### `app/api/ai/gemini/route.ts`
Server-side AI orchestration:
- Contains the decomposition prompt
- Enforces minimum task sizes (server-side)
- Logs request/response for diagnostics

---

## Capacity Model

```
Daily Capacity = Base (240 min) ± Adjustments

Adjustments:
- Recent skips: -10% per skip above threshold
- Active goal count: -5% per goal above 3
- Completion rate: +10% if > 80%
```

### Capacity Range
- **Min:** ~70% of preferred (for gentle/recovery days)
- **Preferred:** Calculated baseline
- **Max:** ~130% of preferred (for energetic days)

---

## Logging & Diagnostics

Structured JSON logging via `lib/logger.ts`:
- `LOG.GOAL_INPUT`: Goal creation start
- `LOG.AI_TASK_DECOMPOSITION_*`: AI prompt/response
- `LOG.TARGET_DATE_CALCULATION`: Feasibility checks
- `LOG.DAILY_PLAN_GENERATION`: Plan creation
- `LOG.QUEUE_ALLOCATION`: Task queueing
- `LOG.TASK_COMPLETION`: Effort recording

All logs include `traceId` for correlation.

---

## UI Flow

1. **Home Page** (`app/page.tsx`): Goal list, progress overview
2. **Goal Creator** (`components/GoalCreator.tsx`): AI-assisted decomposition
3. **Today Page** (`app/today/page.tsx`): Daily execution view
4. **Habits Page**: Lifelong goal management

---

## Database (IndexedDB)

Local-first architecture using IndexedDB:
- `goals`: Goal records
- `tasks`: Task records (effort containers)
- `dailyAllocations`: Date-keyed plan snapshots
- `taskQueue`: Priority queue entries
- `taskProgress`: Progress logs
- `recurringTaskHistory`: Habit completion tracking

---

## Design Decisions

1. **Minutes over Units**: All effort is measured in minutes for clarity.
2. **Never Block**: Goal admission suggests adjustments, never rejects.
3. **Guaranteed Flow**: Always surface at least one task if work exists.
4. **Server Enforcement**: AI constraints are enforced server-side to prevent prompt injection.
5. **No Dates from AI**: Target dates are calculated deterministically, never by AI.
