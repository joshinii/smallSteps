
import { Task, Goal } from '../schema';
import { differenceInDays, parseISO, isValid } from 'date-fns';

export interface PriorityFactors {
    urgencyScore: number;   // 0-40 based on due date
    momentumScore: number;  // 0-30 based on complexity (easier = higher)
    phaseScore: number;     // 0-20 based on phase (research > action)
    ageScore: number;       // 0-10 based on how long it's been sitting
}

export interface TaskPriority {
    taskId: string;
    totalScore: number; // 0-100
    factors: PriorityFactors;
}

/**
 * Calculates a deterministic priority score (0-100) for a task.
 * Philosophy: Momentum > Urgency. We want to surface "easy wins" to get the user moving.
 */
export function calculateTaskPriority(task: Task, goal: Goal): TaskPriority {
    let urgencyScore = 0;
    let momentumScore = 0;
    let phaseScore = 0;
    let ageScore = 0;

    // 1. Urgency (Max 40)
    // Closer to target date = higher score
    if (goal.targetDate) {
        const target = parseISO(goal.targetDate);
        if (isValid(target)) {
            const daysRemaining = differenceInDays(target, new Date());

            if (daysRemaining <= 0) urgencyScore = 40; // Overdue or due today
            else if (daysRemaining <= 3) urgencyScore = 35;
            else if (daysRemaining <= 7) urgencyScore = 30;
            else if (daysRemaining <= 14) urgencyScore = 20;
            else if (daysRemaining <= 30) urgencyScore = 10;
            else urgencyScore = 5;
        }
    }

    // 2. Momentum / Complexity (Max 30)
    // Lower complexity = Higher score (Behavioral Activation)
    if (task.complexity) {
        switch (task.complexity) {
            case 1: momentumScore = 30; break; // Easy (Quick win)
            case 2: momentumScore = 15; break; // Medium
            case 3: momentumScore = 5; break;  // Hard
            default: momentumScore = 15;
        }
    } else {
        // Default to medium if not set
        momentumScore = 15;
    }

    // 3. Phase Weight (Max 20)
    // Research/Prep should come before heavily implementing
    if (task.phase) {
        const p = task.phase.toLowerCase();
        if (p.includes('research') || p.includes('prep') || p.includes('plan')) {
            phaseScore = 20;
        } else if (p.includes('verify') || p.includes('test')) {
            phaseScore = 5; // Validating comes last
        } else {
            phaseScore = 15; // Implementation/Action
        }
    } else {
        phaseScore = 10;
    }

    // 4. Aging (Max 10)
    // Tasks that sit around get a slight bump to prevent starvation
    if (task.createdAt) {
        const created = parseISO(task.createdAt);
        if (isValid(created)) {
            const ageDays = differenceInDays(new Date(), created);
            // Cap at 10 points (1 point per 3 days pending)
            ageScore = Math.min(10, Math.floor(ageDays / 3));
        }
    }

    const totalScore = Math.min(100, urgencyScore + momentumScore + phaseScore + ageScore);

    return {
        taskId: task.id,
        totalScore,
        factors: {
            urgencyScore,
            momentumScore,
            phaseScore,
            ageScore
        }
    };
}
