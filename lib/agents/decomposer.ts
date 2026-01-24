import { anthropic, DEFAULT_MODEL, DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from '../claude';

export interface DailyTask {
  task: string;
  category?: string;
  timeEstimate?: string;
  isRepetitive?: boolean;
}

export interface DecomposedTasks {
  tasks: DailyTask[];
  rationale?: string;
}

/**
 * Enhanced Decomposer Agent
 * 
 * Purpose: Breaks ideas into intelligent, context-aware daily tasks
 * Output: Array of specific daily tasks with rationale
 * Principles: Deep understanding, practical scheduling, measurable actions
 */
export async function decomposeIdea(
  clarifiedIdea: string,
  targetDate?: string
): Promise<DecomposedTasks> {
  const targetDateContext = targetDate
    ? `\nTarget completion: ${new Date(targetDate).toLocaleDateString()}`
    : '';

  console.log('🤖 DECOMPOSER: Starting for idea:', clarifiedIdea);

  const prompt = `You are an expert task planner and life coach. Someone wants to achieve this goal:

"${clarifiedIdea}"${targetDateContext}

Your job is to:
1. UNDERSTAND the goal deeply (What does success look like? What's required?)
2. RATIONALIZE the effort needed (What daily habits/actions will get them there?)
3. CREATE specific, actionable daily tasks they can track

**Guidelines:**
- Think holistically: If it's a fitness goal, include nutrition, exercise, sleep, etc.
- Be specific: Instead of "exercise", say "Do 20 push-ups and 30 crunches"
- Make it daily-trackable: Each task should be something they do every day or regularly
- Include categories: nutrition, exercise, learning, practice, preparation, etc.
- Time estimates: Most tasks should be 10-30 minutes
- Create 5-10 tasks total
- Mark tasks as "isRepetitive: true" -> THIS IS CRITICAL. Most daily tasks MUST be marked repetitive so they appear in the habit tracker.

**Output Format (JSON):**
{
  "rationale": "Brief explanation of what's needed to achieve this goal",
  "tasks": [
    { "task": "Specific action", "category": "exercise", "timeEstimate": "20 min", "isRepetitive": true },
    { "task": "Another action", "category": "nutrition", "timeEstimate": "15 min", "isRepetitive": true }
  ]
}

**Examples:**

Input: "I want to build 6 pack abs"
Output:
{
  "rationale": "Building visible abs requires reducing body fat (nutrition) and strengthening core muscles (exercise). Consistency with diet and daily core work is key.",
  "tasks": [
    { "task": "Do 3 sets of 20 crunches", "category": "exercise", "timeEstimate": "10 min", "isRepetitive": true },
    { "task": "Do 3 sets of 30-second planks", "category": "exercise", "timeEstimate": "5 min", "isRepetitive": true },
    { "task": "Eat at least 120g of protein today", "category": "nutrition", "timeEstimate": "ongoing", "isRepetitive": true },
    { "task": "Track daily calories and stay in a 300-calorie deficit", "category": "nutrition", "timeEstimate": "10 min", "isRepetitive": true },
    { "task": "Drink at least 2 liters of water", "category": "health", "timeEstimate": "ongoing", "isRepetitive": true },
    { "task": "Get 7-8 hours of sleep", "category": "recovery", "timeEstimate": "ongoing", "isRepetitive": true },
    { "task": "Do 20 minutes of cardio (running, cycling, or jumping rope)", "category": "exercise", "timeEstimate": "20 min", "isRepetitive": true }
  ]
}

Input: "Learn to code in Python"
Output:
{
  "rationale": "Learning Python requires daily practice with syntax, solving problems, and building small projects. Consistency beats cramming.",
  "tasks": [
    { "task": "Complete one Python coding challenge on LeetCode or HackerRank", "category": "practice", "timeEstimate": "20 min", "isRepetitive": true },
    { "task": "Watch one 15-minute Python tutorial video", "category": "learning", "timeEstimate": "15 min", "isRepetitive": true },
    { "task": "Write 20 lines of Python code (any project)", "category": "practice", "timeEstimate": "15 min", "isRepetitive": true },
    { "task": "Read one article or documentation page about Python", "category": "learning", "timeEstimate": "10 min", "isRepetitive": true },
    { "task": "Review and understand yesterday's code", "category": "review", "timeEstimate": "10 min", "isRepetitive": true }
  ]
}

Input: "Organize my closet"
Output:
{
  "rationale": "Organizing a closet is best done in small chunks to avoid overwhelm. Daily 10-minute sessions are more sustainable than one marathon session.",
  "tasks": [
    { "task": "Sort through 10 items and decide: keep, donate, or toss", "category": "declutter", "timeEstimate": "10 min", "isRepetitive": false },
    { "task": "Try on 5 questionable items to make keep/donate decisions", "category": "declutter", "timeEstimate": "10 min", "isRepetitive": false },
    { "task": "Fold and organize one shelf or drawer", "category": "organize", "timeEstimate": "15 min", "isRepetitive": false },
    { "task": "Put one bag of donations in the car for drop-off", "category": "action", "timeEstimate": "5 min", "isRepetitive": false }
  ]
}

Return ONLY valid JSON, nothing else.`;

  try {
    console.log('🤖 DECOMPOSER: Calling Claude API...');

    const message = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: DEFAULT_MAX_TOKENS,
      temperature: DEFAULT_TEMPERATURE,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '';

    console.log('✅ DECOMPOSER: Got API response');
    console.log('📝 DECOMPOSER: Raw response length:', text.length);
    console.log('📝 DECOMPOSER: First 200 chars:', text.substring(0, 200));

    // Extract JSON from response
    let jsonText = text;
    if (text.includes('```json')) {
      jsonText = text.split('```json')[1].split('```')[0].trim();
      console.log('📝 DECOMPOSER: Extracted from ```json block');
    } else if (text.includes('```')) {
      jsonText = text.split('```')[1].split('```')[0].trim();
      console.log('📝 DECOMPOSER: Extracted from ``` block');
    }

    console.log('📝 DECOMPOSER: JSON to parse:', jsonText.substring(0, 200));

    const parsed = JSON.parse(jsonText);
    console.log('✅ DECOMPOSER: JSON parsed successfully');
    console.log('📊 DECOMPOSER: Tasks count:', parsed.tasks?.length || 0);

    return {
      rationale: parsed.rationale || '',
      tasks: parsed.tasks.map((t: any) => ({
        task: t.task,
        category: t.category || 'action',
        timeEstimate: t.timeEstimate || '15 min',
        isRepetitive: t.isRepetitive || false,
      })) || [],
    };
  } catch (error) {
    console.error('❌ DECOMPOSER ERROR:', error);
    console.error('Error type:', error instanceof Error ? error.name : typeof error);
    console.error('Error message:', error instanceof Error ? error.message : error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'N/A');

    // Fallback: create basic tasks
    console.warn('⚠️ DECOMPOSER: Using fallback tasks due to error');
    return {
      rationale: 'Breaking this down into manageable daily actions.',
      tasks: [
        { task: `Take the first step toward: ${clarifiedIdea}`, category: 'action', timeEstimate: '15 min', isRepetitive: false },
        { task: 'Continue working on this goal', category: 'action', timeEstimate: '15 min', isRepetitive: false },
        { task: 'Review progress and adjust approach', category: 'review', timeEstimate: '10 min', isRepetitive: false },
      ],
    };
  }
}
