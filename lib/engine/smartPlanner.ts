
import { Task, Goal } from '../schema';
import { calculateTaskPriority, TaskPriority } from './priorityCalculator';

export interface PlannedSession {
    selectedTasks: Task[];
    totalMinutes: number;
    totalPriorityScore: number;
    remainingMinutes: number;
}

/**
 * Smart Planner using the 0/1 Knapsack Algorithm
 * Selects the highest value (priority) set of tasks that fits within the time capacity.
 * 
 * @param tasks - List of active tasks
 * @param goals - Map of goals for context (needed for priority calc)
 * @param capacityMinutes - How much time the user has today (default 240m)
 */
export function selectOptimalTasks(
    tasks: Task[],
    goals: Record<string, Goal>,
    capacityMinutes: number = 240
): PlannedSession {

    // 1. Calculate Priority for all tasks
    // This gives us the "Value" (profit) for the knapsack
    const items = tasks.map(task => {
        const goal = goals[task.goalId];
        // If goal not found (orphaned task), give 0 priority
        if (!goal) return { task, weight: task.estimatedTotalMinutes, value: 0 };

        const priority = calculateTaskPriority(task, goal);
        return {
            task,
            weight: Math.max(5, task.estimatedTotalMinutes), // Minimum 5 min cost
            value: priority.totalScore
        };
    });

    // 2. Solve 0/1 Knapsack Problem
    // DP Table: K[i][w] = max value with first i items and weight limit w
    const n = items.length;
    const capacity = Math.floor(capacityMinutes);

    // Use 1D array optimization for space (we only need previous row)
    // dp[w] = max value achievable with weight limit w
    const dp = new Array(capacity + 1).fill(0);
    // Track selected items to reconstruct solution
    // selected[i][w] = true if item i was included for weight w
    const selected = Array.from({ length: n + 1 }, () => new Array(capacity + 1).fill(false));

    for (let i = 1; i <= n; i++) {
        const item = items[i - 1]; // items are 0-indexed
        // Reverse iteration for 1D array to avoid using same item twice in one step
        // BUT we need 2D "selected" tracking to reconstruct easily, 
        // so let's stick to standard 2D logic conceptually but implemented optimally if needed.
        // For simplicity and reconstruction, standard 2D DP for N items is safer/clearer.
        // N is usually small (<100 tasks). Capacity is small (<480 mins). 100*480 = 48000 ops. Fast.
    }

    // Full 2D DP Table implementation for clarity & reconstruction
    const K = Array.from({ length: n + 1 }, () => new Array(capacity + 1).fill(0));

    for (let i = 0; i <= n; i++) {
        for (let w = 0; w <= capacity; w++) {
            if (i === 0 || w === 0) {
                K[i][w] = 0;
            } else {
                const item = items[i - 1];
                if (item.weight <= w) {
                    const valueWithItem = item.value + K[i - 1][w - item.weight];
                    const valueWithoutItem = K[i - 1][w];
                    K[i][w] = Math.max(valueWithItem, valueWithoutItem);
                } else {
                    K[i][w] = K[i - 1][w];
                }
            }
        }
    }

    // 3. Reconstruct Solution
    const selectedTasks: Task[] = [];
    let w = capacity;
    let totalValue = K[n][capacity];
    let totalWeight = 0;

    for (let i = n; i > 0 && totalValue > 0; i--) {
        // If value came from K[i-1][w], item was NOT included
        if (K[i][w] === K[i - 1][w]) {
            continue;
        } else {
            // Item was included
            const item = items[i - 1];
            selectedTasks.push(item.task);
            totalWeight += item.weight;
            totalValue -= item.value;
            w -= item.weight;
        }
    }

    // Reverse to get original order (optional, but nice)
    selectedTasks.reverse();

    return {
        selectedTasks,
        totalMinutes: totalWeight,
        totalPriorityScore: K[n][capacity],
        remainingMinutes: capacity - totalWeight
    };
}
