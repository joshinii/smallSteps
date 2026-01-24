# SmallSteps - Quick Start Guide

## 🚀 Getting Started in 3 Steps

### 1. Set Your API Key

Open `.env.local` and add your Gemini API key:

```env
GEMINI_API_KEY=your_actual_gemini_api_key_here
DATABASE_URL="file:./prisma/dev.db"
```

**Get a free Gemini API key:** https://ai.google.dev/

### 2. Install & Run

```bash
# Install dependencies (if not already done)
npm install

# Generate Prisma client (if not already done)
npx prisma generate

# Start the development server
npm run dev
```

### 3. Open the App

Navigate to **http://localhost:3000** in your browser.

---

## 📝 Quick Test Flow

1. **Add an idea**: Type "organize my closet" and click "Add Idea"
2. **Break it down**: Click "Break it down" to see AI in action
3. **Start working**: Click "Start Now" on the Today Step
4. **Complete & reflect**: Click "Done" and share how it felt

---

## 🌱 Optional: Seed Example Data

To populate the database with 5 example ideas:

```bash
npx tsx prisma/seed.ts
```

---

## 🐛 Troubleshooting

**"GEMINI_API_KEY is not set"**
- Make sure `.env.local` exists with your API key
- Restart the dev server after adding the key

**Database errors**
```bash
npx prisma migrate reset
npx prisma generate
```

**Build errors**
```bash
rm -rf .next node_modules
npm install
```

---

## 📚 Full Documentation

See [README.md](file:///c:/Users/joshi/Self-projects/smallSteps/README.md) for complete setup, deployment, and feature documentation.

---

**Ready to reduce overwhelm, one small step at a time!** ✨
