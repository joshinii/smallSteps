// SmallSteps AI Prompts
// Three-stage flow: Goal Clarification → Tasks → WorkUnits
// AI structures work, never schedules it
// Philosophy: Gentle Architect - small, doable steps for overwhelmed users

/**
 * Stage 0: Generate Clarification Questions
 * Exactly 3 questions to reduce ambiguity before task decomposition
 * Questions should be answerable in under 5 seconds each
 */
export function getClarifyGoalPrompt(goalText: string): string {
  return `You help people turn vague goals into clear, achievable plans. Before planning, you need to understand their intent better.

Goal: "${goalText}"

Generate exactly 3 clarifying questions to understand their needs. Each question MUST include an options array.

**CRITICAL**: Each question MUST have an "options" array with 4-5 option objects. Without options, the output is invalid.

**PLANNING DIMENSIONS:**
- scope: What depth/breadth of mastery they want
- skill: Their current experience level
- time: How much time they can commit
- rhythm: Their preferred working pattern (daily habit vs occasional deep dives)
- priority: How this fits into their life (main focus vs side project)

**Output Format (JSON only) - EACH QUESTION MUST HAVE OPTIONS:**
{
  "questions": [
    {
      "id": "q1",
      "questionText": "Casual, friendly question?",
      "planningDimension": "scope",
      "options": [
        { "value": "basic", "label": "Get the basics down", "planningHint": "Focus on fundamentals" },
        { "value": "functional", "label": "Be functional", "planningHint": "Focus on practical use" },
        { "value": "confident", "label": "Feel confident", "planningHint": "Build depth" },
        { "value": "advanced", "label": "Reach advanced level", "planningHint": "Include challenging material" },
        { "value": "custom", "label": "Not sure / Custom", "planningHint": "Balanced approach" }
      ]
    },
    {
      "id": "q2",
      "questionText": "Another casual question?",
      "planningDimension": "skill",
      "options": [
        { "value": "beginner", "label": "Complete beginner", "planningHint": "Start from scratch" },
        { "value": "some", "label": "Some experience", "planningHint": "Skip basics" },
        { "value": "rusty", "label": "Know it but rusty", "planningHint": "Focus on refreshing" },
        { "value": "custom", "label": "Not sure / Custom", "planningHint": "Start with assessment" }
      ]
    }
  ]
}

**MANDATORY REQUIREMENTS:**
1. Questions should feel like a friendly conversation, not an interview
2. Each question MUST have an "options" array with at least 4 objects
3. Each option object MUST have: "value", "label", and "planningHint" fields
4. Labels should be 2-6 words max (scannable)
5. Always include a "Not sure / Custom" option as the last option
6. Avoid jargon: "What pace feels sustainable?" not "What's your weekly time allocation?"

Return ONLY valid JSON with exactly 3 questions, each with a complete options array.`;
}

/**
 * Format clarification context for decomposition prompt
 */
export interface ClarificationContext {
  scopeHint?: string;
  skillLevel?: string;
  timeCommitment?: string;
  preferredRhythm?: string;
  priorityLevel?: string;
}

function formatClarificationContext(context?: ClarificationContext): string {
  if (!context) return '';

  const hints: string[] = [];
  if (context.scopeHint) hints.push(`- Desired depth: ${context.scopeHint}`);
  if (context.skillLevel) hints.push(`- Starting point: ${context.skillLevel}`);
  if (context.timeCommitment) hints.push(`- Time available: ${context.timeCommitment}`);
  if (context.preferredRhythm) hints.push(`- Preferred rhythm: ${context.preferredRhythm}`);
  if (context.priorityLevel) hints.push(`- Priority: ${context.priorityLevel}`);

  if (hints.length === 0) return '';

  return `\n**User Context (from clarification):**\n${hints.join('\n')}\n`;
}

/**
 * Stage 1: Decompose Goal into Milestone Tasks
 * A Task represents a meaningful milestone - something the user can DO after completing it.
 * Focus on achievable chunks that build confidence.
 */
export function getDecomposeGoalPrompt(goalText: string, targetDate?: string, clarificationContext?: ClarificationContext): string {
  const targetContext = targetDate
    ? `\nSoft target: ${new Date(targetDate).toLocaleDateString()} (a gentle guideline, not a deadline)`
    : '';

  const userContext = formatClarificationContext(clarificationContext);

  return `You are a supportive guide helping someone break down their goal into achievable milestones.

Goal: "${goalText}"${targetContext}${userContext}

Design 3-6 milestone tasks that build on each other. Each milestone should feel like a small win.
${userContext ? '\n**Important:** Use the user context above to tailor task depth, starting point, and pacing.\n' : ''}

**CRITICAL CONSTRAINTS:**
1. ALL tasks MUST be directly related to: "${goalText}"
2. Do NOT use examples or tasks from other domains or topics
3. Every task must help achieve THIS SPECIFIC goal, not any other goal
4. If the goal mentions specific technologies, tools, or domains, focus strictly on those

**GUIDING PRINCIPLES:**
1. **Achievable Milestones**: Each task title describes what the user CAN DO after completing it (e.g., "Solve 10 array problems" not "Learn arrays").
2. **Progressive Confidence**: Early tasks should be easier, building toward harder ones.
3. **No Overlap**: Each task covers distinct ground.
4. **Realistic Effort**: Consider a beginner's pace - learning takes time.

**Output Format (JSON only):**
{
  "tasks": [
    {
      "title": "Confidently [specific achievable outcome related to the goal]",
      "estimatedTotalMinutes": 180,
      "whyThisMatters": "Brief encouragement about what this unlocks"
    }
  ]
}

**Quality Checks:**
- Titles should complete: "After this, I can ___"
- Minimum 60 minutes for simple tasks, typically 120-600 minutes
- Avoid vague words like "basics", "fundamentals", "introduction"
- Be specific and directly relevant to "${goalText}"

Return ONLY valid JSON. Generate tasks STRICTLY relevant to achieving: "${goalText}"`;
}

/**
 * Stage 2: Decompose Task into Atomic WorkUnits
 * WorkUnits are small, concrete steps a user can start immediately.
 * Focus on reducing activation energy and providing clarity.
 */
export function getDecomposeTaskPrompt(taskTitle: string, taskTotalMinutes: number, otherTasks?: string[], priorCapabilities?: string[]): string {
  const contextInstruction = otherTasks && otherTasks.length > 0
    ? `\n**Context - Other milestones in this goal:**\n${otherTasks.map(t => `- ${t}`).join('\n')}\n`
    : '';

  const capabilityInstruction = priorCapabilities && priorCapabilities.length > 0
    ? `\n**Already learned (build on these, don't repeat):**\n${priorCapabilities.map(c => `- ${c}`).join('\n')}\n`
    : '';

  return `You are a supportive guide breaking down a milestone into small, doable steps.

Milestone: "${taskTitle}"
Total Effort: ${taskTotalMinutes} minutes${contextInstruction}${capabilityInstruction}

Create a sequence of small work units. Each should feel approachable - something someone could start right now without feeling overwhelmed.

**GUIDING PRINCIPLES:**
1. **Tiny First Steps**: The first work unit should be especially easy to start.
2. **Clear Actions**: Each title should describe a concrete action, not a topic.
3. **Know When Done**: Include a clear success signal - how will the user know they've finished?
4. **Immediate Start**: Include a firstAction - the very first tiny thing to do.
5. **Build Momentum**: Order from easiest to harder, building confidence.
6. **Reasonable Chunks**: 15-90 minutes per unit (max 120). Shorter is often better.

**Output Format (JSON only):**
{
  "workUnits": [
    {
      "title": "Research and identify 3 key resources for [topic]",
      "kind": "explore",
      "estimatedTotalMinutes": 20,
      "capabilityId": "domain.specific_skill",
      "firstAction": "Open browser and search for [relevant search term]",
      "successSignal": "You have 3 bookmarked resources you're ready to use"
    },
    {
      "title": "Complete first learning module to [specific outcome]",
      "kind": "study",
      "estimatedTotalMinutes": 45,
      "capabilityId": "domain.another_skill",
      "firstAction": "Open the first resource and start reading",
      "successSignal": "You understand [specific concept] and can explain it"
    }
  ]
}

**Work Unit Kinds:**
- "explore": Research, discover resources, gather information
- "study": Learn concepts, watch/read educational content
- "practice": Repeat an action to build muscle memory or fluency
- "build": Create something tangible (code, document, artifact)
- "review": Consolidate learning, revisit past work

**Quality Checks:**
- Titles should answer: "What will I actually DO?"
- firstAction should be startable in under 2 minutes
- successSignal should be observable (not just "understand X")
- Avoid vague words: "explore basics" → "Find 3 tutorials on X"
- Minutes must sum to exactly ${taskTotalMinutes}
- Each capabilityId must be unique

Return ONLY valid JSON.`;
}

/**
 * Estimate total effort for a goal description
 * Provides realistic expectations without pressure
 */
export function getEstimateGoalEffortPrompt(goalText: string): string {
  return `Estimate the total effort this goal requires, thinking about a relaxed, sustainable pace.

Goal: "${goalText}"

Consider:
- Time needed for a beginner learning at a comfortable pace
- Buffer for repetition, mistakes, and real life
- Quality over speed - no rushing

Reference ranges (approximate):
- "Learn conversational Spanish" = 18000-36000 min (working at it over months)
- "Build a portfolio website" = 1200-3600 min (a few weeks of focused work)
- "Complete an online course" = 600-3600 min (depends on course depth)
- "Read and understand a technical book" = 480-900 min (with notes and reflection)

Respond with JSON only:
{
  "estimatedTotalMinutes": <number>,
  "confidence": "low" | "medium" | "high",
  "rationale": "brief, encouraging explanation"
}`;
}
