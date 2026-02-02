// SmallSteps AI Prompts
// Two-stage decomposition: Goal → Tasks → WorkUnits
// AI structures work, never schedules it

/**
 * Stage 1: Decompose Goal into Tasks
 * Tasks are finite bodies of work with total effort estimates.
 * AI does NOT schedule, does NOT create daily plans.
 */
/**
 * Stage 1: Decompose Goal into Milestone Tasks
 * A Task must represent a new CAPABILITY gained by the user.
 * It is a milestone, not just a bucket of work.
 */
export function getDecomposeGoalPrompt(goalText: string, targetDate?: string): string {
  const targetContext = targetDate
    ? `\nSoft target: ${new Date(targetDate).toLocaleDateString()} (not a deadline)`
    : '';

  return `You are a Skill Progression Architect for SmallSteps.

Goal: "${goalText}"${targetContext}

Your job is to design a SKILL PROGRESSION by defining 3-6 distinct Milestone Tasks.

**CRITICAL RULES:**
1. **Capabilities, Not Topics**: Each task title must describe a CAPABILITY the user gains (e.g., "Build simple songs", NOT "Guitar Practice").
2. **Mutually Exclusive**: No two tasks can cover the same skill or activity.
3. **Sequential unlocking**: Task 1 should unlock Task 2, etc. (mostly).

**Output Format (JSON only):**
{
  "tasks": [
    { "title": "Build [specific foundation] capability", "estimatedTotalMinutes": 600 },
    { "title": "Apply [skill] to create [outcome]", "estimatedTotalMinutes": 600 }
  ]
}

**Guidelines:**
- **DO NOT COPY EXAMPLES.** Generate tasks strictly relevant to the Goal.
- Minimum 120 minutes per task.
- estimatedTotalMinutes = realistic effort to acquire this capability.

Return ONLY valid JSON.`;
}

/**
 * Stage 2: Decompose Task into Atomic WorkUnits
 * WorkUnits must be sequential, atomic steps that unlock the next step.
 * NO GENERIC VERBS (No "Study", "Practice", "Review").
 */
export function getDecomposeTaskPrompt(taskTitle: string, taskTotalMinutes: number, otherTasks?: string[], priorCapabilities?: string[]): string {
  const contextInstruction = otherTasks && otherTasks.length > 0
    ? `\n**Context - Other tasks in this goal:**\n${otherTasks.map(t => `- ${t}`).join('\n')}\n`
    : '';

  const capabilityInstruction = priorCapabilities && priorCapabilities.length > 0
    ? `\n**PRIOR CAPABILITIES (ALREADY LEARNED - DO NOT REPEAT):**\nThe user ALREADY has the following capabilities. You may only BUILD on them:\n${priorCapabilities.map(c => `- ${c}`).join('\n')}\n`
    : '';

  return `You are a Work Structure Engine for SmallSteps.

Task: "${taskTitle}"
Total Effort to Allocate: ${taskTotalMinutes} minutes${contextInstruction}${capabilityInstruction}

Your job is to design a detailed SKILL CHAIN for this task.
Break it down into small, ordered WorkUnits where each step unlocks the next.

**CRITICAL RULES:**
1. **Capability Ledger**: Each WorkUnit must generate a unique "capabilityId" (e.g., "keyboard.white_keys").
2. **NO REPETITION**: If a capability appears in "PRIOR CAPABILITIES" or "Other tasks", DO NOT include it. Output is invalid if duplicates exist.
3. **No Generic Verbs**: DO NOT use "Study", "Practice", "Review" in titles.
4. **Strict Sequencing**: Unit 1 unlocks Unit 2.
5. **Hard Limit**: Max 120 minutes per WorkUnit.

**Output Format (JSON only):**
{
  "workUnits": [
    { 
      "title": "Study [specific link/resource] to understand [concept]", 
      "kind": "study", 
      "estimatedTotalMinutes": 30,
      "capabilityId": "domain.concept_name"
    },
    { 
      "title": "Practice [specific action] until [result]", 
      "kind": "practice", 
      "estimatedTotalMinutes": 60,
      "capabilityId": "domain.skill_name"
    }
  ]
}

**Guidelines:**
- Sum of minutes MUST equal exactly ${taskTotalMinutes}.
- capabilityId must be unique globally.

Return ONLY valid JSON.`;
}

/**
 * Estimate total effort for a goal description
 */
export function getEstimateGoalEffortPrompt(goalText: string): string {
  return `Estimate the TOTAL effort this goal requires for an average person.

Goal: "${goalText}"

Think about ALL the time needed over weeks or months to achieve this goal.

Examples for reference:
- "Learn a new language to conversational level" = 18000-36000 min (300-600 hrs)
- "Build a portfolio website" = 1200-3600 min (20-60 hrs)
- "Complete an online course" = 600-3600 min (10-60 hrs)
- "Read a technical book" = 480-900 min (8-15 hrs)

Respond with JSON only:
{
  "estimatedTotalMinutes": <number>,
  "confidence": "low" | "medium" | "high",
  "rationale": "brief explanation"
}`;
}
