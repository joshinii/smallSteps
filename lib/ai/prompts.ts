// SmallSteps AI Prompts
// Two-stage decomposition: Goal → Tasks → WorkUnits
// AI structures work, never schedules it
// Philosophy: Gentle Architect - small, doable steps for overwhelmed users

/**
 * Stage 1: Decompose Goal into Milestone Tasks
 * A Task represents a meaningful milestone - something the user can DO after completing it.
 * Focus on achievable chunks that build confidence.
 */
export function getDecomposeGoalPrompt(goalText: string, targetDate?: string): string {
  const targetContext = targetDate
    ? `\nSoft target: ${new Date(targetDate).toLocaleDateString()} (a gentle guideline, not a deadline)`
    : '';

  return `You are a supportive guide helping someone break down their goal into achievable milestones.

Goal: "${goalText}"${targetContext}

Design 3-6 milestone tasks that build on each other. Each milestone should feel like a small win.

**GUIDING PRINCIPLES:**
1. **Achievable Milestones**: Each task title describes what the user CAN DO after completing it (e.g., "Play a complete simple song" not "Guitar basics").
2. **Progressive Confidence**: Early tasks should be easier, building toward harder ones.
3. **No Overlap**: Each task covers distinct ground.
4. **Realistic Effort**: Consider a beginner's pace - learning takes time.

**Output Format (JSON only):**
{
  "tasks": [
    {
      "title": "Confidently [specific achievable outcome]",
      "estimatedTotalMinutes": 180,
      "whyThisMatters": "Brief encouragement about what this unlocks"
    }
  ]
}

**Quality Checks:**
- Titles should complete: "After this, I can ___"
- Minimum 60 minutes for simple tasks, typically 120-600 minutes
- Avoid vague words like "basics", "fundamentals", "introduction"
- Be specific: "Navigate the keyboard's white keys" not "Learn keyboard basics"

Return ONLY valid JSON. Generate tasks strictly relevant to this specific goal.`;
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
      "title": "Find and bookmark 3 beginner tutorials on [topic]",
      "kind": "explore",
      "estimatedTotalMinutes": 20,
      "capabilityId": "domain.specific_skill",
      "firstAction": "Open browser and search '[specific search term]'",
      "successSignal": "You have 3 bookmarked links you're excited to try"
    },
    {
      "title": "Follow along with first tutorial to [specific outcome]",
      "kind": "build",
      "estimatedTotalMinutes": 45,
      "capabilityId": "domain.another_skill",
      "firstAction": "Open the first bookmarked tutorial",
      "successSignal": "You've completed the tutorial and can [specific thing]"
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
