import { anthropic, DEFAULT_MODEL, DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from '../claude';
import { z } from 'zod';
import type { AIProvider } from '@/lib/ai/ai-provider';
import type { GeneratedBreakdown, GeneratedTask, GeneratedWorkUnit, WorkUnitKind } from './types';

// ============================================
// Legacy Types (Backward Compatibility)
// ============================================

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

// ============================================
// Zod Schemas for Validation
// ============================================

const WorkUnitKindSchema = z.enum(['study', 'practice', 'build', 'review', 'explore']);

const GeneratedTaskSchema = z.object({
  title: z.string().min(1),
  estimatedTotalMinutes: z.number().min(15).max(600),
  completedMinutes: z.number().default(0),
  order: z.number().min(0),
  phase: z.string().optional(),
  complexity: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  whyThisMatters: z.string().optional(),
});

const GeneratedWorkUnitSchema = z.object({
  title: z.string().min(1),
  estimatedTotalMinutes: z.number().min(15).max(120),
  completedMinutes: z.number().default(0),
  kind: WorkUnitKindSchema,
  capabilityId: z.string().optional(),
  firstAction: z.string().optional(),
  successSignal: z.string().optional(),
  taskOrder: z.number().min(0),
});

const GeneratedBreakdownSchema = z.object({
  tasks: z.array(GeneratedTaskSchema).min(3).max(6),
  workUnits: z.array(GeneratedWorkUnitSchema).min(4),
});

// ============================================
// Default Fallback Breakdown
// ============================================

function createFallbackBreakdown(goalTitle: string): GeneratedBreakdown {
  return {
    tasks: [
      {
        title: 'Get started with the basics',
        estimatedTotalMinutes: 120,
        completedMinutes: 0,
        order: 0,
        phase: 'Foundation',
        whyThisMatters: 'Building a solid foundation makes everything easier',
      },
      {
        title: 'Practice and build momentum',
        estimatedTotalMinutes: 180,
        completedMinutes: 0,
        order: 1,
        phase: 'Practice',
        whyThisMatters: 'Consistent practice turns knowledge into skill',
      },
      {
        title: 'Apply what you learned',
        estimatedTotalMinutes: 240,
        completedMinutes: 0,
        order: 2,
        phase: 'Application',
        whyThisMatters: 'Real application cements your understanding',
      },
    ],
    workUnits: [
      {
        title: `Research basics of: ${goalTitle}`,
        estimatedTotalMinutes: 30,
        completedMinutes: 0,
        kind: 'study',
        taskOrder: 0,
        firstAction: 'Open a browser tab',
        successSignal: 'You understand the key concepts',
      },
      {
        title: 'Create a simple plan',
        estimatedTotalMinutes: 20,
        completedMinutes: 0,
        kind: 'explore',
        taskOrder: 0,
        firstAction: 'Open your notes app',
        successSignal: 'You have 3-5 bullet points written down',
      },
      {
        title: 'Practice the first skill',
        estimatedTotalMinutes: 45,
        completedMinutes: 0,
        kind: 'practice',
        taskOrder: 1,
        firstAction: 'Set a 15-minute timer',
        successSignal: 'You completed one focused session',
      },
      {
        title: 'Review what you practiced',
        estimatedTotalMinutes: 15,
        completedMinutes: 0,
        kind: 'review',
        taskOrder: 1,
        firstAction: 'Look at your notes from the session',
        successSignal: 'You identified one thing to improve',
      },
      {
        title: 'Build something small',
        estimatedTotalMinutes: 60,
        completedMinutes: 0,
        kind: 'build',
        taskOrder: 2,
        firstAction: 'Open your workspace',
        successSignal: 'You have a working result',
      },
    ],
  };
}

// ============================================
// Legacy Decomposer (Backward Compatibility)
// ============================================

/**
 * Enhanced Decomposer Agent (Legacy)
 * 
 * Purpose: Breaks ideas into intelligent, context-aware daily tasks
 * Output: Array of specific daily tasks with rationale
 * Principles: Deep understanding, practical scheduling, measurable actions
 * 
 * @deprecated Consider using generateStructuredBreakdown for full Task/WorkUnit output
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

// ============================================
// Structured Breakdown Generator (New)
// ============================================

/**
 * Generate structured Task + WorkUnit breakdown for a goal
 * 
 * Uses AIProvider to generate a complete breakdown with:
 * - 3-6 Tasks (milestones/phases)
 * - 4-8 WorkUnits per Task
 * - Quality fields (firstAction, successSignal, whyThisMatters)
 * 
 * @param goalTitle - The clarified goal text
 * @param context - User answers from clarification questions
 * @param aiProvider - AIProvider instance (from AIContext.getAI())
 * @returns Promise<GeneratedBreakdown> - Tasks and WorkUnits ready for persistence
 */
export async function generateStructuredBreakdown(
  goalTitle: string,
  context: Record<string, any>,
  aiProvider: AIProvider
): Promise<GeneratedBreakdown> {
  console.log('🤖 DECOMPOSER: Generating structured breakdown for:', goalTitle);
  console.log('🤖 DECOMPOSER: Context:', JSON.stringify(context));

  const prompt = buildStructuredBreakdownPrompt(goalTitle, context);

  // Try up to 2 times (initial + 1 retry)
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`🤖 DECOMPOSER: Attempt ${attempt} - calling AI provider...`);

      let response: string;

      // Use generateCompletion if available
      if ('generateCompletion' in aiProvider && typeof aiProvider.generateCompletion === 'function') {
        response = await aiProvider.generateCompletion(prompt, {
          temperature: 0.7,
          maxTokens: 3000,
          jsonMode: true,
        });
      } else {
        // Fallback: Use decomposeGoal and then decomposeTask for each
        console.log('🤖 DECOMPOSER: Provider lacks generateCompletion, using two-stage approach');
        return await generateBreakdownTwoStage(goalTitle, context, aiProvider);
      }

      // Parse and validate response
      const breakdown = parseAndValidateBreakdown(response);
      console.log(`✅ DECOMPOSER: Generated ${breakdown.tasks.length} tasks and ${breakdown.workUnits.length} work units`);
      return breakdown;

    } catch (error) {
      console.error(`❌ DECOMPOSER: Attempt ${attempt} failed:`, error);

      if (attempt === 2) {
        console.warn('⚠️ DECOMPOSER: All attempts failed, using fallback breakdown');
        return createFallbackBreakdown(goalTitle);
      }
    }
  }

  // Should never reach here, but TypeScript needs it
  return createFallbackBreakdown(goalTitle);
}

// ============================================
// Helper Functions
// ============================================

/**
 * Build the prompt for generating structured breakdown
 */
function buildStructuredBreakdownPrompt(goalTitle: string, context: Record<string, any>): string {
  return `Goal: "${goalTitle}"
User Context: ${JSON.stringify(context)}

Create a complete breakdown for a user who struggles with starting tasks.
Focus on reducing overwhelm and making every step feel doable.

Structure:
- 3-6 Tasks (major milestones that feel achievable)
- 4-8 WorkUnits total across all tasks (concrete actions)

Task fields:
- title: Clear milestone description (encouraging, not intimidating)
- estimatedTotalMinutes: Realistic total time (60-300 minutes)
- completedMinutes: Always 0 (not started)
- order: Progressive sequence starting from 0
- phase: Category (e.g., "Foundation", "Learning", "Practice", "Building")
- complexity: 1 (simple), 2 (moderate), or 3 (complex)
- whyThisMatters: Brief motivation - what completing this unlocks

WorkUnit fields:
- title: Specific actionable step (clear and concrete)
- estimatedTotalMinutes: 15-120 minutes (prefer shorter 15-45 min)
- completedMinutes: Always 0 (not started)
- kind: study | practice | build | review | explore
- firstAction: Tiny immediate step that takes <2 min (e.g., "Open your browser")
- successSignal: Observable sign that this unit is complete
- taskOrder: Links to parent task by order (0, 1, 2...)

Guidelines:
- Each firstAction should be trivially easy to reduce activation energy
- successSignal should be concrete and observable, not vague
- Distribute workUnits across tasks (aim for similar effort per task)
- Use friendly, supportive language throughout

Return ONLY valid JSON matching this exact structure:
{
  "tasks": [
    {
      "title": "Get comfortable with the basics",
      "estimatedTotalMinutes": 90,
      "completedMinutes": 0,
      "order": 0,
      "phase": "Foundation",
      "complexity": 1,
      "whyThisMatters": "Understanding the basics makes everything else click"
    }
  ],
  "workUnits": [
    {
      "title": "Watch an intro video",
      "estimatedTotalMinutes": 20,
      "completedMinutes": 0,
      "kind": "study",
      "firstAction": "Open YouTube",
      "successSignal": "You watched at least 10 minutes",
      "taskOrder": 0
    }
  ]
}

Return ONLY the JSON, no markdown, no explanation.`;
}

/**
 * Fallback: Generate breakdown using two-stage approach
 * (decomposeGoal → decomposeTask for each task)
 */
async function generateBreakdownTwoStage(
  goalTitle: string,
  context: Record<string, any>,
  aiProvider: AIProvider
): Promise<GeneratedBreakdown> {
  console.log('🤖 DECOMPOSER: Using two-stage approach...');

  // Stage 1: Get tasks from decomposeGoal
  const goalPlan = await aiProvider.decomposeGoal(goalTitle);

  const tasks: GeneratedTask[] = goalPlan.tasks.map((t, index) => ({
    title: t.title,
    estimatedTotalMinutes: t.estimatedTotalMinutes || 120,
    completedMinutes: 0,
    order: index,
    phase: t.phase,
    complexity: t.complexity,
    whyThisMatters: t.whyThisMatters,
  }));

  // Stage 2: Get work units for each task
  const allWorkUnits: GeneratedWorkUnit[] = [];

  for (let i = 0; i < Math.min(tasks.length, 4); i++) {
    const task = tasks[i];
    try {
      const taskPlan = await aiProvider.decomposeTask(
        task.title,
        task.estimatedTotalMinutes,
        tasks.map(t => t.title),
        []
      );

      const workUnits = taskPlan.workUnits.map(wu => ({
        title: wu.title,
        estimatedTotalMinutes: wu.estimatedTotalMinutes || 30,
        completedMinutes: 0,
        kind: wu.kind as WorkUnitKind,
        capabilityId: wu.capabilityId,
        firstAction: wu.firstAction,
        successSignal: wu.successSignal,
        taskOrder: i,
      }));

      allWorkUnits.push(...workUnits);
    } catch (error) {
      console.error(`❌ DECOMPOSER: Failed to decompose task ${i}:`, error);
    }
  }

  // Ensure we have at least some work units
  if (allWorkUnits.length === 0) {
    return createFallbackBreakdown(goalTitle);
  }

  return { tasks, workUnits: allWorkUnits };
}

/**
 * Parse AI response and validate against GeneratedBreakdown schema
 */
function parseAndValidateBreakdown(response: string): GeneratedBreakdown {
  // Extract JSON from response (handle markdown code blocks)
  let jsonText = response.trim();

  if (jsonText.includes('```json')) {
    jsonText = jsonText.split('```json')[1].split('```')[0].trim();
  } else if (jsonText.includes('```')) {
    jsonText = jsonText.split('```')[1].split('```')[0].trim();
  }

  // Parse JSON
  const parsed = JSON.parse(jsonText);

  // Validate with Zod
  const validated = GeneratedBreakdownSchema.parse(parsed);

  // Ensure completedMinutes defaults
  validated.tasks = validated.tasks.map(t => ({
    ...t,
    completedMinutes: t.completedMinutes ?? 0,
  }));

  validated.workUnits = validated.workUnits.map(wu => ({
    ...wu,
    completedMinutes: wu.completedMinutes ?? 0,
  }));

  return validated as GeneratedBreakdown;
}

