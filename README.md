# SmallSteps - Smart Goal & Habit Tracker

SmallSteps helps you achieve your goals by breaking them down into daily actionable tasks using AI, then tracking them with a beautiful habit calendar.

## Features

- 🤖 **AI-Powered Task Generation**: Uses Claude AI to break goals into specific, actionable daily tasks
- 📊 **Habit Tracker Calendar**: Month-view calendar grid to track daily completion of repetitive tasks
- 🔄 **Repetitive Tasks**: Mark tasks as daily habits and track them consistently
- ✅ **Simple Task Management**: Check off tasks, mark as daily habits, track progress
- 🎯 **Context-Aware AI**: Creates fitness, learning, organization, and health-specific task plans

## Quick Start

1. **Clone and install**
   ```bash
   npm install
   ```

2. **Set up environment**
   ```bash
   cp .env.example .env.local
   ```
   
   Add your Claude API key to `.env.local`:
   ```
   CLAUDE_API_KEY=your_anthropic_api_key_here
   DATABASE_URL="file:./dev.db"
   ```

3. **Set up database**
   ```bash
   npx prisma migrate dev
   ```

4. **Run development server**
   ```bash
   npm run dev
   ```

5. **Open browser**
   Navigate to http://localhost:3000

## How to Use

### 1. Add a Goal
Type your goal in the input box:
- "I want to build 6 packs"
- "Learn to code in Python"
- "Organize my house"

### 2. Break Down with AI
Click **"✨ Break Down All Goals into Tasks"**

AI will generate context-specific daily tasks:
- **Fitness goals** → Exercise routines, nutrition tracking, sleep
- **Learning goals** → Practice challenges, tutorials, code review
- **Organization** → Small decluttering sessions, decision-making tasks

### 3. Mark Daily Habits
For tasks you want to do every day:
- Click `+ Make daily habit` below any task
- Task shows `🔄 Daily` indicator
- AI automatically marks appropriate tasks as repetitive

### 4. Track on Calendar
Click **"📊 View Habits Tracker"**
- See all daily habits in a calendar grid
- Click cells to mark completion for specific dates
- Navigate between months
- Visual indicators: ✓ (done), • (not done)

## Tech Stack

- **Framework**: Next.js 15 + TypeScript
- **Styling**: Tailwind CSS
- **Database**: SQLite with Prisma ORM
- **AI**: Anthropic Claude (claude-3-5-sonnet)
- **Deployment**: Vercel-ready

## Project Structure

```
smallSteps/
├── app/
│   ├── page.tsx              # Main goals page
│   ├── habits/page.tsx       # Habit tracker calendar
│   └── api/
│       ├── ideas/            # CRUD for goals
│       ├── steps/            # CRUD for tasks
│       ├── completions/      # Daily habit tracking
│       └── ai/
│           ├── clarify/      # Idea clarification
│           └── decompose/    # Task generation
├── lib/
│   ├── claude.ts             # Claude AI client
│   ├── prisma.ts             # Database client
│   └── agents/
│       ├── clarifier.ts      # AI idea clarification
│       └── decomposer.ts     # AI task generation
├── prisma/
│   ├── schema.prisma         # Database schema
│   └── migrations/           # Database migrations
└── types/
    └── index.ts              # TypeScript types
```

## Database Schema

- **Idea**: Goals with priority and target dates
- **Step**: Tasks with categories, completion status, `isRepetitive` flag
- **TaskCompletion**: Daily completion tracking for repetitive tasks
- **Reflection**: Optional post-completion notes

## API Routes

- `GET/POST /api/ideas` - Manage goals
- `GET/POST /api/steps` - Manage tasks
- `PATCH /api/steps/[id]` - Update task (completion, repetitive status)
- `GET/POST /api/completions` - Track daily habit completions
- `POST /api/ai/clarify` - Clarify vague ideas
- `POST /api/ai/decompose` - Generate daily tasks

## Environment Variables

```env
CLAUDE_API_KEY=        # Your Anthropic API key
DATABASE_URL=          # Database connection (default: file:./dev.db)
```

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Connect to Vercel
3. Add environment variables:
   - `CLAUDE_API_KEY`
   - `DATABASE_URL` (use Vercel Postgres or Neon for production)
4. Deploy

## Get Claude API Key

1. Go to https://console.anthropic.com/
2. Sign up / Log in
3. Navigate to API Keys
4. Create a new API key
5. Copy to `.env.local`

## Examples

### "I want to build 6 packs"
AI generates:
- Do 3 sets of 20 crunches (exercise) 🔄 Daily
- Do 3 sets of 30-second planks (exercise) 🔄 Daily
- Eat 120g protein (nutrition) 🔄 Daily
- Track calories with 300 cal deficit (nutrition) 🔄 Daily
- Drink 2 liters of water (health) 🔄 Daily
- Get 7-8 hours of sleep (recovery) 🔄 Daily
- 20 minutes cardio (exercise) 🔄 Daily

### "Learn Python"
AI generates:
- Complete 1 LeetCode challenge (practice) 🔄 Daily
- Watch 15min Python tutorial (learning) 🔄 Daily
- Write 20 lines of code (practice) 🔄 Daily
- Read Python documentation (learning) 🔄 Daily
- Review yesterday's code (review) 🔄 Daily

## Troubleshooting

### "Generic tasks appearing instead of specific ones"
- Check that `CLAUDE_API_KEY` is set correctly in `.env.local`
- Check browser console for API errors
- Verify Claude API key is valid and has credits

### "Database errors"
```bash
npx prisma generate
npx prisma migrate reset
```

### "API rate limits"
- Free tier: 5 requests/minute
- Consider upgrading Claude API plan for production

## License

MIT

---

Built with ❤️ using Next.js and Claude AI
